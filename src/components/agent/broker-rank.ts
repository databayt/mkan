/**
 * Which broker to ask about a home first, and when to ask the next one. Pure,
 * so the rules are tested.
 *
 * One home is often advertised by several brokers (ListingBroker). Until 11-05
 * the line asked them in the order their rows were made — the owner, then the
 * oldest ad — and waited a full day of silence before the next one. Only 10.9%
 * of asks got an answer. Now the broker most likely to answer goes first:
 *
 *   - their own answer rate on availability asks in the last STATS_DAYS,
 *     smoothed so one ask is not a verdict;
 *   - where Mkan stands with them: PARTNER > ACTIVE > INTRODUCED > NEW;
 *   - how recently they were active: wrote to Mkan, posted an ad;
 *   - how fast they usually reply.
 *
 * A broker the outbox would hold anyway (already messaged today, or resting
 * after silent asks — scripts/wa/outbox-pure.ts) goes behind everyone it would
 * send to now, and a broker who never answered SILENT_AFTER_ASKS asks goes last
 * — never dropped, so the home is still asked about when nobody else posted it.
 *
 * The next broker is asked after FALLBACK_AWAKE_HOURS of the send window
 * (08:00–20:00 Kigali) without an answer, at most MAX_BROKERS_PER_HOME brokers
 * per home per tenant.
 */

export const KIGALI_OFFSET_MS = 2 * 3_600_000;
const WINDOW_START_HOUR = 8;
const WINDOW_END_HOUR = 20;
const DAY_MS = 86_400_000;

/** A broker's answer rate is read over this many days. */
export const STATS_DAYS = 30;
/** "Never answers" is read over this many days. */
export const SILENT_LOOKBACK_DAYS = 90;
/** Asks without a single answer before a broker goes to the back of the line. */
export const SILENT_AFTER_ASKS = 3;
/** Daytime hours a broker gets to answer before the next one who posted the home is asked. */
export const FALLBACK_AWAKE_HOURS = 3;
/** Daytime hours a broker gets to answer an ask before the one nudge. */
export const NUDGE_AWAKE_HOURS = 2;
/** Brokers asked about one home for one tenant, at most. */
export const MAX_BROKERS_PER_HOME = 3;

export type Relationship = "NEW" | "INTRODUCED" | "ACTIVE" | "PARTNER" | "PAUSED" | "DO_NOT_CONTACT";

export interface BrokerSignal {
  relationship?: Relationship | string | null;
  /** Their last WhatsApp message to Mkan (Broker.lastReplyAt). */
  lastReplyAt?: Date | null;
  /** Their newest ad anywhere (Broker.lastSeenAt). */
  lastSeenAt?: Date | null;
  /** Median minutes to answer (Broker.replyMinutes). */
  replyMinutes?: number | null;
  /** Availability asks sent to them, and answered by them, in the last STATS_DAYS. */
  asked: number;
  answered: number;
  /** The same over SILENT_LOOKBACK_DAYS. */
  askedLong: number;
  answeredLong: number;
  /** The outbox would hold an ask to them now: messaged today, or resting. */
  held?: boolean;
}

const RELATIONSHIP_SCORE: Record<string, number> = { PARTNER: 30, ACTIVE: 20, INTRODUCED: 8, NEW: 0 };

/** Answers per ask, smoothed toward one in two: (answered + 1) / (asked + 2). */
export const smoothedRate = (answered: number, asked: number) => (answered + 1) / (asked + 2);

/** A broker who was asked SILENT_AFTER_ASKS times and never answered, nor wrote to Mkan since. */
export function isSilent(s: BrokerSignal): boolean {
  return s.askedLong >= SILENT_AFTER_ASKS && s.answeredLong === 0 && !s.lastReplyAt;
}

/** Has this broker ever answered one of our availability asks (SILENT_LOOKBACK_DAYS)? They are asked before those who have not. */
export const answeredBefore = (s: BrokerSignal): boolean => s.answeredLong > 0 || s.answered > 0;

