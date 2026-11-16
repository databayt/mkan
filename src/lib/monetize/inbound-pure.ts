/**
 * Inbound — the people who reach Mkan, web alone and WhatsApp alone (Abdout, 2026-11-16: "this number we
 * will decide on all the processes … so we know we have a problem even before, not after").
 *
 * The definition, once: a person is a real profile (`REAL_PERSON`, team.ts) counted on the Kigali day of their
 * first message, on the channel they first wrote from. WhatsApp people whose source is `web` came through
 * "Continue on WhatsApp" — they were already counted on the web, so they show as the web card's "→ WhatsApp"
 * line, never twice. The target is 1 new person a day in total (7 a week), until real data sets a better one.
 * Upstream of a chat, `SiteSignal` counts visits, WhatsApp taps and chat opens (people, not hits), so a drop
 * shows in reach or intent before it shows here.
 *
 * Pure: the loading is inbound.ts. Types and the shape are fixed here so the cards (/monetize) and the Sunday
 * numbers (loop-numbers) read one thing.
 */

export type InboundChannel = "web" | "wa";

/** 1 new person a day, both channels together (Abdout, 2026-11-16). */
export const INBOUND_TARGET_PER_DAY = 1;
export const INBOUND_TARGET_PER_WEEK = INBOUND_TARGET_PER_DAY * 7;

/** One new person, as the admin list shows them (phones masked before this point). */
export interface InboundPerson {
  /** The profile id (team marking acts on it) — never a phone. */
  profileId: string;
  /** The newest chat's id, for the admin link. */
  taskId: string;
  channel: InboundChannel;
  /** tiktok | tiktok_bio | today | k_page | web | organic | a share marker (fb-…, wa-status, gbp…) */
  source: string;
  /** Kigali day of the first message, YYYY-MM-DD. */
  day: string;
  /** The first words they wrote, phones and emails masked, ≤ 120 chars. */
  firstWords: string;
  /** How far they got (chat-funnel-pure.ts `furthest`). */
  stage: string;
  /** A web person who also wrote on WhatsApp through "Continue on WhatsApp". */
  movedToWa: boolean;
}

/** Upstream of a chat, one channel's reach and intent for a window (people, from SiteSignal). */
export interface InboundUpstream {
  /** web: visitors to /, /find, /today, /tt, /k, listings. wa: taps on a WhatsApp button. */
  reach: number;
  /** web: opened the chat (bubble or /find). wa: — (same as reach). */
  intent: number;
  /** TikTok views over the window (wa card), null on web. */
  tiktokViews: number | null;
}

export interface ChannelInbound {
  channel: InboundChannel;
  today: number;
  week: number;
  lastWeek: number;
  days30: number;
  /** The last 14 Kigali days, oldest first, every day present (0 when nobody came). */
  series: { day: string; n: number }[];
  /** This week's people by source, most first. */
  sources: { source: string; n: number }[];
  /** web only: web people this week who moved to WhatsApp. */
  movedToWa: number;
  upstream: { week: InboundUpstream; lastWeek: InboundUpstream };
}

export interface InboundOverview {
  generatedAt: string;
  /** Kigali day the numbers are for. */
  day: string;
  web: ChannelInbound;
  wa: ChannelInbound;
  total: { today: number; week: number; lastWeek: number; target: number };
  /** The new people of the last 30 days, newest first — admin only (public.ts strips it). */
  people: InboundPerson[];
  /** The funnel's current bottleneck and the next one, in the page's words (keys into monetize.inbound.stage). */
  bottleneck: { now: string; next: string | null; nextRate: number | null };
}

/** The Kigali day of an instant, YYYY-MM-DD (Kigali is UTC+2, no daylight saving). */
export function kigaliDayOf(at: Date | number): string {
  const t = typeof at === "number" ? at : at.getTime();
  return new Date(t + 2 * 3_600_000).toISOString().slice(0, 10);
}
