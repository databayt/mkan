import "server-only";

import { db } from "@/lib/db";
import { brokerSendMode } from "@/components/agent/broker-sends";

import { agentFunnel, type Funnel } from "./agent-funnel";
import { bottleneck, type Bottleneck, type Stage } from "./bottleneck";
import { fixedCostsRwf, fixedEstimated } from "./costs";
import { blockHealth, change, deltas, worst } from "./health";
import { money, REVENUE_LINES, type MoneyView, type RevenueLineKey } from "./money";
import type { BlockKey, BlockView, Health, JobState, Kpi, SnapshotMetrics } from "./types";

/**
 * Everything /monetize shows, read in one pass.
 *
 * Two kinds of evidence: what the Worker can count itself (Neon — the chat
 * funnel, deals, spend, mastering runs) and what only the Mac can see (run
 * state files, scrape/post ledgers), which arrives as BlockSnapshot rows pushed
 * hourly by `pnpm monetize:snapshot`. A block with no snapshot reads
 * "unknown", never a quiet green.
 */

const DAY = 86_400_000;

export interface ExperimentView {
  id: string;
  block: string;
  hypothesis: string;
  metric: string;
  baseline: number | null;
  target: number | null;
  result: number | null;
  verdict: string;
  startedAt: string;
  endedAt: string | null;
}

export interface MonetizeOverview {
  days: number;
  generatedAt: string;
  health: Health;
  money: MoneyView;
  fixedBreakdown: Record<string, number>;
  fixedEstimated: boolean;
  blocks: BlockView[];
  stages: Stage[];
  bottleneck: Bottleneck;
  experiments: ExperimentView[];
  gates: { brokerSends: string; capped: boolean };
  /** Chats that began with a TikTok home code (K1234) — the ad → chat join. */
  adChats: number;
  funnel: Funnel;
}

type SnapRow = { block: string; at: Date; status: string; metrics: unknown };

async function latestSnapshots(since: Date): Promise<SnapRow[]> {
  return db.blockSnapshot
    .findMany({ where: { at: { gte: since } }, orderBy: { at: "asc" }, select: { block: true, at: true, status: true, metrics: true } })
    .catch(() => [] as SnapRow[]);
}

const metricsOf = (row: SnapRow | undefined) => (row?.metrics ?? { jobs: [] }) as SnapshotMetrics;

/** Per-day series of one numeric field from a block's snapshots (last value per day). */
function series(rows: SnapRow[], pick: (m: SnapshotMetrics) => number | undefined | null, days: number): number[] {
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const v = pick(metricsOf(r));
    if (typeof v === "number") byDay.set(r.at.toISOString().slice(0, 10), v);
  }
  const out: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
    if (byDay.has(d)) out.push(byDay.get(d)!);
  }
  return out;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);


