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
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

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
// A busy turn deletes its claim, so the poll starts it fresh.

export type MessageClaim = { mode: "fresh" | "retry"; tries: number } | { mode: "resend"; text: string; tries: number; at: string };
type ClaimValue = { s: "working" | "reply" | "done"; at: string; tries: number; text?: string };

export const CLAIM_STALE_MS = 120_000;
export const MAX_ANSWER_TRIES = 3;
const claimKey = (msgId: string) => `tmsg:${msgId}`;

/** Take a tenant message to answer, or null when it is answered or someone is on it. */
export async function claimMessage(msgId: string, now = new Date()): Promise<MessageClaim | null> {
  const key = claimKey(msgId);
  const fresh: ClaimValue = { s: "working", at: now.toISOString(), tries: 1 };
  const made = await db.waState.createMany({ data: [{ key, value: fresh }], skipDuplicates: true });
  if (made.count === 1) return { mode: "fresh", tries: 1 };
  const row = await db.waState.findUnique({ where: { key }, select: { value: true } });
  const v = row?.value as ClaimValue | undefined;
  if (!v || v.s === "done") return null;
  if (v.s === "reply" && v.text) return { mode: "resend", text: v.text, tries: v.tries ?? 1, at: v.at };
  if (now.getTime() - new Date(v.at).getTime() < CLAIM_STALE_MS) return null;
  // A run that died mid-answer: take it over — conditionally, so two passes cannot both win.
  const tries = (v.tries ?? 1) + 1;
  const next: ClaimValue = { s: "working", at: now.toISOString(), tries };
  const taken = await db.$executeRaw`UPDATE "WaState" SET "value" = ${JSON.stringify(next)}::jsonb, "updatedAt" = now()
    WHERE "key" = ${key} AND "value"->>'s' = 'working' AND "value"->>'at' = ${v.at}`;
  return taken === 1 ? { mode: "retry", tries } : null;
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
  const [claims, asks] = await Promise.all([
    db.waState.deleteMany({ where: { key: { startsWith: "tmsg:" }, updatedAt: { lt: new Date(now - olderThanMs) } } }),
    db.waState.deleteMany({ where: { key: { startsWith: "ask-msg:" }, updatedAt: { lt: new Date(now - 7 * 86_400_000) } } }),
  ]);
  return claims.count + asks.count;
}
