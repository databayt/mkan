/**
 * The outbox drain's policy, without I/O — which QUEUED rows may go out now.
 *
 * A fresh number that messages strangers too much, too fast or at night gets
 * banned by WhatsApp, so the Mac sender only sends:
 *   - between 08:00 and 20:00 Kigali time (UTC+2, no DST),
 *   - up to `cap` messages per Kigali day in total (MKAN_WA_DAILY_CAP, 40 while warming up),
 *   - at most one message per broker number per Kigali day (TENANT_ALERT is exempt but counts toward the total),
 *   - no new ask to a broker who already had three this week, or whose last two went unanswered (a rest),
 *   - with a random 20–60 s gap between sends.
 * Rows for a broker who opted out, rows queued more than STALE_HOURS ago, and every
 * broker row while broker sends are off (broker-sends.ts) are SKIPPED, at any hour.
 */

export const KIGALI_OFFSET_MS = 2 * 60 * 60 * 1000;
export const WINDOW_START_HOUR = 8;
export const WINDOW_END_HOUR = 20;
export const DEFAULT_DAILY_CAP = 40;
export const MAX_ATTEMPTS = 3;

export type OutboundKind = 'BROKER_ASK' | 'BROKER_REQUEST' | 'TENANT_ALERT';

export interface OutboxRow {
  id: string;
  kind: OutboundKind;
  to: string;
  brokerId: string | null;
  createdAt: Date;
}

/** Digits only, without the `00` international prefix — how phones, JIDs and wa.me numbers are compared. */
export function phoneKey(phone: string): string {
  return phone.replace(/[^\d]/g, '').replace(/^00/, '');
}

/**
 * Who a row counts against for the one-a-day rule: the number it goes to. An
 * availability ask carries no broker id and a demand ask does, so keying by the
 * broker let one number get one of each a day.
 */
export function recipientKey(row: Pick<OutboxRow, 'brokerId' | 'to'>): string {
  return `to:${phoneKey(row.to)}`;
}

/** YYYY-MM-DD of `d` in Kigali. */
export function kigaliDay(d: Date): string {
  return new Date(d.getTime() + KIGALI_OFFSET_MS).toISOString().slice(0, 10);
}

/** The UTC instant of the Kigali midnight that starts `now`'s day. */
export function startOfKigaliDay(now: Date): Date {
  return new Date(Date.parse(`${kigaliDay(now)}T00:00:00Z`) - KIGALI_OFFSET_MS);
}

export function kigaliHour(d: Date): number {
  return new Date(d.getTime() + KIGALI_OFFSET_MS).getUTCHours();
}

/** 08:00 ≤ Kigali time < 20:00. */
export function inSendWindow(now: Date): boolean {
  const h = kigaliHour(now);
  return h >= WINDOW_START_HOUR && h < WINDOW_END_HOUR;
}

/** The pause before the next send: 20–60 s, uniformly. */
export function randomGapMs(rand: () => number = Math.random): number {
  return 20_000 + Math.floor(rand() * 40_001);
}

/** How long "typing…" shows before a broker message: about a person's speed, 2.5–8 s. */
export function typingMs(text: string, rand: () => number = Math.random): number {
  return Math.min(8_000, Math.max(2_500, text.length * 45)) + Math.floor(rand() * 1_500);
}

export function dailyCap(env: string | undefined = process.env.MKAN_WA_DAILY_CAP): number {
  const n = Number(env);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_DAILY_CAP;
}

export interface PlanInput<R extends OutboxRow = OutboxRow> {
  now: Date;
  /** QUEUED rows, oldest first. */
  rows: R[];
  /** Messages already SENT since the Kigali day began (every kind). */
  sentToday: number;
  /** recipientKey → when it was last sent to. */
  lastSentAt: Map<string, Date>;
  /** Broker ids that opted out. */
  optedOutBrokers: Set<string>;
  /** phoneKey()s of brokers that opted out — catches rows that carry only a number. */
  optedOutPhones?: Set<string>;
  /** phoneKey() → why that broker gets no new ask now (brokerRest). */
  resting?: Map<string, RestReason>;
  /** Broker sends are off (broker-sends.ts): every broker row is skipped, tenant alerts still go. */
  brokerSendsOff?: boolean;
  cap: number;
}