export async function loadMonetize(days = 7): Promise<MonetizeOverview> {
  const now = Date.now();
  const since = new Date(now - days * DAY);
  const prevSince = new Date(now - 2 * days * DAY);
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const month = monthStart.toISOString().slice(0, 7);
  const daysInMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();

  const [funnel, prevFunnel, snaps, revenue, dealRows, mastering, masteringPrev, backlog, spend, experiments, gate, chatSplit, latency] =
    await Promise.all([
      agentFunnel(db, days),
      agentFunnel(db, days, days),
      latestSnapshots(new Date(now - 14 * DAY)),
      db.revenueEntry
        .groupBy({ by: ["line"], where: { receivedAt: { gte: monthStart } }, _sum: { amountRwf: true } })
        .catch(() => [] as { line: string; _sum: { amountRwf: number | null } }[]),
      db.deal.findMany({
        where: { createdAt: { gte: prevSince } },
        select: { status: true, mkanShare: true, viewingFeePaid: true, createdAt: true, paidAt: true },
      }),
      db.masteringRun.groupBy({ by: ["status"], where: { queuedAt: { gte: since } }, _count: { _all: true } }),
      db.masteringRun.count({ where: { appliedAt: { gte: prevSince, lt: since } } }),
      db.masteringRun.count({ where: { status: { in: ["QUEUED", "ASSIGNED"] } } }),
      db.apiSpend.findMany({ where: { day: { startsWith: month } }, select: { lane: true, usd: true } }),
      db.experiment.findMany({ orderBy: { startedAt: "desc" }, take: 12 }).catch(() => []),
      brokerSendMode().catch(() => "off" as const),
      // Web vs WhatsApp, and chats opened by a TikTok home code (the first message carries `pin`).
      db.$queryRaw<{ wa: number; web: number; ad: number }[]>`
        SELECT
          COUNT(*) FILTER (WHERE p."waPhone" IS NOT NULL)::int AS wa,
          COUNT(*) FILTER (WHERE p."waPhone" IS NULL)::int AS web,
          COUNT(*) FILTER (WHERE t.messages->0->>'pin' IS NOT NULL)::int AS ad
        FROM "AgentTask" t LEFT JOIN "AgentProfile" p ON p.id = t."profileId"
        WHERE t."createdAt" >= ${since}`,
      // `ms` is the turn's step clock ({ read: 900, search: 1400, … }, ms from its start): the last step is the reply time.
      db.$queryRaw<{ p50: number | null; p95: number | null }[]>`
        WITH turns AS (
          SELECT (SELECT max(v.value::float) FROM jsonb_each_text(e.payload->'ms') v) AS ms
          FROM "AgentEvent" e
          WHERE e.kind = 'shortlist_ready' AND e."createdAt" >= ${since} AND jsonb_typeof(e.payload->'ms') = 'object'
        )
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) AS p50,
               percentile_cont(0.95) WITHIN GROUP (ORDER BY ms) AS p95
        FROM turns WHERE ms IS NOT NULL`.catch(() => [{ p50: null, p95: null }]),
    ]);

  // ── snapshots, per block ──────────────────────────────────────────────
  const byBlock = (b: BlockKey) => snaps.filter((s) => s.block === b);
  const last = (b: BlockKey) => byBlock(b).at(-1);
  const jobsOf = (b: BlockKey): JobState[] => {
    const row = last(b);
    if (!row) return [];
    // A snapshot older than 3 h means the pusher itself stopped — say so.
    const stale = now - row.at.getTime() > 3 * 3_600_000;
    const jobs = metricsOf(row).jobs ?? [];
    return stale ? [...jobs, { job: "monetize-snapshot", status: "stale", at: row.at.toISOString() }] : jobs;
  };

  // ── block 1: scrape ───────────────────────────────────────────────────
  const scrapeRows = byBlock("scrape");
  const sm = metricsOf(last("scrape")).scrape ?? {};
  const homesTrend = deltas(series(scrapeRows, (m) => m.scrape?.savedTotal, 15));
  // Until two days of snapshots exist, the latest sweep's own count stands in.
  const homesNow = homesTrend.length ? sum(homesTrend.slice(-days)) : (sm.newHomes ?? null);
  const homesPrev = homesTrend.length > days ? sum(homesTrend.slice(-2 * days, -days)) : null;
  const scrapeJobs = jobsOf("scrape");
  const scrapeKpis: Kpi[] = [
    { key: "newHomes", value: homesNow, unit: "count", lever: true, prev: homesPrev },
    { key: "found", value: sm.found ?? null, unit: "count" },
    { key: "read", value: sm.read ?? null, unit: "count" },
    { key: "skipRate", value: sm.videosTotal ? (sm.skippedTotal ?? 0) / sm.videosTotal : null, unit: "pct" },
    { key: "savedTotal", value: sm.savedTotal ?? null, unit: "count" },
    { key: "webAds", value: sm.webAds ?? null, unit: "count" },
    { key: "newBrokers", value: sm.newBrokers ?? null, unit: "count" },
    { key: "spendMonth", value: sm.spendUsdMonth ?? null, unit: "usd" },
  ];

  // ── block 2: enhance ──────────────────────────────────────────────────
  const mCount = (s: string) => mastering.find((r) => r.status === s)?._count._all ?? 0;
  const masteredNow = mCount("UPDATED") + mCount("MASTERED");
  const queuedNow = mastering.reduce((s, r) => s + r._count._all, 0);
  const em = metricsOf(last("enhance")).enhance ?? {};
  const enhanceKpis: Kpi[] = [
    { key: "mastered", value: masteredNow, unit: "count", lever: true, prev: masteringPrev },
    { key: "queued", value: queuedNow, unit: "count" },
    { key: "rejectRate", value: queuedNow ? (mCount("REJECTED") + mCount("FAILED")) / queuedNow : null, unit: "pct" },
    { key: "backlog", value: backlog, unit: "count" },
    { key: "brokerVideosPerDay", value: em.brokerVideosPerDay ?? null, unit: "perDay" },
  ];

  // ── block 3: post ─────────────────────────────────────────────────────
  const pm = metricsOf(last("post")).post ?? {};
  const posts = (pm.videos ?? 0) + (pm.photos ?? 0);
  const viewsWeek = pm.views != null && pm.viewsWeekAgo != null ? pm.views - pm.viewsWeekAgo : null;
  const postsWeek = pm.postsWeekAgo != null ? posts - pm.postsWeekAgo : null;
  const postKpis: Kpi[] = [
    { key: "viewsPerPost", value: posts ? (pm.views ?? 0) / posts : null, unit: "count", lever: true },
    { key: "postedDays7", value: pm.postedDays7 ?? null, unit: "count" },
    { key: "viewsWeek", value: viewsWeek, unit: "count" },
    { key: "postsWeek", value: postsWeek, unit: "count" },
    { key: "likeRate", value: pm.views ? (pm.likes ?? 0) / pm.views : null, unit: "pct" },
    { key: "adChatRate", value: viewsWeek ? (chatSplit[0]?.ad ?? 0) / viewsWeek : null, unit: "pct" },
  ];

  // ── block 4: chat → deal ──────────────────────────────────────────────
  const inWindow = (d: Date, from: Date, to = new Date(now)) => d >= from && d < to;
  const paid = dealRows.filter((d) => d.status === "PAID" && d.paidAt && inWindow(d.paidAt, since));
  const paidPrev = dealRows.filter((d) => d.status === "PAID" && d.paidAt && inWindow(d.paidAt, prevSince, since));
  const booked = dealRows.filter((d) => inWindow(d.createdAt, since)).length;
  // Capped at 100%: an event in the window can belong to a chat opened before it.
  const conv = (n: number, of: number) => (of > 0 ? Math.min(1, n / of) : null);
  const capped = funnel.capped;
  const brokerSends = gate;
  const chatKpis: Kpi[] = [
    { key: "chatToPaid", value: conv(paid.length, funnel.tasks), unit: "pct", lever: true, prev: conv(paidPrev.length, prevFunnel.tasks) },
    { key: "chats", value: funnel.tasks, unit: "count", prev: prevFunnel.tasks },
    { key: "waChats", value: chatSplit[0]?.wa ?? 0, unit: "count" },
    { key: "webChats", value: chatSplit[0]?.web ?? 0, unit: "count" },
    { key: "shortlistRate", value: conv(funnel.shortlisted, funnel.tasks), unit: "pct", prev: conv(prevFunnel.shortlisted, prevFunnel.tasks) },
    { key: "claudeShare", value: conv(funnel.readers.claude, funnel.readers.claude + funnel.readers.groq + funnel.readers.rules), unit: "pct" },
    { key: "p50", value: latency[0]?.p50 ?? null, unit: "ms" },
    { key: "p95", value: latency[0]?.p95 ?? null, unit: "ms" },
    { key: "brokerAnswerRate", value: conv(funnel.answered, funnel.asked), unit: "pct" },
    { key: "viewings", value: funnel.booked, unit: "count" },
    { key: "paidDeals", value: paid.length, unit: "count", prev: paidPrev.length },
    { key: "failRate", value: conv(funnel.failed, funnel.tasks), unit: "pct" },
  ];
  const chatBlockers = [
    ...(capped ? ["capped"] : []),
    // Deals need brokers asked; with sends off the funnel ends at the shortlist.
    ...(brokerSends !== "gated" ? ["brokerSendsOff"] : []),
    ...(funnel.tasks >= 10 && funnel.failed / funnel.tasks > 0.2 ? ["failRateHigh"] : []),
  ];

  // ── money ─────────────────────────────────────────────────────────────
  const received = Object.fromEntries(REVENUE_LINES.map((l) => [l, 0])) as Record<RevenueLineKey, number>;
  for (const r of revenue) received[r.line as RevenueLineKey] = r._sum.amountRwf ?? 0;
  const monthPaid = dealRows.filter((d) => d.status === "PAID" && d.paidAt && d.paidAt >= monthStart);
  const dealEarnedRwf = sum(monthPaid.map((d) => (d.mkanShare ?? 0) + (d.viewingFeePaid ?? 0)));
  const fixed = fixedCostsRwf();
  const apiUsd = sum(spend.filter((r) => r.lane !== "capped").map((r) => Number(r.usd)));
  const m = money({
    received,
    dealEarnedRwf,
    apiUsd,
    tiktokUsd: sm.spendUsdMonth ?? 0,
    fixedRwf: sum(Object.values(fixed)),
    chats: funnel.tasks,
    leads: homesNow ?? 0,
    paidDeals: monthPaid.length,
    monthElapsed: (now - monthStart.getTime()) / (daysInMonth * DAY),
  });

  const block = (key: BlockKey, kpis: Kpi[], jobs: JobState[], trend: number[], blockers: string[] = []): BlockView => {
    const lever = kpis.find((k) => k.lever);
    const { health, reason } = blockHealth({ jobs, lever: lever?.value ?? null, leverPrev: lever?.prev ?? null, blockers });
    return { key, health, reason, kpis, jobs, snapshotAt: last(key)?.at.toISOString() ?? null, trend };
  };

  const blocks: BlockView[] = [
    block("scrape", scrapeKpis, scrapeJobs, homesTrend),
    block("enhance", enhanceKpis, jobsOf("enhance"), []),
    block("post", postKpis, jobsOf("post"), series(byBlock("post"), (x) => x.post?.views, 14)),
    block("chat", chatKpis, jobsOf("chat"), [], chatBlockers),
  ];

  // The business funnel, end to end, for the bottleneck walk.
  const stages: Stage[] = [
    { key: "read", block: "scrape", count: sm.read ?? 0 },
    { key: "homes", block: "scrape", count: homesNow ?? 0 },
    { key: "ready", block: "enhance", count: masteredNow },
    // Until a week of page stats exists: days posted, and the page's all-time views.
    { key: "posted", block: "post", count: Math.max(0, postsWeek ?? pm.postedDays7 ?? 0) },
    { key: "views", block: "post", count: Math.max(0, viewsWeek ?? pm.views ?? 0) },
    { key: "chats", block: "chat", count: funnel.tasks },
    { key: "shortlisted", block: "chat", count: funnel.shortlisted },
    { key: "asked", block: "chat", count: funnel.asked },
    { key: "available", block: "chat", count: funnel.available },
    { key: "viewings", block: "chat", count: Math.max(funnel.booked, booked) },
    { key: "paid", block: "chat", count: paid.length },
  ];

  return {
    days,
    generatedAt: new Date(now).toISOString(),
    health: worst(blocks.map((b) => b.health)),
    money: m,
    fixedBreakdown: fixed,
    fixedEstimated: fixedEstimated(),
    blocks,
    stages,
    bottleneck: bottleneck(stages),
    experiments: experiments.map((e) => ({
      id: e.id,
      block: e.block,
      hypothesis: e.hypothesis,
      metric: e.metric,
      baseline: e.baseline,
      target: e.target,
      result: e.result,
      verdict: e.verdict,
      startedAt: e.startedAt.toISOString(),
      endedAt: e.endedAt?.toISOString() ?? null,
    })),
    gates: { brokerSends, capped },
    adChats: chatSplit[0]?.ad ?? 0,
    funnel,
  };
}

export { change };
