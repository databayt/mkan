/**
 * TikTok DMs as a channel of the rental agent (2026-11-22). A person who writes to @mkan.rw on TikTok gets the
 * same agent WhatsApp gets, answered in the DM. Pure here, so the rules are tested; the database half is
 * tiktok-channel.ts, the turn is tiktok-chat.ts, the Mac that reads and types the DMs is scripts/crm/tiktok-inbox.ts.
 *
 * A TikTok handle has no phone number, but the whole agent keys a tenant by one (the broker gate, the viewing ask,
 * the deal sheet, STOP, the follow-ups). So a handle gets a PSEUDO number — `+999` and twelve digits of its hash.
 * 999 is not a country code, so it can never be a real person; every digit-based rule (phoneKey, the ask keys, the
 * stop list, the broker gate) keeps working unchanged, and sendMessages (whatsapp.ts) is the one place that sees
 * the prefix and queues the message for the DM instead of WhatsApp. The pseudo number's handle is remembered in
 * WaState `tt-handle:<digits>` (tiktok-channel.ts).
 */
import { createHash } from "node:crypto";
import { joinBurst, type BurstLine } from "../../../scripts/wa/tenant-pure";

/** TikTok handles: letters, digits, underscore, period; up to 24 characters. */
const HANDLE = /^[a-z0-9._]{1,24}$/;

/** The handle without "@", lower-cased; null when it cannot be one. */
export function cleanHandle(input: string | null | undefined): string | null {
  const h = (input ?? "").trim().replace(/^@/, "").toLowerCase();
  return HANDLE.test(h) ? h : null;
}

/** The pseudo number of a handle: "+999" and twelve digits, stable and unique enough for a few thousand tenants. */
export function ttPhone(handle: string): string {
  const h = cleanHandle(handle);
  if (!h) throw new Error(`not a TikTok handle: ${handle}`);
  // 48 bits of the hash → twelve digits (2^48 ≈ 2.8e14, so the modulus is uneven by a hair; it does not matter here).
  const n = parseInt(createHash("sha256").update(`tt:${h}`).digest("hex").slice(0, 12), 16) % 1_000_000_000_000;
  return `+999${String(n).padStart(12, "0")}`;
}

/** Is this address a TikTok handle's pseudo number ("+999…" / "999…")? */
export const isTtPhone = (phone: string | null | undefined): boolean => /^\+?999\d{12}$/.test((phone ?? "").trim());

/** The digits a pseudo number is keyed by (WaState `tt-handle:<digits>`, the stop list). */
export const ttDigits = (phone: string): string => phone.replace(/\D/g, "");

/** What the agent reads for a video the person shared: the home's code, or the post's link when no home is known. */
export const videoRefText = (videoId: string, listingId: number | null): string => (listingId ? `K${listingId}` : `https://www.tiktok.com/@mkan.rw/video/${videoId}`);

export interface TtLine {
  /** Stable per message: the Mac derives it (the inbox shows no ids). */
  id: string;
  text: string;
  /** ISO time. */
  at: string;
  /** The post the line shared, when it is a shared video. */
  videoId?: string | null;
}

/** DM lines → the agent's burst: a shared video becomes its K-code (or link) in front of what was said beside it. */
export function burstOf(lines: readonly TtLine[], homes: ReadonlyMap<string, number | null>): BurstLine[] {
  return lines
    .map((l) => {
      const ref = l.videoId ? videoRefText(l.videoId, homes.get(l.videoId) ?? null) : "";
      const text = [ref, l.text.trim()].filter(Boolean).join(" ");
      const at = new Date(l.at);
      const sentAt = Number.isNaN(at.getTime()) ? new Date() : at;
      return { id: `tt-${l.id}`, text, sentAt, arrivedAt: sentAt } satisfies BurstLine;
    })
    .filter((l) => l.text);
}

/** One turn's input from a handle's new lines: the joined words and the id that carries the claim; null when empty. */
export function turnOf(lines: readonly TtLine[], homes: ReadonlyMap<string, number | null>): { text: string; msgId: string; folded: string[] } | null {
  const joined = joinBurst(burstOf(lines, homes));
  return joined && joined.text ? { text: joined.text, msgId: joined.primary.id, folded: joined.folded } : null;
}

/**
 * TikTok has no "see all in the chat" page to send people to: the paragraph that points to the chat's page is
 * dropped. Home links (/k/…) stay — they are how a DM shows a home (no photo send from here).
 */
export function dmReply(reply: string): string {
  return reply
    .split(/\n{2,}/)
    .filter((p) => !/\/find\?c=/.test(p))
    .join("\n\n")
    .trim();
}

export type TtOut = { id: string; handle: string; text: string; label: string; at: string };
