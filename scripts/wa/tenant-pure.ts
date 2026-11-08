/**
 * Which WhatsApp messages the rental agent answers — pure, so the rules are tested.
 *
 * The agent replies only to a tenant who wrote to Mkan (never a first
 * message), and stays quiet when:
 *   - the sender said STOP (until they say START);
 *   - a person at Mkan typed in that chat in the last HUMAN_HOLD_MS — a human
 *     took the conversation over, and the bot does not talk across them;
 *   - the message is older than MAX_AGE_MS (the fallback poll after a long
 *     outage: an answer a day late reads like spam);
 *   - the phone or the whole line is over its hourly ceiling.
 */

export const HUMAN_HOLD_MS = 12 * 60 * 60 * 1000;
export const MAX_AGE_MS = 60 * 60 * 1000;
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

/** The chat's language from what the tenant just wrote, when it says: Arabic script, or a Kinyarwanda STOP/START. */
export function langOfWords(text: string): 'ar' | 'rw' | null {
  if (/[؀-ۿ]/.test(text)) return 'ar';
  if (/^\s*(?:hagarika|tangira)\b/i.test(text)) return 'rw';
  return null;
}

export type TenantDecision = 'answer' | 'stop' | 'start' | 'media' | 'skip-stopped' | 'skip-human' | 'skip-old' | 'skip-empty' | 'skip-rate';

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
}): TenantDecision {
  const { text, now } = input;
  if (isTenantStop(text)) return 'stop';
  if (isOptIn(text)) return input.stopped ? 'start' : 'answer';
  if (input.stopped) return 'skip-stopped';
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
