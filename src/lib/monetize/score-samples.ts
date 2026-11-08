import type { FunnelStepKey, Sample } from "./scorecard";

/**
 * Raw counts → the scorecard's samples (scorecard.ts PARTS). Pure, so the arithmetic is tested
 * without a database: score-load.ts runs the queries, load.ts adds what the page already counted.
 */

/** One post snapshot reduced to what the scorecard reads (BlockSnapshot block "post"). */
export interface PostPoint {
  at: number;
  posts: number | null;
  views: number | null;
  followers: number | null;
  likes?: number | null;
  /** Comments + shares on the page's videos: the interactions beyond a like. */
  talk?: number | null;
}

export interface ScoreRaw {
  now: number;
  /** Post snapshots, oldest first, the last ~14 days. */
  post: PostPoint[];
  /** The post snapshot nearest before 30 days ago (null: the page is younger than that). */
  post30: PostPoint | null;
  /** People who wrote in 30 days (the team and Abdout's own contacts left out: team.ts), and those who wrote on 2+ days. */
  people30: number;
  returning30: number;
  /** Of those, the ones who came from TikTok: a post's code, the /tt page, or saying so (refSource). */
  tiktokPeople30: number;
  /** Broker asks sent in 30 days for real people's chats: total, answered, distinct chats asked for, chats that got a yes. */
  asks: { sent: number; answered: number; tasks: number; yes: number };
  /** Real WhatsApp tenants in 30 days who got homes, and of them who picked one (a check started: digit, words or code). */
  picks: { shown: number; picked: number };
  /**
   * Hearing back on WhatsApp, 30 days: chats whose first ask went out, and of them those told something within 3 h;
   * broker answers (yes / taken), and of them those that reached the tenant within 1 h.
   */
  told: { asked: number; told3h: number; answers: number; told1h: number };
  /** Deals: booked in 30 days, of those viewed or further, paid in 30 days. */
  deals: { booked: number; viewed: number; paid: number };
  brokers: { asked: number; optOut: number; saidYes: number; agreed: number; replyMedianMin: number | null; replyN: number };
  feedback: { tenantAvg: number | null; tenantN: number; brokerAvg: number | null; brokerN: number; up: number; down: number };
  /** Median tenant messages before the first broker ask, over the chats that reached one (30 days). */
  messagesToAsk: { median: number | null; n: number };
  /** WhatsApp numbers that said STOP, and WhatsApp tenants ever. */
  stops: number;
  waTenants: number;
  /** This week's chatbot numbers, already on the page (load.ts). */
  week: { people: number | null; shortlisted: number | null; tasks: number; failed: number; p50: number | null; turns: number; messages: number | null; handoffs: number | null; evalReader: number | null };
}

const DAY = 86_400_000;
/** The newest value of a field across the points (null when none has it). */
const latestOf = (points: PostPoint[], pick: (p: PostPoint) => number | null): number | null => {
  for (let i = points.length - 1; i >= 0; i--) {
    const v = pick(points[i]!);
    if (v != null) return v;
  }
  return null;
};
const ratio = (n: number, of: number): Sample => ({ value: of > 0 ? n / of : null, n: of });

/** The newest point at or before `t`, else the oldest one (a page younger than the window). */
function baseAt(points: PostPoint[], t: number, pick: (p: PostPoint) => number | null): PostPoint | null {
  const usable = points.filter((p) => pick(p) != null);
  if (!usable.length) return null;
  const before = usable.filter((p) => p.at <= t);
  return before.length ? before[before.length - 1]! : usable[0]!;
}

/** Growth of a cumulative field over the last `days`, scaled to `per` days; n = days observed. */
export function growth(points: PostPoint[], pick: (p: PostPoint) => number | null, now: number, days: number, per: number): Sample {
  const usable = points.filter((p) => pick(p) != null);
  const latest = usable.at(-1);
  const base = baseAt(points, now - days * DAY, pick);
  if (!latest || !base || latest === base) return { value: null, n: 0 };
  const span = (latest.at - base.at) / DAY;
  if (span <= 0) return { value: null, n: 0 };
  const gained = Math.max(0, pick(latest)! - pick(base)!);
  return { value: (gained / span) * per, n: Math.round(span) };
}

