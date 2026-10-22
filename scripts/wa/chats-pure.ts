/**
 * Abdout's own WhatsApp chats with Kigali brokers → broker facts for the
 * directory. Pure: scripts/wa/chats.ts reads the Mac's WhatsApp database and
 * hands each 1:1 chat here. Only facts leave this file (who, where, what
 * price, visit fee, how fast they answer) — never the conversation.
 */
import { parseBrokerReply } from '../../src/components/agent/broker-reply';
import { normaliseRwPhone } from '../crm/brokers-pure';

export interface ChatMessage {
  fromMe: boolean;
  /** 0 text · 1 image · 2 video · 66 album · 5 location · 10 system (WhatsApp's ZMESSAGETYPE). */
  type: number;
  text: string | null;
  at: Date;
}

export type ReviewKind = 'broker' | 'agency' | 'landlord' | 'exclude';
export type ChatClass = ReviewKind | 'review' | 'other';

export interface Quote {
  price: number;
  place: string | null;
  zoneSlug: string | null;
  bedrooms: number | null;
  at: string;
}

export interface WaBroker {
  phone: string;
  /** Other numbers the broker moved the chat to ("use this number…"). */
  altPhones: string[];
  name: string | null;
  kind: 'BROKER' | 'AGENCY' | 'LANDLORD';
  quotes: Quote[];
  /** Places named without a price — still where they work. */
  places: string[];
  visitFee: number | null;
  sentMedia: boolean;
  /** Median minutes from Abdout's message to their next reply. */
  replyMinutes: number | null;
  firstAt: string;
  lastAt: string;
  lastReplyAt: string | null;
  messages: number;
}

const MEDIA = new Set([1, 2, 66]);
const THEIR_HOUSING = /\bbed ?rooms?\b|\bapartment\b|\bhouse\b|\bfor rent\b|\brent\b|furnished|visit(?:ing)? fee|\bprice\b|\b\d{3}k\b|\binzu\b|self ?compound|\bannex\b|\blandlord\b|\bowner\b/i;
const MY_ASK = /\bneed\b.*\b(?:bed ?rooms?|house|apartment|compound|home)\b|looking for (?:a )?(?:house|home|apartment)|\bfor rent\b|\bbed ?rooms?\b.*\b(?:kibagabaga|kimironko|kicukiro|remera|gisozi|kacyiru|nyarutarama|kanombe)\b/i;

/** Saved names can be people; a formatted number or a business name is not a person's private label. */
export function phoneFromLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  const digits = label.replace(/[^\d+]/g, '');
  return /^\+?\d{9,15}$/.test(digits) ? normaliseRwPhone(digits) : null;
}

/** A chat about renting: the broker talks housing, or Abdout asked for a home there. */
export function looksLikeHousing(msgs: ChatMessage[]): boolean {
  return msgs.some((m) => m.text && (m.fromMe ? MY_ASK.test(m.text) : THEIR_HOUSING.test(m.text)));
}

/**
 * The reviewed label wins; an unreviewed housing chat waits for review and is
 * never imported on a guess — Abdout's chats include friends and other work.
 */
export function classifyChat(phone: string, msgs: ChatMessage[], review: Record<string, ReviewKind>): ChatClass {
  const r = review[phone];
  if (r) return r;
  return looksLikeHousing(msgs) ? 'review' : 'other';
}

