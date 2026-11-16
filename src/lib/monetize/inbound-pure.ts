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

import { CHAT_STAGES, funnelTable, furthest, stageIndex, stopCounts, stopOf, worstStop, type ChatFacts, type ChatStage, type Stop } from "./chat-funnel-pure";

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

/** The upstream step the card marks in red: where the road to a new person is weakest (2026-11-16). */
export type InboundStep = "reach" | "intent" | "arrival";

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
  /** The weakest upstream step this week, null while no signal has ever been counted. */
  weakest: InboundStep | null;
}

export interface InboundOverview {
  generatedAt: string;
  /** Kigali day the numbers are for. */
  day: string;
  web: ChannelInbound;
  wa: ChannelInbound;
  total: { today: number; week: number; lastWeek: number; target: number };
  /** First Kigali day of the current week window (today − 6), so a card can tell a partial week from a full one. */
  weekFrom: string;
  /** The first day any SiteSignal row exists (null = none yet): before it, upstream zeros are "not counted", not "nobody". */
  signalsSince: string | null;
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

// ── The builders (2026-11-16) ───────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** A Kigali day plus n days (n may be negative), YYYY-MM-DD. */
export function addDays(day: string, n: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

/** The `n` days ending at `end`, oldest first. */
export function daysEnding(end: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(end, i - (n - 1)));
}

/** One row of SiteSignal, as read. */
export interface SignalRow {
  day: string;
  kind: string;
  visitorHash: string;
}

/** A TikTok post that went out, for the views upstream of the WhatsApp card. */
export interface PostViews {
  postedAt: Date;
  views: number | null;
}

/** Floors for the web steps: a visitor opening the chat, and an opener writing. Below them is the weak step. */
const WEB_FLOOR = { intent: 0.05, arrival: 0.3 };

const distinct = (rows: SignalRow[], kind: string, days: Set<string>) => new Set(rows.filter((r) => r.kind === kind && days.has(r.day)).map((r) => r.visitorHash)).size;

/**
 * Where the road to a new person is weakest this week. Reach goes first: nobody visiting (or a fall of
 * 40% on last week) is the problem before any rate is. Then the lower of the two rates against its floor.
 * null while no signal has ever been counted — an unknown must not be shown as a verdict.
 */
export function weakestStep(channel: InboundChannel, week: InboundUpstream, lastWeek: InboundUpstream, people: number, signalsSince: string | null): InboundStep | null {
  if (!signalsSince) return null;
  if (week.reach === 0 || (lastWeek.reach > 0 && week.reach < lastWeek.reach * 0.6)) return "reach";
  if (channel === "wa") return "arrival";
  const intentScore = week.intent / week.reach / WEB_FLOOR.intent;
  const arrivalScore = week.intent > 0 ? people / week.intent / WEB_FLOOR.arrival : 0;
  return intentScore <= arrivalScore ? "intent" : "arrival";
}

export interface InboundInput {
  facts: ChatFacts[];
  signals: SignalRow[];
  posts: PostViews[];
  signalsSince: string | null;
  now: Date;
}

/** The funnel stage a stopped chat failed to reach: the one after where it stopped. */
function nextStageOf(stage: ChatStage): ChatStage | null {
  return CHAT_STAGES[stageIndex(stage) + 1] ?? null;
}

/** The weakest funnel step after "inbound", from the existing stop counts (reused, not re-derived). */
export function funnelBottlenecks(facts: ChatFacts[], now: Date): { stage: ChatStage; rate: number | null }[] {
  const table = funnelTable(facts);
  const counts = stopCounts(facts.map((f) => stopOf(f, now)).filter((s): s is Stop => !!s));
  const out: { stage: ChatStage; rate: number | null }[] = [];
  let rest = counts;
  for (let i = 0; i < 2; i++) {
    const worst = worstStop(rest);
    if (!worst) break;
    const stage = nextStageOf(worst.stage);
    if (stage && !out.some((o) => o.stage === stage)) out.push({ stage, rate: table.find((r) => r.stage === stage)?.rate ?? null });
    rest = rest.filter((c) => c.cause !== worst.cause);
  }
  return out;
}

export function buildInbound({ facts, signals, posts, signalsSince, now }: InboundInput): InboundOverview {
  const today = kigaliDayOf(now);
  const week = daysEnding(today, 7);
  const weekSet = new Set(week);
  const lastWeek = daysEnding(addDays(today, -7), 7);
  const lastSet = new Set(lastWeek);
  const days14 = daysEnding(today, 14);
  const days30 = new Set(daysEnding(today, 30));

  // A WhatsApp profile whose source is "web" came through "Continue on WhatsApp": the same person, counted on the web.
  const moved = (f: ChatFacts) => f.channel === "wa" && f.source === "web";
  const dayOf = (f: ChatFacts) => kigaliDayOf(f.at.chat ?? new Date(0));
  const counted = facts.filter((f) => !moved(f));
  const channelOf = (f: ChatFacts): InboundChannel => (f.channel === "wa" ? "wa" : "web");

  const tiktok = (days: Set<string>) => posts.filter((p) => days.has(kigaliDayOf(p.postedAt))).reduce((a, p) => a + (p.views ?? 0), 0);

  const channel = (ch: InboundChannel): ChannelInbound => {
    const mine = counted.filter((f) => channelOf(f) === ch);
    const inDays = (set: Set<string>) => mine.filter((f) => set.has(dayOf(f)));
    const thisWeek = inDays(weekSet);
    const bySource = new Map<string, number>();
    for (const f of thisWeek) bySource.set(f.source, (bySource.get(f.source) ?? 0) + 1);
    const upstream = (set: Set<string>): InboundUpstream =>
      ch === "web"
        ? { reach: distinct(signals, "visit", set), intent: distinct(signals, "chat_open", set), tiktokViews: null }
        : { reach: distinct(signals, "wa_tap", set), intent: distinct(signals, "wa_tap", set), tiktokViews: tiktok(set) };
    const up = { week: upstream(weekSet), lastWeek: upstream(lastSet) };
    return {
      channel: ch,
      today: mine.filter((f) => dayOf(f) === today).length,
      week: thisWeek.length,
      lastWeek: inDays(lastSet).length,
      days30: inDays(days30).length,
      series: days14.map((day) => ({ day, n: mine.filter((f) => dayOf(f) === day).length })),
      sources: [...bySource.entries()].map(([source, n]) => ({ source, n })).sort((a, b) => b.n - a.n || a.source.localeCompare(b.source)),
      movedToWa: ch === "web" ? facts.filter((f) => moved(f) && weekSet.has(dayOf(f))).length : 0,
      upstream: up,
      weakest: weakestStep(ch, up.week, up.lastWeek, thisWeek.length, signalsSince),
    };
  };

  const web = channel("web");
  const wa = channel("wa");
  const total = {
    today: web.today + wa.today,
    week: web.week + wa.week,
    lastWeek: web.lastWeek + wa.lastWeek,
    target: INBOUND_TARGET_PER_WEEK,
  };

  const people: InboundPerson[] = facts
    .filter((f) => days30.has(dayOf(f)) && f.profileId)
    .sort((a, b) => (b.at.chat?.getTime() ?? 0) - (a.at.chat?.getTime() ?? 0))
    .map((f) => ({
      profileId: f.profileId!,
      taskId: f.id,
      channel: moved(f) ? "web" : channelOf(f),
      source: f.source,
      day: dayOf(f),
      firstWords: f.firstWords ?? "",
      stage: furthest(f),
      movedToWa: moved(f),
    }));

  // Inbound is the bottleneck until the week reaches the target; then the weakest funnel step takes over.
  const steps = funnelBottlenecks(counted, now);
  const short = total.week < total.target;
  const bottleneck: InboundOverview["bottleneck"] = short
    ? { now: "inbound", next: steps[0]?.stage ?? null, nextRate: steps[0]?.rate ?? null }
    : { now: steps[0]?.stage ?? "inbound", next: steps[1]?.stage ?? null, nextRate: steps[1]?.rate ?? null };

  return { generatedAt: now.toISOString(), day: today, weekFrom: week[0]!, signalsSince, web, wa, total, people, bottleneck };
}
