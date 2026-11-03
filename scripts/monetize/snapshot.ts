/**
 * Push what only the Mac can see into Neon, for /monetize.
 *
 *   pnpm monetize:snapshot [--dry]
 *
 * The page runs on a Cloudflare Worker: it can count the database, but the run
 * ledger (~/.claude/state/runs/*.json) and the scrape/post ledgers
 * (scripts/crm/.data/) live on this Mac. Hourly (launchd
 * com.databayt.mkan-monetize-snapshot via ~/.claude/bin/job-run.sh), this reads
 * them and writes one BlockSnapshot row per block. Read-only on every source;
 * a missing file is a gap in the row, never a failed push.
 */
import { config } from 'dotenv';
config({ override: true });

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { jobStatus } from '../../src/lib/monetize/health';
import type { BlockKey, JobState, SnapshotMetrics } from '../../src/lib/monetize/types';

const RUNS = join(homedir(), '.claude/state/runs');
const DATA = join(__dirname, '../crm/.data');
const HERMES = join(__dirname, '../crm/hermes');

/** Which jobs feed which block, and how often each is meant to run (hours). */
export const JOBS: Record<BlockKey, { job: string; cadence: number }[]> = {
  scrape: [
    { job: 'hermes_mkan-tiktok-sweep', cadence: 12 },
    { job: 'hermes_mkan-web-sweep', cadence: 12 },
    { job: 'mkan-home-sweep', cadence: 1 },
    { job: 'hermes_mkan-demand-match', cadence: 24 },
    { job: 'mkan-crm-sync-up', cadence: 1 },
  ],
  enhance: [
    { job: 'mkan-master-sweep', cadence: 1 },
    { job: 'mkan-mastering-reconcile', cadence: 24 },
  ],
  post: [
    { job: 'hermes_mkan-tiktok-post', cadence: 24 },
    { job: 'hermes_mkan-tiktok-stats', cadence: 168 },
  ],
  // The chat lanes are Worker crons (wa-outbox, broker-requests): the page reads their effects from Neon.
  chat: [],
};

const readJson = <T>(path: string): T | null => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
};

type RunFile = { status?: string; ts?: string; ended?: string | null; summary?: string; steps?: Record<string, { summary?: string; ts?: string }> };

export function jobsFor(block: BlockKey, now = Date.now()): JobState[] {
  return JOBS[block].map(({ job, cadence }) => {
    const f = readJson<RunFile>(join(RUNS, `${job}.json`));
    if (!f) return { job, status: 'missing', at: null };
    const at = f.ts ?? f.ended ?? null;
    const step = f.steps ? Object.values(f.steps).find((s) => s.summary)?.summary : undefined;
    return { job, status: jobStatus({ status: f.status, at }, cadence, now), at, summary: f.summary || step || null };
  });
}

/** "found 131 · fetched 19 · read 20 · 15 new home(s), 0 new broker(s), 0 new lead(s)" */
export function parseSweep(summary: string | null | undefined) {
  const n = (re: RegExp) => {
    const m = summary?.match(re);
    return m ? Number(m[1]) : undefined;
  };
  return {
    found: n(/found (\d+)/),
    fetched: n(/fetched (\d+)/),
    read: n(/read (\d+)/),
    newHomes: n(/(\d+) new home/),
    newBrokers: n(/(\d+) new broker/),
    newLeads: n(/(\d+) new lead/),
  };
}

const rows = (v: unknown): { state?: string }[] =>
  Array.isArray(v) ? v : v && typeof v === 'object' ? (Object.values((v as { videos?: unknown }).videos ?? v) as { state?: string }[]) : [];

function scrape(jobs: JobState[]): SnapshotMetrics['scrape'] {
  const videos = rows(readJson(join(DATA, 'tiktok/videos.json')));
  const count = (s: string) => videos.filter((v) => v.state === s).length;
  const webDir = join(DATA, 'web-ads');
  const web = existsSync(webDir)
    ? readdirSync(webDir)
        .filter((f) => f.endsWith('.json'))
        .flatMap((f) => rows(readJson(join(webDir, f))))
    : [];
  const spend = readJson<{ month?: string; usd?: number }>(join(DATA, 'tiktok/spend.json'));
  const sweep = jobs.find((j) => j.job === 'hermes_mkan-tiktok-sweep');
  const demand = jobs.find((j) => j.job === 'hermes_mkan-demand-match');
  return {
    ...parseSweep(sweep?.summary),
    videosTotal: videos.length,
    // Cumulative homes in the CRM from both lanes; the page turns its day-to-day difference into "new homes per day".
    savedTotal: count('upserted') + web.filter((w) => w.state === 'upserted').length,
    skippedTotal: count('skipped'),
    failedTotal: count('failed'),
    webAds: web.length,
    spendUsdMonth: spend?.month === new Date().toISOString().slice(0, 7) ? (spend.usd ?? 0) : 0,
    mirror: demand?.status,
  };
}

