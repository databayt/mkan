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
  /** "tenant", "tenant-reminder-2h", a broker's name… (wa-outbox's Slack fallback and the staleness rule below). */
  label?: string | null;
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
  /** phoneKey()s of tenants who said STOP: nothing reaches them — no deal sheet, no reminder, no alert. */
  stoppedTenants?: Set<string>;
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
export type SkipReason = 'opted-out' | 'stale' | 'sends-off' | 'tenant-stop' | 'stale-alert';

/**
 * A tenant alert that waited this long (an outage, a line logged out) would read late: an answer, a
 * deal sheet or a match after quiet hours still goes (20 h), a viewing reminder only within 3 h of
 * being queued — "your viewing is in 2 h" after the viewing is worse than nothing.
 */
export const ALERT_STALE_HOURS = 20;
export const REMINDER_STALE_HOURS = 3;
export const isReminder = (label: string | null | undefined) => !!label && label.startsWith('tenant-reminder');
/** The 24 h and 2 h reminders are worthless once late; "how did the viewing go?" still reads well a day on. */
export const isTimedReminder = (label: string | null | undefined) => !!label && /^tenant-reminder-(?:24h|2h)(?::|$)/.test(label);

/**
 * What a tenant alert is, so the outbox can treat them apart and /monetize can count them
 * (2026-11-07: every alert was "tenant"). Rows labelled "tenant" from before keep the default rules.
 */
export const ALERT_LABEL = {
  dealSheet: 'tenant-deal-sheet',
  viewingConfirmed: 'tenant-viewing-confirmed',
  brokerAnswer: 'tenant-broker-answer',
  match: 'tenant-match',
  /** Direct intros (deal-intro.ts): "the broker will connect", the broker's number. */
  intro: 'tenant-intro',
} as const;

/** A viewing reminder's label: which one, for which visit — the outbox marks the visit when it goes. */
export const reminderLabel = (mark: '24h' | '2h' | 'after', visitId: number) => `tenant-reminder-${mark}:v${visitId}`;
export function reminderOf(label: string | null | undefined): { mark: '24h' | '2h' | 'after'; visitId: number } | null {
  const m = label?.match(/^tenant-reminder-(24h|2h|after):v(\d+)$/);
  return m ? { mark: m[1] as '24h' | '2h' | 'after', visitId: Number(m[2]) } : null;
}

/**
 * The answer to the tenant's own open step — the deal sheet after a broker's yes, the booked
 * viewing — may go until 22:00: a yes at 20:38 used to wait twelve hours for the morning.
 */
export const LATE_WINDOW_END_HOUR = 22;
const LATE_LABELS: ReadonlySet<string> = new Set([ALERT_LABEL.dealSheet, ALERT_LABEL.viewingConfirmed, ALERT_LABEL.intro]);

/** [first hour, end hour) in Kigali time this row may be sent. */
export function sendWindowFor(row: Pick<OutboxRow, 'kind' | 'label'>): [number, number] {
  return row.kind === 'TENANT_ALERT' && row.label != null && LATE_LABELS.has(row.label) ? [WINDOW_START_HOUR, LATE_WINDOW_END_HOUR] : [WINDOW_START_HOUR, WINDOW_END_HOUR];
}

export function inWindowFor(row: Pick<OutboxRow, 'kind' | 'label'>, now: Date): boolean {
  const [start, end] = sendWindowFor(row);
  const h = kigaliHour(now);
  return h >= start && h < end;
}

/** The first moment at or after `from` that the row may go out (its own send window). */
export function firstSendableAt(row: Pick<OutboxRow, 'kind' | 'label'>, from: Date): Date {
  const [start, end] = sendWindowFor(row);
  const h = kigaliHour(from);
  if (h >= start && h < end) return from;
  const opens = new Date(startOfKigaliDay(from).getTime() + start * 3_600_000);
  return h < start ? opens : new Date(opens.getTime() + DAY_MS);
}

