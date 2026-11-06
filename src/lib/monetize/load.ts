import "server-only";

import { db } from "@/lib/db";
import { brokerSendMode } from "@/components/agent/broker-sends";

import { agentFunnel, emptyFunnel, type Funnel } from "./agent-funnel";
import { successFor } from "./success";
import { loadFirstShare } from "./first-share";
import type { FirstShareView } from "./first-share-shape";
import { bottleneck, type Bottleneck, type Stage } from "./bottleneck";
import { costByBlock, costLines, type CostLine } from "./cost-lines";
import { nextSteps, type NextStep } from "./next-steps";
import { loadLessons, loadSprints } from "./sprint";
import type { LessonView, SprintsView } from "./sprint-shape";
import { fixedCostsRwf, fixedEstimated, USD_TO_RWF } from "./costs";
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
  /** Every cost line, with the block it serves — "where the money goes". */
  costLines: CostLine[];
  costByBlock: Record<BlockKey, { soFarRwf: number; monthlyRwf: number }>;
  /** Share of the month elapsed (0–1) and the exchange rate the page converts USD at. */
  monthElapsed: number;
  usdToRwf: number;
  /** What to do next to make money, derived from the numbers above. */
  nextSteps: NextStep[];
  /** The week and month sprint, and the prompts that carry them out. */
  sprints: SprintsView;
  /** What the sprint loop measured after each finished prompt, newest first. */
  lessons: LessonView[];
  blocks: BlockView[];
  stages: Stage[];
  bottleneck: Bottleneck;
  experiments: ExperimentView[];
  gates: { brokerSends: string; capped: boolean };
  /** Chats that began with a TikTok home code (K1234) — the ad → chat join. */
  adChats: number;
  funnel: Funnel;
  /** Featured → clean → posted → contacts → chatbot → got the home, per post and in total. Null = unreadable. */
  firstShare: FirstShareView | null;
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

/** The day-by-day gain of a cumulative field (views, homes saved), each with its day. */
function dailyGain(rows: SnapRow[], pick: (m: SnapshotMetrics) => number | undefined | null): { day: string; value: number }[] {
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const v = pick(metricsOf(r));
    if (typeof v === "number") byDay.set(r.at.toISOString().slice(0, 10), v);
  }
  const days = [...byDay.keys()].sort();
  return days.slice(1).map((d, i) => ({ day: d, value: Math.max(0, byDay.get(d)! - byDay.get(days[i]!)!) }));
}