/** A broker ask that waited this long is about a search the tenant has moved on from. */
export const STALE_HOURS = 18;
/** At most this many asks reach one broker in seven days. */
export const ASKS_PER_WEEK = 3;
/** This many asks in a row with no reply → the broker rests. */
export const UNANSWERED_IN_A_ROW = 2;
export const REST_DAYS = 14;
const DAY_MS = 86_400_000;

export type RestReason = 'broker-week' | 'broker-resting';
export type HoldReason = 'quiet-hours' | 'daily-cap' | 'broker-today' | RestReason;
export type SkipReason = 'opted-out' | 'stale' | 'sends-off';

/**
 * Why a broker gets no new ask now, from the asks that number was sent (any
 * order) and when they last wrote back — null when they may get one. A broker
 * who answers is never rested; one who stays silent hears nothing for two weeks.
 */
export function brokerRest(asks: Date[], lastReplyAt: Date | null, now: Date): RestReason | null {
  const newest = [...asks].sort((a, b) => b.getTime() - a.getTime());
  if (newest.filter((a) => now.getTime() - a.getTime() < 7 * DAY_MS).length >= ASKS_PER_WEEK) return 'broker-week';
  if (newest.length >= UNANSWERED_IN_A_ROW) {
    const older = newest[UNANSWERED_IN_A_ROW - 1]!;
    const silent = !lastReplyAt || lastReplyAt.getTime() < older.getTime();
    if (silent && now.getTime() - newest[0]!.getTime() < REST_DAYS * DAY_MS) return 'broker-resting';
  }
  return null;
}

export interface Plan<R extends OutboxRow = OutboxRow> {
  /** In send order. */
  send: R[];
  /** Mark SKIPPED now. */
  skip: Array<{ row: R; reason: SkipReason }>;
  /** Stay QUEUED for a later run. */
  hold: Array<{ row: R; reason: HoldReason }>;
}

export function planOutbox<R extends OutboxRow>(input: PlanInput<R>): Plan<R> {
  const { now, rows, cap } = input;
  const plan: Plan<R> = { send: [], skip: [], hold: [] };
  const today = kigaliDay(now);
  const open = inSendWindow(now);
  const takenToday = new Set<string>();
  for (const [key, at] of input.lastSentAt) if (kigaliDay(at) === today) takenToday.add(key);
  let budget = Math.max(0, cap - input.sentToday);

  for (const row of rows) {
    const isAlert = row.kind === 'TENANT_ALERT';
    if (!isAlert && input.brokerSendsOff) {
      plan.skip.push({ row, reason: 'sends-off' });
      continue;
    }
    const optedOut = !isAlert && ((row.brokerId != null && input.optedOutBrokers.has(row.brokerId)) || (input.optedOutPhones?.has(phoneKey(row.to)) ?? false));
    if (optedOut) {
      plan.skip.push({ row, reason: 'opted-out' });
      continue;
    }
    if (!isAlert && now.getTime() - row.createdAt.getTime() > STALE_HOURS * 3_600_000) {
      plan.skip.push({ row, reason: 'stale' });
      continue;
    }
    if (!open) {
      plan.hold.push({ row, reason: 'quiet-hours' });
      continue;
    }
    const key = recipientKey(row);
    if (!isAlert && takenToday.has(key)) {
      plan.hold.push({ row, reason: 'broker-today' });
      continue;
    }
    const rest = isAlert ? undefined : input.resting?.get(phoneKey(row.to));
    if (rest) {
      plan.hold.push({ row, reason: rest });
      continue;
    }
    if (budget <= 0) {
      plan.hold.push({ row, reason: 'daily-cap' });
      continue;
    }
    plan.send.push(row);
    budget -= 1;
    if (!isAlert) takenToday.add(key);
  }
  return plan;
}

