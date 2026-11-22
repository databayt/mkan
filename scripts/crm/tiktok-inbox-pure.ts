/**
 * `pnpm tt:inbox`'s decisions without I/O (scripts/crm/tiktok-inbox.ts reads and types; this decides).
 *
 * A chat's messages arrive as DmMsg: an id (TikTok's own, a snowflake — its high bits are the send time in
 * seconds, so a message's time needs no date separator), who wrote it (`mine`: our @mkan.rw), the words and a
 * shared video's id. From them: which lines are new and unanswered, whether the chat is held (a person at Mkan
 * typed in it), whether the burst has gone quiet, which queued messages may go out, and how a reply is split.
 */
import { HUMAN_HOLD_MS, MAX_AGE_MS, TENANT_BURST_QUIET_MS, burstQuietLeft, textHash, type BurstLine } from '../wa/tenant-pure';

export { HUMAN_HOLD_MS, MAX_AGE_MS, TENANT_BURST_QUIET_MS };

export interface DmMsg {
  /** TikTok's message id (numeric string, grows with time). */
  id: string;
  /** Written by our own account (the avatar links to @mkan.rw). */
  mine: boolean;
  text: string;
  videoId: string | null;
}

/** A TikTok message id's send time: the id's high 32 bits are unix seconds. Null for anything that is not an id. */
export function idTime(id: string): Date | null {
  if (!/^\d{15,20}$/.test(id)) return null;
  const secs = Number(BigInt(id) / BigInt(2 ** 32));
  return secs > 1_500_000_000 && secs < 4_000_000_000 ? new Date(secs * 1000) : null;
}

/** `a` is newer than `b` (ids only grow); a missing `b` is older than everything. */
export const newerId = (a: string, b: string | null | undefined): boolean => {
  if (!b) return true;
  try {
    return BigInt(a) > BigInt(b);
  } catch {
    return a > b;
  }
};

/** The video id out of a TikTok URL or a message's words, or null. */
export const videoIdIn = (s: string | null | undefined): string | null => (s ?? '').match(/\/(?:video|photo)\/(\d{8,25})/)?.[1] ?? null;