export function buildSamples(r: ScoreRaw): { samples: Record<string, Sample>; counts: Partial<Record<FunnelStepKey, number | null>>; followers: number | null } {
  const latest = [...r.post].reverse().find((p) => p.posts != null || p.views != null) ?? null;
  // 30 days of posts and views: the latest total minus the total 30 days ago (0 when the page is younger).
  const posts30 = latest?.posts != null ? latest.posts - (r.post30?.posts ?? 0) : null;
  const views30 = latest?.views != null ? latest.views - (r.post30?.views ?? 0) : null;
  const w = r.week;
  const samples: Record<string, Sample> = {
    postsPerDay: growth(r.post, (p) => p.posts, r.now, 7, 1),
    followersWeek: growth(r.post, (p) => p.followers, r.now, 7, 7),
    viewsWeek: growth(r.post, (p) => p.views, r.now, 7, 7),
    // No likes on record is "not read yet", never 0%.
    likeRate: latest?.views && latestOf(r.post, (p) => p.likes ?? null) != null ? { value: latestOf(r.post, (p) => p.likes ?? null)! / latest.views, n: latest.views } : { value: null, n: 0 },
    engageRate:
      latest?.views && latestOf(r.post, (p) => p.likes ?? null) != null
        ? { value: (latestOf(r.post, (p) => p.likes ?? null)! + (latestOf(r.post, (p) => p.talk ?? null) ?? 0)) / latest.views, n: latest.views }
        : { value: null, n: 0 },
    followRate: (() => {
      const f = growth(r.post, (p) => p.followers, r.now, 7, 7);
      const v = growth(r.post, (p) => p.views, r.now, 7, 7);
      return f.value != null && v.value != null && v.value > 0 ? { value: f.value / v.value, n: Math.round(v.value) } : { value: null, n: 0 };
    })(),
    viewsPerPost: latest?.posts ? { value: (latest.views ?? 0) / latest.posts, n: latest.posts } : { value: null, n: 0 },
    // TikTok's own chats over TikTok's views: every chat over the views read 2.6% when not one came from a post (2026-11-08).
    viewsToChats: views30 != null ? ratio(r.tiktokPeople30, views30) : { value: null, n: 0 },
    chatsToAsked: ratio(r.asks.tasks, r.people30),
    askedToYes: ratio(Math.min(r.asks.yes, r.asks.tasks), r.asks.tasks),
    yesToViewing: ratio(r.deals.booked, r.asks.yes),
    viewingToViewed: ratio(r.deals.viewed, r.deals.booked),
    viewedToPaid: ratio(r.deals.paid, r.deals.viewed),

    brokerAnswerRate: ratio(r.asks.answered, r.asks.sent),
    brokerReplyMin: { value: r.brokers.replyMedianMin, n: r.brokers.replyN },
    brokerShareAgreed: ratio(r.brokers.agreed, r.brokers.saidYes),
    brokerStayed: r.brokers.asked > 0 ? { value: 1 - r.brokers.optOut / r.brokers.asked, n: r.brokers.asked } : { value: null, n: 0 },
    brokerRating: { value: r.feedback.brokerAvg, n: r.feedback.brokerN },

    tenantRating: { value: r.feedback.tenantAvg, n: r.feedback.tenantN },
    thumbsUp: ratio(r.feedback.up, r.feedback.up + r.feedback.down),
    returning: ratio(r.returning30, r.people30),
    noStop: r.waTenants > 0 ? { value: 1 - Math.min(r.stops, r.waTenants) / r.waTenants, n: r.waTenants } : { value: null, n: 0 },
    // The tenant hears back, on their WhatsApp, within 3 h of their pick — not "the broker answered" (a web chat nobody could tell counted).
    answeredIn3h: ratio(r.told.told3h, r.told.asked),

    peopleToHomes: w.people != null && w.shortlisted != null ? ratio(Math.min(w.shortlisted, w.people), w.people) : { value: null, n: 0 },
    pickRate: ratio(r.picks.picked, r.picks.shown),
    toldIn1h: ratio(r.told.told1h, r.told.answers),
    replyP50: { value: w.p50, n: w.turns },
    noFailures: w.tasks > 0 ? { value: 1 - w.failed / w.tasks, n: w.tasks } : { value: null, n: 0 },
    handledAlone: w.messages != null && w.messages > 0 ? { value: 1 - Math.min(w.handoffs ?? 0, w.messages) / w.messages, n: w.messages } : { value: null, n: 0 },
    evalReader: { value: w.evalReader, n: w.evalReader != null ? 1 : 0 },
    messagesToAsk: { value: r.messagesToAsk.median, n: r.messagesToAsk.n },
  };
  const counts: Partial<Record<FunnelStepKey, number | null>> = {
    posts: posts30,
    views: views30,
    chats: r.people30,
    asked: r.asks.tasks,
    yes: r.asks.yes,
    viewing: r.deals.booked,
    viewed: r.deals.viewed,
    paid: r.deals.paid,
  };
  const followers = [...r.post].reverse().find((p) => p.followers != null)?.followers ?? null;
  return { samples, counts, followers };
}

