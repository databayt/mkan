import "server-only";

/**
 * Abdout's own contacts on the Mkan line. +250 780 984 777 is also his own
 * number: friends, family, shops and old chats write to it about other things.
 * The agent never answers them, never opens a chat for them and never posts
 * them to #mkan — the phone stays his. Kept as WaState rows
 * `personal:<address>` (digits, or `<id>@lid`), written by `pnpm wa:personal`.
 */
import { db } from "@/lib/db";
import { addressesOf } from "./wa-state";

export const personalKey = (address: string) => `personal:${address.replace(/^\+/, "").trim()}`;

const listed = async (address: string): Promise<boolean> =>
  !!(await db.waState.findUnique({ where: { key: personalKey(address) }, select: { key: true } }).catch(() => null));

/**
 * Is this person on the list — under either address? WhatsApp knows one contact by a phone number and by
 * an `@lid` (wa-state.ts addressesOf); the list may hold either, so both are read (2026-11-22).
 * Pass `also` when the caller already holds the other address.
 */
export async function isPersonal(address: string, also: readonly (string | null | undefined)[] = []): Promise<boolean> {
  if (!address) return false;
  if (await listed(address)) return true;
  const others = new Set<string>(also.filter((a): a is string => !!a && a !== address));
  if (others.size === 0) for (const a of await addressesOf(address).catch(() => [address])) if (a !== address) others.add(a);
  for (const a of others) if (await listed(a)) return true;
  return false;
}

/**
 * Put a number on the list by itself — a chat the line owner already lived in (tenant-pure.ts
 * humanChatBeforeBot). `pnpm wa:personal remove <address>` takes it off again. Never throws.
 */
export async function markPersonal(address: string, why: string, also: readonly string[] = []): Promise<void> {
  if (!address) return;
  const value = { why, at: new Date().toISOString(), auto: true };
  // Both addresses of the person, so the half the other side writes under is covered too.
  const all = new Set([address, ...(await addressesOf(address).catch(() => [address])), ...also]);
  for (const a of all) {
    const key = personalKey(a);
    await db.waState.upsert({ where: { key }, create: { key, value }, update: {} }).catch(() => {});
  }
}
