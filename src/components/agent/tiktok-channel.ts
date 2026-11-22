/**
 * The database half of the TikTok DM channel (tiktok-channel-pure.ts): which handle a pseudo number is, and the
 * `tt-outbox` — the messages the agent wants a TikTok tenant to get later (a broker's answer, a viewing's
 * confirmation, a quiet-nudge follow-up). The Mac's `pnpm tt:inbox` types them into the DM and takes them off.
 * No "server-only": the Mac script imports this too.
 */
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { readState } from "./wa-state";
import { cleanHandle, isTtPhone, ttDigits, ttPhone, type TtOut } from "./tiktok-channel-pure";

export const TT_OUTBOX_KEY = "tt-outbox";
const handleKey = (digits: string) => `tt-handle:${digits}`;

/** Remember whose pseudo number this is (idempotent); returns the number. */
export async function rememberHandle(handle: string): Promise<string> {
  const phone = ttPhone(handle);
  const key = handleKey(ttDigits(phone));
  const h = cleanHandle(handle)!;
  await db.waState.upsert({ where: { key }, create: { key, value: { handle: h } }, update: { value: { handle: h } } });
  return phone;
}

/** The handle behind a pseudo number, or null. */
export async function handleOfPhone(phone: string): Promise<string | null> {
  if (!isTtPhone(phone)) return null;
  const row = await db.waState.findUnique({ where: { key: handleKey(ttDigits(phone)) }, select: { value: true } }).catch(() => null);
  return cleanHandle((row?.value as { handle?: string } | null)?.handle);
}

/**
 * Queue messages for TikTok tenants. One SQL statement appends to the list: the container and the Mac both write
 * this row. A tenant who said STOP is skipped. Returns how many were queued.
 */
export async function queueTikTok(messages: { to: string; body: string; label: string }[]): Promise<number> {
  if (messages.length === 0) return 0;
  const stopped = await readState<string[]>("tenant-stop", []).catch(() => [] as string[]);
  const entries: TtOut[] = [];
  for (const m of messages) {
    if (stopped.includes(ttDigits(m.to))) continue;
    const handle = await handleOfPhone(m.to);
    if (!handle) {
      console.warn(`[tiktok] no handle for ${m.to} — message not queued`);
      continue;
    }
    entries.push({ id: randomUUID(), handle, text: m.body, label: m.label, at: new Date().toISOString() });
  }
  if (entries.length === 0) return 0;
  const add = JSON.stringify(entries);
  await db.$executeRaw`INSERT INTO "WaState" ("key", "value", "updatedAt") VALUES (${TT_OUTBOX_KEY}, ${add}::jsonb, now())
    ON CONFLICT ("key") DO UPDATE SET "value" = COALESCE("WaState"."value", '[]'::jsonb) || ${add}::jsonb, "updatedAt" = now()`;
  return entries.length;
}

/** The queued messages, oldest first. */
export async function readOutbox(): Promise<TtOut[]> {
  const list = await readState<unknown>(TT_OUTBOX_KEY, []);
  if (!Array.isArray(list)) return [];
  return (list as Partial<TtOut>[])
    .filter((e): e is TtOut => !!e && typeof e.id === "string" && typeof e.handle === "string" && typeof e.text === "string")
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** Take sent messages off the queue — one statement, so a message queued meanwhile stays. */
export async function ackOutbox(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRaw`UPDATE "WaState" SET "value" = COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements("value") x WHERE NOT (x->>'id' = ANY(${ids}::text[]))), '[]'::jsonb), "updatedAt" = now()
    WHERE "key" = ${TT_OUTBOX_KEY}`;
}
