/**
 * One nudge for a tenant who went quiet under the homes (2026-11-14). Between 11-05 and 11-13, six of eight
 * WhatsApp chats ended right after the homes went out: no pick, no word back, and the line never wrote
 * again. A person selling homes would ask once. So, QUIET_AWAKE_HOURS of daytime after the tenant's last
 * word — and never past QUIET_MAX_MS — the line asks once whether any of them fit. Once per chat; a chat
 * that picked a home, was asked a question, or is already in someone's hands is left alone.
 * Pure: the sweep is quiet-nudge.ts.
 */
import type { DealLang } from "./deal-pure";
import type { AgentMessage, ShortlistItem } from "./types";

const HOUR_MS = 3_600_000;
/** Daytime hours (08:00–20:00 Kigali) of silence before the nudge. */
export const QUIET_AWAKE_HOURS = 3;
/** After this long the search is cold: no nudge. */
export const QUIET_MAX_MS = 48 * HOUR_MS;
/** The outbox label, and how /monetize counts it. */
export const QUIET_LABEL = "tenant-quiet-nudge";
export const quietKey = (taskId: string) => `quiet:${taskId}`;

/** On unless MKAN_QUIET_NUDGE=off. */
export const quietNudgeOn = (env: string | undefined = process.env.MKAN_QUIET_NUDGE) => env?.trim().toLowerCase() !== "off";

export type QuietVerdict = "nudge" | "not-homes" | "picked" | "too-soon" | "cold" | "nudged" | "quiet-hours";

/**
 * `lastActivity`: the tenant's last word in the chat — a message that ran a turn, or one answered under the
 * homes (those leave only a trace row). `awakeMs`: daytime milliseconds since then (broker-rank.ts awakeMs).
 */
export function quietVerdict(i: {
  messages: readonly AgentMessage[];
  shortlist: readonly Pick<ShortlistItem, "availability">[];
  lastActivity: Date | null;
  now: Date;
  awakeMs: number;
  nudged: boolean;
  inWindow: boolean;
}): QuietVerdict {
  const last = [...i.messages].reverse().find((m) => m.role === "agent");
  // Only a chat that ends on homes: a question waiting on the tenant, an answer or an error is not this.
  if (!last || last.kind !== "shortlist" || i.shortlist.length === 0 || !i.lastActivity) return "not-homes";
  // A home asked about, confirmed or taken: the broker loop, the deal sheet and the 48-hour rule own that chat.
  if (i.shortlist.some((s) => s.availability !== "unconfirmed")) return "picked";
  if (i.nudged) return "nudged";
  if (i.now.getTime() - i.lastActivity.getTime() >= QUIET_MAX_MS) return "cold";
  if (i.awakeMs < QUIET_AWAKE_HOURS * HOUR_MS) return "too-soon";
  return i.inWindow ? "nudge" : "quiet-hours";
}

/** The nudge: one question, and both ways to go on. rw is machine-written (native review sheet). */
export function quietNudgeMessage(lang: DealLang, n: number): string {
  const range = n > 1 ? (lang === "ar" ? `من 1 إلى ${n}` : lang === "rw" ? `kuva kuri 1 kugeza kuri ${n}` : `1 to ${n}`) : "1";
  if (lang === "ar") return `مرحباً، معك مكان. هل ناسبك أحد المنازل التي أرسلتها؟ أرسل رقمه، ${range}، وأتأكد من وسيطه أنه ما زال متاحاً، أو أخبرني بما تريد تغييره: المنطقة أو الميزانية أو عدد الغرف.`;
  if (lang === "rw") return `Muraho, ni Mkan. Hari inzu muri izo nakoherereje yakunogeye? Ohereza nimero yayo, ${range}, ndebe ko igihari, cyangwa umbwire icyo wahindura: agace, amafaranga cyangwa ibyumba.`;
  return `Hi, it's Mkan. Did any of the homes I sent fit? Send its number, ${range}, and I'll check with its broker that it's still free, or tell me what to change: the area, the budget or the bedrooms.`;
}
