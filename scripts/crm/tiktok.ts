/**
 * The TikTok lane — Kigali rentals posted as TikTok videos → the mkan CRM.
 *
 *   pnpm crm:tiktok-discover [--seeds-only|--search-only] [--query="…"|--queries=3] [--max-age=120] [--per-seed=30]
 *   pnpm crm:tiktok-fetch    [--limit=N] [--max-age=120]       metadata + 8 frames + transcript, mp4 deleted
 *   pnpm crm:tiktok-read     [--read-limit=N] [--reader=groq|claude]  newest first; Groq vision (free tier) by default
 *   pnpm crm:tiktok-upsert   [--limit=N] [--apply]              frames → S3, host + home (VETTING) + note → Twenty
 *   pnpm crm:tiktok          [--limit=N] [--fetch-limit=N] [--read-limit=N] [--apply] [--notify]
 *                                                              all four, then the /find lead mirror (with --apply)
 *   pnpm crm:tiktok-status                                      the ledger, by state and skip reason
 *   pnpm crm:tiktok-seeds    [--add=a,b] [--promote=h] [--ignore=h]
 *
 * Discovery never logs in to TikTok: an account's public videos come from
 * yt-dlp, new accounts and videos from a public web search. Accounts found by
 * search are only PROPOSED as seeds — a human promotes them.
 *
 * The local stages (discover, fetch, read) only write the gitignored ledger
 * under scripts/crm/.data/tiktok/. `upsert` is the only stage that writes
 * anywhere shared (S3 + Twenty), and it is a dry run unless `--apply`.
 * Every stage is idempotent: re-run after a network drop and it resumes.
 *
 * Nothing here publishes. A TikTok home lands at VETTING; going live is the
 * same human `live` word as the Slack lane. Documented at kun.databayt.org/docs/scrape.
 */
import { config } from 'dotenv';
config({ override: true });

import { execFileSync, execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { runClaude } from './claude-reader';
import { GROQ_VISION_MODEL, GroqLimit, runGroq } from './groq-reader';
import { postToMkan } from './notify';
import { mirrorLeads } from './tiktok-mirror';
import { phonesFromTwenty, twentyPhones } from '../../src/lib/phone';
import { twentyClient } from './twenty-rest';
import { TIKTOK_PROMPT_VERSION, buildTikTokPrompt } from './tiktok-read-prompt';
import {
  SEARCH_QUERIES,
  dupKey,
  frameTimes,
  homeBody,
  hostBody,
  looksLikeRental,
  parseTikTokRead,
  phonesFor,
  propertyFramePaths,
  skipReasonFor,
  tiktokVideosIn,
  unitReads,
  type SeedRow,
  type TikTokRead,
  type VideoRow,
} from './tiktok-pure';

// ── argv ─────────────────────────────────────────────────────────────────────
const argv = (n: string, d = ''): string => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.split('=').slice(1).join('=') : d;
};
const flag = (n: string): boolean => process.argv.includes(`--${n}`);
const APPLY = flag('apply');
const LIMIT = Number(argv('limit', '0')) || Infinity;
// Fetch and read used to share one limit and both took the OLDEST rows first,
// so a 148-video read backlog never shrank and nothing was read the day it was
// fetched. Each stage now has its own budget, and read takes the newest first.
const FETCH_LIMIT = Number(argv('fetch-limit', '0')) || LIMIT;
const READ_LIMIT = Number(argv('read-limit', '0')) || LIMIT;
const READER = (argv('reader') || process.env.TIKTOK_READER || 'groq').trim() as 'groq' | 'claude';
const MAX_FETCH_ATTEMPTS = 3;
/**
 * Groq's free vision tier: at most 3 images a request, 7,000 input tokens a
 * minute, and it budgets ~2,050 tokens per image whatever its size (measured
 * 2026-10-18: 3 images + the prompt was "Requested 7224"). So the reader gets
 * 6 frames as 2 strips of 3, and reads are spaced to stay under the minute.
 */
const GROQ_IMAGES = 2;
const PER_IMAGE = 3;
const GROQ_FRAMES = GROQ_IMAGES * PER_IMAGE;
const GROQ_GAP_MS = Number(argv('groq-gap', '45000'));
const MAX_AGE_DAYS = Number(argv('max-age', '120'));
const DELAY_MS = Number(argv('delay', '4000'));
const cmd = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'help';

const DATA = join(process.cwd(), 'scripts/crm/.data/tiktok');
const VIDEOS = join(DATA, 'videos.json');
const SEEDS = join(DATA, 'seeds.json');
const FRAMES = join(DATA, 'frames');
const TMP = join(DATA, 'tmp');
const LOCK = join(DATA, 'run.lock');
const READER_MODEL = (process.env.TIKTOK_READER_MODEL ?? '').trim() || 'sonnet';
const ASR_PY = (process.env.TIKTOK_ASR_PYTHON ?? '').trim() || join(homedir(), '.local/share/uv/tools/mlx-whisper/bin/python');
const ASR_SCRIPT = (process.env.TIKTOK_ASR_SCRIPT ?? '').trim() || join(homedir(), '.claude/skills/edit/scripts/media/asr_batch.py');
const ASR_MODEL = 'mlx-community/whisper-large-v3-turbo';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

