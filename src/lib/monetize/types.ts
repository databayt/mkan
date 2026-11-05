/**
 * /monetize — the chatbot business as four building blocks.
 *
 *   scrape  → posts about Kigali homes land in the CRM
 *   enhance → photos/videos mastered, foreign text stripped, our brand on
 *   post    → ads go out on TikTok @mkan.rw
 *   chat    → viewers message us; the agent talks to brokers and closes the deal
 *
 * Pure types: shared by the Mac pusher (scripts/monetize/snapshot.ts), the
 * server loader (load.ts) and the page.
 */
export const BLOCKS = ["scrape", "enhance", "post", "chat"] as const;
export type BlockKey = (typeof BLOCKS)[number];

/** green = running and holding · yellow = lever down >20% wow · red = failed or stale · unknown = no evidence yet */
export type Health = "green" | "yellow" | "red" | "unknown";

/** What the run ledger said about one job. */
export type JobStatus = "ok" | "warn" | "fail" | "stale" | "missing";

export interface JobState {
  job: string;
  status: JobStatus;
  /** ISO time of the last run's end (or start, when it never ended). */
  at: string | null;
  summary?: string | null;
}

export type Unit = "count" | "pct" | "ms" | "hours" | "usd" | "rwf" | "perDay";

export interface Kpi {
  key: string;
  value: number | null;
  unit: Unit;
  /** The one number this block is judged by; it drives the yellow light. */
  lever?: boolean;
  /** Same KPI one window earlier, for the week-on-week delta. */
  prev?: number | null;
}

export interface BlockView {
  key: BlockKey;
  health: Health;
  /** Why the light is what it is — one machine-readable reason key. */
  reason: string;
  kpis: Kpi[];
  jobs: JobState[];
  /** When the Mac last pushed this block (null for DB-only blocks). */
  snapshotAt: string | null;
  /** Lever value per day, oldest first — the sparkline. */
  trend: number[];
  /** A per-day series with its days (YYYY-MM-DD), oldest first — the sticky card's trend chart. */
  daily?: { day: string; value: number }[];
}

/** Metrics the Mac pushes per block (BlockSnapshot.metrics). All optional: a missing file is a gap, not a crash. */
export interface ScrapeMetrics {
  found?: number;
  fetched?: number;
  read?: number;
  newHomes?: number;
  newBrokers?: number;
  newLeads?: number;
  videosTotal?: number;
  savedTotal?: number;
  skippedTotal?: number;
  failedTotal?: number;
  webAds?: number;
  spendUsdMonth?: number;
  mirror?: JobStatus;
}
export interface EnhanceMetrics {
  /** Broker videos the strip pipeline may post per day (PER_DAY in hermes/tiktok-post.sh); 0 = held. */
  brokerVideosPerDay?: number;
  /** Rendered stripped clips waiting in today's queue. */
  pendingRenders?: number;
  /** Kigali listings saved in the last 7 days. */
  newHomes7?: number;
  /** Of those, the ones the page's post gate passed within a day of saving — the funnel's "ready to post". */
  readyNew7?: number;
  /** Why the rest are held, by reason. */
  readyWhy?: Record<string, number>;
}
export interface PostMetrics {
  videos?: number;
  photos?: number;
  views?: number;
  likes?: number;
  homeVideos?: number;
  /** Days in the last 7 with at least one confirmed upload. */
  postedDays7?: number;
  lastUploadAt?: string | null;
  /** Views on the page-stats row ~7 days earlier, for views gained this week. */
  viewsWeekAgo?: number | null;
  /** The page's followers and total likes (its profile, read in the session Chrome), and comments + shares on its videos. */
  followers?: number | null;
  followersWeekAgo?: number | null;
  hearts?: number | null;
  comments?: number | null;
  shares?: number | null;
  /** When the page stats were last read. */
  statsAt?: string | null;
  /** Post count ~7 days earlier. */
  postsWeekAgo?: number | null;
}
export interface ChatMetrics {
  evalReaderPct?: number | null;
  evalWriterPct?: number | null;
}
export interface SnapshotMetrics {
  jobs: JobState[];
  scrape?: ScrapeMetrics;
  enhance?: EnhanceMetrics;
  post?: PostMetrics;
  chat?: ChatMetrics;
}