/** What TikTok shows for a message type the web inbox cannot render: not words, never read. */
export const isUnsupported = (text: string): boolean => /^\[This message type isn.t supported/i.test(text.trim());

/** The words a line carries for the agent: nothing for a placeholder. */
const wordsOf = (m: DmMsg): string => (isUnsupported(m.text) ? '' : m.text.trim());

// ── what the bot typed, what a person typed ──────────────────────────────────────────────────────

/** A normalised start of a text: TikTok can clip or reflow a long message, the hash alone would then miss it. */
export const prefixOf = (t: string): string => t.replace(/\s+/g, ' ').trim().slice(0, 40).toLowerCase();

export interface SentMark {
  h: string;
  p: string;
}
export const markOf = (text: string): SentMark => ({ h: textHash(text), p: prefixOf(text) });

/** Is this outgoing message one the bot typed? Its words' hash, or their start, is in what it recorded. */
export function isBotText(text: string, sent: readonly SentMark[]): boolean {
  const h = textHash(text);
  const p = prefixOf(text);
  return sent.some((s) => s.h === h || (!!p && s.p === p));
}

// ── one chat → what to do ────────────────────────────────────────────────────────────────────────

export type ChatSkip = 'no-incoming' | 'ours-last' | 'no-new' | 'hold' | 'personal' | 'old';

export type ChatVerdict =
  | { act: 'answer'; lines: BurstLine[]; ids: string[]; videos: Record<string, string>; newest: string; humanAt: Date | null }
  | { act: 'skip'; why: ChatSkip; humanAt: Date | null };

/**
 * One chat's messages (oldest first) → answer its unanswered lines, or why not.
 *
 *   unanswered  tenant lines after our last message (the bot's or a person's) and after what was seen already
 *   hold        a message of ours the bot did not type is a person at Mkan: the bot is quiet in that chat for
 *               HUMAN_HOLD_MS (12 h) after it — the same time `tenant-human` keeps for WhatsApp
 *   personal    the chat opened with OUR message (outreach to a broker, a vendor) and the bot never spoke in it:
 *               a person's conversation, never the agent's
 *   old         unanswered lines older than MAX_AGE_MS (12 h) are left to a person — an inbox's whole history is not new
 */
export function chatVerdict(input: {
  msgs: readonly DmMsg[];
  sent: readonly SentMark[];
  /** The newest incoming id already handled (WaState `tt-seen:<handle>`). */
  seenId: string | null;
  /** The bot has typed in this chat before, or it has an agent chat. */
  botWasHere: boolean;
  now: Date;
}): ChatVerdict {
  const { msgs, sent, seenId, botWasHere, now } = input;
  const humanTimes = msgs.filter((m) => m.mine && wordsOf(m) && !isBotText(m.text, sent)).map((m) => idTime(m.id)).filter((d): d is Date => !!d);
  const humanAt = humanTimes.length ? new Date(Math.max(...humanTimes.map((d) => d.getTime()))) : null;
  const skip = (why: ChatSkip): ChatVerdict => ({ act: 'skip', why, humanAt });

  const incoming = msgs.filter((m) => !m.mine);
  if (incoming.length === 0) return skip('no-incoming');
  if (humanAt && now.getTime() - humanAt.getTime() < HUMAN_HOLD_MS) return skip('hold');
  const first = msgs.find((m) => wordsOf(m) || m.videoId);
  if (first?.mine && !botWasHere) return skip('personal');

  const lastMine = [...msgs].reverse().find((m) => m.mine);
  const fresh = incoming.filter((m) => (wordsOf(m) || m.videoId) && (!lastMine || newerId(m.id, lastMine.id)) && newerId(m.id, seenId));
  if (fresh.length === 0) return skip(msgs[msgs.length - 1]?.mine ? 'ours-last' : 'no-new');
  const live = fresh.filter((m) => {
    const t = idTime(m.id);
    return !t || now.getTime() - t.getTime() <= MAX_AGE_MS;
  });
  if (live.length === 0) return skip('old');

  const videos: Record<string, string> = {};
  const lines: BurstLine[] = live.map((m) => {
    const t = idTime(m.id) ?? now;
    if (m.videoId) videos[m.id] = m.videoId;
    return { id: m.id, text: wordsOf(m), sentAt: t, arrivedAt: t };
  });
  return { act: 'answer', lines, ids: live.map((m) => m.id), videos, newest: live[live.length - 1]!.id, humanAt };
}

/** Milliseconds until the tenant has been quiet for the burst window (WhatsApp's 25 s); 0 or less = answer now. */
export const quietLeft = (lines: readonly BurstLine[], now: Date): number => burstQuietLeft(lines, now, TENANT_BURST_QUIET_MS);

// ── the reply, typed ─────────────────────────────────────────────────────────────────────────────

/**
 * A reply goes out as at most TWO messages: split at the first blank line, the rest stays together. A reply with
 * no blank line is one message. (A wall of messages in a DM reads as spam; two read as a person.)
 */
export function splitReply(reply: string): string[] {
  const text = reply.replace(/\r/g, '').trim();
  if (!text) return [];
  const at = text.search(/\n\s*\n/);
  if (at < 0) return [text];
  const a = text.slice(0, at).trim();
  const b = text.slice(at).trim();
  return [a, b].filter(Boolean);
}

// ── the queued messages (WaState `tt-outbox`) ────────────────────────────────────────────────────

export interface OutRow {
  id: string;
  handle: string;
  text: string;
  label: string;
  at: string;
}

/** A queued message older than this is stale: a broker's answer two days late is worse than none. */
export const OUT_STALE_MS = 48 * 3_600_000;
/** Messages typed per run: a DM burst from a young account reads as spam to TikTok. */
export const OUT_PER_RUN = 12;

export type DrainPlan = { send: OutRow[]; drop: OutRow[]; wait: OutRow[] };

/**
 * Which queued messages to type now. Oldest first, at most OUT_PER_RUN. Stale ones are dropped (taken off,
 * never sent); a handle whose chat is held for a person (`held`) or that is still answering a burst
 * (`busy`) waits; the rest go. Per handle the order is kept.
 */
export function drainPlan(rows: readonly OutRow[], opts: { now: Date; held: ReadonlySet<string>; busy?: ReadonlySet<string>; perRun?: number }): DrainPlan {
  const plan: DrainPlan = { send: [], drop: [], wait: [] };
  const cap = opts.perRun ?? OUT_PER_RUN;
  const ordered = [...rows].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (const r of ordered) {
    if (opts.now.getTime() - Date.parse(r.at) > OUT_STALE_MS) plan.drop.push(r);
    else if (opts.held.has(r.handle) || opts.busy?.has(r.handle) || plan.send.length >= cap) plan.wait.push(r);
    else plan.send.push(r);
  }
  return plan;
}

// ── quiet hours, idle gate ───────────────────────────────────────────────────────────────────────

/** Kigali is UTC+2 all year. */
export const kigaliHour = (now: Date): number => (now.getUTCHours() + 2) % 24;

/** The job's day: 07:00 to 22:00 Kigali (the schedule's last tick is 22:00 itself). */
export function inDay(now: Date): boolean {
  const h = kigaliHour(now);
  return h >= 7 && (h < 22 || (h === 22 && now.getUTCMinutes() === 0));
}

/** Idle at least this long before the bot types in the browser Abdout works in (the WhatsApp desktop rule). */
export const IDLE_MIN_S = 120;

/** `ioreg -c IOHIDSystem` → seconds since the last key or mouse event; null when it cannot be read. */
export function idleSeconds(ioreg: string): number | null {
  const m = ioreg.match(/"HIDIdleTime"\s*=\s*(\d+)/);
  return m ? Math.floor(Number(m[1]) / 1e9) : null;
}

/** May the bot act now? An unreadable idle time is a no — never type blind. */
export const mayAct = (idle: number | null): boolean => idle != null && idle >= IDLE_MIN_S;