export async function loadMonetize(days = 7): Promise<MonetizeOverview> {
  const now = Date.now();
  const since = new Date(now - days * DAY);
  const prevSince = new Date(now - 2 * days * DAY);
  // The business month is Kigali's (UTC+2): money received at 23:30 on the 31st belongs to that month.
  const KIGALI_MS = 2 * 3_600_000;
  const kigaliNow = new Date(Date.now() + KIGALI_MS);
  const monthStart = new Date(Date.UTC(kigaliNow.getUTCFullYear(), kigaliNow.getUTCMonth(), 1) - KIGALI_MS);
  const month = kigaliNow.toISOString().slice(0, 7);
  const daysInMonth = new Date(Date.UTC(kigaliNow.getUTCFullYear(), kigaliNow.getUTCMonth() + 1, 0)).getUTCDate();

  // Deals are read from the earlier of the comparison window and the month: one created weeks ago
  // and paid this month still counts as this month's money.
  const dealsFrom = new Date(Math.min(prevSince.getTime(), monthStart.getTime()));
  const [funnel, prevFunnel, snaps, revenue, dealRows, mastering, masteringPrev, backlog, spend, experiments, gate, chatSplit, latency, sprints, firstShare, lessons, inbox, handoffs, directory] =
    await Promise.all([
      // Every read below falls back on its own: one failed query must not take the page down (2026-11-06).
      agentFunnel(db, days).catch(() => emptyFunnel(days)),
      agentFunnel(db, days, days).catch(() => emptyFunnel(days)),
      // Two windows plus a day, so a 30-day view has a previous window to compare against.
      latestSnapshots(new Date(now - Math.max(14, 2 * days + 1) * DAY)),
      db.revenueEntry
        .groupBy({ by: ["line"], where: { receivedAt: { gte: monthStart } }, _sum: { amountRwf: true } })
        .catch(() => [] as { line: string; _sum: { amountRwf: number | null } }[]),
      db.deal.findMany({
        where: { OR: [{ createdAt: { gte: prevSince } }, { paidAt: { gte: dealsFrom } }] },
        select: { status: true, mkanShare: true, viewingFeePaid: true, createdAt: true, paidAt: true },
      }).catch(() => []),
      db.masteringRun.groupBy({ by: ["status"], where: { queuedAt: { gte: since } }, _count: { _all: true } }).catch(() => []),
      db.masteringRun.count({ where: { appliedAt: { gte: prevSince, lt: since } } }).catch(() => 0),
      db.masteringRun.count({ where: { status: { in: ["QUEUED", "ASSIGNED"] } } }).catch(() => 0),
      db.apiSpend.findMany({ where: { day: { startsWith: month } }, select: { lane: true, usd: true, calls: true, inputTokens: true, outputTokens: true } }).catch(() => []),
      db.experiment.findMany({ orderBy: { startedAt: "desc" }, take: 12 }).catch(() => []),
      brokerSendMode().catch(() => "off" as const),
      // Web vs WhatsApp, and chats opened by a TikTok home code: `refSource` since 2026-11-05;
      // older chats only carry the first message's `pin`, which the /k page's button set too.
      db.$queryRaw<{ wa: number; web: number; ad: number }[]>`
        SELECT
          COUNT(*) FILTER (WHERE p."waPhone" IS NOT NULL)::int AS wa,
          COUNT(*) FILTER (WHERE p."waPhone" IS NULL)::int AS web,
          COUNT(*) FILTER (WHERE t."refSource" = 'tiktok' OR (t."refSource" IS NULL AND t.messages->0->>'pin' IS NOT NULL))::int AS ad
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
      loadSprints().catch(() => ({ week: null, month: null, prompts: [], startIndex: 0 }) as SprintsView),
      loadFirstShare(days).catch(() => null),
      loadLessons(8).catch(() => [] as LessonView[]),
      // Messages clients sent in the window, and the people behind them — Abdout's own contacts
      // (WaState personal:<number>) left out — and of those people, who got homes, a viewing, the home.
      db.$queryRaw<{ chats: number; messages: number; people: number; shortlisted: number; viewing: number; signed: number }[]>`
        WITH said AS (
          SELECT t.id, t."profileId", COUNT(*)::int AS n
          FROM "AgentTask" t
          LEFT JOIN "AgentProfile" p ON p.id = t."profileId"
          CROSS JOIN LATERAL jsonb_array_elements(t.messages) m
          WHERE t."updatedAt" >= ${since} AND m->>'role' = 'user' AND m->>'at' >= ${since.toISOString()}
            AND NOT EXISTS (SELECT 1 FROM "WaState" w WHERE p."waPhone" IS NOT NULL AND w.key = 'personal:' || replace(p."waPhone", '+', ''))
            -- The team's test numbers are not clients (broker-sends.ts testPhones).
            AND NOT EXISTS (SELECT 1 FROM "WaState" w WHERE p."waPhone" IS NOT NULL AND w.key = 'test-phones' AND w.value @> to_jsonb(replace(p."waPhone", '+', '')))
          GROUP BY t.id, t."profileId"
        )
        SELECT COUNT(*)::int AS chats,
               COALESCE(SUM(n), 0)::int AS messages,
               COUNT(DISTINCT COALESCE("profileId", id))::int AS people,
               -- Got homes = a real shortlist in the window: homes on it, and not a saved search's later match
               -- (shortlist_ready is also written for an empty or demand-only list — "100%" every week).
               COUNT(DISTINCT COALESCE("profileId", id)) FILTER (WHERE EXISTS (
                 SELECT 1 FROM "AgentEvent" e WHERE e."taskId" = said.id AND e.kind = 'shortlist_ready' AND e."createdAt" >= ${since}
                   AND COALESCE((e.payload->>'count')::int, 0) > 0 AND COALESCE((e.payload->>'demand')::boolean, false) = false
               ))::int AS shortlisted,
               COUNT(DISTINCT COALESCE("profileId", id)) FILTER (WHERE EXISTS (SELECT 1 FROM "Deal" d WHERE d."taskId" = said.id))::int AS viewing,
               COUNT(DISTINCT COALESCE("profileId", id)) FILTER (WHERE EXISTS (SELECT 1 FROM "Deal" d WHERE d."taskId" = said.id AND d.status IN ('SIGNED', 'PAID')))::int AS signed
        FROM said`.catch(() => null),
      // Messages the agent left to a person (whatsapp-chat.ts noteHandoff).
      db.waState.count({ where: { key: { startsWith: "handoff:" }, updatedAt: { gte: since } } }).catch(() => null),
      // The broker + agency directory the agent asks (goal: 1,000), and how many joined this window.
      Promise.all([db.broker.count(), db.broker.count({ where: { createdAt: { gte: since } } })]).catch(() => null),
    ]);

  // ── snapshots, per block ──────────────────────────────────────────────
  const byBlock = (b: BlockKey) => snaps.filter((s) => s.block === b);
  const last = (b: BlockKey) => byBlock(b).at(-1);
  const jobsOf = (b: BlockKey): JobState[] => {
    const row = last(b);
    if (!row) return [];
    // A snapshot older than 3 h means the pusher itself stopped — say so, on the blocks whose numbers
    // come from the Mac. Chat reads Neon live: a sleeping Mac does not make it red (2026-11-06).
    const stale = b !== "chat" && now - row.at.getTime() > 3 * 3_600_000;
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
    { key: "brokersTotal", value: directory?.[0] ?? null, unit: "count" },
    { key: "brokersNewWeek", value: directory?.[1] ?? null, unit: "count" },
    { key: "spendMonth", value: sm.spendUsdMonth ?? null, unit: "usd" },
  ];

  // ── block 2: enhance ──────────────────────────────────────────────────
  const mCount = (s: string) => mastering.find((r) => r.status === s)?._count._all ?? 0;
  const masteredNow = mCount("UPDATED") + mCount("MASTERED");
  const queuedNow = mastering.reduce((s, r) => s + r._count._all, 0);
  const em = metricsOf(last("enhance")).enhance ?? {};
  // Enhance = the broker video stripped of every text and logo, nothing of ours burned on (2026-11-05).
  // The Port Sudan photo mastering stays listed, but no longer drives the block.
  const fs = firstShare;
  const enhanceKpis: Kpi[] = [
    { key: "videosClean", value: fs?.clean ?? null, unit: "count", lever: true },
    { key: "videosFeatured", value: fs?.featured ?? null, unit: "count" },
    { key: "videoRejectRate", value: fs && fs.featured ? fs.rejected / fs.featured : null, unit: "pct" },
    { key: "brokerVideosPerDay", value: em.brokerVideosPerDay ?? null, unit: "perDay" },
    { key: "readyNew", value: em.readyNew7 ?? null, unit: "count" },
    { key: "mastered", value: masteredNow, unit: "count", prev: masteringPrev },
    { key: "backlog", value: backlog, unit: "count" },
  ];
  void queuedNow;

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
    // Both sides over one week: code chats in the last 7 days per view gained in them.
    { key: "adChatRate", value: viewsWeek ? (days === 7 ? (chatSplit[0]?.ad ?? 0) : ((chatSplit[0]?.ad ?? 0) * 7) / days) / viewsWeek : null, unit: "pct" },
    { key: "followers", value: pm.followers ?? null, unit: "count" },
    { key: "followersWeek", value: pm.followers != null && pm.followersWeekAgo != null ? pm.followers - pm.followersWeekAgo : null, unit: "count" },
    { key: "engageRate", value: pm.views ? ((pm.likes ?? 0) + (pm.comments ?? 0) + (pm.shares ?? 0)) / pm.views : null, unit: "pct" },
    { key: "postsListing", value: fs?.posted ?? null, unit: "count" },
    { key: "contactsPerPost", value: fs && fs.posted ? fs.contacts / fs.posted : null, unit: "count" },
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
    // Chats with a client's words in the window, Abdout's own contacts left out; the agent's funnel as a fallback.
    { key: "chats", value: inbox?.[0]?.chats ?? funnel.tasks, unit: "count", prev: prevFunnel.tasks },
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
    // People, not chats: one person can open several. Their messages, and how many of them moved on.
    { key: "messages", value: inbox?.[0]?.messages ?? null, unit: "count" },
    { key: "handoffs", value: handoffs, unit: "count" },
    { key: "evalReader", value: metricsOf(last("chat")).chat?.evalReaderPct ?? null, unit: "pct" },
    { key: "evalWriter", value: metricsOf(last("chat")).chat?.evalWriterPct ?? null, unit: "pct" },
    { key: "people", value: inbox?.[0]?.people ?? null, unit: "count" },
    { key: "peopleToHomes", value: inbox?.[0] ? conv(inbox[0].shortlisted, inbox[0].people) : null, unit: "pct" },
    { key: "peopleToViewing", value: inbox?.[0] ? conv(inbox[0].viewing, inbox[0].people) : null, unit: "pct" },
    { key: "peopleToSigned", value: inbox?.[0] ? conv(inbox[0].signed, inbox[0].people) : null, unit: "pct" },
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
  const monthElapsed = (now - monthStart.getTime()) / (daysInMonth * DAY);
  const lines = costLines({
    fixed,
    spend: spend.map((r) => ({ lane: r.lane, usd: Number(r.usd), calls: r.calls, tokensIn: r.inputTokens, tokensOut: r.outputTokens })),
    tiktokUsd: sm.spendUsdMonth ?? 0,
    monthElapsed,
  });

  const block = (key: BlockKey, kpis: Kpi[], jobs: JobState[], trend: number[], blockers: string[] = [], daily?: { day: string; value: number }[]): BlockView => {
    const lever = kpis.find((k) => k.lever);
    const goals = successFor({ key, kpis } as BlockView, days);
    const targets = { met: goals.filter((g) => g.status === "met").length, known: goals.filter((g) => g.status !== "unknown").length };
    const { health, reason } = blockHealth({ jobs, lever: lever?.value ?? null, leverPrev: lever?.prev ?? null, blockers, targets });
    return { key, health, reason, kpis, jobs, snapshotAt: last(key)?.at.toISOString() ?? null, trend, ...(daily ? { daily } : {}) };
  };

  const blocks: BlockView[] = [
    block("scrape", scrapeKpis, scrapeJobs, homesTrend, [], dailyGain(scrapeRows, (m) => m.scrape?.savedTotal)),
    block("enhance", enhanceKpis, jobsOf("enhance"), []),
    block("post", postKpis, jobsOf("post"), series(byBlock("post"), (x) => x.post?.views, 14), [], dailyGain(byBlock("post"), (x) => x.post?.views)),
    block("chat", chatKpis, jobsOf("chat"), [], chatBlockers),
  ];

  // The business funnel, end to end, for the bottleneck walk.
  const stages: Stage[] = [
    { key: "read", block: "scrape", count: sm.read ?? 0 },
    { key: "homes", block: "scrape", count: homesNow ?? 0 },
    // New Kigali homes the page's post gate passed within a day (pushed by monetize:snapshot).
    // Mastering is the Port Sudan photo lane: those homes are never in the Kigali "homes saved"
    // count above, so dividing by it read 0% whatever either lane did. Older snapshots fall back.
    // Not the ledger's clean videos: those are one per post (a few a week), so against ~100 homes
    // saved they read "homes → ready" under its floor and aimed the sprint at Enhance whenever the
    // real limit was how often the page posts. Strip quality lives in the first-share section.
    { key: "ready", block: "enhance", count: em.readyNew7 ?? (fs && fs.featured > 0 ? fs.clean : masteredNow) },
    // Listing posts from the ledger; until it has rows, page stats (days posted as a last resort).
    { key: "posted", block: "post", count: fs && fs.posted > 0 ? fs.posted : Math.max(0, postsWeek ?? pm.postedDays7 ?? 0) },
    { key: "views", block: "post", count: Math.max(0, viewsWeek ?? pm.views ?? 0) },
    { key: "chats", block: "chat", count: funnel.tasks },
    { key: "shortlisted", block: "chat", count: funnel.shortlisted },
    { key: "asked", block: "chat", count: funnel.asked },
    { key: "available", block: "chat", count: funnel.available },
    { key: "viewings", block: "chat", count: Math.max(funnel.booked, booked) },
    { key: "paid", block: "chat", count: paid.length },
  ];

  const gates = { brokerSends, capped };
  const bn = bottleneck(stages);
  const fixedIsEstimate = fixedEstimated();
  const steps = nextSteps({ money: m, blocks, bottleneck: bn, gates, fixedEstimated: fixedIsEstimate, shortlisted: funnel.shortlisted, paidDealsMonth: monthPaid.length });

  return {
    days,
    generatedAt: new Date(now).toISOString(),
    health: worst(blocks.map((b) => b.health)),
    money: m,
    fixedBreakdown: fixed,
    fixedEstimated: fixedIsEstimate,
    costLines: lines,
    costByBlock: costByBlock(lines),
    monthElapsed,
    usdToRwf: USD_TO_RWF,
    nextSteps: steps,
    sprints,
    lessons,
    blocks,
    stages,
    bottleneck: bn,
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
    gates,
    adChats: chatSplit[0]?.ad ?? 0,
    funnel,
    firstShare,
  };
}

export { change };