/** What this run did, for the Slack summary — including what went wrong. */
const runStats = { seedsListed: 0, seedsFailed: 0, discovered: 0, fetched: 0, read: 0, readStopped: '' as string, mirrored: 0 };

// ── the ledger ───────────────────────────────────────────────────────────────
function readJson<T>(file: string, empty: T): T {
  if (!existsSync(file)) return empty;
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}
function writeJson(file: string, value: unknown): void {
  mkdirSync(DATA, { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2));
  renameSync(`${file}.tmp`, file);
}
const loadVideos = () => readJson<Record<string, VideoRow>>(VIDEOS, {});
const saveVideos = (v: Record<string, VideoRow>) => writeJson(VIDEOS, v);
const loadSeeds = () => readJson<Record<string, SeedRow>>(SEEDS, {});
const saveSeeds = (s: Record<string, SeedRow>) => writeJson(SEEDS, s);
const tooOld = (ts: number | null | undefined) => ts != null && Date.now() / 1000 - ts > MAX_AGE_DAYS * 86400;

function ytdlp(args: string[]): string {
  try {
    return execFileSync('yt-dlp', ['--no-warnings', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    // "Command failed" alone says nothing — the reason (network, 403, removed video) is yt-dlp's last stderr line.
    const err = String((e as { stderr?: string }).stderr ?? '').trim().split('\n').pop();
    throw new Error(`yt-dlp: ${err || (e as Error).message.split('\n')[0]}`);
  }
}

/**
 * The Kigali link drops for minutes at a time (and the Mac sleeps). A stage that
 * keeps going through a drop burns its whole queue into errors — the 2026-10-13
 * backlog run did, 337 of 355. So each video first checks DNS for the host it is
 * about to need, waits out a drop for up to 30 minutes, then stops the stage.
 */
async function waitForNetwork(host: string): Promise<void> {
  const { lookup } = await import('node:dns/promises');
  for (let waited = 0; ; waited += 60) {
    try {
      await lookup(host);
      if (waited) console.log(`  … ${host} reachable again after ${waited / 60} min`);
      return;
    } catch {
      if (waited >= 30 * 60) throw new NetworkDown(host);
      if (!waited) console.warn(`  … ${host} does not resolve — waiting for the network (up to 30 min)`);
      await sleep(60_000);
    }
  }
}
class NetworkDown extends Error {
  constructor(host: string) {
    super(`network down: ${host} has not resolved for 30 min — stopping this stage; re-run resumes`);
  }
}

// ── discover ─────────────────────────────────────────────────────────────────
/**
 * An account's recent videos. yt-dlp's `@handle` page extractor broke
 * ("Unable to extract secondary user ID", every seed, every run since ~10-13);
 * `tiktokuser:<secUid>` still lists. The secUid comes from any one video of the
 * account — the ledger always has one, since that is how the seed was found.
 */
function listSeed(handle: string, seed: SeedRow, videos: Record<string, VideoRow>): { entries?: unknown[] } {
  const list = (target: string) => JSON.parse(ytdlp(['--flat-playlist', '-J', '--playlist-end', argv('per-seed', '30'), target]));
  if (seed.channelId) return list(`tiktokuser:${seed.channelId}`);
  try {
    return list(`https://www.tiktok.com/@${handle}`);
  } catch (e) {
    const known = Object.values(videos).find((v) => v.handle === handle && v.meta?.channelId)?.meta?.channelId;
    const sample = Object.values(videos).find((v) => v.handle === handle);
    const channelId = known ?? (sample ? (JSON.parse(ytdlp(['-J', sample.url])).channel_id as string | undefined) : undefined);
    if (!channelId) throw e;
    seed.channelId = channelId;
    return list(`tiktokuser:${channelId}`);
  }
}

async function discover(): Promise<void> {
  const videos = loadVideos();
  const seeds = loadSeeds();
  const before = Object.keys(videos).length;
  const add = (v: { handle: string; videoId: string; url: string }, via: VideoRow['via'], query?: string) => {
    if (videos[v.videoId]) return false;
    videos[v.videoId] = { videoId: v.videoId, url: v.url, handle: v.handle, via, query, discoveredAt: now(), state: 'discovered' };
    return true;
  };

  if (!flag('search-only')) {
    const active = Object.entries(seeds).filter(([, s]) => s.status === 'active').map(([h]) => h);
    console.log(`\nseeds: ${active.length} active account(s)`);
    for (const handle of active) {
      const seed = seeds[handle]!;
      try {
        const json = listSeed(handle, seed, videos);
        let fresh = 0;
        let stale = 0;
        for (const e of (json.entries ?? []) as { id: string; timestamp?: number }[]) {
          if (tooOld(e.timestamp)) {
            stale++;
            continue;
          }
          if (add({ handle, videoId: e.id, url: `https://www.tiktok.com/@${handle}/video/${e.id}` }, 'seed')) fresh++;
        }
        Object.assign(seed, { failStreak: 0, lastListedAt: now() });
        runStats.seedsListed++;
        console.log(`  @${handle}: +${fresh} new${stale ? ` · ${stale} older than ${MAX_AGE_DAYS}d` : ''}`);
      } catch (e) {
        seed.failStreak = (seed.failStreak ?? 0) + 1;
        runStats.seedsFailed++;
        console.warn(`  ! @${handle} (${seed.failStreak} run(s) in a row): ${(e as Error).message.split('\n')[0]!.slice(0, 160)}`);
      }
      await sleep(DELAY_MS / 2);
    }
  }

  if (!flag('seeds-only')) {
    // A few phrases per run, rotating by day: the engines rate-limit after two or
    // three queries, and a daily run covers the whole list in under a week.
    const perRun = Number(argv('queries', '3'));
    const day = Math.floor(Date.now() / 86_400_000);
    const queries = argv('query')
      ? [argv('query')]
      : Array.from({ length: Math.min(perRun, SEARCH_QUERIES.length) }, (_, i) => SEARCH_QUERIES[(day * perRun + i) % SEARCH_QUERIES.length]);
    const hits = new Map<string, number>();
    console.log(`\nsearch: ${queries.length} quer${queries.length === 1 ? 'y' : 'ies'}`);
    // DuckDuckGo answers two or three queries, then serves its bot "anomaly"
    // page (HTTP 202); Brave answers the rest. Measured 2026-10-12 — Bing, Yahoo,
    // Startpage and Mojeek return no TikTok URLs to a plain fetch at all.
    const engines = [
      { name: 'duckduckgo', url: (q: string) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, blocked: false },
      { name: 'brave', url: (q: string) => `https://search.brave.com/search?q=${encodeURIComponent(q)}`, blocked: false },
    ];
    for (const q of queries) {
      const engine = engines.find((e) => !e.blocked);
      if (!engine) {
        console.warn('  ! every search engine is blocking — stopping search; seeds still run');
        break;
      }
      try {
        const res = await fetch(engine.url(`site:tiktok.com ${q}`), { headers: { 'User-Agent': UA } });
        const html = await res.text();
        if ((res.status === 202 || res.status === 429 || /anomaly|captcha/i.test(html.slice(0, 20_000))) && !tiktokVideosIn(html).length) {
          engine.blocked = true;
          console.warn(`  · ${engine.name} is blocking (HTTP ${res.status}) — switching engine`);
          queries.push(q); // retry this phrase on the next engine
          continue;
        }
        const found = tiktokVideosIn(html);
        let fresh = 0;
        for (const v of found) {
          if (add(v, 'search', q)) fresh++;
          hits.set(v.handle, (hits.get(v.handle) ?? 0) + 1);
        }
        console.log(`  "${q}" (${engine.name}): ${found.length} video(s), +${fresh} new${res.ok ? '' : ` (HTTP ${res.status})`}`);
      } catch (e) {
        console.warn(`  ! "${q}": ${(e as Error).message}`);
      }
      await sleep(DELAY_MS);
    }
    let proposed = 0;
    for (const [handle, n] of hits) {
      if (seeds[handle]) seeds[handle].hits = Math.max(seeds[handle].hits ?? 0, n);
      else {
        seeds[handle] = { status: 'proposed', from: 'search', addedAt: now(), hits: n };
        proposed++;
      }
    }
    if (proposed) console.log(`  ${proposed} new account(s) proposed as seeds — review with \`pnpm crm:tiktok-seeds\``);
  }

  saveVideos(videos);
  saveSeeds(seeds);
  runStats.discovered = Object.keys(videos).length - before;
  console.log(`\ndiscover: ${runStats.discovered} new video(s), ${Object.keys(videos).length} in the ledger.`);
}

// ── fetch ────────────────────────────────────────────────────────────────────
function transcribe(wavs: string[]): Record<string, string> {
  if (!wavs.length) return {};
  if (!existsSync(ASR_PY) || !existsSync(ASR_SCRIPT)) {
    console.warn(`  ! no whisper (${!existsSync(ASR_PY) ? ASR_PY : ASR_SCRIPT}) — continuing without transcripts`);
    return {};
  }
  const job = join(TMP, 'asr-job.json');
  writeFileSync(job, JSON.stringify({ model: ASR_MODEL, files: wavs }));
  const proc = spawnSync(ASR_PY, [ASR_SCRIPT, job], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 30 * 60_000 });
  if (proc.status !== 0) {
    console.warn(`  ! whisper failed: ${(proc.stderr || '').split('\n').filter(Boolean).pop()?.slice(0, 160)}`);
    return {};
  }
  return JSON.parse(proc.stdout.trim().split('\n').pop() || '{}');
}

async function fetchStage(): Promise<void> {
  const videos = loadVideos();
  const queue = Object.values(videos)
    .filter((v) => v.state === 'discovered')
    .sort((a, b) => b.videoId.localeCompare(a.videoId)) // TikTok ids grow with time: newest first
    .slice(0, FETCH_LIMIT === Infinity ? undefined : FETCH_LIMIT);
  console.log(`\nfetch: ${queue.length} video(s) to fetch`);
  mkdirSync(TMP, { recursive: true });
  const BATCH = 10;
  for (let i = 0; i < queue.length; i += BATCH) {
    const batch = queue.slice(i, i + BATCH);
    const wavFor = new Map<string, string>();
    for (const row of batch) {
      const mp4 = join(TMP, `${row.videoId}.mp4`);
      await waitForNetwork('www.tiktok.com');
      try {
        const j = JSON.parse(ytdlp(['-J', row.url]));
        row.meta = {
          caption: (j.description ?? j.title ?? '').trim(),
          uploader: j.uploader ?? row.handle,
          channel: j.channel ?? null,
          timestamp: j.timestamp ?? null,
          duration: j.duration ?? null,
          views: j.view_count ?? null,
          channelId: j.channel_id ?? null,
        };
        if (tooOld(row.meta.timestamp)) {
          Object.assign(row, { state: 'skipped', skipReason: `older than ${MAX_AGE_DAYS} days` });
          delete row.error;
          continue;
        }
        if (!looksLikeRental(row.meta.caption)) {
          Object.assign(row, { state: 'skipped', skipReason: 'caption does not read as a rental' });
          delete row.error;
          continue;
        }
        ytdlp(['-q', '-f', 'b[ext=mp4]/b', '-o', mp4, row.url]);
        const dir = join(FRAMES, row.videoId);
        mkdirSync(dir, { recursive: true });
        const dur = row.meta.duration || Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4], { encoding: 'utf8' }));
        row.frames = [];
        frameTimes(dur).forEach((t, k) => {
          const out = join(dir, `${k + 1}.jpg`);
          execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(t), '-i', mp4, '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '3', out]);
          if (existsSync(out)) row.frames!.push(out);
        });
        const wav = join(TMP, `${row.videoId}.wav`);
        execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', mp4, '-vn', '-ac', '1', '-ar', '16000', wav]);
        wavFor.set(row.videoId, wav);
        delete row.error;
        console.log(`  ✓ ${row.videoId} @${row.handle} · ${row.frames.length} frames · ${row.meta.caption.slice(0, 70).replace(/\n/g, ' ')}`);
      } catch (e) {
        if (e instanceof NetworkDown) throw e;
        row.error = (e as Error).message.split('\n')[0]!.slice(0, 200);
        // A drop in the link is not the video's fault; a block, a removal or
        // "no video formats" is, and retrying those forever wasted every run.
        if (!/resolve|ENOTFOUND|EAI_AGAIN|timed out|network/i.test(row.error)) row.attempts = (row.attempts ?? 0) + 1;
        if ((row.attempts ?? 0) >= MAX_FETCH_ATTEMPTS) Object.assign(row, { state: 'failed' });
        console.warn(`  ! ${row.videoId}: ${row.error}${row.state === 'failed' ? ` — given up after ${MAX_FETCH_ATTEMPTS} tries` : ''}`);
      } finally {
        rmSync(mp4, { force: true });
      }
      await sleep(DELAY_MS / 2);
    }
    const texts = transcribe([...wavFor.values()]);
    for (const row of batch) {
      const wav = wavFor.get(row.videoId);
      if (!wav) continue;
      row.transcript = texts[wav] ?? '';
      row.state = 'fetched';
      runStats.fetched++;
      rmSync(wav, { force: true });
    }
    saveVideos(videos);
  }
  console.log(`fetch: done.`);
}

