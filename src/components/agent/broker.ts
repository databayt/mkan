import "server-only";

/**
 * The broker loop: ask the people who can speak for a shortlisted home whether
 * it is still available, apply their answers to every task waiting on them,
 * and give up honestly after 24 h of silence.
 *
 * Silence is never confirmation, and a request is never repeated to the same
 * broker for the same home within 24 h — a later tenant's task joins the
 * pending request instead.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { publicAppUrl } from "../../../scripts/crm/public-links";
import { availabilityMessage, brokerAnswerMessage, needSummary, type BrokerHomeLine } from "./broker-message";
import { CONFIRMATION_TTL_DAYS } from "./rank";
import type { Requirements } from "./requirements";
import type { EventKind, ShortlistItem, StepStatus } from "./types";
import { sendMessages, sendToBroker } from "./whatsapp";

export const REQUEST_TTL_HOURS = 24;
const json = (v: unknown) => v as Prisma.InputJsonValue;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const brokerLink = (token: string, lang = "en") => `${publicAppUrl()}/${lang}/b/${token}`;

/** Append an event at the task's next seq (tasks are written by one turn or one answer at a time). */
export async function appendTaskEvent(taskId: string, kind: EventKind, status: StepStatus, payload: Record<string, unknown>) {
  await appendTaskEvents(taskId, [[kind, status, payload]]);
}

/** Several events in one write: one read of the last seq, one insert. */
export async function appendTaskEvents(taskId: string, rows: [EventKind, StepStatus, Record<string, unknown>][]) {
  if (rows.length === 0) return;
  for (let attempt = 0; attempt < 3; attempt++) {
    const last = await db.agentEvent.findFirst({ where: { taskId }, orderBy: { seq: "desc" }, select: { seq: true } });
    const base = last?.seq ?? 0;
    try {
      await db.agentEvent.createMany({ data: rows.map(([kind, status, payload], i) => ({ taskId, seq: base + i + 1, kind, status, payload: json(payload) })) });
      return;
    } catch (err) {
      if (attempt === 2) throw err; // another writer took the seq; read it again
    }
  }
}