/** A whole reply that means "stop messaging me" — en, rw, fr. "stop by tomorrow" is not one. */
const OPT_OUT = /^(?:please )?(?:stop|hagarika|arr[êe]te|arr[êe]tez|unsubscribe|sinshaka|ntimwongere|mundeke)[\s.!]*$/iu;
/**
 * The same said in a sentence — "please stop", "stop sending me these", "don't
 * message me again", "you keep sending sending??" (a broker, 11-01). Only in a
 * short reply, so a long message that mentions stopping is read by a person.
 */
const OPT_OUT_PHRASE =
  /\b(?:please stop|stop (?:it|this|now|sending|messaging|texting|writing|asking|bothering)|(?:don'?t|do not|dont) (?:message|text|send|write|contact|disturb) (?:me|us)|(?:you|u) keep (?:on )?(?:sending|asking|texting|messaging)|keep sending|leave me alone|remove (?:me|my number)|unsubscribe|wrong number|ntimwongere|ne m'?[ée]cri(?:vez|s) plus|arr[êe]tez de m'?[ée]crire)\b/iu;

export function isOptOut(text: string | null | undefined): boolean {
  const t = (text ?? '').trim();
  return OPT_OUT.test(t) || (t.length <= 160 && OPT_OUT_PHRASE.test(t));
}

/** The words of a WhatsApp message payload, whatever kind carried them. */
export function messageText(message: Record<string, unknown> | null | undefined): string {
  if (!message) return '';
  const m = message as {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string };
    videoMessage?: { caption?: string };
    documentMessage?: { caption?: string };
    buttonsResponseMessage?: { selectedDisplayText?: string };
    listResponseMessage?: { title?: string };
  };
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    m.documentMessage?.caption ??
    m.buttonsResponseMessage?.selectedDisplayText ??
    m.listResponseMessage?.title ??
    ''
  ).trim();
}

/**
 * The sender's phone from a message key. Newer WhatsApp addresses some chats
 * by a private `@lid`; Evolution then carries the number in `remoteJidAlt` or
 * `senderPn`. Null for groups, broadcasts and lids without a number.
 */
export function senderPhone(key: { remoteJid?: string; remoteJidAlt?: string; senderPn?: string } | undefined): string | null {
  for (const jid of [key?.senderPn, key?.remoteJidAlt, key?.remoteJid]) {
    if (jid && jid.endsWith('@s.whatsapp.net')) return phoneKey(jid.split('@')[0] ?? '');
  }
  return null;
}

/** A photo message (album items arrive as separate image messages). */
export function isImage(message: Record<string, unknown> | null | undefined, messageType?: string): boolean {
  return messageType === 'imageMessage' || !!(message as { imageMessage?: unknown } | null)?.imageMessage;
}

export interface InboxItem {
  id: string;
  phone: string | null;
  text: string;
  image: boolean;
  type: string;
}

/**
 * One broker's burst — an album and its caption arrive as several messages
 * within a run — read as one reply: the texts joined, the photos together.
 * Oldest first in, sender order kept out.
 */
export function groupByPhone<T extends InboxItem>(items: T[]): { phone: string; items: T[]; text: string; imageIds: string[] }[] {
  const groups = new Map<string, T[]>();
  for (const m of items) {
    if (!m.phone) continue;
    groups.set(m.phone, [...(groups.get(m.phone) ?? []), m]);
  }
  return [...groups].map(([phone, its]) => ({
    phone,
    items: its,
    text: its.map((m) => m.text).filter(Boolean).join('\n'),
    imageIds: its.filter((m) => m.image).map((m) => m.id),
  }));
}