// ── read ─────────────────────────────────────────────────────────────────────
/** Up to n evenly spaced frames, keeping each one's place in the video (its 1-based label). */
function pickFrames(frames: string[], n: number): { label: number; path: string }[] {
  const all = frames.map((path, i) => ({ label: i + 1, path })).filter((f) => existsSync(f.path));
  if (all.length <= n) return all;
  return Array.from({ length: n }, (_, k) => all[Math.round((k * (all.length - 1)) / (n - 1))]!);
}

async function readOne(row: VideoRow, attempt = 0, extra = ''): Promise<TikTokRead> {
  const dir = join(FRAMES, row.videoId);
  const base = {
    handle: row.handle,
    channel: row.meta?.channel ?? null,
    caption: row.meta?.caption ?? '',
    // Whisper over music is mostly noise, and the Groq tier counts every token.
    transcript: (row.transcript ?? '').slice(0, READER === 'groq' ? 600 : 4000),
    uploadedAt: row.meta?.timestamp ? new Date(row.meta.timestamp * 1000).toISOString().slice(0, 10) : null,
  };
  let text: string;
  if (READER === 'groq') {
    const picked = pickFrames(row.frames ?? [], GROQ_FRAMES);
    const strips = Array.from({ length: Math.ceil(picked.length / PER_IMAGE) }, (_, i) => picked.slice(i * PER_IMAGE, (i + 1) * PER_IMAGE));
    mkdirSync(TMP, { recursive: true });
    const images = strips.map((strip, i) => {
      if (strip.length === 1) return strip[0]!.path;
      const out = join(TMP, `${row.videoId}-strip${i + 1}.jpg`);
      const inputs = strip.flatMap((f) => ['-i', f.path]);
      const scaled = strip.map((_, k) => `[${k}:v]scale=360:-2[f${k}]`).join(';');
      const stack = `${strip.map((_, k) => `[f${k}]`).join('')}hstack=inputs=${strip.length}`;
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', `${scaled};${stack}`, '-q:v', '3', out]);
      return out;
    });
    const side = ['left', 'middle', 'right'];
    const labels = strips.map((strip, i) =>
      `image ${i + 1} = ${strip.map((f, k) => `frame ${f.label}${strip.length > 1 ? ` (${strip.length === 2 ? ['left', 'right'][k] : side[k]})` : ''}`).join(' + ')}`,
    );
    const prompt = buildTikTokPrompt({ ...base, frames: labels, framesMode: 'attached' });
    try {
      text = await runGroq({ prompt: prompt + extra, images });
    } finally {
      for (const img of images) if (img.startsWith(TMP)) rmSync(img, { force: true });
    }
  } else {
    const frames = (row.frames ?? []).map((f) => basename(f));
    const prompt = buildTikTokPrompt({ ...base, frames, framesMode: 'files' });
    text = runClaude({ prompt: prompt + extra, model: READER_MODEL, allowTools: frames.length ? ['Read'] : [], cwd: existsSync(dir) ? dir : undefined, timeoutMs: 240_000 });
  }
  try {
    return parseTikTokRead(text);
  } catch (e) {
    if (attempt >= 1) throw e;
    return readOne(row, 1, `\n\nYour previous answer was rejected: ${(e as Error).message.slice(0, 300)}. Return ONLY the JSON object.`);
  }
}