// ── TikTok reach: followers, views, posts (Abdout, 2026-11-07: "show how many people follow our page
// and watch our posts, and always work on increasing them") ──────────────

export interface ReachDay {
  /** YYYY-MM-DD (UTC), the last snapshot of that day. */
  day: string;
  followers: number | null;
  views: number | null;
  posts: number | null;
  likes: number | null;
  talk: number | null;
}

export interface ReachView {
  followers: number | null;
  views: number | null;
  posts: number | null;
  likes: number | null;
  /** Comments + shares. */
  talk: number | null;
  likesWeek: number | null;
  talkWeek: number | null;
  viewsPerPost: number | null;
  /** Gained over the last 7 days, or since the first snapshot when the page's record is younger. */
  followersWeek: number | null;
  viewsWeek: number | null;
  postsWeek: number | null;
  /** The first day of that gain when the record is younger than a week (else null: a full week). */
  since: string | null;
  /** One point a day, oldest first, for the trend lines. */
  days: ReachDay[];
}

/** The page's reach from the hourly post snapshots: the latest numbers, the week's gain, one point a day. */
export function reachOf(points: PostPoint[], now: number, days = 14): ReachView {
  const byDay = new Map<string, ReachDay>();
  for (const p of points) {
    if (p.at > now || now - p.at > days * DAY) continue;
    const day = new Date(p.at).toISOString().slice(0, 10);
    const prev = byDay.get(day);
    byDay.set(day, {
      day,
      followers: p.followers ?? prev?.followers ?? null,
      views: p.views ?? prev?.views ?? null,
      posts: p.posts ?? prev?.posts ?? null,
      likes: p.likes ?? prev?.likes ?? null,
      talk: p.talk ?? prev?.talk ?? null,
    });
  }
  const series = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  const latest = (pick: (p: PostPoint) => number | null) => [...points].reverse().find((p) => pick(p) != null);
  const gain = (pick: (p: PostPoint) => number | null) => {
    const last = latest(pick);
    const base = baseAt(points, now - 7 * DAY, pick);
    if (!last || !base || last === base) return { value: null as number | null, since: null as string | null };
    const young = now - base.at < 6.5 * DAY;
    return { value: Math.max(0, pick(last)! - pick(base)!), since: young ? new Date(base.at).toISOString().slice(0, 10) : null };
  };
  const f = gain((p) => p.followers);
  const v = gain((p) => p.views);
  const n = gain((p) => p.posts);
  const l = gain((p) => p.likes ?? null);
  const t = gain((p) => p.talk ?? null);
  const posts = latest((p) => p.posts)?.posts ?? null;
  const views = latest((p) => p.views)?.views ?? null;
  return {
    followers: latest((p) => p.followers)?.followers ?? null,
    views,
    posts,
    likes: latest((p) => p.likes ?? null)?.likes ?? null,
    talk: latest((p) => p.talk ?? null)?.talk ?? null,
    likesWeek: l.value,
    talkWeek: t.value,
    viewsPerPost: posts && views != null ? views / posts : null,
    followersWeek: f.value,
    viewsWeek: v.value,
    postsWeek: n.value,
    since: f.since ?? v.since ?? n.since,
    days: series,
  };
}

