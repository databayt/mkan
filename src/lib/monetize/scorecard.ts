/**
 * The four numbers Abdout asked for (2026-11-07): how we are doing, are the brokers happy, are the
 * tenants satisfied, is the chatbot effective. Each tile is the mean of its parts' progress toward
 * their targets, counting only parts with enough sample; each names its weakest part. The funnel
 * line walks posts → paid and marks the weakest arrow. Pure: samples in, tiles out — the loader
 * (score-load.ts) counts, this file judges, the page and the sprint loop read the same verdict.
 */
export type TileKey = "tiktok" | "doing" | "brokers" | "tenants" | "chatbot";
export type PartUnit = "pct" | "count" | "perDay" | "perPost" | "ms" | "min" | "score";
export type Word = "strong" | "ok" | "weak" | "thin";

export interface PartDef {
  key: string;
  tile: TileKey;
  op: ">=" | "<=";
  target: number;
  unit: PartUnit;
  /** Fewer observations than this and the part shows "not enough data" and is not counted. */
  minN: number;
  /** The window it is counted over, in days (0 = all time). */
  days: number;
  /** Shown and judged, but left out of the tile's percentage (a volume beside a chain of rates). */
  aside?: boolean;
  /**
   * The tile has no percentage until this part has its sample. The chatbot tile read "100%, every
   * part on target" on speed, errors and the quality test while no real renter had picked a home
   * (2026-11-08): a bot is effective when renters pick, not when it is fast for us.
   */
  gate?: boolean;
}

/** TikTok first: the page is Mkan's front door (Abdout, 2026-11-07: "TikTok is our main entity"). */
export const TILES: TileKey[] = ["tiktok", "doing", "brokers", "tenants", "chatbot"];

/**
 * How a tile's percentage is made. "How we are doing" is a chain — posts × views a post × each
 * hand-off — so it is the product of its parts: the share of the planned deals the road delivers
 * today, and one step at 0% makes it 0% (an average said 67% while no viewing had ever happened,
 * 2026-11-07). The other three are separate signals of one feeling, so they average.
 */
export const TILE_MODE: Record<TileKey, "product" | "mean"> = { tiktok: "mean", doing: "product", brokers: "mean", tenants: "mean", chatbot: "mean" };