async function readStage(): Promise<void> {
  const videos = loadVideos();
  const queue = Object.values(videos)
    .filter((v) => v.state === 'fetched')
    .sort((a, b) => (b.meta?.timestamp ?? 0) - (a.meta?.timestamp ?? 0))
    .slice(0, READ_LIMIT === Infinity ? undefined : READ_LIMIT);
  const model = READER === 'groq' ? GROQ_VISION_MODEL : READER_MODEL;
  console.log(`\nread: ${queue.length} video(s), newest first · reader ${TIKTOK_PROMPT_VERSION}/${READER}:${model}`);
  for (const row of queue) {
    const started = Date.now();
    await waitForNetwork(READER === 'groq' ? 'api.groq.com' : 'api.anthropic.com');
    try {
      const read = await readOne(row);
      row.read = read;
      row.readVersion = `${TIKTOK_PROMPT_VERSION}/${READER}`;
      const skip = skipReasonFor(read);
      Object.assign(row, skip ? { state: 'skipped', skipReason: skip } : { state: 'read' });
      // A skipped video's frames are never uploaded; keep the disk for the ones that are.
      if (skip) rmSync(join(FRAMES, row.videoId), { recursive: true, force: true });
      delete row.error;
      runStats.read++;
      console.log(
        `  ${skip ? '·' : '✓'} ${row.videoId} @${row.handle} · ${((Date.now() - started) / 1000).toFixed(0)}s · ${skip ?? `${read.bedrooms ?? '?'}bd ${read.propertyType ?? '?'} ${read.priceRwf ?? '?'} RWF/${read.period}${read.units.length > 1 ? ` (${read.units.length} units)` : ''} · ${read.neighbourhood ?? read.district ?? '?'} · ${read.phones.length} phone(s) · conf ${read.confidence}`}`,
      );
    } catch (e) {
      const msg = (e as Error).message;
      // A spent limit fails every video behind it the same way — the 10-16 run
      // logged 40 identical "weekly limit" errors. Stop once; the ledger resumes.
      if (e instanceof GroqLimit || /hit your .*limit|usage limit|rate limit/i.test(msg)) {
        runStats.readStopped = msg.slice(0, 160);
        console.warn(`  ■ reader limit reached — stopping the read stage (${msg.slice(0, 120)})`);
        saveVideos(videos);
        break;
      }
      row.error = msg.slice(0, 200);
      console.warn(`  ! ${row.videoId}: ${row.error}`);
    }
    saveVideos(videos);
    if (READER === 'groq') await sleep(GROQ_GAP_MS); // a read is most of the tier's minute
  }
}

