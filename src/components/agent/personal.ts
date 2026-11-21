import "server-only";

/**
 * Abdout's own contacts on the Mkan line. +250 780 984 777 is also his own
 * number: friends, family, shops and old chats write to it about other things.
 * The agent never answers them, never opens a chat for them and never posts
 * them to #mkan — the phone stays his. Kept as WaState rows
 * `personal:<address>` (digits, or `<id>@lid`), written by `pnpm wa:personal`.
 */
import { db } from "@/lib/db";

export const personalKey = (address: string) => `personal:${address.replace(/^\+/, "").trim()}`;

export async function isPersonal(address: string): Promise<boolean> {
  if (!address) return false;
  const row = await db.waState.findUnique({ where: { key: personalKey(address) }, select: { key: true } }).catch(() => null);
  return !!row;
}

/**
 * Put a number on the list by itself — a chat the line owner already lived in (tenant-pure.ts
 * humanChatBeforeBot). `pnpm wa:personal remove <address>` takes it off again. Never throws.
 */
export async function markPersonal(address: string, why: string): Promise<void> {
  if (!address) return;
  const key = personalKey(address);
  const value = { why, at: new Date().toISOString(), auto: true };
  await db.waState.upsert({ where: { key }, create: { key, value }, update: {} }).catch(() => {});
}
