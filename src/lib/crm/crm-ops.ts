import "server-only";
/**
 * The CRM queue (2026-11-15). Twenty is the CRM of record; mkan's Neon DB is the working copy the
 * WhatsApp line runs on. Every write to Twenty goes through a `CrmOp` row — the same pattern as
 * `OutboundMessage` — so a Twenty outage only DELAYS the record and never stops a deal:
 *
 *   enqueueCrm()  one row (merged into a still-queued one for the same record), then kickCrm()
 *   kickCrm()     a drain a few seconds later, in the container, never blocking the caller
 *   drainCrm()    the backstop: also run by /api/cron/wa-outbox (no new cron — Neon must sleep at night)
 *
 * The drain is oldest-first, keeps to 40 Twenty calls a minute (Twenty allows 100, shared with the Mac
 * scripts), upserts by the dedupe key (CrmLink → find by key → create) and records what it wrote in
 * CrmLink.pushedFields so the webhook can tell a person's edit from our own echo.
 *
 * Truth rule: Twenty wins on what a person edits (stage, terms, share, notes, relationship, optOut);
 * mkan reports what it observes (messages, timestamps, counts). See app/api/webhooks/twenty/route.ts.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { takeLease, releaseLease, readState, writeState } from "@/components/agent/wa-state";
import { passScheduler } from "../../../scripts/wa/outbox-pure";
import { twentyPhones } from "@/lib/phone";
import { TwentyError, createdOf, findOne, recordsOf, twentyCalls, twentyConfigured, twentyRest, warnUnconfiguredOnce } from "./twenty";
import { CRM_OBJECTS, afterFailure, backlogAlertDue, backlogCard, callBudget, coalesces, isCrmObject, isRef, mergePayload, pushedFieldsOf, type CrmObject } from "./crm-ops-pure";

const LEASE = "crm-lease";
const LEASE_MS = 90_000;
const WINDOW_KEY = "crm-window";
const ALERT_KEY = "crm-backlog-alert";

/** The person Viewing Tasks are assigned to (a Twenty workspace member, found by email at run time). */
const assigneeEmail = () => (process.env.MKAN_CRM_ASSIGNEE_EMAIL?.trim() || "abdout@databayt.org").toLowerCase();

// ── enqueue ──────────────────────────────────────────────────────────────

/**
 * Queue a write. A newer op for the same record that is still QUEUED merges into it (fields the newer one
 * has win), so a burst of steps on one deal is one call. Never throws: a failed enqueue must not fail the
 * step that called it.
 */
export async function enqueueCrm(object: string, key: string, payload: Record<string, unknown>): Promise<void> {
  try {
    if (coalesces(object)) {
      const queued = await db.crmOp.findFirst({ where: { object, key, status: "QUEUED" }, orderBy: { createdAt: "desc" }, select: { id: true, payload: true } });
      if (queued) {
        const merged = mergePayload((queued.payload ?? {}) as Record<string, unknown>, payload);
        await db.crmOp.update({ where: { id: queued.id }, data: { payload: merged as Prisma.InputJsonValue } });
        kickCrm("enqueue");
        return;
      }
    }
    await db.crmOp.create({ data: { object, key, payload: payload as Prisma.InputJsonValue } });
    kickCrm("enqueue");
  } catch (e) {
    console.error(`[crm] enqueue ${object} ${key}:`, (e as Error).message);
  }
}

// ── kick ─────────────────────────────────────────────────────────────────

/** Kicks run in the container only (Next's server, production, Twenty configured) — never in a Mac script. */
const kicksOn = () => process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production" && twentyConfigured();

const passes = passScheduler(async (reason) => {
  const r = await drainCrm().catch((err) => {
    console.warn(`[crm] kick ${reason} failed: ${(err as Error).message}`);
    return null;
  });
  return { locked: r?.skipped === "locked" };
});

/** Run a drain in `delayMs` (container only). One asked for during a pass runs after it; asks merge. */
export function kickCrm(reason: string, delayMs = 3_000): void {
  if (kicksOn()) passes.kick(reason, delayMs);
}

// ── the drain ────────────────────────────────────────────────────────────