/** How likely this broker is to answer now — higher first. */
export function brokerScore(s: BrokerSignal, now: Date): number {
  const days = (d: Date | null | undefined) => (d ? (now.getTime() - d.getTime()) / DAY_MS : null);
  let score = RELATIONSHIP_SCORE[s.relationship ?? "NEW"] ?? 0;
  score += Math.round(smoothedRate(s.answered, s.asked) * 40);
  const replied = days(s.lastReplyAt);
  if (replied != null) score += replied <= 7 ? 15 : replied <= 30 ? 8 : 0;
  const seen = days(s.lastSeenAt);
  if (seen != null) score += seen <= 7 ? 8 : seen <= 30 ? 4 : seen > 90 ? -5 : 0;
  if (s.replyMinutes != null) score += s.replyMinutes <= 60 ? 5 : s.replyMinutes >= 24 * 60 ? -5 : 0;
  return score;
}

/** 0 — ask now; 1 — the outbox would hold it; 2 — never answers, or paused: last. */
export function brokerTier(s: BrokerSignal): 0 | 1 | 2 {
  if (s.relationship === "PAUSED" || isSilent(s)) return 2;
  return s.held ? 1 : 0;
}

/** The brokers in the order to ask them; ties keep the order they came in (owner first, then oldest ad). */
export function rankBrokers<T>(items: readonly T[], signal: (item: T) => BrokerSignal, now: Date): T[] {
  return items
    .map((item, i) => {
      const s = signal(item);
      return { item, i, tier: brokerTier(s), answered: answeredBefore(s), score: brokerScore(s, now) };
    })
    .sort((a, b) => a.tier - b.tier || Number(b.answered) - Number(a.answered) || b.score - a.score || a.i - b.i)
    .map((x) => x.item);
}

/** Time between `from` and `to` that falls inside the send window (08:00–20:00 Kigali), in ms. */
export function awakeMs(from: Date, to: Date): number {
  if (to <= from) return 0;
  let total = 0;
  // Kigali midnight on or before `from`, in UTC ms.
  let day = Math.floor((from.getTime() + KIGALI_OFFSET_MS) / DAY_MS) * DAY_MS - KIGALI_OFFSET_MS;
  for (; day < to.getTime(); day += DAY_MS) {
    const open = Math.max(day + WINDOW_START_HOUR * 3_600_000, from.getTime());
    const close = Math.min(day + WINDOW_END_HOUR * 3_600_000, to.getTime());
    if (close > open) total += close - open;
  }
  return total;
}

/** Has the broker had their daytime hours to answer an ask that went out at `sentAt`? */
export const dueForNext = (sentAt: Date, now: Date, hours = FALLBACK_AWAKE_HOURS) => awakeMs(sentAt, now) >= hours * 3_600_000;

/**
 * Is the one nudge due? Once, and only after NUDGE_AWAKE_HOURS of the send window (08:00–20:00 Kigali)
 * since the ask went out — so an ask at 21:00 is nudged at 10:00 next morning, never at night. A request
 * that was nudged (`nudgedAt`) is never nudged again.
 */
export const nudgeDue = (sentAt: Date | null | undefined, now: Date, nudgedAt?: Date | string | null) => !!sentAt && !nudgedAt && dueForNext(sentAt, now, NUDGE_AWAKE_HOURS);

/** One availability ask, as the stats read it. */
export interface AskRow {
  brokerUserId: string;
  status: string;
  channel: string;
  sentAt: Date | null;
  respondedAt: Date | null;
  createdAt: Date;
}

/**
 * Per broker: asks that went out (not a later tenant joining one), and those
 * the broker answered themselves — `respondedAt` is stamped only on the rows of
 * the broker who answered (broker.ts applyAnswer), not on another broker's ask
 * about the same home that the answer closed.
 */
export function answerStats(rows: readonly AskRow[], now: Date): Map<string, { asked: number; answered: number; askedLong: number; answeredLong: number }> {
  const out = new Map<string, { asked: number; answered: number; askedLong: number; answeredLong: number }>();
  const recent = now.getTime() - STATS_DAYS * DAY_MS;
  const long = now.getTime() - SILENT_LOOKBACK_DAYS * DAY_MS;
  for (const r of rows) {
    if (r.channel === "joined" || !r.sentAt || r.createdAt.getTime() < long) continue;
    const s = out.get(r.brokerUserId) ?? { asked: 0, answered: 0, askedLong: 0, answeredLong: 0 };
    const answered = (r.status === "AVAILABLE" || r.status === "RENTED") && r.respondedAt != null;
    s.askedLong += 1;
    if (answered) s.answeredLong += 1;
    if (r.createdAt.getTime() >= recent) {
      s.asked += 1;
      if (answered) s.answered += 1;
    }
    out.set(r.brokerUserId, s);
  }
  return out;
}
