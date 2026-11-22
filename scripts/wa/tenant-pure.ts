/**
 * Which WhatsApp messages the rental agent answers — pure, so the rules are tested.
 *
 * The agent replies only to a tenant who wrote to Mkan (never a first
 * message), and stays quiet when:
 *   - the sender said STOP (until they say START);
 *   - a person at Mkan typed in that chat in the last HUMAN_HOLD_MS — a human
 *     took the conversation over, and the bot does not talk across them;
 *   - the message is older than MAX_AGE_MS: after a long outage a person answers it
 *     (a #mkan card), not the bot. Up to then the bot answers late, saying sorry first
 *     (Abdout, 2026-11-08 — at night the backstop runs hourly, and the 60-minute
 *     limit before dropped any message the webhook missed just after a pass);
 *   - the phone or the whole line is over its hourly ceiling.
 */
import { createHash } from 'node:crypto';

export const HUMAN_HOLD_MS = 12 * 60 * 60 * 1000;
export const MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** A reply to a message older than this opens with an apology for the wait. */
export const LATE_AFTER_MS = 15 * 60 * 1000;
export const PER_PHONE_PER_HOUR = 20;
export const LINE_PER_HOUR = 120;

const OPT_IN = /^(start|tangira|unstop|resume)[\s.!]*$/iu;
export const isOptIn = (text: string | null | undefined) => OPT_IN.test((text ?? '').trim());

/**
 * A tenant's STOP is the whole message: the word, or only a way of saying it ("please stop", "stop
 * messaging me", "hagarika", "arrêtez", "توقف"). A tenant who writes "stop sending me Kicukiro" or "you
 * keep sending expensive ones" is changing the search — the broker list (outbox-pure.ts isOptOut) read
 * those as opt-outs and silenced the tenant for good, with no reply (2026-11-08).
 */