/** Latest broker answer per listing: AVAILABLE within the TTL, or RENTED within 30 days. */
export async function brokerAnswers(listingIds: number[]): Promise<Map<number, { status: "AVAILABLE" | "RENTED"; at: Date }>> {
  if (listingIds.length === 0) return new Map();
  const rows = await db.brokerRequest.findMany({
    where: {
      listingId: { in: listingIds },
      OR: [
        { status: "AVAILABLE", respondedAt: { gte: new Date(Date.now() - CONFIRMATION_TTL_DAYS * 86_400_000) } },
        { status: "RENTED", respondedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
      ],
    },
    orderBy: { respondedAt: "desc" },
    select: { listingId: true, status: true, respondedAt: true },
  });
  const out = new Map<number, { status: "AVAILABLE" | "RENTED"; at: Date }>();
  for (const r of rows) if (!out.has(r.listingId) && r.respondedAt) out.set(r.listingId, { status: r.status as "AVAILABLE" | "RENTED", at: r.respondedAt });
  return out;
}

type BrokerLink = { listingId: number; userId: string; user: { phoneNumber: string | null; username: string | null; sourceHostId: string | null } };
type RecentRequest = { id: string; listingId: number; brokerUserId: string; status: string; expiresAt: Date; taskId: string | null };

/** Everyone who can speak for each home, owner first, then brokers by age. */
async function brokersFor(listingIds: number[]): Promise<Map<number, BrokerLink[]>> {
  const links = await db.listingBroker.findMany({
    where: { listingId: { in: listingIds }, user: { phoneNumber: { not: null } } },
    orderBy: [{ role: "desc" }, { createdAt: "asc" }],
    select: { listingId: true, userId: true, user: { select: { phoneNumber: true, username: true, sourceHostId: true } } },
  });
  const out = new Map<number, BrokerLink[]>();
  for (const l of links) if (l.user.phoneNumber) out.set(l.listingId, [...(out.get(l.listingId) ?? []), l]);
  return out;
}

/**
 * Who to ask about one home, given today's requests. A question already out
 * is joined; otherwise the first broker not yet asked today — so a broker who
 * said nothing hands the home to the next one who posted it.
 */
export function pickBroker(brokers: BrokerLink[], recent: Map<string, RecentRequest>): { join: RecentRequest; broker: BrokerLink } | { ask: BrokerLink } | null {
  for (const b of brokers) {
    const r = recent.get(`${b.listingId}:${b.userId}`);
    if (r?.status === "PENDING") return { join: r, broker: b };
  }
  const fresh = brokers.find((b) => !recent.has(`${b.listingId}:${b.userId}`));
  return fresh ? { ask: fresh } : null;
}

const handleOf = (b: BrokerLink) => (b.user.sourceHostId?.startsWith("tiktok:") ? b.user.sourceHostId.slice(7) : null);

/** Send each broker one message for all their homes, and record the channel it went by. */
async function sendGrouped(
  groups: Map<string, { phone: string; handle: string | null; homes: BrokerHomeLine[]; ids: string[] }>,
  need: { en: string; rw: string },
): Promise<{ broker: string | null; count: number; channel: string }[]> {
  return Promise.all(
    [...groups.values()].map(async (m) => {
      const channel = await sendToBroker(m.phone, availabilityMessage(m.handle, need, m.homes), m.handle ? `@${m.handle}` : m.phone, m.ids);
      // "queued": the Mac's outbox stamps channel "evolution" and sentAt once it really went out.
      await db.brokerRequest.updateMany({ where: { id: { in: m.ids } }, data: { channel, sentAt: null } });
      return { broker: m.handle ? `@${m.handle}` : null, count: m.homes.length, channel };
    }),
  );
}

/**
 * For every unconfirmed home on the shortlist that has a reachable broker,
 * make sure a request is out. One WhatsApp per broker, listing all their homes.
 * Returns the listing ids now awaiting an answer.
 *
 * Reads and writes in batches: this ran one query per home and one event
 * insert per home and per broker, all in sequence, inside the tenant's turn.
 */
export async function requestConfirmations(taskId: string, shortlist: ShortlistItem[], r: Requirements, lang: string): Promise<number[]> {
  const unconfirmed = shortlist.filter((s) => s.availability === "unconfirmed");
  if (unconfirmed.length === 0) return [];
  const ids = unconfirmed.map((s) => s.id);
  const since = new Date(Date.now() - REQUEST_TTL_HOURS * 3_600_000);
  const [brokers, recentRows] = await Promise.all([
    brokersFor(ids),
    db.brokerRequest.findMany({
      where: { listingId: { in: ids }, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: { id: true, listingId: true, brokerUserId: true, status: true, expiresAt: true, taskId: true },
    }),
  ]);
  const recent = new Map<string, RecentRequest>();
  for (const q of recentRows) if (!recent.has(`${q.listingId}:${q.brokerUserId}`)) recent.set(`${q.listingId}:${q.brokerUserId}`, q);

  const need = needSummary(r);
  const needJson = json({ requirements: r, summary: need });
  const joins: Prisma.BrokerRequestCreateManyInput[] = [];
  const asks: { row: Prisma.BrokerRequestCreateManyInput; token: string; item: ShortlistItem; broker: BrokerLink }[] = [];
  const events: [EventKind, StepStatus, Record<string, unknown>][] = [];
  const waiting: number[] = [];

  for (const item of unconfirmed) {
    const pick = pickBroker(brokers.get(item.id) ?? [], recent);
    if (!pick) continue;
    waiting.push(item.id);
    if ("join" in pick) {
      // Already asked today: this task joins the same question (a row of its
      // own so the answer reaches it), and nothing is sent again.
      if (pick.join.taskId !== taskId) {
        joins.push({ tokenHash: hashToken(randomBytes(18).toString("base64url")), listingId: item.id, brokerUserId: pick.broker.userId, taskId, locale: lang, need: needJson, channel: "joined", expiresAt: pick.join.expiresAt });
      }
      events.push(["broker_contact_started", "waiting_person", { listingId: item.id, title: item.title, reused: true }]);
      continue;
    }
    const token = randomBytes(18).toString("base64url");
    const row = { tokenHash: hashToken(token), listingId: item.id, brokerUserId: pick.ask.userId, taskId, locale: lang, need: needJson, expiresAt: new Date(Date.now() + REQUEST_TTL_HOURS * 3_600_000) };
    asks.push({ row, token, item, broker: pick.ask });
  }

  const created = asks.length
    ? await db.brokerRequest.createManyAndReturn({ data: asks.map((a) => a.row), select: { id: true, tokenHash: true } })
    : [];
  if (joins.length) await db.brokerRequest.createMany({ data: joins });
  const idByHash = new Map(created.map((c) => [c.tokenHash, c.id]));
  const groups = new Map<string, { phone: string; handle: string | null; homes: BrokerHomeLine[]; ids: string[] }>();
  for (const a of asks) {
    const id = idByHash.get(a.row.tokenHash);
    if (!id) continue;
    const g = groups.get(a.broker.userId) ?? { phone: a.broker.user.phoneNumber!, handle: handleOf(a.broker), homes: [], ids: [] };
    g.homes.push({ title: a.item.title, link: brokerLink(a.token, "en") });
    g.ids.push(id);
    groups.set(a.broker.userId, g);
  }
  for (const sent of await sendGrouped(groups, need)) events.push(["broker_contact_started", "waiting_person", sent]);
  await appendTaskEvents(taskId, events);
  return waiting;
}

type Answer = "AVAILABLE" | "RENTED" | "NO_REPLY";

/** Re-derive tasks' status: WAITING while any of its homes still has a pending request. */
async function settleTasks(taskIds: string[]) {
  if (taskIds.length === 0) return;
  const pending = await db.brokerRequest.groupBy({ by: ["taskId"], where: { taskId: { in: taskIds }, status: "PENDING" }, _count: true });
  const waiting = new Set(pending.map((p) => p.taskId));
  const ids = (s: boolean) => taskIds.filter((t) => waiting.has(t) === s);
  // A RUNNING turn writes its own status when it finishes.
  await Promise.all([
    ids(true).length ? db.agentTask.updateMany({ where: { id: { in: ids(true) }, status: { not: "RUNNING" } }, data: { status: "WAITING" } }) : null,
    ids(false).length ? db.agentTask.updateMany({ where: { id: { in: ids(false) }, status: { not: "RUNNING" } }, data: { status: "DONE" } }) : null,
  ]);
}

/**
 * Write a broker's answer onto every task whose shortlist holds the home and
 * that is still waiting — not just the task that sent the request.
 */
export async function applyAnswer(listingId: number, answer: Answer) {
  // Every open question about this home has its answer now.
  if (answer !== "NO_REPLY") {
    await db.brokerRequest.updateMany({ where: { listingId, status: "PENDING" }, data: { status: answer, respondedAt: new Date() } });
  }
  const tasks = await db.agentTask.findMany({
    where: { status: { in: ["WAITING", "DONE"] }, updatedAt: { gte: new Date(Date.now() - 7 * 86_400_000) }, brokerRequests: { some: { listingId } } },
    select: { id: true, shortlist: true, locale: true, profile: { select: { waPhone: true } } },
  });
  const availability = answer === "AVAILABLE" ? "confirmed" : answer === "RENTED" ? "rented" : "no_reply";
  await Promise.all(
    tasks.map(async (t) => {
      const list = ((t.shortlist as unknown as ShortlistItem[]) ?? []).map((s) =>
        s.id === listingId ? { ...s, availability: availability as ShortlistItem["availability"] } : s,
      );
      const item = list.find((s) => s.id === listingId);
      await db.agentTask.update({ where: { id: t.id }, data: { shortlist: json(list) } });
      await appendTaskEvent(t.id, "broker_replied", answer === "AVAILABLE" ? "done" : answer === "RENTED" ? "failed" : "uncertain", {
        listingId,
        title: item?.title ?? null,
        answer: availability,
      });
    }),
  );
  await settleTasks(tasks.map((t) => t.id));
  await tellWhatsAppTenants(tasks, listingId, answer);
  if (answer === "AVAILABLE") await db.listing.update({ where: { id: listingId }, data: { lastAvailabilityConfirmedAt: new Date() } });
}

/**
 * A tenant who asked on WhatsApp hears the broker's answer there — the web
 * chat updates itself, a WhatsApp chat does not. Queued like every other
 * send (whatsapp.ts), so the outbox's caps and the #mkan fallback apply.
 */
async function tellWhatsAppTenants(tasks: { id: string; shortlist: unknown; locale: string; profile: { waPhone: string | null } | null }[], listingId: number, answer: Answer) {
  if (answer !== "AVAILABLE" && answer !== "RENTED") return;
  const messages = tasks.flatMap((t) => {
    const to = t.profile?.waPhone;
    if (!to) return [];
    const title = ((t.shortlist as ShortlistItem[] | null) ?? []).find((s) => s.id === listingId)?.title?.trim() || `#${listingId}`;
    return [{ kind: "TENANT_ALERT" as const, to, body: brokerAnswerMessage(t.locale, title, answer === "AVAILABLE", `${publicAppUrl()}/${t.locale}/find?c=${t.id}`), label: "tenant" }];
  });
  if (messages.length) await sendMessages(messages, `Broker answered home #${listingId}`);
}

/**
 * Cron: requests unanswered past their expiry become NO_REPLY — and the home
 * goes to the next broker who posted it, if there is one nobody has asked
 * today. Only when nobody is left does the tenant hear "no reply".
 */
export async function expireRequests(now = new Date()): Promise<number> {
  const stale = await db.brokerRequest.findMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    select: { id: true, listingId: true, taskId: true, locale: true, need: true, listing: { select: { title: true } } },
  });
  if (stale.length === 0) return 0;
  await db.brokerRequest.updateMany({ where: { id: { in: stale.map((r) => r.id) } }, data: { status: "NO_REPLY" } });

  const listingIds = [...new Set(stale.map((r) => r.listingId))];
  const since = new Date(now.getTime() - REQUEST_TTL_HOURS * 3_600_000);
  const [brokers, recentRows, stillPending] = await Promise.all([
    brokersFor(listingIds),
    db.brokerRequest.findMany({
      where: { listingId: { in: listingIds }, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: { id: true, listingId: true, brokerUserId: true, status: true, expiresAt: true, taskId: true },
    }),
    db.brokerRequest.groupBy({ by: ["listingId"], where: { listingId: { in: listingIds }, status: "PENDING", expiresAt: { gte: now } }, _count: true }),
  ]);
  const recent = new Map<string, RecentRequest>();
  for (const q of recentRows) if (!recent.has(`${q.listingId}:${q.brokerUserId}`)) recent.set(`${q.listingId}:${q.brokerUserId}`, q);
  const pendingNow = new Set(stillPending.map((p) => p.listingId));

  for (const listingId of listingIds) {
    if (pendingNow.has(listingId)) continue; // someone else is still being asked
    const pick = pickBroker(brokers.get(listingId) ?? [], recent);
    const mine = stale.filter((r) => r.listingId === listingId);
    if (!pick || !("ask" in pick)) {
      await applyAnswer(listingId, "NO_REPLY");
      continue;
    }
    // The next broker gets the same question, for every task that asked.
    const first = mine[0]!;
    const summary = ((first.need as { summary?: { en: string; rw: string } } | null)?.summary) ?? { en: "a home in Kigali", rw: "inzu i Kigali" };
    const tokens = mine.map(() => randomBytes(18).toString("base64url"));
    const created = await db.brokerRequest.createManyAndReturn({
      data: mine.map((r, i) => ({ tokenHash: hashToken(tokens[i]!), listingId, brokerUserId: pick.ask.userId, taskId: r.taskId, locale: r.locale, need: json(r.need), expiresAt: new Date(now.getTime() + REQUEST_TTL_HOURS * 3_600_000) })),
      select: { id: true },
    });
    await sendGrouped(new Map([[pick.ask.userId, { phone: pick.ask.user.phoneNumber!, handle: handleOf(pick.ask), homes: [{ title: first.listing.title ?? "Home in Kigali", link: brokerLink(tokens[0]!, "en") }], ids: created.map((c) => c.id) }]]), summary);
    await Promise.all(
      [...new Set(mine.map((r) => r.taskId).filter((t): t is string => !!t))].map((t) =>
        appendTaskEvent(t, "broker_contact_started", "waiting_person", { listingId, title: first.listing.title, broker: handleOf(pick.ask) ? `@${handleOf(pick.ask)}` : null, next: true }),
      ),
    );
  }
  return stale.length;
}

/**
 * Cron: a turn whose `after()` was lost stays RUNNING forever — unlock it, as
 * an open tab would (task-view.ts `recoverStuck`). One that already answered
 * is done; one that never did gets the error reply, so the chat does not end
 * on the tenant's own message.
 */
export async function failStuckTasks(now = new Date(), olderThanMs = 90_000): Promise<number> {
  const cutoff = new Date(now.getTime() - olderThanMs);
  const errorReply = JSON.stringify([{ role: "agent", kind: "error", at: now.toISOString() }]);
  return db.$executeRaw`
    UPDATE "AgentTask" SET
      "status" = (CASE WHEN "messages"->-1->>'role' = 'agent' THEN 'DONE' ELSE 'FAILED' END)::"AgentTaskStatus",
      "messages" = CASE WHEN "messages"->-1->>'role' = 'agent' THEN "messages" ELSE "messages" || ${errorReply}::jsonb END,
      "updatedAt" = ${now}
    WHERE "status" = 'RUNNING' AND "updatedAt" < ${cutoff}`;
}
