/**
 * Signed links to a chat, for the WhatsApp messages that point at it ("All homes, photos and move-in
 * costs:", the deal sheet, a broker's answer). A WhatsApp chat belongs to the phone's profile, which no
 * browser owns, so `/find?c=<id>` opened an empty chat (2026-11-06). `&s=<sig>` lets anyone holding
 * the link see that one chat's homes, read-only (src/components/agent/shared-chat.tsx).
 *
 * The key is derived from MKAN_WA_BRIDGE_SECRET (already on the Worker and the Mac), with its own
 * label, so links keep working when the session secret rotates. No key → no signature (the old link).
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const key = (): Buffer | null => {
  const secret = process.env.MKAN_WA_BRIDGE_SECRET?.trim();
  return secret ? createHash("sha256").update(`chat-link:${secret}`).digest() : null;
};

export function chatSig(taskId: string): string | null {
  const k = key();
  return k ? createHmac("sha256", k).update(`chat:${taskId}`).digest("base64url").slice(0, 22) : null;
}

export function verifyChatSig(taskId: string | null | undefined, sig: string | null | undefined): boolean {
  if (!taskId || !sig) return false;
  const want = chatSig(taskId);
  if (!want || want.length !== sig.length) return false;
  return timingSafeEqual(Buffer.from(want), Buffer.from(sig));
}