export const PARTS: PartDef[] = [
  // TikTok: the page grows, is watched and is engaged with (docs/tiktok-playbook.md).
  { key: "postsPerDay", tile: "tiktok", op: ">=", target: 3, unit: "perDay", minN: 3, days: 7 },
  { key: "followersWeek", tile: "tiktok", op: ">=", target: 20, unit: "count", minN: 2, days: 7 },
  { key: "viewsWeek", tile: "tiktok", op: ">=", target: 4200, unit: "count", minN: 2, days: 7 },
  { key: "likeRate", tile: "tiktok", op: ">=", target: 0.03, unit: "pct", minN: 200, days: 0 },
  { key: "engageRate", tile: "tiktok", op: ">=", target: 0.05, unit: "pct", minN: 200, days: 0 },
  { key: "followRate", tile: "tiktok", op: ">=", target: 0.01, unit: "pct", minN: 200, days: 7 },
  // How we are doing: the road from a post to Mkan's share.
  { key: "viewsPerPost", tile: "doing", op: ">=", target: 200, unit: "perPost", minN: 3, days: 0 },
  { key: "viewsToChats", tile: "doing", op: ">=", target: 0.01, unit: "pct", minN: 200, days: 30 },
  { key: "chatsToAsked", tile: "doing", op: ">=", target: 0.3, unit: "pct", minN: 5, days: 30 },
  { key: "askedToYes", tile: "doing", op: ">=", target: 0.3, unit: "pct", minN: 5, days: 30 },
  { key: "yesToViewing", tile: "doing", op: ">=", target: 0.7, unit: "pct", minN: 3, days: 30 },
  { key: "viewingToViewed", tile: "doing", op: ">=", target: 0.8, unit: "pct", minN: 3, days: 30 },
  { key: "viewedToPaid", tile: "doing", op: ">=", target: 0.2, unit: "pct", minN: 3, days: 30 },
  // Brokers: do they answer, fast, agree Mkan's terms, stay, like the tenants we send.
  { key: "brokerAnswerRate", tile: "brokers", op: ">=", target: 0.3, unit: "pct", minN: 5, days: 30 },
  { key: "brokerReplyMin", tile: "brokers", op: "<=", target: 60, unit: "min", minN: 3, days: 30 },
  { key: "brokerShareAgreed", tile: "brokers", op: ">=", target: 0.5, unit: "pct", minN: 5, days: 0 },
  { key: "brokerStayed", tile: "brokers", op: ">=", target: 0.98, unit: "pct", minN: 5, days: 0 },
  { key: "brokerRating", tile: "brokers", op: ">=", target: 4, unit: "score", minN: 3, days: 90 },
  // Tenants: what they say, whether they come back, whether they hear back in time.
  { key: "tenantRating", tile: "tenants", op: ">=", target: 4.3, unit: "score", minN: 3, days: 90 },
  { key: "thumbsUp", tile: "tenants", op: ">=", target: 0.8, unit: "pct", minN: 5, days: 30 },
  { key: "returning", tile: "tenants", op: ">=", target: 0.2, unit: "pct", minN: 5, days: 30 },
  { key: "noStop", tile: "tenants", op: ">=", target: 0.95, unit: "pct", minN: 5, days: 0 },
  { key: "answeredIn3h", tile: "tenants", op: ">=", target: 0.5, unit: "pct", minN: 5, days: 30 },
  // The chatbot: real renters pick a home and hear the broker's answer fast — then speed, no errors,
  // no person needed. "Chats that get homes" is shown but not counted: the bot shows homes to almost
  // anyone, so it read 100% on our own tests while nothing converted (2026-11-08).
  { key: "peopleToHomes", tile: "chatbot", op: ">=", target: 0.8, unit: "pct", minN: 5, days: 7, aside: true },
  { key: "pickRate", tile: "chatbot", op: ">=", target: 0.4, unit: "pct", minN: 5, days: 30, gate: true },
  { key: "toldIn1h", tile: "chatbot", op: ">=", target: 0.9, unit: "pct", minN: 3, days: 30 },
  { key: "replyP50", tile: "chatbot", op: "<=", target: 3000, unit: "ms", minN: 5, days: 7 },
  { key: "noFailures", tile: "chatbot", op: ">=", target: 0.95, unit: "pct", minN: 5, days: 7 },
  { key: "handledAlone", tile: "chatbot", op: ">=", target: 0.95, unit: "pct", minN: 10, days: 7 },
  { key: "evalReader", tile: "chatbot", op: ">=", target: 0.9, unit: "pct", minN: 1, days: 0 },
  // Straight to the point: how many messages a tenant writes before Mkan asks a broker for them.
  { key: "messagesToAsk", tile: "chatbot", op: "<=", target: 5, unit: "count", minN: 5, days: 30 },
];

/** One observation: the value and how many things it was counted over. */
export interface Sample {
  value: number | null;
  n: number;
}

export interface PartView extends PartDef {
  value: number | null;
  n: number;
  /** 0–1 toward the target; null when not counted. */
  progress: number | null;
  status: "met" | "missed" | "thin";
}

export interface TileView {
  key: TileKey;
  /** 0–100, or null when no part has enough sample. */
  score: number | null;
  word: Word;
  parts: PartView[];
  weakest: string | null;
}

/** The funnel line, posts → paid, over the window its parts use. */
export const FUNNEL_STEPS = ["posts", "views", "chats", "asked", "yes", "viewing", "viewed", "paid"] as const;
export type FunnelStepKey = (typeof FUNNEL_STEPS)[number];
/** The part that measures each arrow, keyed by the step the arrow points at. */
export const ARROW_PART: Record<Exclude<FunnelStepKey, "posts">, string> = {
  views: "viewsPerPost",
  chats: "viewsToChats",
  asked: "chatsToAsked",
  yes: "askedToYes",
  viewing: "yesToViewing",
  viewed: "viewingToViewed",
  paid: "viewedToPaid",
};