const TENANT_STOP_WORD = /^(?:(?:please|pls|plz)[\s,]+)?(?:stop|hagarika|arr[êe]te[rz]?|unsubscribe|توقف|أوقف|اوقف|إيقاف|ايقاف)(?:[\s,]+(?:it|now|please|pls|me|messaging(?:\s+me)?|texting(?:\s+me)?|contacting\s+me|writing\s+(?:to\s+)?me|(?:sending\s+)?(?:me\s+)?(?:messages|msgs|texts)|ubutumwa|الرسائل|المراسلة))*[\s.!]*$/iu;
const TENANT_STOP_PHRASE = /^(?:(?:please|pls)[\s,]+)?(?:leave me alone|(?:don'?t|do not) (?:message|text|contact|write to) me(?: again| anymore| any more)?)[\s.!]*$/iu;
export const isTenantStop = (text: string | null | undefined): boolean => {
  const t = (text ?? '').trim();
  return TENANT_STOP_WORD.test(t) || TENANT_STOP_PHRASE.test(t);
};

/** The one reply a STOP gets, so the tenant knows it worked and how to come back. rw is machine-written (native review sheet). */
export function stopConfirmText(lang: string): string {
  if (lang === 'ar') return 'تم، لن تراسلك مكان بعد الآن. إن أردت منازل لاحقاً أرسل START.';
  if (lang === 'rw') return 'Byakozwe — Mkan ntizongera kukwandikira. Niba ushaka amazu nyuma, ohereza START.';
  return "Done — Mkan won't message you again. If you want homes later, reply START.";
}

/** A START after a STOP: welcome back, and what to send — the bare word is not a search. */
export function startText(lang: string): string {
  if (lang === 'ar') return 'أهلاً بعودتك! أخبرني بالمنطقة وعدد الغرف والميزانية.';
  if (lang === 'rw') return "Murakaza neza! Mbwira agace, umubare w'ibyumba n'amafaranga ufite.";
  return 'Welcome back! Tell me the area, the number of bedrooms and your budget.';
}

/** Mkan's TikTok page: the chat sends viewers back to follow it (the 1k-follower push, 2026-11-15). */
export const TIKTOK_PAGE_URL = 'https://www.tiktok.com/@mkan.rw';

/** A reply that shows a home names its code (K6671). Only such a reply carries the follow line. */
export function showsAHome(reply: string): boolean {
  return /\bK\d{3,6}\b/.test(reply);
}

/**
 * One line under the first reply that shows homes, once per phone, ever. rw reuses the caption's
 * line (tiktok-post.ts), machine-written like the rest (native review sheet).
 */
export function followLine(lang: string): string {
  if (lang === 'ar') return `📲 بيوت جديدة في كيغالي كل يوم على تيك توك: ${TIKTOK_PAGE_URL}`;
  if (lang === 'rw') return `📲 Kurikira kugira ngo ubone amazu mashya yo gukodesha i Kigali buri munsi: ${TIKTOK_PAGE_URL}`;
  return `📲 New Kigali homes every day on TikTok: ${TIKTOK_PAGE_URL}`;
}

/** The first line of a late answer (LATE_AFTER_MS). rw is machine-written (native review sheet). */
export function lateLead(lang: string): string {
  if (lang === 'ar') return 'آسف على تأخري في الرد.';
  if (lang === 'rw') return 'Mbabarira gutinda kugusubiza.';
  return 'Sorry for the slow reply.';
}

/**
 * Tenant messages the webhook never delivered — the backstop poll found them with no `thook:` mark. A
 * deploy restart misses one now and then; a bridge that stopped calling the hook (11-07: Evolution's own
 * database error) misses every one. #mkan hears once per window: at HOOK_MISS_ALERT_AT misses, or as soon
 * as one of them waited HOOK_MISS_LATE_MS.
 */
export const HOOK_MISS_WINDOW_MS = 6 * 60 * 60 * 1000;
export const HOOK_MISS_ALERT_AT = 3;
export const HOOK_MISS_LATE_MS = 30 * 60 * 1000;
export type HookMisses = { ids: { id: string; at: string }[]; alertedAt?: string };
export function noteMisses(
  state: HookMisses,
  missed: { id: string; sentAt: Date }[],
  now: Date,
): { next: HookMisses; alert: { count: number; oldestMin: number } | null } {
  const since = now.getTime() - HOOK_MISS_WINDOW_MS;
  const known = new Set((state.ids ?? []).map((m) => m.id));
  const ids = [...(state.ids ?? []).filter((m) => Date.parse(m.at) > since), ...missed.filter((m) => !known.has(m.id)).map((m) => ({ id: m.id, at: now.toISOString() }))];
  const alerted = !!state.alertedAt && Date.parse(state.alertedAt) > since;
  const oldest = missed.reduce((o, m) => Math.max(o, now.getTime() - m.sentAt.getTime()), 0);
  if (!alerted && missed.length > 0 && (ids.length >= HOOK_MISS_ALERT_AT || oldest >= HOOK_MISS_LATE_MS)) {
    return { next: { ids, alertedAt: now.toISOString() }, alert: { count: ids.length, oldestMin: Math.round(oldest / 60_000) } };
  }
  return { next: { ids, ...(state.alertedAt ? { alertedAt: state.alertedAt } : {}) }, alert: null };
}

/** The chat's language from what the tenant just wrote, when it says: Arabic script, or a Kinyarwanda STOP/START. */
export function langOfWords(text: string): 'ar' | 'rw' | null {
  if (/[؀-ۿ]/.test(text)) return 'ar';
  if (/^\s*(?:hagarika|tangira)\b/i.test(text)) return 'rw';
  return null;
}

export type TenantDecision = 'answer' | 'stop' | 'start' | 'media' | 'skip-stopped' | 'skip-human' | 'skip-personal' | 'skip-old' | 'skip-empty' | 'skip-rate';

export function tenantDecision(input: {
  text: string;
  sentAt: Date;
  now: Date;
  stopped: boolean;
  /** When a person last typed in this chat from Mkan's side. */
  humanAt: Date | null;
  phoneRepliesLastHour: number;
  lineRepliesLastHour: number;
  /** A voice note, photo, location… with no words: the tenant hears once that only typed messages are read. */
  media?: boolean;
  /**
   * The chat is the line owner's own (humanChatBeforeBot): a person talked in it and the agent never did.
   * Judged after STOP and START, which anyone may say, and before everything that would answer.
   */
  personalChat?: boolean;
}): TenantDecision {
  const { text, now } = input;
  if (isTenantStop(text)) return 'stop';
  if (isOptIn(text)) return input.stopped ? 'start' : 'answer';
  if (input.stopped) return 'skip-stopped';
  if (input.personalChat) return 'skip-personal';
  if (now.getTime() - input.sentAt.getTime() > MAX_AGE_MS) return 'skip-old';
  if (input.humanAt && now.getTime() - input.humanAt.getTime() < HUMAN_HOLD_MS) return 'skip-human';
  if (!text.trim()) return input.media ? 'media' : 'skip-empty';
  if (input.phoneRepliesLastHour >= PER_PHONE_PER_HOUR || input.lineRepliesLastHour >= LINE_PER_HOUR) return 'skip-rate';
  return 'answer';
}

/** Once an hour per chat: a voice note or photo gets this, in the chat's language. rw is machine-written (native review sheet). */
export const MEDIA_NUDGE_MS = 60 * 60 * 1000;
export function typePleaseText(lang: string): string {
  if (lang === 'ar') return 'أستطيع قراءة الرسائل المكتوبة فقط — اكتب ما تبحث عنه من فضلك: المنطقة، عدد الغرف، والميزانية.';
  if (lang === 'rw') return "Nsoma ubutumwa bwanditse gusa — andika icyo ushaka: agace, umubare w'ibyumba, n'amafaranga.";
  return "I can only read typed messages — please type what you're looking for: the area, the number of bedrooms and your budget.";
}

/** A one-to-one chat (not a group, a broadcast or a status). */
export const isDirectChat = (remoteJid: string | undefined) => !!remoteJid && (remoteJid.endsWith('@s.whatsapp.net') || remoteJid.endsWith('@lid'));

// ── the same words twice ─────────────────────────────────────────────────────────────────────────

/** The agent's own messages to tenants (WaState `tenant-sent`): `id` once WhatsApp gave one, `h` the words' hash. */
/** `m`: a photo's caption — it never counts as "the last message" a repeat is checked against. */
export type Sent = { id: string; phone: string; at: string; h?: string; m?: true }[];

/** A reply's words, hashed: its echo is ours even when it comes back before the send returned its id. */
export const textHash = (t: string) => createHash('sha1').update(t.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 12);

/**
 * A reply already sent to this phone this recently is not sent again word for word: two messages in a
 * row that draw the same line ("The 1 first one", then "Okay", 11-12) read as a machine, and the second
 * needs no answer.
 */
export const REPEAT_WINDOW_MS = 3 * 60_000;

/** Did these exact words go out to this phone within REPEAT_WINDOW_MS? Sent replies only (they carry an id). */
export function saidJustNow(sent: Sent, phone: string, text: string, now: number): boolean {
  const h = textHash(text);
  return sent.some((s) => !!s.id && s.phone === phone && s.h === h && now - new Date(s.at).getTime() < REPEAT_WINDOW_MS);
}

/**
 * The very last message sent to this phone, word for word, however long ago (within a chat's day): a list
 * or a line sent again identical is a machine. …077 got the same six homes seven times and a vendor got
 * "Happy to help. Tell me the area…" four times in a row (2026-11-21). A list is replaced by the one-line
 * "same homes" answer; anything else is not sent.
 */
export const REPEAT_LAST_WITHIN_MS = 24 * 60 * 60 * 1000;
export function repeatsLast(sent: Sent, phone: string, text: string, now: number): boolean {
  const mine = sent.filter((s) => !!s.id && s.phone === phone && !s.m);
  const last = mine[mine.length - 1];
  return !!last && last.h === textHash(text) && now - new Date(last.at).getTime() < REPEAT_LAST_WITHIN_MS;
}

/** How many homes a reply lists: its "*1. Title*" lines. */
export const homesListed = (reply: string): number => (reply.match(/^\*\d+\. /gm) ?? []).length;

/** Homes sent as native WhatsApp photos beside the list (MKAN_WA_MEDIA): on unless it says off. */
export const mediaEnabled = (flag: string | undefined = process.env.MKAN_WA_MEDIA): boolean => !/^(?:0|off|false|no)$/i.test((flag ?? '').trim());

/**
 * A chat the line owner already lived in (2026-11-21: the line still carried Abdout's personal chats, and
 * vendors and friends got "Happy to help. Tell me the area…"): a person typed in it, the hold on them has long
 * run out, and the agent has never said a word there nor opened a chat for that number. A person who answers a
 * brand-new tenant by hand is inside HUMAN_HOLD_MS and is not this — that chat stays the agent's afterwards.
 */
export function humanChatBeforeBot(i: { humanAt: Date | null; now: Date; botSentToPhone: boolean; hasAgentChat: boolean }): boolean {
  if (!i.humanAt || i.botSentToPhone || i.hasAgentChat) return false;
  return i.now.getTime() - i.humanAt.getTime() >= HUMAN_HOLD_MS;
}

// ── one person, two addresses (2026-11-22) ───────────────────────────────────────────────────────
// WhatsApp now addresses a contact by a private `<id>@lid` AND by phone number, and a single thread
// arrives under one while the bot's reply and the line owner's own history sit under the other. The
// phone digits stay the canonical key (profiles are `sha256("wa:<digits>")`, STOP / human-hold / sent
// lists are keyed by them); the lid is the second address every personal / STOP / human check also reads.

/** The ids Evolution v2 can put on a message key (`remoteJidAlt`, `senderPn`, `senderLid`, `participantAlt`…). */
export interface WaKey {
  remoteJid?: string;
  remoteJidAlt?: string;
  senderPn?: string;
  senderLid?: string;
  participant?: string;
  participantAlt?: string;
  participantPn?: string;
}

/** The two addresses of one person: phone digits, and `<id>@lid`; either can be missing. */
export interface WaAddresses {
  phone: string | null;
  lid: string | null;
}

const jidUser = (jid: string) => (jid.split('@')[0] ?? '').replace(/:\d+$/, '');
const phoneDigits = (s: string) => s.replace(/[^\d]/g, '').replace(/^00/, '');
export const isLid = (address: string | null | undefined): boolean => !!address && address.endsWith('@lid');
/** `<id>@lid`, device suffix dropped; null when the string is not a lid. */
export const lidOf = (jid: string | null | undefined): string | null => (jid && jid.endsWith('@lid') && jidUser(jid) ? `${jidUser(jid)}@lid` : null);

/**
 * Both addresses of the sender of a message key: the phone from `senderPn` / `remoteJidAlt` / `remoteJid`
 * (an `@s.whatsapp.net` jid), the lid from whichever field carries an `@lid`. `phoneOfLid` is what an
 * earlier message taught us (WaState `alias:<lid>`): it fills the phone of a message that carries only the lid.
 */
export function resolveAddresses(key: WaKey | undefined, phoneOfLid?: string | null): WaAddresses {
  let phone: string | null = null;
  for (const jid of [key?.senderPn, key?.remoteJidAlt, key?.participantPn, key?.remoteJid, key?.participantAlt, key?.participant]) {
    if (jid && jid.endsWith('@s.whatsapp.net')) {
      const d = phoneDigits(jidUser(jid));
      if (d) {
        phone = d;
        break;
      }
    }
  }
  let lid: string | null = null;
  for (const jid of [key?.remoteJid, key?.remoteJidAlt, key?.senderLid, key?.participant, key?.participantAlt]) {
    lid = lidOf(jid);
    if (lid) break;
  }
  if (!phone && phoneOfLid) phone = phoneDigits(phoneOfLid) || null;
  return { phone, lid };
}

/** Every address a person is known by, for the checks that must see both halves of the history. */
export const addressList = (a: Partial<WaAddresses> | null | undefined): string[] => [a?.phone, a?.lid].filter((x): x is string => !!x);

/** STOP is on either address. */
export const stoppedAt = (stopped: readonly string[], addrs: readonly string[]): boolean => addrs.some((a) => stopped.includes(a));

/** The newest time a person typed in this chat, under any of its addresses. */
export function humanAtAny(human: Record<string, string>, addrs: readonly string[]): Date | null {
  let best = 0;
  for (const a of addrs) {
    const t = human[a] ? Date.parse(human[a]!) : NaN;
    if (Number.isFinite(t) && t > best) best = t;
  }
  return best ? new Date(best) : null;
}

/** Did the agent ever send to any of these addresses? */
export const botSentTo = (sent: Sent, addrs: readonly string[]): boolean => sent.some((s) => addrs.includes(s.phone));

// ── one reply per burst (2026-11-22) ─────────────────────────────────────────────────────────────
// People write in bursts ("Mwiriwe" / "ko nashakaga inzu…" / "itarengeje ibihumbi ijana" within ~3 min) and
// the bot answered each line: 3–5 replies, sometimes in two languages. A tenant's lines now wait until the
// chat has been quiet this long, then ONE turn reads them all, joined in order.

export const TENANT_BURST_QUIET_MS = 25_000;

export interface BurstLine {
  id: string;
  text: string;
  sentAt: Date;
  /** A voice note, photo, location… (no words). */
  media?: boolean;
  /** When the line reached us (the server's clock — the phone's can be off); falls back to sentAt. */
  arrivedAt?: Date;
}

/**
 * A line that never waits: a bare digit (a pick of the last numbered question), STOP, START. STOP must
 * never wait; a pick or START alone is the whole turn, joined with words it would read as something else.
 */
export const isImmediateLine = (text: string | null | undefined): boolean => {
  const t = (text ?? '').trim();
  return /^\d{1,2}[\s.!]*$/.test(t) || isTenantStop(t) || isOptIn(t);
};

/** When the tenant last wrote: the newest line's arrival, never in the future. */
export function lastWriteAt(lines: readonly BurstLine[], now: Date): number {
  let best = 0;
  for (const l of lines) best = Math.max(best, (l.arrivedAt ?? l.sentAt).getTime());
  return Math.min(best, now.getTime());
}

/** How long until the tenant has been quiet for `quietMs`; 0 or less when the burst is ready. */
export function burstQuietLeft(lines: readonly BurstLine[], now: Date, quietMs = TENANT_BURST_QUIET_MS): number {
  if (lines.length === 0) return 0;
  return lastWriteAt(lines, now) + quietMs - now.getTime();
}

/** Oldest first; equal times keep their given order. */
export const inOrder = (lines: readonly BurstLine[]): BurstLine[] =>
  lines.map((l, i) => ({ l, i })).sort((a, b) => a.l.sentAt.getTime() - b.l.sentAt.getTime() || a.i - b.i).map((x) => x.l);

/**
 * One chat's unanswered lines → the turns to run, in order: a run of ordinary lines is one burst, an
 * immediate line (isImmediateLine) is a turn of its own and splits the burst around it.
 */
export function segmentBursts(lines: readonly BurstLine[]): BurstLine[][] {
  const out: BurstLine[][] = [];
  let run: BurstLine[] = [];
  for (const l of inOrder(lines)) {
    if (isImmediateLine(l.text) && !l.media) {
      if (run.length) out.push(run);
      out.push([l]);
      run = [];
    } else run.push(l);
  }
  if (run.length) out.push(run);
  return out;
}

/** What one turn reads for a burst: the newest line carries the claim, the words are all lines newline-joined in order. */
export function joinBurst(lines: readonly BurstLine[]): { primary: BurstLine; folded: string[]; text: string; media: boolean; sentAt: Date } | null {
  const ordered = inOrder(lines);
  const primary = ordered[ordered.length - 1];
  if (!primary) return null;
  const text = ordered.map((l) => l.text.trim()).filter(Boolean).join('\n');
  return {
    primary,
    folded: ordered.slice(0, -1).map((l) => l.id),
    text,
    media: ordered.some((l) => l.media),
    // The oldest unanswered line: how long the tenant has waited, for "Sorry for the slow reply" and the 12 h limit.
    sentAt: ordered.reduce((o, l) => (l.sentAt.getTime() < o.getTime() ? l.sentAt : o), primary.sentAt),
  };
}

/** A claim row as wa-state.ts keeps it: only the fields a burst plan reads. */
export type ClaimRow = { s: 'working' | 'reply' | 'done'; at: string };

export type BurstPlan =
  | { kind: 'none' }
  | { kind: 'held' }
  /** An earlier line has a written but unsent reply: send it first, on its own; the rest wait for the next pass. */
  | { kind: 'resend-first'; line: BurstLine }
  | { kind: 'burst'; lines: BurstLine[] };

/**
 * Which of a burst's lines to read now. Settled lines are dropped (answered by an earlier turn); a line
 * another run is still on (a fresh `working` claim that is not the newest) means that run is live — held;
 * an earlier line whose reply was written but not sent goes first on its own, or its reply would be lost.
 */
export function planBurst(lines: readonly BurstLine[], claims: ReadonlyMap<string, ClaimRow>, now: Date, staleMs: number): BurstPlan {
  const open = inOrder(lines).filter((l) => claims.get(l.id)?.s !== 'done');
  if (open.length === 0) return { kind: 'none' };
  const newest = open[open.length - 1]!;
  for (const l of open) {
    if (l === newest) continue;
    const c = claims.get(l.id);
    if (c?.s === 'reply') return { kind: 'resend-first', line: l };
    if (c?.s === 'working' && now.getTime() - Date.parse(c.at) < staleMs) return { kind: 'held' };
  }
  return { kind: 'burst', lines: open };
}