function enhance(): SnapshotMetrics['enhance'] {
  const sh = existsSync(join(HERMES, 'tiktok-post.sh')) ? readFileSync(join(HERMES, 'tiktok-post.sh'), 'utf8') : '';
  const m = sh.match(/PER_DAY="\$\{TIKTOK_POSTS_PER_DAY:-(\d+)\}"/);
  const perDay = process.env.TIKTOK_POSTS_PER_DAY ?? m?.[1];
  return { brokerVideosPerDay: perDay != null ? Number(perDay) : undefined };
}

type PageStat = { at: string; videos?: number; photos?: number; views?: number; likes?: number; homeVideos?: number };

export function post(now = Date.now()): SnapshotMetrics['post'] {
  const dir = join(DATA, 'tiktok-post');
  const stats: PageStat[] = existsSync(join(dir, 'page-stats.jsonl'))
    ? readFileSync(join(dir, 'page-stats.jsonl'), 'utf8')
        .split('\n')
        .filter(Boolean)
        .flatMap((l) => {
          try {
            return [JSON.parse(l) as PageStat];
          } catch {
            return [];
          }
        })
    : [];
  const latest = stats.at(-1);
  const weekAgo = [...stats].reverse().find((s) => Date.parse(s.at) <= now - 7 * 86_400_000);
  let postedDays7 = 0;
  let lastUploadAt: string | null = null;
  for (let i = 0; i < 7; i++) {
    const day = new Date(now - i * 86_400_000).toISOString().slice(0, 10);
    const up = readJson<Record<string, string>>(join(dir, day, 'uploads.json'));
    const times = up ? Object.values(up).filter((t) => typeof t === 'string') : [];
    if (times.length) {
      postedDays7++;
      const newest = times.sort().at(-1)!;
      if (!lastUploadAt || newest > lastUploadAt) lastUploadAt = newest;
    }
  }
  return {
    videos: latest?.videos,
    photos: latest?.photos ?? 0,
    views: latest?.views,
    likes: latest?.likes,
    homeVideos: latest?.homeVideos,
    postedDays7,
    lastUploadAt,
    viewsWeekAgo: weekAgo?.views ?? null,
    postsWeekAgo: weekAgo ? (weekAgo.videos ?? 0) + (weekAgo.photos ?? 0) : null,
  };
}

const worstStatus = (jobs: JobState[]) =>
  jobs.some((j) => j.status === 'fail') ? 'fail' : jobs.some((j) => j.status === 'stale') ? 'stale' : jobs.some((j) => j.status === 'warn') ? 'warn' : 'ok';

export function build(now = Date.now()): { block: BlockKey; status: string; metrics: SnapshotMetrics; summary: string | null }[] {
  const sj = jobsFor('scrape', now);
  const ej = jobsFor('enhance', now);
  const pj = jobsFor('post', now);
  const s = scrape(sj);
  const e = enhance();
  const p = post(now);
  return [
    { block: 'scrape', status: worstStatus(sj), metrics: { jobs: sj, scrape: s }, summary: sj.find((j) => j.job === 'hermes_mkan-tiktok-sweep')?.summary ?? null },
    { block: 'enhance', status: worstStatus(ej), metrics: { jobs: ej, enhance: e }, summary: null },
    { block: 'post', status: worstStatus(pj), metrics: { jobs: pj, post: p }, summary: `${p?.views ?? '?'} views · ${p?.postedDays7 ?? 0}/7 days posted` },
    { block: 'chat', status: 'ok', metrics: { jobs: [] }, summary: null },
  ];
}

if (process.argv[1] && /snapshot\.ts$/.test(process.argv[1])) {
  (async () => {
    const snaps = build();
    for (const s of snaps) console.log(`${s.block.padEnd(8)} ${s.status.padEnd(6)} ${s.summary ?? ''}`);
    if (process.argv.includes('--dry')) return console.log(JSON.stringify(snaps, null, 2));
    const { db } = await import('../../src/lib/db');
    await db.blockSnapshot.createMany({ data: snaps.map((s) => ({ block: s.block, status: s.status, metrics: s.metrics as never, summary: s.summary })) });
    // Keep 90 days: hourly × 4 blocks stays small.
    await db.blockSnapshot.deleteMany({ where: { at: { lt: new Date(Date.now() - 90 * 86_400_000) } } });
    console.log(`✓ ${snaps.length} snapshots pushed`);
    await db.$disconnect();
  })().catch((e) => {
    console.error(`❌ ${(e as Error).message}`);
    process.exit(1);
  });
}