export interface ScorecardView {
  tiles: TileView[];
  /** The part furthest from its target among the counted ones (the cash road wins a tie). */
  weakest: { tile: TileKey; part: string } | null;
  funnel: {
    steps: { key: FunnelStepKey; count: number | null }[];
    weakest: FunnelStepKey | null;
    /** The TikTok page's followers now, shown on the Posts step (Abdout: "how many followers we have"). */
    followers: number | null;
  };
}

export function progressOf(op: ">=" | "<=", value: number, target: number): number {
  if (op === ">=") return target > 0 ? Math.max(0, Math.min(1, value / target)) : 1;
  return value <= target ? 1 : value > 0 ? Math.max(0, Math.min(1, target / value)) : 0;
}

export function wordOf(score: number | null): Word {
  if (score == null) return "thin";
  return score >= 80 ? "strong" : score >= 50 ? "ok" : "weak";
}

export function judgePart(def: PartDef, s: Sample | undefined): PartView {
  const value = s?.value ?? null;
  const n = s?.n ?? 0;
  if (value == null || !Number.isFinite(value) || n < def.minN) return { ...def, value, n, progress: null, status: "thin" };
  const progress = progressOf(def.op, value, def.target);
  return { ...def, value, n, progress, status: progress >= 1 ? "met" : "missed" };
}

/** The lowest progress among counted parts (an `aside` is shown, never counted); PARTS order breaks ties, so the cash road comes first. */
function lowest(parts: PartView[]): PartView | null {
  let worst: PartView | null = null;
  for (const p of parts) if (!p.aside && p.progress != null && p.progress < 1 && (worst == null || p.progress < worst.progress!)) worst = p;
  return worst;
}

export function scorecard(samples: Record<string, Sample>, counts: Partial<Record<FunnelStepKey, number | null>> = {}, followers: number | null = null): ScorecardView {
  const judged = PARTS.map((d) => judgePart(d, samples[d.key]));
  const tiles: TileView[] = TILES.map((key) => {
    const parts = judged.filter((p) => p.tile === key);
    const counted = parts.filter((p) => p.progress != null && !p.aside);
    const gated = parts.some((p) => p.gate && p.progress == null);
    const score = !counted.length || gated
      ? null
      : TILE_MODE[key] === "product"
        ? Math.round(counted.reduce((s, p) => s * p.progress!, 1) * 100)
        : Math.round((counted.reduce((s, p) => s + p.progress!, 0) / counted.length) * 100);
    return { key, score, word: wordOf(score), parts, weakest: lowest(parts)?.key ?? null };
  });
  const w = lowest(judged);
  const arrows = (Object.entries(ARROW_PART) as [Exclude<FunnelStepKey, "posts">, string][]).map(([step, part]) => ({ step, part: judged.find((p) => p.key === part)! }));
  const weakArrow = lowest(arrows.map((a) => a.part));
  return {
    tiles,
    weakest: w ? { tile: w.tile, part: w.key } : null,
    funnel: {
      steps: FUNNEL_STEPS.map((key) => ({ key, count: counts[key] ?? null })),
      weakest: weakArrow ? arrows.find((a) => a.part.key === weakArrow.key)!.step : null,
      followers,
    },
  };
}

/** For the loop: the tile scores and the weakest part as flat metric keys (metrics.ts). */
export function scoreMetrics(view: ScorecardView): Record<string, number | string | null> {
  const out: Record<string, number | string | null> = {};
  for (const t of view.tiles) out[`score.${t.key}`] = t.score;
  out["score.weakest"] = view.weakest?.part ?? null;
  for (const t of view.tiles) for (const p of t.parts) out[`part.${p.key}`] = p.progress != null ? p.value : null;
  return out;
}
