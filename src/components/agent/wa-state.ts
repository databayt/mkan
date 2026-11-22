/**
 * The WhatsApp bridge's working state, in Postgres (`WaState`, one JSON value
 * per key) — it lived in JSON files on the Mac until the bridge moved to
 * Cloudflare, where the container's disk does not survive a restart.
 *
 *   seen          message ids the outbox poll already handled
 *   pending       broker photos waiting for their price
 *   tenant-stop   phones that said STOP (START removes them)
 *   tenant-human  when a person last typed in a chat from Mkan's side
 *   tenant-sent   ids and times of the agent's own replies — a fromMe
 *                 message not in it was typed by a person
 *   outbox-lease  one drain at a time
 *   streak        failed runs in a row, and whether #mkan heard
 *   tmsg:<id>     one claim per tenant message (below)
 *   thook:<id>    the webhook delivered this tenant message — one the poll finds without it was missed
 *   hook-miss     the misses of the last hours, and when #mkan last heard (tenant-pure.ts noteMisses)
 *   alias:<lid>   {phone} — the phone digits of a `<id>@lid` address (one person, two addresses)
 *   lid-of:<phone> {lid} — the reverse, so a phone-keyed check also reads the lid's history
 *   tburst:<phone> a tenant's unanswered lines while the chat is not yet quiet (tenant-pure.ts BurstLine)
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { lidOf, type BurstLine, type ClaimRow } from "../../../scripts/wa/tenant-pure";

export async function readState<T>(key: string, empty: T): Promise<T> {
  const row = await db.waState.findUnique({ where: { key } });
  return row ? (row.value as T) : empty;
}

export async function writeState(key: string, value: unknown): Promise<void> {
  const v = value as Prisma.InputJsonValue;
  await db.waState.upsert({ where: { key }, create: { key, value: v }, update: { value: v } });
}

/** Read-modify-write in turn: the webhook and the cron share these keys inside one container. */
let queue: Promise<unknown> = Promise.resolve();
export function mutateState<T>(key: string, empty: T, change: (value: T) => T): Promise<T> {
  const run = async () => {
    const next = change(await readState(key, empty));
    await writeState(key, next);
    return next;
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

/**
 * Take the lease on `key` for `ms` unless someone holds it — the holder's token, or null. A
 * conditional update, so two crons racing for it cannot both win.
 */
export async function takeLease(key: string, ms: number): Promise<string | null> {
  const now = Date.now();
  const until = new Date(now + ms).toISOString();
  const owner = `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await db.waState.createMany({ data: [{ key, value: { until: new Date(0).toISOString() } }], skipDuplicates: true });
  const taken = await db.$executeRaw`UPDATE "WaState" SET "value" = jsonb_build_object('until', ${until}::text, 'owner', ${owner}::text), "updatedAt" = now()
    WHERE "key" = ${key} AND ("value"->>'until')::timestamptz < ${new Date(now)}`;
  return taken === 1 ? owner : null;
}

/** Give the lease back — only the holder can: a pass that outran its lease must not free the next one's. */
export async function releaseLease(key: string, owner?: string | null): Promise<void> {
  if (!owner) return;
  await db.$executeRaw`UPDATE "WaState" SET "value" = jsonb_build_object('until', ${new Date(0).toISOString()}::text), "updatedAt" = now()
    WHERE "key" = ${key} AND "value"->>'owner' = ${owner}`;
}

/**
 * Add to / take from a list of strings in one SQL statement — the webhook, the cron and the Mac's
 * scripts can all write the same row, and mutateState's queue only orders one process (2026-11-06:
 * a STOP written by one could be dropped by another's read-modify-write).
 */
export async function addToList(key: string, item: string): Promise<void> {
  await db.$executeRaw`INSERT INTO "WaState" ("key", "value", "updatedAt") VALUES (${key}, ${JSON.stringify([item])}::jsonb, now())
    ON CONFLICT ("key") DO UPDATE SET "value" = CASE WHEN "WaState"."value" @> to_jsonb(${item}::text) THEN "WaState"."value"
      ELSE COALESCE("WaState"."value", '[]'::jsonb) || to_jsonb(${item}::text) END, "updatedAt" = now()`;
}

export async function removeFromList(key: string, item: string): Promise<void> {
  await db.$executeRaw`UPDATE "WaState" SET "value" = COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements("value") x WHERE x <> to_jsonb(${item}::text)), '[]'::jsonb), "updatedAt" = now()
    WHERE "key" = ${key}`;
}

// ── one claim per tenant message ─────────────────────────────────────────
// The webhook (instant) and the outbox poll (every 2 min) can both bring a tenant's message. A row
// `tmsg:<id>` decides who answers it and remembers how far it got, so a message is never lost and
// never answered twice (2026-11-06; it used to be marked "seen" before it was answered, so a busy
// turn or an error dropped it for good):
//   working  someone is answering it; older than CLAIM_STALE_MS = that run died → retried
//   reply    the reply is written but not yet sent → the next pass re-sends the same text
//   done     answered, or deliberately not answered (STOP, a person's chat, too old…)
// A busy turn deletes its claim, so the poll starts it fresh. A claim another run holds is "held": not
// answered, not to be marked seen — the poll looks again once that run has finished or gone stale
// (2026-11-08: it came back as null, the poll called it a duplicate, and a run that then died was lost).

export type MessageClaim =
  | { mode: "fresh" | "retry"; tries: number }
  | { mode: "resend"; text: string; tries: number; at: string }
  | { mode: "held" };
type ClaimValue = { s: "working" | "reply" | "done"; at: string; tries: number; text?: string };

export const CLAIM_STALE_MS = 120_000;
export const MAX_ANSWER_TRIES = 3;
const claimKey = (msgId: string) => `tmsg:${msgId}`;

/** Take a tenant message to answer; `held` while another run is on it; null only when it is settled. */
export async function claimMessage(msgId: string, now = new Date()): Promise<MessageClaim | null> {
  const key = claimKey(msgId);
  const fresh: ClaimValue = { s: "working", at: now.toISOString(), tries: 1 };
  const made = await db.waState.createMany({ data: [{ key, value: fresh }], skipDuplicates: true });
  if (made.count === 1) return { mode: "fresh", tries: 1 };
  const row = await db.waState.findUnique({ where: { key }, select: { value: true } });
  const v = row?.value as ClaimValue | undefined;
  if (!v || v.s === "done") return null;
  if (v.s === "reply" && v.text) return { mode: "resend", text: v.text, tries: v.tries ?? 1, at: v.at };
  if (now.getTime() - new Date(v.at).getTime() < CLAIM_STALE_MS) return { mode: "held" };
  // A run that died mid-answer: take it over — conditionally, so two passes cannot both win.
  const tries = (v.tries ?? 1) + 1;
  const next: ClaimValue = { s: "working", at: now.toISOString(), tries };
  const taken = await db.$executeRaw`UPDATE "WaState" SET "value" = ${JSON.stringify(next)}::jsonb, "updatedAt" = now()
    WHERE "key" = ${key} AND "value"->>'s' = 'working' AND "value"->>'at' = ${v.at}`;
  return taken === 1 ? { mode: "retry", tries } : { mode: "held" };
}

/** The webhook brought this tenant message (the poll counts one without the mark as a miss). */
export async function markHeard(msgId: string): Promise<void> {
  await db.waState.createMany({ data: [{ key: `thook:${msgId}`, value: {} }], skipDuplicates: true }).catch(() => {});
}

/** Which of these messages the webhook brought. */
export async function heardIds(msgIds: string[]): Promise<Set<string>> {
  if (msgIds.length === 0) return new Set();
  const rows = await db.waState.findMany({ where: { key: { in: msgIds.map((id) => `thook:${id}`) } }, select: { key: true } });
  return new Set(rows.map((r) => r.key.slice("thook:".length)));
}

/** The reply is written: if the send fails, the next pass sends this same text. */
export async function holdReply(msgId: string, text: string, tries: number): Promise<void> {
  await writeState(claimKey(msgId), { s: "reply", at: new Date().toISOString(), tries, text } satisfies ClaimValue);
}

/** Answered (or deliberately not): no pass touches it again. */
export async function settleMessage(msgId: string): Promise<void> {
  await writeState(claimKey(msgId), { s: "done", at: new Date().toISOString(), tries: 0 } satisfies ClaimValue);
}

/** Not started after all (the last turn was still running): the poll takes it fresh. */
export async function releaseMessage(msgId: string): Promise<void> {
  await db.waState.deleteMany({ where: { key: claimKey(msgId) } });
}

/** Claims older than the poll's lookback are history; so is the ask a sent message carried, after a week. */
export async function pruneMessageClaims(olderThanMs = 2 * 86_400_000): Promise<number> {
  const now = Date.now();
  const [claims, bursts, heard, asks] = await Promise.all([
    db.waState.deleteMany({ where: { key: { startsWith: "tmsg:" }, updatedAt: { lt: new Date(now - olderThanMs) } } }),
    db.waState.deleteMany({ where: { key: { startsWith: "tburst:" }, updatedAt: { lt: new Date(now - olderThanMs) } } }),
    db.waState.deleteMany({ where: { key: { startsWith: "thook:" }, updatedAt: { lt: new Date(now - olderThanMs) } } }),
    db.waState.deleteMany({ where: { key: { startsWith: "ask-msg:" }, updatedAt: { lt: new Date(now - 7 * 86_400_000) } } }),
  ]);
  return claims.count + bursts.count + heard.count + asks.count;
}

// ── one person, two addresses ────────────────────────────────────────────────────────────────────

const aliasKey = (lid: string) => `alias:${lid}`;
const lidOfKey = (phone: string) => `lid-of:${phone}`;

/** The phone a lid is known by; null when no message has taught us one. */
export async function phoneOfLid(lid: string | null | undefined): Promise<string | null> {
  const l = lidOf(lid);
  if (!l) return null;
  const row = await db.waState.findUnique({ where: { key: aliasKey(l) }, select: { value: true } }).catch(() => null);
  const phone = (row?.value as { phone?: string } | null)?.phone;
  return phone || null;
}

/** The lid a phone is known by; null when none has been seen. */
export async function lidOfPhone(phone: string | null | undefined): Promise<string | null> {
  if (!phone) return null;
  const row = await db.waState.findUnique({ where: { key: lidOfKey(phone) }, select: { value: true } }).catch(() => null);
  return (row?.value as { lid?: string } | null)?.lid || null;
}

/**
 * Remember that this lid and this phone are one person (a message key carried both). Writes only when
 * the pair is new or changed — most messages repeat a pair already known. Never throws.
 */
export async function rememberAlias(lid: string, phone: string): Promise<void> {
  const l = lidOf(lid);
  if (!l || !phone) return;
  try {
    if ((await phoneOfLid(l)) !== phone) await writeState(aliasKey(l), { phone, at: new Date().toISOString() });
    if ((await lidOfPhone(phone)) !== l) await writeState(lidOfKey(phone), { lid: l, at: new Date().toISOString() });
  } catch {
    // The alias only widens a check; a failed write costs nothing the next message cannot repair.
  }
}

/** Every address of the person behind this one (the address itself first): the phone and the lid. */
export async function addressesOf(address: string): Promise<string[]> {
  const lid = lidOf(address);
  const other = lid ? await phoneOfLid(lid) : await lidOfPhone(address);
  return other && other !== address ? [address, other] : [address];
}

// ── one reply per burst ──────────────────────────────────────────────────────────────────────────

const burstKey = (phone: string) => `tburst:${phone}`;
type BurstRow = { lines: { id: string; text: string; sentAt: string; arrivedAt: string; media?: boolean }[]; lastId: string; lastAt: string };

/**
 * Add one line to the phone's burst in a single SQL statement (webhook runs in several requests at once;
 * a read-modify-write would drop a line). A line already in it (a redelivery) is not added twice.
 */
export async function addBurstLine(phone: string, line: BurstLine): Promise<void> {
  const arrived = (line.arrivedAt ?? new Date()).toISOString();
  const one = JSON.stringify({ id: line.id, text: line.text, sentAt: line.sentAt.toISOString(), arrivedAt: arrived, ...(line.media ? { media: true } : {}) });
  const fresh = JSON.stringify({ lines: [JSON.parse(one)], lastId: line.id, lastAt: arrived });
  await db.$executeRaw`INSERT INTO "WaState" ("key", "value", "updatedAt") VALUES (${burstKey(phone)}, ${fresh}::jsonb, now())
    ON CONFLICT ("key") DO UPDATE SET "value" = jsonb_build_object(
        'lines', COALESCE("WaState"."value"->'lines', '[]'::jsonb) || ${`[${one}]`}::jsonb,
        'lastId', ${line.id}::text, 'lastAt', ${arrived}::text), "updatedAt" = now()
      WHERE NOT (COALESCE("WaState"."value"->'lines', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('id', ${line.id}::text)))`;
}

/** Who wrote last in this phone's pending burst, and when (the server's clock); null when none is pending. */
export async function burstTail(phone: string): Promise<{ lastId: string; lastAt: Date } | null> {
  const row = await db.waState.findUnique({ where: { key: burstKey(phone) }, select: { value: true } });
  const v = row?.value as Partial<BurstRow> | undefined;
  return v?.lastId && v.lastAt ? { lastId: v.lastId, lastAt: new Date(v.lastAt) } : null;
}

/**
 * Take the pending burst, but only when `lastId` is still its last line — one DELETE ... RETURNING, so
 * of two runs only one gets the lines, and a run whose tenant has written since gets nothing.
 */
export async function takeBurst(phone: string, lastId: string): Promise<BurstLine[] | null> {
  const rows = await db.$queryRaw<{ value: BurstRow }[]>`DELETE FROM "WaState" WHERE "key" = ${burstKey(phone)} AND "value"->>'lastId' = ${lastId} RETURNING "value"`;
  const v = rows[0]?.value;
  if (!v?.lines?.length) return null;
  return v.lines.map((l) => ({ id: l.id, text: l.text, sentAt: new Date(l.sentAt), arrivedAt: new Date(l.arrivedAt), media: l.media }));
}

/** Drop the phone's pending burst (the poll answered its lines). */
export async function clearBurst(phone: string): Promise<void> {
  await db.waState.deleteMany({ where: { key: burstKey(phone) } }).catch(() => {});
}

/** The claim rows of these message ids (a burst plan reads them: tenant-pure.ts planBurst). */
export async function readClaims(msgIds: string[]): Promise<Map<string, ClaimRow>> {
  const out = new Map<string, ClaimRow>();
  if (msgIds.length === 0) return out;
  const rows = await db.waState.findMany({ where: { key: { in: msgIds.map(claimKey) } }, select: { key: true, value: true } });
  for (const r of rows) {
    const v = r.value as Partial<ClaimValue> | null;
    if (v?.s && v.at) out.set(r.key.slice("tmsg:".length), { s: v.s, at: v.at });
  }
  return out;
}

/** The phones of many lids at once (the poll reads a day of messages in one pass). */
export async function phonesOfLids(lids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (lids.length === 0) return out;
  const rows = await db.waState.findMany({ where: { key: { in: lids.map(aliasKey) } }, select: { key: true, value: true } }).catch(() => []);
  for (const r of rows) {
    const phone = (r.value as { phone?: string } | null)?.phone;
    if (phone) out.set(r.key.slice("alias:".length), phone);
  }
  return out;
}
