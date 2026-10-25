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
 * Take the lease on `key` for `ms` unless someone holds it. A conditional
 * update, so two crons racing for it cannot both win.
 */
export async function takeLease(key: string, ms: number): Promise<boolean> {
  const now = Date.now();
  const until = new Date(now + ms).toISOString();
  await db.waState.createMany({ data: [{ key, value: { until: new Date(0).toISOString() } }], skipDuplicates: true });
  const taken = await db.$executeRaw`UPDATE "WaState" SET "value" = jsonb_build_object('until', ${until}::text), "updatedAt" = now()
    WHERE "key" = ${key} AND ("value"->>'until')::timestamptz < ${new Date(now)}`;
  return taken === 1;
}

export async function releaseLease(key: string): Promise<void> {
  await writeState(key, { until: new Date(0).toISOString() });
}