/** When "how did the viewing go?" is due: 3 h after the visit, or the next 08:00 if that is in quiet hours. */
export function afterViewingAt(visitAt: Date): Date {
  return firstSendableAt({ kind: 'TENANT_ALERT', label: 'tenant-reminder-after' }, new Date(visitAt.getTime() + 3 * 3_600_000));
}

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
  const takenToday = new Set<string>();
  for (const [key, at] of input.lastSentAt) if (kigaliDay(at) === today) takenToday.add(key);
  let budget = Math.max(0, cap - input.sentToday);

  for (const row of rows) {
    const isAlert = row.kind === 'TENANT_ALERT';
    if (isAlert && input.stoppedTenants?.has(phoneKey(row.to))) {
      plan.skip.push({ row, reason: 'tenant-stop' });
      continue;
    }
    // Late is counted from when the alert could first go out, not from when it was queued: a deal
    // sheet queued at 21:00 has its 20 h from 08:00 (2026-11-07). A 24 h / 2 h reminder keeps 3 h from
    // being queued, so "your viewing is in 2 h" can never arrive after the viewing.
    const lateMs = isTimedReminder(row.label) ? now.getTime() - row.createdAt.getTime() : now.getTime() - firstSendableAt(row, row.createdAt).getTime();
    if (isAlert && lateMs > (isTimedReminder(row.label) ? REMINDER_STALE_HOURS : ALERT_STALE_HOURS) * 3_600_000) {
      plan.skip.push({ row, reason: 'stale-alert' });
      continue;
    }
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
    if (!inWindowFor(row, now)) {
      plan.hold.push({ row, reason: 'quiet-hours' });
      continue;
    }
    const key = recipientKey(row);
    // The line's own word back about something the broker started (labelled auto-*: Mkan's terms,
    // the tenant's number, a follow-up on an intro) is not a new ask: it is not held for "already
    // asked today" or a resting broker — held to tomorrow, it went stale unsent (2026-11-07).
    const reply = !isAlert && !!row.label && row.label.startsWith('auto-');
    if (!isAlert && !reply && takenToday.has(key)) {
      plan.hold.push({ row, reason: 'broker-today' });
      continue;
    }
    const rest = isAlert || reply ? undefined : input.resting?.get(phoneKey(row.to));
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
    if (!isAlert && !reply) takenToday.add(key);
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

const MEDIA_KINDS = ['audioMessage', 'pttMessage', 'imageMessage', 'videoMessage', 'documentMessage', 'stickerMessage', 'locationMessage', 'liveLocationMessage', 'contactMessage', 'contactsArrayMessage'];
/** A voice note, photo, video, file, sticker, location or contact — something the agent cannot read as words. */
export function isMedia(message: Record<string, unknown> | null | undefined, messageType?: string): boolean {
  if (messageType && MEDIA_KINDS.includes(messageType)) return true;
  return !!message && MEDIA_KINDS.some((k) => k in message);
}

/** The id of the message this one replies to (WhatsApp's "reply"): which of our asks a broker answers. */
export function quotedId(message: Record<string, unknown> | null | undefined): string | null {
  if (!message) return null;
  for (const v of Object.values(message)) {
    const ctx = (v as { contextInfo?: { stanzaId?: string } } | null)?.contextInfo;
    if (ctx?.stanzaId) return ctx.stanzaId;
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

// ── passes on events (wa-outbox.ts kickOutbox) ───────────────────────────────────────────────────

/** The least time between two broker messages: a person does not send twice a minute. */
export const BROKER_GAP_MS = 2 * 60_000;

/** How long until a broker may get the next message: 0 when they may now. */
export function brokerGapLeft(sent: Array<{ kind: string; sentAt: Date | null }>, now: Date, gapMs = BROKER_GAP_MS): number {
  const last = Math.max(0, ...sent.filter((s) => s.kind !== 'TENANT_ALERT' && s.sentAt).map((s) => s.sentAt!.getTime()));
  return last ? Math.max(0, gapMs - (now.getTime() - last)) : 0;
}

export interface PassScheduler {
  /** Run a pass in `delayMs`; asks before it runs merge (the earliest wins). */
  kick(reason: string, delayMs?: number): void;
  /** A pass started (under the lease): kicks now wait for it to end. */
  enter(): void;
  /** The pass ended: one asked for meanwhile runs now (or when it was asked for). */
  leave(): void;
  /** When the waiting pass runs, if one waits. */
  nextAt(): number | null;
}

/**
 * One timer for the outbox's event-driven passes. `run` returns locked when another process holds
 * the lease (the cron's own request): the pass is tried again `retryMs` later, `maxTries` times.
 */
export function passScheduler(
  run: (reason: string) => Promise<{ locked?: boolean } | void>,
  { retryMs = 15_000, maxTries = 4, now = () => Date.now() }: { retryMs?: number; maxTries?: number; now?: () => number } = {},
): PassScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let timerAt = 0;
  let passing = false;
  let againAt: number | null = null;
  const schedule = (reason: string, at: number, tries: number) => {
    if (timer && timerAt <= at) return;
    if (timer) clearTimeout(timer);
    timerAt = at;
    timer = setTimeout(() => {
      timer = null;
      void run(reason)
        .then((r) => {
          if (r && r.locked && tries < maxTries) schedule(reason, now() + retryMs, tries + 1);
        })
        .catch(() => {});
    }, Math.max(0, at - now()));
  };
  return {
    kick(reason, delayMs = 3_000) {
      const at = now() + delayMs;
      if (passing) {
        againAt = againAt == null ? at : Math.min(againAt, at);
        return;
      }
      schedule(reason, at, 0);
    },
    enter() {
      passing = true;
    },
    leave() {
      passing = false;
      if (againAt != null) {
        const at = againAt;
        againAt = null;
        schedule('again', Math.max(at, now() + 1_000), 0);
      }
    },
    nextAt: () => (timer ? timerAt : null),
  };
}
