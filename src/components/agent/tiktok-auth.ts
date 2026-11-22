import { timingSafeEqual } from "node:crypto";

/** The shared secret of /api/agent/tiktok: MKAN_TT_SECRET, else MKAN_WA_BRIDGE_SECRET (the Mac already holds it). Empty = closed. */
export const ttSecret = (): string => process.env.MKAN_TT_SECRET?.trim() || process.env.MKAN_WA_BRIDGE_SECRET?.trim() || "";

/** Does the `x-mkan-tt-secret` header carry the secret? Constant-time; a missing secret or header is a no. */
export function ttAllowed(header: string | null | undefined, secret = ttSecret()): boolean {
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
