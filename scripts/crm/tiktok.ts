/**
 * The TikTok lane — Kigali rentals posted as TikTok videos → the mkan CRM.
 *
 *   pnpm crm:tiktok-discover [--seeds-only|--search-only] [--query="…"|--queries=3] [--max-age=120] [--per-seed=30]
 *   pnpm crm:tiktok-fetch    [--limit=N] [--max-age=120]       metadata + 8 frames + transcript, mp4 deleted
 *   pnpm crm:tiktok-read     [--limit=N]                        claude -p reads caption + transcript + frames
 *   pnpm crm:tiktok-upsert   [--limit=N] [--apply]              frames → S3, host + home (VETTING) + note → Twenty
 *   pnpm crm:tiktok          [--limit=N] [--apply] [--notify]   all four, in order
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
import { twentyClient, phoneOf, type Phones } from './twenty-rest';
import { TIKTOK_PROMPT_VERSION, buildTikTokPrompt } from './tiktok-read-prompt';
import {
  SEARCH_QUERIES,
  dupKey,
  frameTimes,
  homeBody,
  hostBody,
  looksLikeRental,
  normalizeRwandaPhone,
  parseTikTokRead,
  phonesFor,
  propertyFramePaths,
  skipReasonFor,
  tiktokVideosIn,
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
  return execFileSync('yt-dlp', ['--no-warnings', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] });
}

// ── discover ─────────────────────────────────────────────────────────────────
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
      try {
        const json = JSON.parse(ytdlp(['--flat-playlist', '-J', '--playlist-end', argv('per-seed', '30'), `https://www.tiktok.com/@${handle}`]));
        let fresh = 0;
        let stale = 0;
        for (const e of (json.entries ?? []) as { id: string; timestamp?: number }[]) {
          if (tooOld(e.timestamp)) {
            stale++;
            continue;
          }
          if (add({ handle, videoId: e.id, url: `https://www.tiktok.com/@${handle}/video/${e.id}` }, 'seed')) fresh++;
        }
        console.log(`  @${handle}: +${fresh} new${stale ? ` · ${stale} older than ${MAX_AGE_DAYS}d` : ''}`);
      } catch (e) {
        console.warn(`  ! @${handle}: ${(e as Error).message.split('\n')[0].slice(0, 160)}`);
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
  console.log(`\ndiscover: ${Object.keys(videos).length - before} new video(s), ${Object.keys(videos).length} in the ledger.`);
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
  const queue = Object.values(videos).filter((v) => v.state === 'discovered').slice(0, LIMIT === Infinity ? undefined : LIMIT);
  console.log(`\nfetch: ${queue.length} video(s) to fetch`);
  mkdirSync(TMP, { recursive: true });
  const BATCH = 10;
  for (let i = 0; i < queue.length; i += BATCH) {
    const batch = queue.slice(i, i + BATCH);
    const wavFor = new Map<string, string>();
    for (const row of batch) {
      const mp4 = join(TMP, `${row.videoId}.mp4`);
      try {
        const j = JSON.parse(ytdlp(['-J', row.url]));
        row.meta = {
          caption: (j.description ?? j.title ?? '').trim(),
          uploader: j.uploader ?? row.handle,
          channel: j.channel ?? null,
          timestamp: j.timestamp ?? null,
          duration: j.duration ?? null,
          views: j.view_count ?? null,
        };
        if (tooOld(row.meta.timestamp)) {
          Object.assign(row, { state: 'skipped', skipReason: `older than ${MAX_AGE_DAYS} days` });
          continue;
        }
        if (!looksLikeRental(row.meta.caption)) {
          Object.assign(row, { state: 'skipped', skipReason: 'caption does not read as a rental' });
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
        row.error = (e as Error).message.split('\n')[0].slice(0, 200);
        console.warn(`  ! ${row.videoId}: ${row.error}`);
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
      rmSync(wav, { force: true });
    }
    saveVideos(videos);
  }
  console.log(`fetch: done.`);
}

// ── read ─────────────────────────────────────────────────────────────────────
function readOne(row: VideoRow, attempt = 0, extra = ''): TikTokRead {
  const dir = join(FRAMES, row.videoId);
  const frames = (row.frames ?? []).map((f) => basename(f));
  const prompt = buildTikTokPrompt({
    handle: row.handle,
    channel: row.meta?.channel ?? null,
    caption: row.meta?.caption ?? '',
    transcript: row.transcript ?? '',
    uploadedAt: row.meta?.timestamp ? new Date(row.meta.timestamp * 1000).toISOString().slice(0, 10) : null,
    frames,
  });
  const text = runClaude({ prompt: prompt + extra, model: READER_MODEL, allowTools: frames.length ? ['Read'] : [], cwd: existsSync(dir) ? dir : undefined, timeoutMs: 240_000 });
  try {
    return parseTikTokRead(text);
  } catch (e) {
    if (attempt >= 1) throw e;
    return readOne(row, 1, `\n\nYour previous answer was rejected: ${(e as Error).message.slice(0, 300)}. Return ONLY the JSON object.`);
  }
}

async function readStage(): Promise<void> {
  const videos = loadVideos();
  const queue = Object.values(videos).filter((v) => v.state === 'fetched').slice(0, LIMIT === Infinity ? undefined : LIMIT);
  console.log(`\nread: ${queue.length} video(s) · reader ${TIKTOK_PROMPT_VERSION}/${READER_MODEL}`);
  for (const row of queue) {
    const started = Date.now();
    try {
      const read = readOne(row);
      row.read = read;
      row.readVersion = TIKTOK_PROMPT_VERSION;
      const skip = skipReasonFor(read);
      Object.assign(row, skip ? { state: 'skipped', skipReason: skip } : { state: 'read' });
      delete row.error;
      console.log(
        `  ${skip ? '·' : '✓'} ${row.videoId} @${row.handle} · ${((Date.now() - started) / 1000).toFixed(0)}s · ${skip ?? `${read.bedrooms ?? '?'}bd ${read.propertyType ?? '?'} ${read.priceRwf ?? '?'} RWF/${read.period} · ${read.neighbourhood ?? read.district ?? '?'} · ${read.phones.length} phone(s) · conf ${read.confidence}`}`,
      );
    } catch (e) {
      row.error = (e as Error).message.slice(0, 200);
      console.warn(`  ! ${row.videoId}: ${row.error}`);
    }
    saveVideos(videos);
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
  for (const h of hosts) for (const p of [phoneOf(h.phone as Phones), phoneOf(h.whatsapp as Phones)]) {
    const n = normalizeRwandaPhone(p);
    if (n) hostByPhone.set(n, h);
  }
  const seenDup = new Set(Object.values(videos).filter((v) => v.state === 'upserted' && v.read).map((v) => dupKey(v.handle, v.read!)).filter(Boolean) as string[]);

  let newHomes = 0;
  let newHosts = 0;
  for (const row of queue) {
    const read = row.read!;
    const existing = homeBySource.get(`tiktok:${row.videoId}`);
    if (existing) {
      Object.assign(row, { state: 'upserted', homeId: String(existing.id), hostId: existing.hostId ? String(existing.hostId) : undefined });
      console.log(`  = ${row.videoId} already in Twenty (${existing.id})`);
      continue;
    }
    const phones = phonesFor(read, row.meta?.caption ?? '');
    const phone = phones[0] ?? null;
    const key = dupKey(row.handle, read);
    const duplicate = key ? seenDup.has(key) : false;
    let host = (phone && hostByPhone.get(phone)) || hostByHandle.get(row.handle) || null;
    const framePaths = propertyFramePaths(row.frames ?? [], read.propertyFrames);
    const hBody = clean(hostBody(row, read, phone));

    if (!APPLY) {
      const body = clean(homeBody(row, read, { frameUrls: framePaths.map((p) => `s3://…/${basename(p)}`), phone, hostName: String(hBody.name), promptVersion: row.readVersion ?? TIKTOK_PROMPT_VERSION, duplicate }));
      console.log(`  + ${row.videoId} → home "${body.title}" ${body.zone ?? '(no zone)'} · host ${host ? `existing ${host.id}` : `new @${row.handle}`} ${phone ?? '(no phone)'} · ${framePaths.length} photo(s)${duplicate ? ' · SUSPECTED DUPLICATE' : ''}`);
      if (newHomes === 0) console.log(`    sample home body: ${JSON.stringify(body).slice(0, 900)}`);
      newHomes++;
      if (!host) {
        newHosts++;
        const planned = { id: `(new @${row.handle})`, ...hBody };
        hostByHandle.set(row.handle, planned);
        if (phone) hostByPhone.set(phone, planned);
      }
      if (key) seenDup.add(key);
      continue;
    }

    try {
      if (!host) {
        const created = createdId(await client.rest('POST', 'hosts', hBody));
        host = { id: created, ...hBody };
        hostByHandle.set(row.handle, host);
        if (phone) hostByPhone.set(phone, host);
        newHosts++;
        try {
          await client.rest('POST', 'opportunities', clean({ name: `Onboard ${hBody.name} — TikTok`, onboardingStage: 'SCRAPED', homesCount: 1, hostId: created }));
        } catch (e) {
          console.warn(`  ! opportunity for @${row.handle}: ${(e as Error).message.slice(0, 120)}`);
        }
      } else if (!host.tiktokHandle) {
        await client.rest('PATCH', `hosts/${host.id}`, { tiktokHandle: row.handle });
        host.tiktokHandle = row.handle;
      }
      const frameUrls = row.frameUrls?.length ? row.frameUrls : await uploadFrames(row, framePaths);
      row.frameUrls = frameUrls;
      const body = clean({ ...homeBody(row, read, { frameUrls, phone, hostName: String(hBody.name), promptVersion: row.readVersion ?? TIKTOK_PROMPT_VERSION, duplicate }), hostId: String(host.id) });
      const homeId = createdId(await client.rest('POST', 'homes', body));
      const markdown = [
        `**TikTok** ${row.url}`,
        `**Poster** @${row.handle}${row.meta?.channel ? ` (${row.meta.channel})` : ''} · ${row.meta?.views ?? '?'} views · posted ${row.meta?.timestamp ? new Date(row.meta.timestamp * 1000).toISOString().slice(0, 10) : '?'}`,
        phones.length > 1 ? `**All phones** ${phones.join(', ')}` : '',
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
      Object.assign(row, { state: 'upserted', homeId, hostId: String(host.id) });
      homeBySource.set(`tiktok:${row.videoId}`, { id: homeId });
      if (key) seenDup.add(key);
      newHomes++;
      console.log(`  + ${row.videoId} → home ${homeId} "${body.title}" · host ${host.id} ${phone ?? ''} · ${frameUrls.length} photo(s)${duplicate ? ' · SUSPECTED DUPLICATE' : ''}`);
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

async function notify(text: string): Promise<void> {
  let token = (process.env.SLACK_BOT_TOKEN ?? '').trim();
  if (!token) {
    try {
      token = execSync('security find-generic-password -s databayt -a SLACK_BOT_TOKEN -w', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      /* no token — skip */
    }
  }
  if (!token) return console.warn('  ! no Slack token — summary not posted');
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel: (process.env.SLACK_HOME_CHANNEL ?? '').trim() || 'C0BS2NZE2AY', text }),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!json.ok) console.warn(`  ! slack: ${json.error}`);
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
        if (APPLY && flag('notify') && r.homes)
          await notify(`TikTok lane: ${r.homes} new Kigali home(s) at VETTING (${r.hosts} new host(s)) — https://mkan.databayt.org/objects/homes`);
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