// ── upsert ───────────────────────────────────────────────────────────────────
type Row = Record<string, unknown>;
const clean = <T extends Record<string, unknown>>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))) as Partial<T>;
const createdId = (res: unknown): string => {
  const d = (res as { data?: Row })?.data ?? (res as Row);
  const rec = (d as Row)?.createHome ?? (d as Row)?.createHost ?? (d as Row)?.createNote ?? (d as Row)?.createOpportunity ?? d;
  return String((rec as Row)?.id ?? '');
};

async function uploadFrames(row: VideoRow, paths: string[]): Promise<string[]> {
  const s3 = await import('@/lib/s3');
  if (!s3.isS3Configured()) throw new Error('S3 is not configured (AWS_* in .env) — frames cannot be stored');
  const ns = process.env.NEXT_PUBLIC_CDN_NAMESPACE?.trim() || 'mkan';
  const urls: string[] = [];
  for (const [i, p] of paths.entries()) {
    const url = await s3.putObject({
      key: `${ns}/uploads/tiktok/${row.videoId}/${i + 1}.jpg`,
      body: readFileSync(p),
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000, immutable',
    });
    if (url) urls.push(url);
  }
  return urls;
}

async function upsert(): Promise<{ homes: number; hosts: number }> {
  const videos = loadVideos();
  const queue = Object.values(videos).filter((v) => v.state === 'read' && v.read).slice(0, LIMIT === Infinity ? undefined : LIMIT);
  console.log(`\nupsert: ${queue.length} read video(s) → Twenty ${APPLY ? '(APPLY)' : '(dry run — pass --apply to write)'}`);
  if (!queue.length) return { homes: 0, hosts: 0 };

  const client = twentyClient();
  const [hosts, homes] = await Promise.all([client.all('hosts'), client.all('homes')]);
  const homeBySource = new Map(homes.filter((h) => h.sourceId).map((h) => [String(h.sourceId), h]));
  const hostByHandle = new Map(hosts.filter((h) => h.tiktokHandle).map((h) => [String(h.tiktokHandle).toLowerCase(), h]));
  const hostByPhone = new Map<string, Row>();
  for (const h of hosts) for (const n of [...phonesFromTwenty(h.phone as never, 'RW'), ...phonesFromTwenty(h.whatsapp as never, 'RW')]) {
    if (n.startsWith('+250')) hostByPhone.set(n, h);
  }
  // Facts already on the board, across every broker (dupKey has no handle).
  const seenDup = new Set(
    Object.values(videos)
      .filter((v) => v.state === 'upserted' && v.read)
      .flatMap((v) => unitReads(v.videoId, v.read!).map((u) => dupKey(v.handle, u.read)))
      .filter(Boolean) as string[],
  );

  let newHomes = 0;
  let newHosts = 0;
  for (const row of queue) {
    const read = row.read!;
    const units = unitReads(row.videoId, read);
    const existing = homeBySource.get(units[0]!.sourceId);
    if (existing && units.every((u) => homeBySource.has(u.sourceId))) {
      Object.assign(row, { state: 'upserted', homeId: String(existing.id), hostId: existing.hostId ? String(existing.hostId) : undefined });
      delete row.error;
      console.log(`  = ${row.videoId} already in Twenty (${existing.id})`);
      continue;
    }
    // The handle can carry the number ("muranga.pierre0788371624").
    const phones = phonesFor(read, `${row.meta?.caption ?? ''} ${row.handle}`);
    const phone = phones[0] ?? null;
    let host = (phone && hostByPhone.get(phone)) || hostByHandle.get(row.handle.toLowerCase()) || null;
    const framePaths = propertyFramePaths(row.frames ?? [], read.propertyFrames);
    const hBody = clean({ ...hostBody(row, read, phone), phone: twentyPhones(phone, phones.slice(1)) });
    const promptVersion = row.readVersion ?? TIKTOK_PROMPT_VERSION;

    if (!APPLY) {
      for (const u of units) {
        if (homeBySource.has(u.sourceId)) continue;
        const key = dupKey(row.handle, u.read);
        const duplicate = key ? seenDup.has(key) : false;
        const body = clean(homeBody(row, u.read, { frameUrls: framePaths.map((p) => `s3://…/${basename(p)}`), phone, hostName: String(hBody.name), promptVersion, duplicate, sourceId: u.sourceId }));
        console.log(`  + ${u.sourceId} → home "${body.title}" ${body.zone ?? '(no zone)'} · host ${host ? `existing ${host.id}` : `new @${row.handle}`} ${phone ?? '(no phone)'} · ${framePaths.length} photo(s)${duplicate ? ' · SUSPECTED DUPLICATE' : ''}`);
        if (newHomes === 0) console.log(`    sample home body: ${JSON.stringify(body).slice(0, 900)}`);
        newHomes++;
        if (key) seenDup.add(key);
      }
      if (!host) {
        newHosts++;
        const planned = { id: `(new @${row.handle})`, ...hBody };
        hostByHandle.set(row.handle.toLowerCase(), planned);
        if (phone) hostByPhone.set(phone, planned);
      }
      continue;
    }

    try {
      if (!host) {
        const created = createdId(await client.rest('POST', 'hosts', hBody));
        host = { id: created, ...hBody };
        hostByHandle.set(row.handle.toLowerCase(), host);
        if (phone) hostByPhone.set(phone, host);
        newHosts++;
        try {
          await client.rest('POST', 'opportunities', clean({ name: `Onboard ${hBody.name} — TikTok`, onboardingStage: 'SCRAPED', homesCount: units.length, hostId: created }));
        } catch (e) {
          console.warn(`  ! opportunity for @${row.handle}: ${(e as Error).message.slice(0, 120)}`);
        }
      } else {
        // A host first seen without a number gets one the moment a video shows it;
        // a broker's second handle is kept in the notes rather than lost.
        const patch: Row = {};
        const known = phonesFromTwenty(host.phone as never, 'RW');
        if (!host.tiktokHandle) patch.tiktokHandle = row.handle;
        if (!known.length && phone) patch.phone = twentyPhones(phone, phones.slice(1));
        else if (phones.some((p) => !known.includes(p))) patch.phone = twentyPhones(known[0]!, [...known.slice(1), ...phones.filter((p) => !known.includes(p))]);
        if (Object.keys(patch).length) {
          await client.rest('PATCH', `hosts/${host.id}`, patch);
          Object.assign(host, patch);
          console.log(`    host ${host.id}: ${Object.keys(patch).join(', ')} updated`);
        }
      }
      const frameUrls = row.frameUrls?.length ? row.frameUrls : await uploadFrames(row, framePaths);
      row.frameUrls = frameUrls;
      const homeIds: string[] = [];
      for (const [i, u] of units.entries()) {
        const already = homeBySource.get(u.sourceId);
        if (already) {
          homeIds.push(String(already.id));
          continue;
        }
        const key = dupKey(row.handle, u.read);
        const duplicate = key ? seenDup.has(key) : false;
        const body = clean({ ...homeBody(row, u.read, { frameUrls, phone, hostName: String(hBody.name), promptVersion, duplicate, sourceId: u.sourceId }), hostId: String(host.id) });
        const homeId = createdId(await client.rest('POST', 'homes', body));
        homeIds.push(homeId);
        homeBySource.set(u.sourceId, { id: homeId });
        if (key) seenDup.add(key);
        newHomes++;
        console.log(`  + ${u.sourceId} → home ${homeId} "${body.title}" · host ${host.id} ${phone ?? ''} · ${frameUrls.length} photo(s)${duplicate ? ' · SUSPECTED DUPLICATE' : ''}`);
        if (i > 0) continue; // one note per video, on its first home
        const markdown = [
          `**TikTok** ${row.url}`,
          `**Poster** @${row.handle}${row.meta?.channel ? ` (${row.meta.channel})` : ''} · ${row.meta?.views ?? '?'} views · posted ${row.meta?.timestamp ? new Date(row.meta.timestamp * 1000).toISOString().slice(0, 10) : '?'}`,
          phones.length > 1 ? `**All phones** ${phones.join(', ')}` : '',
          units.length > 1 ? `**Units** ${units.length} homes from this post: ${units.map((x) => x.sourceId).join(', ')}` : '',
          `**Caption**\n\n${row.meta?.caption ?? ''}`,
          row.transcript ? `**Transcript (Whisper, auto)**\n\n${row.transcript}` : '',
          `**Reader ${row.readVersion}**\n\n\`\`\`json\n${JSON.stringify(read, null, 2)}\n\`\`\``,
        ].filter(Boolean).join('\n\n');
        try {
          const noteId = createdId(await client.rest('POST', 'notes', { title: `TikTok ${row.videoId}`, bodyV2: { markdown } }));
          if (noteId) await client.rest('POST', 'noteTargets', { noteId, targetHomeId: homeId });
        } catch (e) {
          console.warn(`  ! note for ${row.videoId}: ${(e as Error).message.slice(0, 120)}`);
        }
      }
      Object.assign(row, { state: 'upserted', homeId: homeIds[0], hostId: String(host.id) });
      delete row.error;
      // The S3 copies are the record now; the local frames were 124 MB and growing.
      if (frameUrls.length) rmSync(join(FRAMES, row.videoId), { recursive: true, force: true });
    } catch (e) {
      row.error = (e as Error).message.slice(0, 200);
      console.warn(`  ! ${row.videoId}: ${row.error}`);
    }
    saveVideos(videos);
  }
  if (APPLY) saveVideos(videos);
  console.log(`upsert: ${APPLY ? '' : 'would create '}${newHomes} home(s), ${newHosts} new host(s).`);
  return { homes: newHomes, hosts: newHosts };
}