export interface DrainResult {
  sent: number;
  failed: number;
  held: number;
  calls: number;
  skipped?: "no-env" | "locked" | "budget";
}

class DependencyMissing extends Error {}

export async function drainCrm(opts: { max?: number; deadlineMs?: number } = {}): Promise<DrainResult> {
  const out: DrainResult = { sent: 0, failed: 0, held: 0, calls: 0 };
  if (!twentyConfigured()) {
    warnUnconfiguredOnce();
    return { ...out, skipped: "no-env" };
  }
  const lease = await takeLease(LEASE, LEASE_MS);
  if (!lease) return { ...out, skipped: "locked" };
  passes.enter();
  const started = Date.now();
  const deadline = started + (opts.deadlineMs ?? 25_000);
  try {
    const window = await readState<{ at?: string; used?: number }>(WINDOW_KEY, {});
    const budget = callBudget(window, started);
    if (budget <= 2) return { ...out, skipped: "budget" };
    const before = twentyCalls();
    const ops = await db.crmOp.findMany({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" }, take: opts.max ?? 40 });
    for (const op of ops) {
      // An op takes up to ~4 calls; stop before the minute's budget or the time-box runs out.
      if (twentyCalls() - before + 4 > budget || Date.now() > deadline) break;
      if (!isCrmObject(op.object)) {
        await db.crmOp.update({ where: { id: op.id }, data: { status: "SKIPPED", error: `unknown object ${op.object}` } });
        continue;
      }
      try {
        await sendOp(op.object, op.key, (op.payload ?? {}) as Record<string, unknown>, op.id);
        // A newer step merged into this op while it was in flight: send again rather than lose it.
        const fresh = await db.crmOp.findUnique({ where: { id: op.id }, select: { payload: true } });
        if (JSON.stringify(fresh?.payload) !== JSON.stringify(op.payload)) continue;
        await db.crmOp.update({ where: { id: op.id }, data: { status: "SENT", sentAt: new Date(), error: null } });
        out.sent += 1;
      } catch (e) {
        const dependency = e instanceof DependencyMissing;
        const transient = dependency || (e instanceof TwentyError ? e.transient : true);
        const next = afterFailure(op.tries, transient);
        await db.crmOp.update({ where: { id: op.id }, data: { status: next.status, tries: next.tries, error: (e as Error).message.slice(0, 300) } });
        if (next.status === "FAILED") out.failed += 1;
        else out.held += 1;
        // Twenty is down or slow: the rest would only fail the same way. A missing dependency is just this op.
        if (!dependency && transient) break;
      }
    }
    out.calls = twentyCalls() - before;
    const fresh = window.at && started - Date.parse(window.at) < 60_000;
    await writeState(WINDOW_KEY, fresh ? { at: window.at, used: (window.used ?? 0) + out.calls } : { at: new Date(started).toISOString(), used: out.calls }).catch(() => {});
    await alertOnBacklog();
    return out;
  } finally {
    passes.leave();
    await releaseLease(LEASE, lease);
  }
}

async function alertOnBacklog(): Promise<void> {
  const oldest = await db.crmOp.findFirst({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
  if (!oldest) return;
  const last = await readState<{ at?: string }>(ALERT_KEY, {});
  if (!backlogAlertDue(oldest.createdAt, last.at ? new Date(last.at) : null)) return;
  const count = await db.crmOp.count({ where: { status: "QUEUED" } });
  const { postSlackCard } = await import("@/components/agent/whatsapp");
  await postSlackCard(backlogCard(count, oldest.createdAt)).catch(() => {});
  await writeState(ALERT_KEY, { at: new Date().toISOString() });
}

// ── one op ───────────────────────────────────────────────────────────────

async function sendOp(object: CrmObject, key: string, payload: Record<string, unknown>, opId: string): Promise<void> {
  if (object === "tenant" || object === "deal") return upsertRecord(object, key, payload);
  if (object === "task") return upsertTask(key, payload);
  return createNote(key, payload, opId);
}

const linkOf = (k: string) => db.crmLink.findUnique({ where: { key: k } });

async function saveLink(key: string, object: string, twentyId: string, pushedFields: string[]): Promise<void> {
  const data = { object, twentyId, pushedFields, pushedAt: new Date() };
  try {
    await db.crmLink.upsert({ where: { key }, create: { key, ...data }, update: data });
  } catch {
    // (object, twentyId) already belongs to another key — that key was merged away in Twenty: take it over.
    await db.crmLink.deleteMany({ where: { object, twentyId, NOT: { key } } });
    await db.crmLink.upsert({ where: { key }, create: { key, ...data }, update: data });
  }
}

/** A Twenty id for something mkan keys: CrmLink first, then a lookup by the dedupe field (and cached). */
async function twentyIdFor(object: string, key: string, plural: string, field: string, quote = true): Promise<string | null> {
  const linkKey = `${object}:${key}`;
  const link = await linkOf(linkKey);
  if (link) return link.twentyId;
  const res = quote
    ? await findOne(plural, field, key)
    : recordsOf(await twentyRest("GET", `${plural}?filter=${field}[eq]:${encodeURIComponent(key)}&limit=1&depth=0`), plural)[0] ?? null;
  if (!res?.id) return null;
  await saveLink(linkKey, object, String(res.id), []);
  return String(res.id);
}

/** A Prisma Listing → its Twenty `home`: mkanListingId (the row id every script joins on), else the public code. */
async function homeIdFor(listingId: number): Promise<string | null> {
  const cached = await twentyIdFor("home", String(listingId), "homes", "mkanListingId", false);
  if (cached) return cached;
  const l = await db.listing.findUnique({ where: { id: listingId }, select: { code: true } });
  if (!l?.code) return null;
  const rec = await findOne("homes", "listingId", l.code);
  if (!rec?.id) return null;
  await saveLink(`home:${listingId}`, "home", String(rec.id), []);
  return String(rec.id);
}

async function brokerIdFor(brokerId: string): Promise<string | null> {
  const b = await db.broker.findUnique({ where: { id: brokerId }, select: { twentyId: true } });
  return b?.twentyId ?? null;
}

/** Turn the `$` references of a payload into Twenty fields. A reference that cannot be resolved is left out and logged. */
async function resolveFields(object: "tenant" | "deal", payload: Record<string, unknown>): Promise<{ fields: Record<string, unknown>; refs: string[] }> {
  const fields: Record<string, unknown> = {};
  const refs: string[] = [];
  for (const [k, v] of Object.entries(payload)) if (!isRef(k) && v !== undefined) fields[k] = v;
  const set = (name: string, id: string | null, what: string) => {
    if (id) {
      fields[name] = id;
      refs.push(name);
    } else console.warn(`[crm] ${object}: ${what} has no Twenty record yet — relation left out`);
  };
  if (object === "deal") {
    if (typeof payload.$tenant === "string") set("tenantId", await twentyIdFor("tenant", payload.$tenant, "tenants", "mkanProfileId"), `tenant ${payload.$tenant}`);
    if (typeof payload.$broker === "string") set("brokerId", await brokerIdFor(payload.$broker), `broker ${payload.$broker}`);
    if (typeof payload.$home === "number") set("homeId", await homeIdFor(payload.$home), `home ${payload.$home}`);
  } else if (typeof payload.$phone === "string") {
    const p = twentyPhones(payload.$phone);
    if (p) {
      fields.phone = p;
      fields.whatsapp = p;
      refs.push("phone", "whatsapp");
    }
  }
  return { fields, refs };
}

async function upsertRecord(object: "tenant" | "deal", key: string, payload: Record<string, unknown>): Promise<void> {
  const def = CRM_OBJECTS[object];
  const { fields, refs } = await resolveFields(object, payload);
  fields[def.keyField] = key;
  const linkKey = `${object}:${key}`;
  const pushed = pushedFieldsOf(fields, refs);
  let id = (await linkOf(linkKey))?.twentyId ?? null;
  if (id) {
    try {
      await twentyRest("PATCH", `${def.plural}/${id}`, fields);
      return void (await saveLink(linkKey, object, id, pushed));
    } catch (e) {
      if (!(e instanceof TwentyError && e.status === 404)) throw e;
      await db.crmLink.deleteMany({ where: { key: linkKey } }); // deleted in Twenty: find or create again
      id = null;
    }
  }
  const found = await findOne(def.plural, def.keyField, key);
  if (found?.id) {
    await twentyRest("PATCH", `${def.plural}/${found.id}`, fields);
    return void (await saveLink(linkKey, object, String(found.id), pushed));
  }
  // A new tenant needs a name (Twenty's label field): the number, until the tenant says theirs.
  if (object === "tenant" && !fields.name) fields.name = typeof payload.$phone === "string" ? payload.$phone : "Tenant";
  const created = createdOf(await twentyRest("POST", def.plural, fields));
  if (!created?.id) throw new TwentyError(null, `POST ${def.plural} answered no id`, true);
  await saveLink(linkKey, object, String(created.id), pushed);
}

/** Abdout's workspace member id: looked up by email once, then cached in CrmLink. */
async function assigneeId(email: string): Promise<string | null> {
  const linkKey = `member:${email}`;
  const link = await linkOf(linkKey);
  if (link) return link.twentyId;
  const members = recordsOf(await twentyRest("GET", "workspaceMembers?limit=100&depth=0"), "workspaceMembers");
  const m = members.find((x) => String(x.userEmail ?? "").toLowerCase() === email);
  if (!m?.id) {
    console.warn(`[crm] no Twenty workspace member with email ${email} — the viewing Task is left unassigned`);
    return null;
  }
  await saveLink(linkKey, "member", String(m.id), []);
  return String(m.id);
}

const markdown = (text: string) => ({ markdown: text, blocknote: null });

/** One Task per deal: a moved viewing PATCHes it. Linked to the deal by a taskTarget. */
async function upsertTask(key: string, payload: Record<string, unknown>): Promise<void> {
  const dealId = typeof payload.$deal === "string" ? (await linkOf(`deal:${payload.$deal}`))?.twentyId : null;
  if (!dealId) throw new DependencyMissing(`deal ${payload.$deal} is not in Twenty yet`);
  const body = { title: String(payload.title ?? "Viewing"), dueAt: payload.dueAt, bodyV2: markdown(String(payload.body ?? "")) };
  const linkKey = `task:${key}`;
  const existing = await linkOf(linkKey);
  if (existing) {
    try {
      await twentyRest("PATCH", `tasks/${existing.twentyId}`, body);
      return void (await saveLink(linkKey, "task", existing.twentyId, Object.keys(body)));
    } catch (e) {
      if (!(e instanceof TwentyError && e.status === 404)) throw e;
      await db.crmLink.deleteMany({ where: { key: linkKey } });
    }
  }
  const assignee = await assigneeId(typeof payload.$assignee === "string" ? payload.$assignee : assigneeEmail());
  const created = createdOf(await twentyRest("POST", "tasks", { ...body, status: "TODO", ...(assignee ? { assigneeId: assignee } : {}) }));
  if (!created?.id) throw new TwentyError(null, "POST tasks answered no id", true);
  // The link first: if the taskTarget below fails and the op is retried, the Task is not created twice.
  await saveLink(linkKey, "task", String(created.id), Object.keys(body));
  await twentyRest("POST", "taskTargets", { taskId: created.id, dealId });
}

/** A note on a deal. `note:<opId>` records the created note, so a retry after a failed noteTarget does not duplicate it. */
async function createNote(key: string, payload: Record<string, unknown>, opId: string): Promise<void> {
  const dealId = typeof payload.$deal === "string" ? (await linkOf(`deal:${payload.$deal}`))?.twentyId : null;
  if (!dealId) throw new DependencyMissing(`deal ${payload.$deal} is not in Twenty yet`);
  const linkKey = `note:${opId}`;
  let noteId = (await linkOf(linkKey))?.twentyId ?? null;
  if (!noteId) {
    const text = String(payload.body ?? "");
    const created = createdOf(await twentyRest("POST", "notes", { title: String((payload.title as string | undefined) || text.slice(0, 60) || "Note"), bodyV2: markdown(text) }));
    if (!created?.id) throw new TwentyError(null, "POST notes answered no id", true);
    noteId = String(created.id);
    await saveLink(linkKey, "note", noteId, []);
  }
  await twentyRest("POST", "noteTargets", { noteId, dealId });
}
