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
import { isOptOut } from './outbox-pure';

export const HUMAN_HOLD_MS = 12 * 60 * 60 * 1000;
export const MAX_AGE_MS = 60 * 60 * 1000;
export const PER_PHONE_PER_HOUR = 20;
export const LINE_PER_HOUR = 120;

const OPT_IN = /^(start|tangira|unstop|resume)[\s.!]*$/iu;
export const isOptIn = (text: string | null | undefined) => OPT_IN.test((text ?? '').trim());

export type TenantDecision = 'answer' | 'stop' | 'start' | 'skip-stopped' | 'skip-human' | 'skip-old' | 'skip-empty' | 'skip-rate';

export function tenantDecision(input: {
  text: string;
  sentAt: Date;
  now: Date;
  stopped: boolean;
  /** When a person last typed in this chat from Mkan's side. */
  humanAt: Date | null;
  phoneRepliesLastHour: number;
  lineRepliesLastHour: number;
}): TenantDecision {
  const { text, now } = input;
  if (isOptOut(text)) return 'stop';
  if (isOptIn(text)) return input.stopped ? 'start' : 'answer';
  if (input.stopped) return 'skip-stopped';
  if (!text.trim()) return 'skip-empty';
  if (now.getTime() - input.sentAt.getTime() > MAX_AGE_MS) return 'skip-old';
  if (input.humanAt && now.getTime() - input.humanAt.getTime() < HUMAN_HOLD_MS) return 'skip-human';
  if (input.phoneRepliesLastHour >= PER_PHONE_PER_HOUR || input.lineRepliesLastHour >= LINE_PER_HOUR) return 'skip-rate';
  return 'answer';
}

/** A one-to-one chat (not a group, a broadcast or a status). */
export const isDirectChat = (remoteJid: string | undefined) => !!remoteJid && (remoteJid.endsWith('@s.whatsapp.net') || remoteJid.endsWith('@lid'));