// ── status / seeds / notify ──────────────────────────────────────────────────
function status(): void {
  const videos = Object.values(loadVideos());
  const by = (k: (v: VideoRow) => string) => videos.reduce<Record<string, number>>((a, v) => ((a[k(v)] = (a[k(v)] ?? 0) + 1), a), {});
  console.log(`\nTikTok ledger — ${videos.length} video(s)`);
  for (const [s, n] of Object.entries(by((v) => v.state))) console.log(`  ${s.padEnd(11)} ${n}`);
  const skips = by((v) => (v.state === 'skipped' ? (v.skipReason ?? '?').replace(/:.*/, '') : ''));
  delete skips[''];
  if (Object.keys(skips).length) {
    console.log('skipped because:');
    for (const [r, n] of Object.entries(skips).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${r}`);
  }
  const errs = videos.filter((v) => v.error).length;
  if (errs) console.log(`with errors (retried next run): ${errs}`);
  const seeds = Object.entries(loadSeeds());
  console.log(`seeds: ${seeds.filter(([, s]) => s.status === 'active').length} active · ${seeds.filter(([, s]) => s.status === 'proposed').length} proposed · ${seeds.filter(([, s]) => s.status === 'ignored').length} ignored`);
}

function seedsCmd(): void {
  const seeds = loadSeeds();
  const list = (s: string) => s.split(',').map((h) => h.trim().replace(/^@/, '').toLowerCase()).filter(Boolean);
  for (const h of list(argv('add'))) seeds[h] = { ...(seeds[h] ?? { from: 'manual', addedAt: now() }), status: 'active' };
  for (const h of list(argv('promote'))) if (seeds[h]) seeds[h].status = 'active';
  for (const h of list(argv('ignore'))) seeds[h] = { ...(seeds[h] ?? { from: 'manual', addedAt: now() }), status: 'ignored' };
  if (argv('add') || argv('promote') || argv('ignore')) saveSeeds(seeds);
  const videos = Object.values(loadVideos());
  const kept = (h: string) => videos.filter((v) => v.handle === h && v.state === 'upserted').length;
  console.log('\nhandle'.padEnd(36) + 'status    from     hits  homes');
  for (const [h, s] of Object.entries(seeds).sort((a, b) => (b[1].hits ?? 0) - (a[1].hits ?? 0)))
    console.log(`@${h}`.padEnd(35) + ` ${s.status.padEnd(9)} ${s.from.padEnd(8)} ${String(s.hits ?? '').padStart(4)}  ${kept(h)}`);
}

/** One #mkan line a day, quiet when nothing happened and loud when something broke. */
function runSummary(r: { homes: number; hosts: number }): string {
  const videos = Object.values(loadVideos());
  const backlog = (st: VideoRow['state']) => videos.filter((v) => v.state === st).length;
  const lines = [
    `*TikTok lane* — ${r.homes} new Kigali home(s) at VETTING, ${r.hosts} new broker(s), ${runStats.mirrored} lead(s) in /find · <https://mkan.databayt.org/objects/homes|board>`,
    `found ${runStats.discovered} · fetched ${runStats.fetched} · read ${runStats.read} · waiting: ${backlog('discovered')} to fetch, ${backlog('fetched')} to read`,
  ];
  if (runStats.seedsFailed) lines.push(`⚠️ ${runStats.seedsFailed} of ${runStats.seedsListed + runStats.seedsFailed} seed account(s) could not be listed`);
  if (runStats.readStopped) lines.push(`⚠️ reader stopped at its limit: \`${runStats.readStopped.slice(0, 120)}\``);
  const proposed = Object.values(loadSeeds()).filter((x) => x.status === 'proposed').length;
  if (proposed) lines.push(`${proposed} proposed seed account(s) waiting — \`pnpm crm:tiktok-seeds\``);
  return lines.join('\n');
}

// ── main ─────────────────────────────────────────────────────────────────────
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  mkdirSync(DATA, { recursive: true });
  if (existsSync(LOCK) && Date.now() - Number(readFileSync(LOCK, 'utf8')) < 3 * 3600_000) {
    console.log('another TikTok run holds the lock (< 3h old) — nothing to do');
    process.exit(0);
  }
  writeFileSync(LOCK, String(Date.now()));
  return fn().finally(() => rmSync(LOCK, { force: true }));
}

async function main(): Promise<void> {
  switch (cmd) {
    case 'discover':
      return withLock(discover);
    case 'fetch':
      return withLock(fetchStage);
    case 'read':
      return withLock(readStage);
    case 'upsert':
      return withLock(async () => void (await upsert()));
    case 'run':
      return withLock(async () => {
        await discover();
        await fetchStage();
        await readStage();
        const r = await upsert();
        // The /find agent only sees what is in Prisma; it used to wait for a
        // hand-run `crm:tiktok-mirror --apply`.
        if (APPLY) {
          try {
            runStats.mirrored = (await mirrorLeads(true)).written;
            await (await import('../../src/lib/db')).db.$disconnect();
          } catch (e) {
            console.warn(`  ! mirror: ${(e as Error).message.slice(0, 160)}`);
          }
        }
        if (APPLY && flag('notify')) await postToMkan(runSummary(r));
      });
    case 'status':
      return status();
    case 'seeds':
      return seedsCmd();
    default:
      console.log(readFileSync(__filename, 'utf8').split('*/')[0]);
  }
}

main().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