/** "I'm Eric", "my name is Eric", "this is Grace" — the name they gave. */
export function nameGiven(msgs: ChatMessage[]): string | null {
  for (const m of msgs) {
    if (m.fromMe || !m.text) continue;
    const hit = m.text.replace(/[’`]/g, "'").match(/\b(?:[Ii]'?m|[Ii] am|[Mm]y name is|[Tt]his is)\s+([A-Z][a-z]{2,15})\b/);
    if (hit && !/^(?:Available|Here|Not|Ok|Okay|Fine|Good|Busy|Coming|Mkan)$/.test(hit[1]!)) return hit[1]!;
  }
  return null;
}

/**
 * "Use this number 07…", "my other line" — a number the broker
 * gives as their own. A number for someone else ("call him 07…") is not theirs.
 */
export function numbersSent(msgs: ChatMessage[], own: string): string[] {
  const out = new Set<string>();
  for (const m of msgs) {
    if (m.fromMe || !m.text || !/\b(?:my|this|new|other|another)\s+(?:number|no\.?|line|whatsapp)\b|reach me|whatsapp me|text me/i.test(m.text)) continue;
    for (const raw of m.text.match(/(?:\+?250|0)\s?7[2389](?:[\s-]?\d){7}/g) ?? []) {
      const p = normaliseRwPhone(raw.replace(/[\s-]/g, ''));
      if (p && p !== own) out.add(p);
    }
  }
  return [...out];
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

/** Minutes from each of Abdout's messages to the broker's next one (only gaps under 3 days count). */
export function replyMinutes(msgs: ChatMessage[]): number | null {
  const gaps: number[] = [];
  let asked: Date | null = null;
  for (const m of msgs) {
    if (m.type === 10) continue;
    if (m.fromMe) asked ??= m.at;
    else if (asked) {
      const min = (m.at.getTime() - asked.getTime()) / 60_000;
      if (min >= 0 && min < 3 * 24 * 60) gaps.push(min);
      asked = null;
    }
  }
  const md = median(gaps);
  return md == null ? null : Math.round(md);
}

/** Everything the directory keeps about one broker chat. */
/**
 * `label` is the name Abdout saved, `pushName` the one the broker set on their
 * WhatsApp profile ("FREDY REAL ESTATE Ltd"). A name they gave in the chat wins.
 */
export function brokerFromChat(phone: string, kind: ReviewKind, label: string | null, msgs: ChatMessage[], pushName: string | null = null): WaBroker | null {
  if (kind === 'exclude' || !msgs.length) return null;
  const sorted = [...msgs].sort((a, b) => a.at.getTime() - b.at.getTime());
  const theirs = sorted.filter((m) => !m.fromMe && m.type !== 10);
  const quotes: Quote[] = [];
  const places = new Set<string>();
  let visitFee: number | null = null;
  for (const m of theirs) {
    if (!m.text) continue;
    const r = parseBrokerReply(m.text);
    if (r.visitFee != null) visitFee ??= r.visitFee;
    if (r.place) places.add(r.place);
    if (r.price != null) quotes.push({ price: r.price, place: r.place, zoneSlug: r.zoneSlug, bedrooms: r.bedrooms, at: m.at.toISOString() });
  }
  const savedName = label && !phoneFromLabel(label) && !/^(?:home|house|broker|agent|landlord|rent)$/i.test(label.trim()) ? label : null;
  const profileName = pushName?.trim() && !phoneFromLabel(pushName) ? pushName.trim() : null;
  return {
    phone,
    altPhones: numbersSent(sorted, phone),
    name: nameGiven(sorted) ?? profileName ?? savedName,
    kind: kind === 'agency' ? 'AGENCY' : kind === 'landlord' ? 'LANDLORD' : 'BROKER',
    quotes,
    places: [...places],
    visitFee,
    sentMedia: theirs.some((m) => MEDIA.has(m.type)),
    replyMinutes: replyMinutes(sorted),
    firstAt: sorted[0]!.at.toISOString(),
    lastAt: sorted.at(-1)!.at.toISOString(),
    lastReplyAt: theirs.at(-1)?.at.toISOString() ?? null,
    messages: sorted.length,
  };
}

/** A WhatsApp channel post that reads as a rental ad. */
export interface ChannelPost {
  channel: string;
  id: string;
  text: string;
  at: string;
  hasMedia: boolean;
}

export const isRentalPost = (text: string) => /\bfor rent\b|\brent\b|\bbed ?rooms?\b|\bprice\b/i.test(text) && !/\bfor sale\b/i.test(text);
