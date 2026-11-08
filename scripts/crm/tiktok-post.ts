/**
 * mkan's own Kigali TikTok page — the daily video queue.
 *
 *   pnpm tt:run [--n=fresh|<n>] [--slot] [--dry]   pick → render → card (the 07:00 Hermes tick; tt:upload posts after it)
 *   pnpm tt:pick [--n=fresh|<n>] [--dry]   choose today's homes → .data/tiktok-post/<date>/queue.json (a second pick adds to it)
 *   pnpm tt:render [--slot|--ahead] [--id=5771] [--slideshow]   one 9:16 video per queued home (--slot: this upload slot's share; --ahead: the next slots'; --id: one listing, for a look)
 *   pnpm tt:card                    show each video + its caption in Slack #mkan (tt:upload posts them)
 *   pnpm tt:posted <ref> <url>      the poster's receipt: the home rests 30 days
 *   pnpm tt:stats [--notify]        views / likes of our posts, read back by yt-dlp
 *   pnpm tt:ask [--mark=a,b --as=ASKED|YES|NO --apply]   broker repost consent
 *   pnpm tt:ask --preview [--top=5]  remaster one home per top broker (preview/, never posted) and post the asks with it
 *   pnpm tt:consent --yes=<handle,…> [--no=<handle,…>] --source="<how they said it>" [--apply]
 *                                   record brokers' answers (a note on their CRM host) and keep a YES broker's videos
 *   pnpm tt:consent --from-line      record the answers brokers gave on the WhatsApp line (every pick does this first)
 *
 * One listing → one broker video → one post (Abdout, 2026-11-05). The video
 * carries NO text, logo or branding: the broker's burned-in captions, number,
 * @handle and logo (and TikTok's own watermark) are wiped, and nothing of
 * mkan's goes on — no sting, corner mark, lower third, price pill or end card.
 * The price, the code, the WhatsApp number and the broker's credit live only in
 * the post's caption. The broker's own sound is kept, with any phone number or
 * @handle they say out loud muted. No bundled carousels or picture videos.
 *
 * --dry renders into .data/tiktok-post/dry/<date>/ (tt:upload never reads it),
 * writes no queue, ledger or TikTokPost row (ever — the funnel counts them), and sends no
 * Slack card. Every real pick writes a TikTokPost row per home: PICKED →
 * CLEAN | REJECTED (render) → POSTED | FAILED (tt:upload) → views (tt:stats).
 *
 * Who is on the page: monthly homes with ≥4 photos and a price, whose source
 * post is at most 14 days old and not taken (Listing.lostAt) — owners' and
 * field-agent homes (MANUAL), Airbnb hosts who took a monthly price, and a
 * broker's TikTok lead only once that broker said YES (Twenty host
 * `repostConsent`). A broker lead goes out as that broker's own video, AI-
 * upscaled, stabilised and graded; an owner's home with no video as its photos.
 *
 * How many, and when (2026-11-07): every postable home whose ad went up today or yesterday, picked
 * at 07:00 and again in the evening slots after the 15:00 sweep, 3 to 15 a day (pickFresh). They
 * go out one by one through the day's 14 slots, 10 of them between 17:00 and 21:30 when Kigali
 * scrolls (slotQuota), each slot rendering ahead for the next (aheadRenders). The 21:00 stats line
 * carries the reposts' reach by time of day and the chats the posts brought (repostReach).
 *
 * Env: MKAN_KIGALI_WHATSAPP (the number in the caption), TIKTOK_POSTS_PER_DAY
 * (default "fresh"; a number fixes the day's count and 0 holds the lane), TIKTOK_POSTS_MIN /
 * TIKTOK_POSTS_MAX (3 / 15), TIKTOK_PAGE_HANDLE (default mkan.rw), TIKTOK_PAGE_SECUID (when
 * yt-dlp's @handle page breaks), KUN_DIR (for the shared reel encode; default
 * ~/kun), MKAN_WHISPER_MODEL (the local voice check's model).
 */
import { config } from 'dotenv';
config({ override: true });

import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { postToMkan, recordRun, uploadToMkan } from './notify';
import { twentyClient, phoneOf, type Phones } from './twenty-rest';
import { ownTikTok } from './tiktok-pure';
import {
  brokerAsk,
  brokerPreviewAsk,
  brokerHandle,
  addedText,
  bandCrop,
  brokerVideoUrl,
  fitGraph,
  pictureRect,
  type Rect,
  captionFor,
  asksForFollow,
  captionMarks,
  parseStudioMetrics,
  interactionRate,
  bestWorst,
  type StudioMetrics,
  FRESH_DAYS,
  type GrayFrame,
  H,
  ineligibleReason,
  leftoverText,
  MAX_SLIDES,
  muteFilter,
  type MuteSpan,
  oldRenderDays,
  AHEAD_MARGIN_MIN,
  aheadRenders,
  clock,
  codePattern,
  dayPieces,
  fetchFailure,
  probeVerdict,
  type Probe,
  bufferPlan,
  ledgerFixes,
  shortfallLine,
  BUFFER_READY,
  kigaliMinute,
  nextSlotGap,
  pickFresh,
  pickToday,
  POSTS_CEILING,
  POSTS_FLOOR,
  diskFloorGiB,
  fillUnreadFrames,
  repostLine,
  repostReach,
  slotQuota,
  refInText,
  refOf,
  spokenContactSpans,
  type SpokenWord,
  sceneMotion,
  sceneTextKept,
  staticOverlayRegions,
  STRIP_FPS,
  stripGraph,
  textRegions,
  type TextBox,
  type TextFrame,
  timeline,
  W,
  waLink,
  errorText,
  pageStatsLine,
  type Ledger,
  type PageVideo,
  type PostRow,
} from './tiktok-post-pure';

const argv = (n: string, d = ''): string => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.slice(n.length + 3) : d;
};
import { refuseUnattended } from '../unattended';
const flag = (n: string): boolean => process.argv.includes(`--${n}`);
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const cmd = positional[0] ?? 'help';

const DATA = join(__dirname, '.data', 'tiktok-post');
const LEDGER = join(DATA, 'posted.json');
const today = (): string => new Date().toISOString().slice(0, 10);
/** `tt:buffer` works on tomorrow's folder through the same pick and render code: it sets this. */
let dateOverride: string | null = null;
const dayDir = (d = dateOverride ?? argv('date', today())) => join(DATA, d);
const PAGE = ownTikTok().handle;
const KUN = (process.env.KUN_DIR ?? '').trim() || join(homedir(), 'kun');

function whatsapp(): string {
  const n = (process.env.MKAN_KIGALI_WHATSAPP ?? '').trim();
  if (n) return n;
  if (flag('preview')) return '+250 7XX XXX XXX';
  throw new Error('MKAN_KIGALI_WHATSAPP is not set — the end card and caption need the page\'s WhatsApp number (or pass --preview for a look)');
}

const loadLedger = (): Ledger => (existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : {});
const saveLedger = (l: Ledger) => {
  mkdirSync(DATA, { recursive: true });
  writeFileSync(LEDGER, JSON.stringify(l, null, 2));
};

// ── rows ─────────────────────────────────────────────────────────────────────
async function loadRows(where: Record<string, unknown>): Promise<PostRow[]> {
  const { db } = await import('../../src/lib/db');
  const rows = await db.listing.findMany({
    where: { rentPeriod: 'MONTHLY', location: { country: 'Rwanda' }, ...where },
    select: {
      id: true, code: true, source: true, priceMonth: true, bedrooms: true, bathrooms: true, propertyType: true, photoUrls: true,
      postedDate: true, createdAt: true, lostAt: true,
      location: { select: { address: true, state: true } },
      host: { select: { sourceHostId: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    source: r.source,
    priceMonth: r.priceMonth,
    bedrooms: r.bedrooms,
    bathrooms: r.bathrooms,
    propertyType: r.propertyType,
    photoUrls: r.photoUrls,
    area: r.location?.address ?? null,
    district: r.location?.state || null,
    hostSourceId: r.host?.sourceHostId ?? null,
    // A broker lead's own video date beats these (sourcePostedAt reads it from the frames' video id).
    postedAt: (r.postedDate ?? r.createdAt).toISOString(),
    lostAt: r.lostAt?.toISOString() ?? null,
  }));
}

/** Handles of brokers who said YES. Twenty down → nobody (fail closed). */
async function consentedHandles(): Promise<Set<string>> {
  return (await readConsent()) ?? new Set();
}

/** The same, or null when Twenty does not answer: a render then waits for a later slot instead of rejecting the day. */
async function readConsent(): Promise<Set<string> | null> {
  try {
    const hosts = await twentyClient().all('hosts', 0);
    return new Set(hosts.filter((h) => h.repostConsent === 'YES').map((h) => String(h.tiktokHandle ?? '').replace(/^@/, '').trim().toLowerCase()).filter(Boolean));
  } catch (e) {
    console.warn(`  ! CRM unreachable (${(e as Error).message.slice(0, 80)}) — broker leads held back`);
    return null;
  }
}

const readJsonFile = <T>(p: string, d: T): T => (existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T) : d);

// ── the ledger: one TikTokPost row per home that goes through the lane ──────
type Db = (typeof import('../../src/lib/db'))['db'];
/** Only a real run writes rows: the /monetize funnel counts them, so a dry or preview render never does. */
const recording = (): boolean => !flag('dry') && !argv('id');

/** A TikTokPost write that never stops the lane: the post matters more than its row. */
async function ledgerRow<T>(what: string, fn: (db: Db) => Promise<T>): Promise<T | null> {
  if (!recording()) return null;
  try {
    const { db } = await import('../../src/lib/db');
    return await fn(db);
  } catch (e) {
    console.warn(`  ! TikTokPost ${what}: ${errorText(e).slice(0, 160)}`);
    return null;
  }
}

const videoIdOf = (r: PostRow): string | null => brokerVideoUrl(r)?.split('/').pop() ?? null;

// ── pick ─────────────────────────────────────────────────────────────────────
/** A whole-number env setting, else its default. */
const intEnv = (name: string, d: number): number => {
  const v = Number((process.env[name] ?? '').trim() || NaN);
  return Number.isInteger(v) && v >= 0 ? v : d;
};

/** Cheap fetchability check of a broker lead's video: metadata only, nothing downloaded. Non-broker homes have no fetch to fail. */
function probeVideo(r: PostRow): Probe {
  if (r.source !== 'TIKTOK') return 'ok';
  const url = brokerVideoUrl(r);
  if (!url) return 'photo'; // a broker lead whose frames carry no video id has nothing to fetch
  try {
    execFileSync('yt-dlp', ['-s', '-q', '--no-warnings', '--no-playlist', url], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 45_000 });
    return 'ok';
  } catch (e) {
    return probeVerdict(false, String((e as { stderr?: string }).stderr ?? (e as Error).message ?? ''));
  }
}

async function pick(): Promise<PostRow[]> {
  // --n / TIKTOK_POSTS_PER_DAY: "fresh" (the default since 2026-11-07) posts every postable home
  // whose ad went up today or yesterday, from TIKTOK_POSTS_MIN (3) up to TIKTOK_POSTS_MAX (15); see
  // pickFresh. A number is the day's fixed count, and 0 holds the lane (an answer, not a typo).
  const raw = argv('n', process.env.TIKTOK_POSTS_PER_DAY ?? 'fresh').trim().toLowerCase();
  const asked = Number(raw);
  const fixed = raw !== 'fresh' && raw !== '' && Number.isInteger(asked) && asked >= 0 ? asked : null;
  // Brokers who answered the repost ask on WhatsApp since the last run go into today's pool.
  if (!flag('dry')) await syncLineConsent().catch((e) => console.warn(`  ! repost answers from the line not read: ${(e as Error).message.slice(0, 120)}`));
  const [rows, consented] = await Promise.all([loadRows({}), consentedHandles()]);
  const ledger = loadLedger();
  const why = new Map<string, number>();
  for (const r of rows) {
    const w = ineligibleReason(r, consented);
    if (w) why.set(w, (why.get(w) ?? 0) + 1);
  }
  // A second pick on the same day adds to today's queue. It never replaces the queue: an earlier
  // pick's renders and uploads read from it.
  const queued = readQueue();
  const inQueue = new Set(queued.map(refOf));
  const open = rows.filter((r) => !inQueue.has(refOf(r)));
  // Fetchability: an unfetchable broker video is marked in the ledger (never featured again) and the
  // pick runs again so the next ready home takes its place and the day's count holds.
  const skipped: string[] = [];
  const checked = new Set<string>();
  const pickOnce = (): PostRow[] =>
    fixed !== null
      ? pickToday(open, ledger, consented, Math.max(0, fixed - queued.length))
      : pickFresh(open, ledger, consented, { already: queued.length, floor: intEnv('TIKTOK_POSTS_MIN', POSTS_FLOOR), ceiling: intEnv('TIKTOK_POSTS_MAX', POSTS_CEILING) }).picked;
  const verified = (): PostRow[] => {
    for (let round = 0; round < 6; round += 1) {
      const cand = pickOnce();
      let marked = 0;
      for (const r of cand) {
        if (checked.has(refOf(r))) continue;
        checked.add(refOf(r));
        const v = probeVideo(r);
        if (v === 'ok' || v === 'network') continue;
        ledger[refOf(r)] = { ...(ledger[refOf(r)] ?? { listingId: r.id, district: r.district, queuedAt: new Date().toISOString() }), fetchFailedAt: new Date().toISOString(), fetchFailure: v };
        skipped.push(`${refOf(r)} (${v})`);
        marked += 1;
      }
      if (!marked) return cand;
    }
    return pickOnce();
  };
  let picked: PostRow[];
  if (fixed !== null) picked = verified();
  else {
    const floor = intEnv('TIKTOK_POSTS_MIN', POSTS_FLOOR);
    const ceiling = intEnv('TIKTOK_POSTS_MAX', POSTS_CEILING);
    const f = pickFresh(open, ledger, consented, { already: queued.length, floor, ceiling });
    picked = verified();
    console.log(
      `ads posted today or yesterday: ${f.fresh} postable` +
        (f.over ? ` (${f.over} more over the ${ceiling}-a-day cap stay for the next pick)` : '') +
        (f.topUp ? ` + ${f.topUp} older to reach ${floor}` : '') +
        (queued.length ? ` · ${queued.length} already in today's queue` : ''),
    );
  }
  if (skipped.length) console.log(`unfetchable broker videos skipped and replaced: ${skipped.join(', ')}${flag('dry') ? ' (dry: ledger not written)' : ''}`);
  console.log(`Kigali monthly homes: ${rows.length} · brokers consented: ${consented.size} · held back: ${[...why].map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}`);
  for (const r of picked) console.log(`  ${refOf(r).padEnd(8)} #${r.id}  ${r.bedrooms ?? '?'}bd  RWF ${r.priceMonth}/mo  ${r.area ?? ''}, ${r.district ?? ''}  (${r.source})`);
  if (!picked.length && fixed === 0) console.log('  broker videos on hold (--n=0)');
  else if (!picked.length && queued.length) console.log(`  nothing to add — today's queue has ${queued.length}`);
  else if (!picked.length) console.log('  nothing to post today — the pool fills when brokers say YES (tt:ask) or owners send homes');
  // Lever 4: alternate the follow ask by post number (homes the ledger already holds + index).
  const posted = Object.keys(ledger).length;
  picked.forEach((r, i) => {
    r.askFollow = asksForFollow(posted + i);
  });
  // One row per home attempt: the page counts featured → enhanced → posted from these.
  for (const r of picked) {
    const id = await newRow(r);
    if (id) r.postId = id;
  }
  if (flag('dry')) return picked;
  mkdirSync(dayDir(), { recursive: true });
  if (picked.length || !queued.length) writeFileSync(join(dayDir(), 'queue.json'), JSON.stringify([...queued, ...picked], null, 2));
  const now = new Date().toISOString();
  for (const r of picked) ledger[refOf(r)] = { ...(ledger[refOf(r)] ?? {}), listingId: r.id, district: r.district, queuedAt: now, askFollow: r.askFollow };
  saveLedger(ledger);
  return picked;
}

/**
 * The TikTokPost row of a picked home. The experiment tags (askFollow, waLine) are columns a migration adds:
 * while the database lacks them the row is written without, so the home still counts as featured and clean.
 */
async function newRow(r: PostRow): Promise<string | null> {
  const base = { listingId: r.id, ref: refOf(r), sourceVideoId: videoIdOf(r), brokerHandle: brokerHandle(r.hostSourceId), status: 'PICKED' };
  const row =
    (await ledgerRow('picked', (db) => db.tikTokPost.create({ data: { ...base, askFollow: r.askFollow ?? false, waLine: 2 }, select: { id: true } }))) ??
    (await ledgerRow('picked (without the tags)', (db) => db.tikTokPost.create({ data: base, select: { id: true } })));
  return row?.id ?? null;
}

/** A queued home with no row (its pick could not write one) gets one before its render, so the render is counted. */
async function ensureRow(r: PostRow): Promise<string | null> {
  const found = await ledgerRow('find', (db) => db.tikTokPost.findFirst({ where: { listingId: r.id, ref: refOf(r), status: 'PICKED' }, orderBy: { pickedAt: 'desc' }, select: { id: true } }));
  return found?.id ?? (await newRow(r));
}

const readQueue = (): PostRow[] => {
  const f = join(dayDir(), 'queue.json');
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : [];
};

// ── render ───────────────────────────────────────────────────────────────────
// The full ffmpeg build carries vidstab and the other filters the enhance step
// needs; the slim Homebrew build is the fallback (no stabilising then).
const FFMPEG_FULL = '/opt/homebrew/opt/ffmpeg-full/bin';
const FF = existsSync(join(FFMPEG_FULL, 'ffmpeg')) ? join(FFMPEG_FULL, 'ffmpeg') : 'ffmpeg';
const FFPROBE = existsSync(join(FFMPEG_FULL, 'ffprobe')) ? join(FFMPEG_FULL, 'ffprobe') : 'ffprobe';
/** A broker video longer than this is cut; the reel profile caps the whole piece at 60 s. */
const MAX_BODY = 45;

function ffmpeg(args: string[]): void {
  try {
    execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
  } catch (e) {
    throw new Error(`ffmpeg: ${String((e as { stderr?: string }).stderr ?? (e as Error).message).trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/** Whether a file carries a sound track. */
function hasAudio(path: string): boolean {
  try {
    return execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', path], { encoding: 'utf8' }).trim().length > 0;
  } catch {
    return false;
  }
}

function probe(path: string): { w: number; h: number; dur: number } | null {
  try {
    const j = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', path], { encoding: 'utf8' }));
    const st = j.streams?.[0];
    return st ? { w: st.width, h: st.height, dur: Number(j.format?.duration) || 0 } : null;
  } catch {
    return null;
  }
}

const hasFilter = (() => {
  let list: string | null = null;
  return (name: string): boolean => {
    list ??= execFileSync(FF, ['-hide_banner', '-filters'], { encoding: 'utf8' });
    return new RegExp(`\\s${name}\\s`).test(list);
  };
})();

// Real-ESRGAN (ncnn/Vulkan, Apple GPU): the release binary at ~/.local/opt/realesrgan, or REALESRGAN.
const REALESRGAN = (process.env.REALESRGAN ?? '').trim() || join(homedir(), '.local/opt/realesrgan/realesrgan-ncnn-vulkan');
/** Frames upscaled per batch: a 4× frame is ~6 MB of JPEG, so 50 bound the batch to ~300 MB. */
const UPSCALE_CHUNK = 50;

/**
 * The remaster's AI step: every frame upscaled 4× by Real-ESRGAN's video model
 * (≈0.35 s a frame on the M-series GPU, so a 45 s clip is ~8 min), brought down
 * to 1080 wide, then blended 65/35 with a plain lanczos scale of the source:
 * the model's crisp edges without its painted look. Its photo model looks a
 * touch more natural but runs 30× slower. Improves the picture, never the
 * property: no generative fill, no object changes. Null when the binary is
 * missing or `--fast` — the caller keeps today's ffmpeg-only enhance.
 */
function upscale(src: string, dur: number, work: string, info: { w: number; h: number }): string | null {
  if (flag('fast') || !existsSync(REALESRGAN)) return null;
  const raw = join(work, 'raw');
  const ai = join(work, 'ai');
  mkdirSync(raw, { recursive: true });
  mkdirSync(ai, { recursive: true });
  ffmpeg(['-t', String(dur), '-i', src, '-vf', 'fps=30', '-q:v', '2', join(raw, '%05d.jpg')]);
  const frames = execFileSync('ls', [raw], { encoding: 'utf8' }).split('\n').filter((f) => f.endsWith('.jpg')).sort();
  // Upscaled frames are scaled to the 9:16 cover's width (or the landscape fit) as they land.
  const target = info.w > info.h ? `${W}:-2` : `${W}:${H}:force_original_aspect_ratio=increase`;
  const started = Date.now();
  for (let i = 0; i < frames.length; i += UPSCALE_CHUNK) {
    const inDir = join(work, 'in');
    const upDir = join(work, 'up');
    rmSync(inDir, { recursive: true, force: true });
    rmSync(upDir, { recursive: true, force: true });
    mkdirSync(inDir);
    mkdirSync(upDir);
    for (const f of frames.slice(i, i + UPSCALE_CHUNK)) execFileSync('mv', [join(raw, f), join(inDir, f)]);
    execFileSync(REALESRGAN, ['-i', inDir, '-o', upDir, '-n', 'realesr-animevideov3', '-s', '4', '-f', 'jpg', '-m', join(dirname(REALESRGAN), 'models')], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 3_600_000 });
    for (const f of frames.slice(i, i + UPSCALE_CHUNK)) {
      ffmpeg(['-i', join(upDir, f), '-i', join(inDir, f), '-filter_complex', `[0]scale=${target}:flags=lanczos[a];[1]scale=${target}:flags=lanczos[b];[a][b]blend=all_expr='A*0.65+B*0.35'`, '-q:v', '2', join(ai, f)]);
      execFileSync('mv', [join(inDir, f), join(raw, f)]);
    }
    rmSync(upDir, { recursive: true, force: true });
  }
  const out = join(work, 'remaster.mp4');
  ffmpeg(['-framerate', '30', '-i', join(ai, '%05d.jpg'), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', '-pix_fmt', 'yuv420p', out]);
  rmSync(raw, { recursive: true, force: true });
  rmSync(ai, { recursive: true, force: true });
  console.log(`  … AI upscale: ${frames.length} frames in ${((Date.now() - started) / 60000).toFixed(1)} min`);
  return out;
}

/**
 * The broker's own video, remastered: AI-upscaled (see upscale), stabilised,
 * deflickered, graded to a daylight look, framed to 9:16 (a landscape clip sits
 * on a blurred fill instead of losing its sides). Its own sound stays — taken
 * from the source, since the upscale rebuilds the picture from frames — and its
 * burned-in text and logos come off in renderOne (stripText) on this 9:16 frame.
 * Null when there is no video to get (a photo post, a deleted video).
 */
async function videoBody(r: PostRow, work: string): Promise<{ path: string; dur: number; pic: Rect } | null> {
  const url = brokerVideoUrl(r);
  if (!url) return null;
  const id = url.split('/').pop()!;
  const srcDir = join(DATA, 'src');
  mkdirSync(srcDir, { recursive: true });
  const src = join(srcDir, `${id}.mp4`);
  if (!existsSync(src)) {
    // DNS often fails for a minute after the Mac wakes: retry twice before calling the video gone.
    let stderr = '';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        execFileSync('yt-dlp', ['-q', '--no-warnings', '-f', 'b[ext=mp4]/b', '-o', src, url], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000 });
        stderr = '';
        break;
      } catch (e) {
        stderr = String((e as { stderr?: string }).stderr ?? (e as Error).message ?? '').trim();
        if (fetchFailure(stderr) === 'gone' || attempt === 2) break;
        console.warn(`  … ${refOf(r)}: no network for the download (try ${attempt + 1} of 3) — waiting`);
        await new Promise((res) => setTimeout(res, 20_000 * (attempt + 1)));
      }
    }
    if (stderr) {
      // Gone from TikTok? The copy kept when the broker said YES (tt:consent) still plays.
      const kept = loadArchive()[id];
      const res = kept ? await fetch(kept).catch(() => null) : null;
      if (res?.ok) writeFileSync(src, Buffer.from(await res.arrayBuffer()));
      else {
        console.warn(`  … ${refOf(r)}: no broker video (${stderr.split('\n').pop()?.slice(0, 100)})`);
        // No network is not a deleted video: a later slot tries again, the home is not rejected.
        if (fetchFailure(stderr) === 'network') throw new Transient('no network to fetch the broker video — a later slot retries');
        return null;
      }
    }
  }
  const info = probe(src);
  if (!info || info.dur < 3) return null;
  const dur = Math.min(info.dur, MAX_BODY);
  const out = join(work, 'body.mp4');
  // The AI upscale feeds the rest of the chain; without it the source goes in as before.
  const upscaled = upscale(src, dur, work, info);
  const input = upscaled ?? src;
  // mkan's daylight look: lift, a little warmth, flicker from phone auto-exposure smoothed out.
  const grade = `${upscaled ? '' : 'hqdn3d=1.5:1.5:6:6,'}deflicker=size=5,eq=contrast=1.05:saturation=1.1:gamma=1.03,colorbalance=rm=0.03:bm=-0.03,unsharp=5:5:${upscaled ? '0.25' : '0.5'}:5:5:0`;
  let stab = '';
  if (hasFilter('vidstabdetect')) {
    const trf = join(work, 'shake.trf');
    ffmpeg(['-t', String(dur), '-i', input, '-vf', `vidstabdetect=shakiness=5:accuracy=15:result=${trf}`, '-f', 'null', '-']);
    stab = `vidstabtransform=input=${trf}:smoothing=20:optzoom=1,`;
  }
  const frame =
    info.w > info.h
      ? // landscape: blurred cover behind, the whole frame in front
        `split[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=40,eq=brightness=-0.06[bg];[b]scale=${W}:-2:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`
      : `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H}`;
  // The broker's sound: from the source itself (the upscaled remaster is picture only).
  const sound = upscaled ? ['-t', String(dur), '-i', src] : [];
  ffmpeg([
    '-t', String(dur), '-i', input, ...sound,
    '-filter_complex', `[0:v]${stab}${grade},${frame},fps=30,setsar=1,format=yuv420p[v]`,
    '-map', '[v]', '-map', `${upscaled ? 1 : 0}:a:0?`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', out,
  ]);
  return { path: out, dur: probe(out)?.dur || dur, pic: pictureRect(info.w, info.h) };
}

/** An owner's home with no video: its own photos with a slow push-in, crossfaded — no text, no sound. */
async function slideshowBody(r: PostRow, work: string): Promise<{ path: string; dur: number }> {
  const ref = refOf(r);
  const slides: string[] = [];
  for (const url of r.photoUrls) {
    if (slides.length >= MAX_SLIDES) break;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const out = join(work, `s${slides.length}.jpg`);
      // 2× the frame so the push-in stays sharp instead of stepping pixel by pixel.
      await sharp(Buffer.from(await res.arrayBuffer())).rotate().resize(W * 2, H * 2, { fit: 'cover', position: 'attention' }).jpeg({ quality: 88 }).toFile(out);
      slides.push(out);
    } catch {
      /* a dead photo is skipped, not fatal */
    }
  }
  if (slides.length < 3) throw new Error(`${ref}: only ${slides.length} photos downloaded`);
  const SLIDE = 2.6;
  const FADE = 0.4;
  const t = timeline(slides.length, SLIDE, FADE);
  const frames = Math.round(SLIDE * 30);
  const f: string[] = slides.map(
    (_, i) => `[${i}:v]zoompan=z='min(zoom+0.0009,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=30,setsar=1,format=yuv420p[v${i}]`,
  );
  let last = 'v0';
  t.offsets.forEach((off, i) => {
    f.push(`[${last}][v${i + 1}]xfade=transition=fade:duration=${FADE}:offset=${off}[x${i + 1}]`);
    last = `x${i + 1}`;
  });
  const out = join(work, 'body.mp4');
  ffmpeg([...slides.flatMap((p) => ['-i', p]), '-filter_complex', f.join(';'), '-map', `[${last}]`, '-t', String(t.slidesLen), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', out]);
  return { path: out, dur: t.slidesLen };
}
// ── the broker's text, off ───────────────────────────────────────────────────
/** Apple Vision text boxes (ocr-frames.swift --boxes), compiled once into the data dir — the same binary the TikTok lane reads with. */
const OCR_SRC = join(__dirname, 'ocr-frames.swift');
const OCR_BIN = join(__dirname, '.data', 'bin', 'ocr-frames');
/** videoBody and slideshowBody both end on fps=30, so a frame's index is its time. */
const BODY_FPS = 30;

/** Where Vision sees text on each image. Throws when it cannot read one — the callers fail closed. */
function ocrBoxes(images: string[]): TextBox[][] {
  if (!existsSync(OCR_BIN) || statSync(OCR_BIN).mtimeMs < statSync(OCR_SRC).mtimeMs) {
    mkdirSync(dirname(OCR_BIN), { recursive: true });
    const tmp = `${OCR_BIN}.${process.pid}`;
    execFileSync('swiftc', ['-O', OCR_SRC, '-o', tmp], { stdio: 'pipe' });
    renameSync(tmp, OCR_BIN);
  }
  const run = (paths: string[], timeout: number): Record<string, TextBox[]> =>
    JSON.parse(execFileSync(OCR_BIN, ['--boxes', ...paths], { encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024 })) as Record<string, TextBox[]>;
  let out: Record<string, TextBox[]>;
  try {
    out = run(images, 600_000);
  } catch (e) {
    // A timeout (ETIMEDOUT) or a Vision start failure: once more, with twice the time.
    console.log(`  … text read failed (${firstLine(e)}) — once more, longer`);
    try {
      out = run(images, 1_200_000);
    } catch {
      // Still failing: read frame by frame; a single unreadable frame is skipped (the nearest
      // frame stands in), two or more fail the render (fillUnreadFrames).
      out = {};
      for (const p of images) {
        try {
          Object.assign(out, run([p], 300_000));
        } catch {
          /* left unread */
        }
      }
    }
  }
  return fillUnreadFrames(images.map((p) => (Array.isArray(out[p]) ? out[p]! : null)));
}

/** Every (BODY_FPS / STRIP_FPS)th frame of a body from frame `offset`, as JPEGs with their times. */
function sampleFrames(video: string, dir: string, offset: number): { t: number; path: string }[] {
  const stride = BODY_FPS / STRIP_FPS;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  ffmpeg(['-i', video, '-vf', `select='eq(mod(n,${stride}),${offset})'`, '-fps_mode', 'vfr', '-q:v', '2', join(dir, '%04d.jpg')]);
  const files = readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
  if (!files.length) throw new Error(`no frames sampled from ${video}`);
  return files.map((f, i) => ({ t: +((offset + i * stride) / BODY_FPS).toFixed(3), path: join(dir, f) }));
}

const firstLine = (e: unknown): string => String((e as { stderr?: string }).stderr || (e as Error).message).trim().split('\n')[0]!.slice(0, 160);

/** The grey grid the logo finder reads each sampled frame at (1/8 of the output). */
const GW = W / 8;
const GH = H / 8;

async function grayFrames(frames: { t: number; path: string }[]): Promise<GrayFrame[]> {
  return Promise.all(
    frames.map(async (f) => {
      const { data, info } = await sharp(f.path).greyscale().resize(GW, GH, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
      // greyscale() gives one channel; anything else keeps its first.
      const g = info.channels === 1 ? data : Uint8Array.from({ length: GW * GH }, (_, i) => data[i * info.channels]!);
      return { t: f.t, data: g };
    }),
  );
}

/** A render that must not go out, with the reason that goes on its TikTokPost row. */
class Rejected extends Error {}
/** A render that failed for want of the network: it waits for a later slot and is never rejected or retried-out. */
class Transient extends Error {}

/**
 * Every burned-in text and logo off a body — nothing of the broker's on our
 * page, and nothing of ours put back. Frames sampled STRIP_FPS a second are
 * read for where text sits (Apple Vision → textRegions) and where something
 * holds still while the scene moves (staticOverlayRegions: their logo, a
 * watermark, TikTok's mark); each place is wiped while it is there
 * (stripGraph). The cleaned body is then read again between those samples —
 * the strict gate: any readable text left (leftoverText), not just a number,
 * gets one more pass with wider pads and what was found, and is REJECTED after
 * that. Fails closed: frames that cannot be read reject the render too.
 */
async function stripText(ref: string, made: { path: string; dur: number; pic?: Rect }, work: string): Promise<{ path: string; dur: number; note: string }> {
  const dir = join(work, 'ocr');
  const read = async (video: string, offset: number, gray = false): Promise<{ text: TextFrame[]; grays: GrayFrame[] }> => {
    try {
      const frames = sampleFrames(video, dir, offset);
      const boxes = ocrBoxes(frames.map((f) => f.path));
      const grays = gray ? await grayFrames(frames) : [];
      return { text: frames.map((f, i) => ({ t: f.t, boxes: boxes[i]! })), grays };
    } catch (e) {
      throw new Rejected(`could not read the frames for the broker's text (${firstLine(e)}) — not rendered, so nothing goes out with their text on it`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  let first = await read(made.path, 0, true);
  let body = { path: made.path, dur: made.dur };
  // Only text added on top of the video is the broker's: a sign or a label in the scene stays
  // (addedText — Abdout, 2026-11-06: "the text which was later added to the video").
  let motion = sceneMotion(first.grays, { gw: GW, gh: GH });
  // A caption banner across the picture's top or bottom is cut off, not wiped (a wipe leaves a
  // frosted block): the rows between the bands re-fit to 9:16, then the rest is read again.
  const band = bandCrop(textRegions(addedText(first.text, { motion }), { duration: made.dur }), made.pic ?? { x: 0, y: 0, w: W, h: H });
  let cut = '';
  if (band) {
    const k = band.keep;
    const path = join(work, 'banded.mp4');
    ffmpeg(['-i', made.path, '-filter_complex', `[0:v]crop=${k.w}:${k.h}:${k.x}:${k.y},${fitGraph(k.w, k.h)},setsar=1,format=yuv420p[v]`, '-map', '[v]', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-c:a', 'copy', path]);
    body = { path, dur: made.dur };
    first = await read(path, 0, true);
    motion = sceneMotion(first.grays, { gw: GW, gh: GH });
    cut = `cut caption band (${[band.top && `top ${band.top}px`, band.bottom && `bottom ${band.bottom}px`].filter(Boolean).join(', ')}), `;
    console.log(`  … ${ref}: ${cut.slice(0, -2)} — re-fit ${k.w}×${k.h} to 9:16`);
  }
  const seen = addedText(first.text, { motion });
  const keptScene = sceneTextKept(first.text, seen);
  const marks = staticOverlayRegions(first.grays, { gw: GW, gh: GH, duration: body.dur });
  for (let pass = 1; pass <= 2; pass++) {
    const words = textRegions(seen, { duration: body.dur, padScale: pass === 1 ? 1 : 1.6 });
    const regions = [...words, ...marks];
    let path = body.path;
    if (regions.length) {
      path = join(work, `clean${pass}.mp4`);
      ffmpeg(['-i', body.path, '-filter_complex', stripGraph(regions), '-map', '[v]', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', '-c:a', 'copy', path]);
    }
    // Between the samples the wipe was built from: no readable text may be left.
    // Scene text the strip kept on purpose does not fail the gate; added text or a contact does.
    const check = addedText((await read(path, Math.floor(BODY_FPS / STRIP_FPS / 2))).text, { motion });
    const left = leftoverText(check);
    if (!left.length) {
      const kept = keptScene ? `, kept ${keptScene} line${keptScene === 1 ? '' : 's'} of scene text` : '';
      const note = cut + (regions.length ? `wiped ${words.length} text place${words.length === 1 ? '' : 's'} + ${marks.length} logo/watermark${marks.length === 1 ? '' : 's'}${pass > 1 ? ' (second pass)' : ''}` : 'no added text or logo') + kept;
      console.log(`  … ${ref}: ${note}`);
      return { path, dur: body.dur, note };
    }
    if (pass === 2) throw new Rejected(`text still on screen after two strips: ${left.slice(0, 3).join(', ')}`);
    console.log(`  … ${ref}: ${left.length} text read${left.length === 1 ? '' : 's'} left after the strip (${left.slice(0, 2).join(', ')}) — once more, wider`);
    seen.push(...check);
  }
  throw new Rejected('unreachable');
}

// ── the broker's voice: kept, with numbers said out loud muted ───────────────
const WHISPER = [join(homedir(), '.local/bin/mlx_whisper'), '/opt/homebrew/bin/mlx_whisper'].find((p) => existsSync(p)) ?? null;
const WHISPER_MODEL = (process.env.MKAN_WHISPER_MODEL ?? '').trim() || 'mlx-community/whisper-large-v3-turbo';

/**
 * The broker's sound stays, but not their number: a local Whisper pass (kun's
 * media lane, mlx-whisper on the Mac, $0) finds a phone number or @handle said
 * out loud (spokenContactSpans), and those spans alone are muted. No Whisper on
 * this Mac, or a transcript that fails: the sound goes as it is, and the log
 * says so.
 */
function audioGuard(ref: string, body: { path: string; dur: number }, work: string): { path: string; dur: number; muted: MuteSpan[]; note: string } {
  if (!hasAudio(body.path)) return { ...body, muted: [], note: 'no sound' };
  if (!WHISPER) {
    console.log(`  … ${ref}: no local Whisper — broker sound kept unchecked`);
    return { ...body, muted: [], note: 'sound unchecked (no Whisper)' };
  }
  const wav = join(work, 'voice.wav');
  let words: SpokenWord[];
  try {
    ffmpeg(['-i', body.path, '-vn', '-ac', '1', '-ar', '16000', wav]);
    execFileSync(WHISPER, [wav, '--model', WHISPER_MODEL, '--word-timestamps', 'True', '--output-format', 'json', '--output-dir', work, '--verbose', 'False', '--condition-on-previous-text', 'False'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 600_000 });
    const j = JSON.parse(readFileSync(join(work, 'voice.json'), 'utf8')) as { segments?: { words?: SpokenWord[] }[] };
    words = (j.segments ?? []).flatMap((s) => s.words ?? []);
  } catch (e) {
    console.log(`  … ${ref}: voice check skipped (${firstLine(e)}) — broker sound kept unchecked`);
    return { ...body, muted: [], note: 'sound unchecked (transcript failed)' };
  }
  const spans = spokenContactSpans(words);
  const af = muteFilter(spans);
  if (!af) {
    console.log(`  … ${ref}: broker sound kept (${words.length} words, no number or handle said)`);
    return { ...body, muted: [], note: 'sound kept' };
  }
  const out = join(work, 'voiced.mp4');
  ffmpeg(['-i', body.path, '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy', '-af', af, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', out]);
  const what = spans.map((s) => `${s.what} ${s.start}–${s.end} s`).join(', ');
  console.log(`  … ${ref}: broker sound kept, muted ${spans.length} span${spans.length === 1 ? '' : 's'} (${what})`);
  return { path: out, dur: body.dur, muted: spans, note: `sound kept, muted ${what}` };
}

/** The delivery encode: kun's reel profile (1080×1920 H.264 high, BT.709, loudness-levelled AAC, faststart, 60 s cap), else ffmpeg directly. */
const MEDIA_SH = () => join(KUN, '.claude/skills/edit/scripts/media.sh');
function reelEncode(mezz: string, out: string): void {
  if (existsSync(MEDIA_SH())) {
    try {
      execFileSync('bash', [MEDIA_SH(), 'encode', 'reel', mezz, out], { stdio: ['ignore', 'pipe', 'pipe'] });
      return;
    } catch (e) {
      console.warn(`  … reel profile declined (${String((e as { stderr?: string }).stderr ?? '').trim().split('\n').pop()}) — encoding directly`);
    }
  }
  ffmpeg(['-i', mezz, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-profile:v', 'high', '-maxrate', '8M', '-bufsize', '16M', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-movflags', '+faststart', out]);
}

// ── disk + work dirs ─────────────────────────────────────────────────────────
/** Renders refuse below this, like kun's media lane. */
const DISK_FLOOR_GIB = diskFloorGiB(process.env.TIKTOK_DISK_FLOOR_GIB);
/** Work dirs of renders in flight: removed on exit, a kill included (the run's watchdog sends TERM). */
const working = new Set<string>();
const dropWork = () => {
  for (const d of working) rmSync(d, { recursive: true, force: true });
  working.clear();
};
process.on('exit', dropWork);
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => {
  dropWork();
  process.exit(sig === 'SIGINT' ? 130 : 143);
});

const freeGiB = (): number => Number(execFileSync('df', ['-g', homedir()], { encoding: 'utf8' }).trim().split('\n').pop()!.trim().split(/\s+/)[3]) || 0;

/** Leftover `.work-*` dirs (a run killed mid-render) under every render folder. */
function staleWork(): void {
  for (const base of [DATA, join(DATA, 'dry')]) {
    if (!existsSync(base)) continue;
    for (const d of readdirSync(base)) {
      const day = join(base, d);
      if (!statSync(day).isDirectory()) continue;
      for (const w of readdirSync(day)) if (w.startsWith('.work-') && !working.has(join(day, w))) rmSync(join(day, w), { recursive: true, force: true });
    }
  }
}

/**
 * Days a day folder keeps its videos. A posted video lives on TikTok, and up to 15 a day at
 * 5–22 MB each add up; the folder's captions, records and screenshots stay.
 */
const VIDEO_KEEP_DAYS = 3;

function pruneOldVideos(): number {
  if (!existsSync(DATA)) return 0;
  let n = 0;
  for (const d of oldRenderDays(readdirSync(DATA), Date.now(), VIDEO_KEEP_DAYS)) {
    for (const f of readdirSync(join(DATA, d))) {
      if (!f.endsWith('.mp4')) continue;
      rmSync(join(DATA, d, f), { force: true });
      n += 1;
    }
  }
  return n;
}

/** The 10 GiB floor, after freeing what the lane itself left: old videos, render folders over 14 days old, and stale work dirs. */
function ensureDisk(): void {
  staleWork();
  const pruned = pruneOldVideos();
  if (pruned) console.log(`  … disk: ${pruned} video${pruned === 1 ? '' : 's'} over ${VIDEO_KEEP_DAYS} days old removed (their records stay)`);
  let free = freeGiB();
  if (free >= DISK_FLOOR_GIB) return;
  let freed = 0;
  for (const base of [DATA, join(DATA, 'dry')]) {
    if (!existsSync(base)) continue;
    for (const d of oldRenderDays(readdirSync(base))) {
      rmSync(join(base, d), { recursive: true, force: true });
      freed += 1;
    }
  }
  free = freeGiB();
  console.log(`  … disk: ${freed} render folder${freed === 1 ? '' : 's'} over 14 days old cleared — ${free} GiB free`);
  if (free < DISK_FLOOR_GIB) throw new Error(`only ${free} GiB free (floor ${DISK_FLOOR_GIB}) — free space before rendering`);
}

/**
 * One home → `<dir>/<ref>.mp4` + `<ref>.txt`: the broker's video (an owner's
 * home with no video: its photos) → enhance → every text and logo off → the
 * broker's sound with spoken numbers muted → reel encode. Nothing is burned on.
 * A broker lead whose video is gone is rejected, never swapped for photos.
 */
async function renderOne(r: PostRow, dir: string, phone: string): Promise<{ out: string; note: string }> {
  const ref = refOf(r);
  const work = join(dir, `.work-${ref}`);
  const out = join(dir, `${ref}.mp4`);
  // A render that fails must leave nothing to post: an older cut of this home goes first.
  rmSync(out, { force: true });
  rmSync(join(dir, `${ref}.txt`), { force: true });
  mkdirSync(work, { recursive: true });
  working.add(work);
  try {
    const video = flag('slideshow') && r.source !== 'TIKTOK' ? null : await videoBody(r, work);
    if (!video && r.source === 'TIKTOK') throw new Rejected('the broker video could not be fetched (gone, private, or a photo post)');
    const made = video ?? (await slideshowBody(r, work));
    console.log(`  … ${ref}: ${video ? 'broker video, enhanced' : 'photo slideshow'} (${made.dur.toFixed(1)} s)`);
    const clean = await stripText(ref, made, work);
    const voiced = audioGuard(ref, clean, work);
    reelEncode(voiced.path, out);
    writeFileSync(join(dir, `${ref}.txt`), captionFor(r, phone));
    return { out, note: `${clean.note}; ${voiced.note}` };
  } finally {
    rmSync(work, { recursive: true, force: true });
    working.delete(work);
  }
}

/** Renders of the day's queue that failed in this run: the run's record counts them. */
let renderFailures = 0;

/**
 * A queued home that will not render today. `<ref>.rejected` takes it out of the day's count, so
 * later slots neither wait for it nor try it again. A rejected render (text left after the strip,
 * or the video gone) also rests in the ledger like a posted home. A broker whose YES is gone is
 * only skipped. Any other failure gets one more try in a later slot: the first leaves
 * `<ref>.error`, and the second turns it into `.rejected`.
 */
function markFailed(dir: string, ref: string, kind: 'rejected' | 'held' | 'error', why: string): void {
  const line = `${new Date().toISOString()} ${why}\n`;
  if (kind === 'error' && !existsSync(join(dir, `${ref}.error`))) return void writeFileSync(join(dir, `${ref}.error`), line);
  writeFileSync(join(dir, `${ref}.rejected`), line);
  if (kind !== 'rejected') return;
  const ledger = loadLedger();
  if (!ledger[ref]) return;
  ledger[ref] = { ...ledger[ref]!, rejectedAt: new Date().toISOString(), ...(/could not be fetched/.test(why) ? { fetchFailedAt: new Date().toISOString(), fetchFailure: 'gone' as const } : {}) };
  saveLedger(ledger);
}

/**
 * Renders `rows` (default: today's queue) into `dir`. `--id` renders any one
 * listing into preview/ for a look (never posted, no row). Each queued home's
 * TikTokPost row turns CLEAN or REJECTED with the reason.
 *
 * --slot renders only what this upload slot posts (slotQuota), and only when its share is not
 * ready yet: the next homes in the queue that have no video. --ahead runs after the slot's posts
 * are out and renders the next homes for the slots to come (aheadRenders): up to 3 when the next
 * slot is an hour or more away, 1 when it is half an hour away, and none started within
 * AHEAD_MARGIN_MIN of it. So no render holds the post lock for hours, and the evening's posts go
 * out on the minute.
 */
async function render(given?: PostRow[], limit = Infinity): Promise<string[]> {
  const phone = whatsapp();
  const id = Number(argv('id', '0'));
  // The day's real queue, not a look (--id, into preview/) or a dry run (into dry/).
  const real = !id && !flag('dry');
  const dir = id ? join(DATA, 'preview') : flag('dry') ? join(DATA, 'dry', argv('date', today())) : dayDir();
  // --id renders any one listing for a look, eligible or not — into preview/, never the queue.
  let rows = id ? await loadRows({ id }) : (given ?? readQueue());
  let want = limit;
  // --ahead: no render starts after this (minutes since midnight in Kigali).
  let lastStart = Infinity;
  const ahead = real && flag('ahead');
  if (real && (flag('slot') || ahead)) {
    const files = existsSync(dir) ? readdirSync(dir) : [];
    const s = dayPieces(rows.map(refOf), files, readJsonFile(join(dir, 'uploads.json'), {}), readJsonFile(join(dir, 'pending.json'), {}));
    const minute = kigaliMinute();
    const todo = new Set(s.todo);
    rows = rows.filter((r) => todo.has(refOf(r)));
    if (ahead) {
      const gap = nextSlotGap(minute);
      want = aheadRenders(gap, rows.length);
      if (gap !== null) lastStart = minute + gap - AHEAD_MARGIN_MIN;
      console.log(`ahead at ${clock(minute)} — ${rows.length} home(s) still to render, next slot ${gap === null ? 'tomorrow' : `in ${gap} min`} → render ${want}`);
    } else {
      const quota = slotQuota(s.total, s.out, minute);
      want = Math.max(0, quota - s.ready.length);
      console.log(`slot ${clock(minute)} — ${s.out} of ${s.total} out, ${s.ready.length} ready, this slot posts ${quota} → render ${Math.min(want, rows.length)} of ${rows.length} waiting`);
    }
    if (!want || !rows.length) return [];
  }
  if (!id) {
    // The queue was written at pick time; a broker can withdraw a YES in between.
    const consented = await readConsent();
    if (!consented) {
      // Twenty did not answer: nothing is rejected for it, and a later slot renders these.
      renderFailures += 1;
      return [];
    }
    const held = rows.filter((r) => r.source === 'TIKTOK' && !consented.has(brokerHandle(r.hostSourceId) ?? ''));
    for (const r of held) {
      console.warn(`  ! ${refOf(r)}: broker has no YES on file — not rendered`);
      if (real) markFailed(dir, refOf(r), 'held', 'broker has no YES on file');
      if (r.postId) await ledgerRow('rejected', (db) => db.tikTokPost.update({ where: { id: r.postId! }, data: { status: 'REJECTED', reason: 'broker has no YES on file' }, select: { id: true } }));
    }
    rows = rows.filter((r) => !held.includes(r));
  }
  if (!rows.length) {
    console.log(id ? `no Kigali monthly listing #${id}` : `queue for ${argv('date', today())} is empty — run tt:pick`);
    return [];
  }
  ensureDisk();
  mkdirSync(dir, { recursive: true });
  const outs: string[] = [];
  let tried = 0;
  for (const r of rows) {
    // A slot that loses a render to the strip tries the next home, at most two extra.
    if (outs.length >= want || tried >= want + 2) break;
    // Rendering ahead never runs into the next slot: a render takes up to ~16 minutes.
    if (kigaliMinute() > lastStart) {
      console.log(`  … stopping: the next slot is under ${AHEAD_MARGIN_MIN} min away`);
      break;
    }
    tried += 1;
    if (real && !r.postId) r.postId = (await ensureRow(r)) ?? undefined;
    try {
      const { out, note } = await renderOne(r, dir, phone);
      console.log(`  🎬 ${refOf(r)} → ${out}`);
      outs.push(out);
      if (r.postId && !id) await ledgerRow('clean', (db) => db.tikTokPost.update({ where: { id: r.postId! }, data: { status: 'CLEAN', cleanAt: new Date(), reason: note.slice(0, 500) }, select: { id: true } }));
    } catch (e) {
      const why = errorText(e);
      console.warn(`  ! ${refOf(r)}: ${e instanceof Rejected ? 'REJECTED — ' : e instanceof Transient ? 'WAITING — ' : ''}${why}`);
      if (e instanceof Transient) {
        renderFailures += 1;
        continue;
      }
      if (real) {
        renderFailures += 1;
        markFailed(dir, refOf(r), e instanceof Rejected ? 'rejected' : 'error', why);
      }
      if (r.postId && !id) await ledgerRow('rejected', (db) => db.tikTokPost.update({ where: { id: r.postId! }, data: { status: 'REJECTED', reason: why.slice(0, 500) }, select: { id: true } }));
    }
  }
  return outs;
}

// ── a day ahead: tomorrow's three clean videos, and the 21:00 check ──────────────────────────
const addDays = (d: string, n: number): string => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** A folder's pieces: the queue, the posted and clicked homes, and what is on disk. */
function folderState(date: string) {
  const dir = join(DATA, date);
  const queue = readJsonFile<PostRow[]>(join(dir, 'queue.json'), []);
  const files = existsSync(dir) ? readdirSync(dir) : [];
  const pieces = dayPieces(queue.map(refOf), files, readJsonFile(join(dir, 'uploads.json'), {}), readJsonFile(join(dir, 'pending.json'), {}));
  return { dir, queue, files, pieces };
}

/** Today's rejected and failed renders by cause, for the shortfall line. */
function stalledToday(date: string): Record<string, number> {
  const { dir, files } = folderState(date);
  const out: Record<string, number> = {};
  for (const f of files) {
    const m = /^(K\d+)\.(rejected|error)$/.exec(f);
    if (!m) continue;
    const why = readFileSync(join(dir, f), 'utf8');
    const k = /could not be fetched/.test(why) ? 'video not fetched' : /ocr|frames/i.test(why) ? 'text read timed out' : /YES/.test(why) ? 'no broker YES' : m[2] === 'error' ? 'render error' : 'rejected';
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/**
 * Settles TikTokPost rows still PICKED from the day folders: a database write lost to a sleeping Neon
 * or a column the database lacked (11-08) leaves a rendered video uncounted. Reads and writes `id` only.
 */
async function reconcile(days = 4): Promise<number> {
  const { db } = await import('../../src/lib/db');
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db.tikTokPost.findMany({ where: { status: 'PICKED', pickedAt: { gte: since } }, select: { id: true, ref: true, status: true, pickedAt: true } });
  let fixed = 0;
  for (let i = 0; i <= days; i += 1) {
    const date = addDays(today(), -i);
    const { dir, files } = folderState(date);
    const why: Record<string, string> = {};
    for (const f of files) if (f.endsWith('.rejected')) why[f.slice(0, -9)] = readFileSync(join(dir, f), 'utf8').replace(/^\S+\s/, '').trim().slice(0, 500);
    for (const fx of ledgerFixes(rows.filter((r) => r.status === 'PICKED'), files, why)) {
      const when = fx.status === 'CLEAN' ? new Date(statSync(join(dir, `${fx.ref}.mp4`)).mtimeMs) : new Date();
      const data = fx.status === 'CLEAN' ? { status: 'CLEAN', cleanAt: when, reason: 'settled from the day folder (the write was lost)' } : { status: 'REJECTED', reason: fx.reason ?? 'rejected (settled from the day folder)' };
      await db.tikTokPost.update({ where: { id: fx.id }, data, select: { id: true } });
      const row = rows.find((r) => r.id === fx.id);
      if (row) row.status = fx.status;
      console.log(`  ✔ ${fx.ref} → ${fx.status} (${date})`);
      fixed += 1;
    }
  }
  return fixed;
}

/**
 * tt:buffer — what the evening does for tomorrow. Settles lost ledger rows, then (once today has three rendered
 * and waiting, or no home left to render) picks tomorrow's queue up to the floor of three, renders the missing clean videos into
 * tomorrow's folder (the morning slot posts them first), and at 21:00 Kigali or later posts one line to #mkan
 * if fewer than three are ready (once a day). --plan shows the plan and changes nothing.
 */
async function buffer(): Promise<void> {
  const plan = flag('plan');
  if (!plan) await reconcile().catch((e) => console.warn(`  ! ledger settle: ${errorText(e).slice(0, 120)}`));
  const date = today();
  const tomorrow = addDays(date, 1);
  const minute = kigaliMinute();
  const now = folderState(date);
  const gap = nextSlotGap(minute);
  const tmr = folderState(tomorrow);
  let p = bufferPlan({ live: tmr.pieces.total, ready: tmr.pieces.ready.length }, { todo: now.pieces.todo.length, ready: now.pieces.ready.length }, minute, gap);
  console.log(`buffer ${clock(minute)} — tomorrow ${tomorrow}: ${tmr.pieces.ready.length} of ${BUFFER_READY} ready, ${tmr.pieces.total} queued · today ${now.pieces.todo.length} still to render, ${now.pieces.ready.length} ready → ${p.pick ? 'pick, ' : ''}render ${p.render}${p.alert ? ', ALERT' : ''}`);
  if (plan) return;
  if (p.pick || (p.render > 0 && tmr.pieces.todo.length < p.render)) {
    dateOverride = tomorrow;
    try {
      await pick();
    } finally {
      dateOverride = null;
    }
    const again = folderState(tomorrow);
    p = bufferPlan({ live: again.pieces.total, ready: again.pieces.ready.length }, { todo: now.pieces.todo.length, ready: now.pieces.ready.length }, minute, gap);
  }
  if (p.render > 0) {
    const { queue, pieces } = folderState(tomorrow);
    const todo = new Set(pieces.todo);
    const rows = queue.filter((r) => todo.has(refOf(r)));
    dateOverride = tomorrow;
    try {
      const outs = await render(rows, p.render);
      console.log(`  buffer: ${outs.length} rendered for ${tomorrow}`);
    } finally {
      dateOverride = null;
    }
  }
  const after = folderState(tomorrow).pieces;
  const q = bufferPlan({ live: after.total, ready: after.ready.length }, { todo: now.pieces.todo.length, ready: now.pieces.ready.length }, minute, gap);
  const marker = join(DATA, `.shortfall-${tomorrow}`);
  if (q.alert && !existsSync(marker)) {
    writeFileSync(marker, new Date().toISOString());
    await postToMkan(shortfallLine(PAGE, tomorrow, after.ready.length, after.total, stalledToday(date)));
  }
  console.log(`buffer done — ${after.ready.length} of ${BUFFER_READY} ready for ${tomorrow}`);
}

// ── card ─────────────────────────────────────────────────────────────────────
async function cdnCopy(path: string, name: string, contentType = 'video/mp4'): Promise<string | null> {
  try {
    const s3 = await import('@/lib/s3');
    if (!s3.isS3Configured()) return null;
    const ns = process.env.NEXT_PUBLIC_CDN_NAMESPACE?.trim() || 'mkan';
    return await s3.putObject({ key: `${ns}/uploads/tiktok-post/${name}`, body: readFileSync(path), contentType, cacheControl: 'public, max-age=31536000, immutable' });
  } catch (e) {
    console.warn(`  ! CDN copy: ${(e as Error).message}`);
    return null;
  }
}

async function card(): Promise<number> {
  const rows = readQueue();
  let sent = 0;
  for (const r of rows) {
    const ref = refOf(r);
    const mp4 = join(dayDir(), `${ref}.mp4`);
    if (!existsSync(mp4)) continue;
    const caption = readFileSync(join(dayDir(), `${ref}.txt`), 'utf8');
    // tt:upload posts this same file at the end of the run: the card is for a look, never a second post.
    const comment = [
      `🎬 *TikTok @${PAGE}* — ${ref} (#${r.id})`,
      'Queued for the automatic upload: tt:upload posts it to the page with this caption at the end of the run. Nothing to post by hand.',
      '```',
      caption,
      '```',
    ].join('\n');
    if (await uploadToMkan(mp4, comment, { title: `${ref}.mp4` })) {
      sent += 1;
      continue;
    }
    // No `files:write` on the bot (or Slack refused): put the clip on the CDN and post the link.
    const url = await cdnCopy(mp4, `${argv('date', today())}/${ref}.mp4`);
    if (url && (await postToMkan(`${comment.split('\n')[0]}\n▶️ ${url}\n${comment.split('\n').slice(1).join('\n')}`))) sent += 1;
  }
  console.log(`📤 ${sent}/${rows.length} videos sent to #mkan`);
  return sent;
}

// ── posted / stats ───────────────────────────────────────────────────────────
function posted(): void {
  const [, ref, url] = positional;
  if (!ref) throw new Error('usage: tt:posted <ref> [tiktok url]');
  const ledger = loadLedger();
  const e = ledger[ref];
  if (!e) throw new Error(`${ref} was never queued — check the ref on the Slack card`);
  ledger[ref] = { ...e, postedAt: new Date().toISOString(), url: url ?? e.url };
  saveLedger(ledger);
  console.log(`✅ ${ref} posted${url ? ` — ${url}` : ''}; rests ${30} days`);
}


/** yt-dlp's read of the page, retried with backoff: a waking Mac has failed DNS for tiktok.com (11-02). */
async function readPage(target: string): Promise<string> {
  const waits = [0, 20_000, 60_000, 180_000];
  let last: unknown;
  for (const [i, wait] of waits.entries()) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      return execFileSync('yt-dlp', ['--no-warnings', '--socket-timeout', '30', '--retries', '3', '--flat-playlist', '-J', '--playlist-end', '60', target], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 180_000, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      last = e;
      console.warn(`  … page read ${i + 1}/${waits.length} failed: ${firstLine(e)}`);
    }
  }
  throw new Error(`yt-dlp could not read @${PAGE} after ${waits.length} tries: ${firstLine(last)}`);
}

/**
 * The page itself — followers, total likes, video count — read from its own profile in the
 * signed-in session Chrome the uploader drives (a plain fetch meets TikTok's bot wall). Null when
 * that Chrome is not up; the rest of the stats still run.
 */
async function pageProfile(): Promise<{ followers: number; hearts: number; videoCount: number } | null> {
  const cdp = process.env.TIKTOK_CDP_URL ?? 'http://127.0.0.1:9222';
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.connectOverCDP(cdp, { timeout: 15_000 });
    const page = await browser.contexts()[0]!.newPage();
    try {
      await page.goto(`https://www.tiktok.com/@${PAGE}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForTimeout(3_000);
      const s = await page.evaluate(() => {
        const el = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
        const d = el ? (JSON.parse(el.textContent ?? '{}') as Record<string, Record<string, { userInfo?: { stats?: Record<string, number> } }>>) : {};
        return d.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo?.stats ?? null;
      });
      return s ? { followers: Number(s.followerCount ?? 0), hearts: Number(s.heartCount ?? s.heart ?? 0), videoCount: Number(s.videoCount ?? 0) } : null;
    } finally {
      await page.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  } catch (err) {
    console.warn(`  ! page profile not read (${(err as Error).message.slice(0, 120)})`);
    return null;
  }
}

/**
 * Per-post numbers TikTok Studio shows and the public feed does not: saves, average watch time,
 * completion. Read only: one tab in the signed-in Chrome opens each recent post's analytics page and
 * listens to the JSON it loads (never clicks, posts, replies or pins). Empty when that Chrome is not
 * up, or when Studio answers in a shape parseStudioMetrics does not know; the rest of the stats run.
 */
async function studioNumbers(ids: string[]): Promise<Map<string, StudioMetrics>> {
  const out = new Map<string, StudioMetrics>();
  if (!ids.length) return out;
  const cdp = process.env.TIKTOK_CDP_URL ?? 'http://127.0.0.1:9222';
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.connectOverCDP(cdp, { timeout: 15_000 });
    const page = await browser.contexts()[0]!.newPage();
    try {
      for (const id of ids) {
        const payloads: unknown[] = [];
        const watch = async (res: import('playwright').Response): Promise<void> => {
          if (!/tiktokstudio|analytics|aweme\/v\d\/data/i.test(res.url()) || !(res.headers()['content-type'] ?? '').includes('json')) return;
          payloads.push(await res.json().catch(() => null));
        };
        page.on('response', watch);
        try {
          await page.goto(`https://www.tiktok.com/tiktokstudio/analytics/${id}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
          await page.waitForTimeout(6_000);
        } catch (e) {
          console.warn(`  ! Studio ${id}: ${firstLine(e)}`);
        } finally {
          page.off('response', watch);
        }
        const m = parseStudioMetrics(payloads);
        if (Object.keys(m).length) out.set(id, m);
      }
    } finally {
      await page.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  } catch (err) {
    console.warn(`  ! Studio numbers not read (${(err as Error).message.slice(0, 120)})`);
  }
  return out;
}

async function stats(): Promise<void> {
  const secUid = (process.env.TIKTOK_PAGE_SECUID ?? '').trim();
  const target = secUid ? `tiktokuser:${secUid}` : `https://www.tiktok.com/@${PAGE}`;
  const raw = await readPage(target);
  const entries = ((JSON.parse(raw) as { entries?: Record<string, unknown>[] }).entries ?? []);
  const ledger = loadLedger();
  let matched = 0;
  let rows = 0;
  // Studio's extras for the posts of the last 7 days (the public feed has views, likes, comments, shares).
  const weekAgo = Date.now() - 7 * 86_400_000;
  const studio = await studioNumbers(entries.filter((v) => Number(v.timestamp ?? 0) * 1000 >= weekAgo).map((v) => String(v.id ?? '')).filter(Boolean));
  const perPost: { ref: string; views: number; likes: number; comments: number; shares: number; saves: number }[] = [];
  for (const v of entries) {
    const ref = refInText((v.description as string) ?? (v.title as string));
    const id = String(v.id ?? '');
    const url = (v.url as string) || `https://www.tiktok.com/@${PAGE}/video/${id}`;
    const views = Number(v.view_count ?? 0);
    const likes = Number(v.like_count ?? 0);
    const at = new Date(Number(v.timestamp ?? Date.now() / 1000) * 1000);
    const st = studio.get(id) ?? {};
    const comments = Math.max(Number(v.comment_count ?? 0), st.comments ?? 0);
    const shares = Math.max(Number(v.repost_count ?? 0), st.shares ?? 0);
    const saves = st.saves ?? (v.collect_count != null ? Number(v.collect_count) : undefined);
    // The experiment marks are read from the live caption: true for posts that predate the tag too.
    const marks = captionMarks(String(v.description ?? v.title ?? ''));
    const extra = {
      comments,
      shares,
      ...(saves !== undefined ? { saves } : {}),
      ...(st.avgWatchSec !== undefined ? { avgWatchSec: st.avgWatchSec } : {}),
      ...(st.completion !== undefined ? { completion: st.completion } : {}),
    };
    // The post's TikTokPost row: by its id or URL, else the newest row for that ref
    // posted (or rendered) no later than a day before the video went up.
    if (id || ref) {
      const hit = await ledgerRow('stats', async (db) => {
        const row =
          (id ? await db.tikTokPost.findFirst({ where: { OR: [{ tiktokId: id }, { tiktokUrl: url }] }, select: { id: true, postedAt: true } }) : null) ??
          (ref
            ? await db.tikTokPost.findFirst({
                where: { ref, tiktokId: null, status: { in: ['POSTED', 'CLEAN'] }, pickedAt: { lte: new Date(at.getTime() + 86_400_000) } },
                orderBy: { pickedAt: 'desc' },
                select: { id: true, postedAt: true },
              })
            : null);
        if (!row) return false;
        await db.tikTokPost.update({ where: { id: row.id }, data: { views, likes, ...extra, askFollow: marks.askFollow, waLine: marks.waLine, statsAt: new Date(), tiktokId: id || undefined, tiktokUrl: url, status: 'POSTED', postedAt: row.postedAt ?? at }, select: { id: true } });
        return true;
      });
      if (hit) rows += 1;
    }
    if (!ref || !ledger[ref]) continue;
    if (at.getTime() >= weekAgo) perPost.push({ ref, views, likes, comments, shares, saves: saves ?? 0 });
    ledger[ref] = { ...ledger[ref], postedAt: ledger[ref].postedAt ?? at.toISOString(), url, views, likes, ...extra, askFollow: marks.askFollow, ...(marks.waLine ? { waLine: marks.waLine } : {}), statsAt: new Date().toISOString() };
    matched += 1;
  }
  saveLedger(ledger);
  const live = Object.entries(ledger).filter(([, e]) => e.statsAt);
  const homeViews = live.reduce((s, [, e]) => s + (e.views ?? 0), 0);
  const vids: PageVideo[] = entries.map((v) => ({
    views: Number(v.view_count ?? 0),
    likes: Number(v.like_count ?? 0),
    at: Number(v.timestamp ?? 0) * 1000,
    text: String(v.description ?? v.title ?? ''),
  }));
  // One snapshot per run, so the page's reach has a trend (weekly in #mkan, any day by hand).
  const views = vids.reduce((s, v) => s + v.views, 0);
  const comments = entries.reduce((s, v) => s + Number(v.comment_count ?? 0), 0);
  const shares = entries.reduce((s, v) => s + Number(v.repost_count ?? 0), 0);
  const profile = await pageProfile();
  appendFileSync(
    join(DATA, 'page-stats.jsonl'),
    `${JSON.stringify({ at: new Date().toISOString(), videos: vids.length, views, likes: vids.reduce((s, v) => s + v.likes, 0), comments, shares, ...(profile ?? {}), homeVideos: matched, rows })}\n`,
  );
  const reach = await repostNumbers();
  const line = [pageStatsLine(PAGE, vids, { matched, views: homeViews }), reach].filter(Boolean).join(' · ');
  console.log(`${line}${rows ? ` · ${rows} TikTokPost rows updated` : ''}`);
  const bw = bestWorst(perPost);
  if (bw) {
    const f = (p: (typeof perPost)[number]) => `${p.ref} ${((interactionRate(p) ?? 0) * 100).toFixed(1)}% of ${p.views}`;
    console.log(`per-post interaction, last 7 days (${perPost.length} posts): best ${f(bw.best)} · worst ${f(bw.worst)}`);
  }
  if (flag('notify')) await postToMkan(line);
}

/**
 * Plan B's numbers (2026-11-07), for the review on 11-14: the broker reposts' median views, day
 * against evening and week over week (repostReach), and the chats the posts brought. A chat counts
 * when it quotes the code of a home posted in the last 7 days, or arrives from a TikTok link
 * (AgentTask.refSource tiktok / k_page, set once the owed app deploy is live). A broken query
 * leaves the part out and never stops the stats.
 */
async function repostNumbers(): Promise<string | null> {
  try {
    const { db } = await import('../../src/lib/db');
    const now = Date.now();
    const posts = await db.tikTokPost.findMany({
      where: { status: 'POSTED', brokerHandle: { not: null }, postedAt: { gte: new Date(now - 15 * 86_400_000) } },
      select: { ref: true, postedAt: true, views: true },
    });
    const reach = repostReach(posts.map((p) => ({ postedAt: p.postedAt!.getTime(), views: p.views })), now);
    const pattern = codePattern(posts.filter((p) => p.postedAt!.getTime() > now - 7 * 86_400_000).map((p) => p.ref));
    const [chats] = pattern
      ? await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "AgentTask" WHERE "createdAt" > now() - interval '7 days' AND ("refSource" IN ('tiktok', 'tiktok_bio', 'k_page') OR "messages"::text ~* ${pattern})`
      : await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "AgentTask" WHERE "createdAt" > now() - interval '7 days' AND "refSource" IN ('tiktok', 'tiktok_bio', 'k_page')`;
    return repostLine(reach, chats?.n ?? null);
  } catch (e) {
    console.warn(`  ! repost numbers not read: ${errorText(e).slice(0, 160)}`);
    return null;
  }
}


// ── ask (broker consent) ─────────────────────────────────────────────────────
async function ask(): Promise<void> {
  const client = twentyClient();
  const hosts = (await client.all('hosts', 0)).filter((h) => String(h.tiktokHandle ?? '').trim());
  const marks = argv('mark').split(',').map((s) => s.trim().replace(/^@/, '').toLowerCase()).filter(Boolean);
  if (marks.length) {
    const as = argv('as').toUpperCase();
    if (!['ASKED', 'YES', 'NO'].includes(as)) throw new Error('--as must be ASKED, YES or NO');
    for (const m of marks) {
      const h = hosts.find((x) => String(x.tiktokHandle).replace(/^@/, '').toLowerCase() === m);
      if (!h) {
        console.warn(`  ! no host with TikTok @${m}`);
        continue;
      }
      if (flag('apply')) await client.rest('PATCH', `hosts/${h.id}`, { repostConsent: as });
      console.log(`  ${flag('apply') ? '✓' : '·'} @${m} → ${as}`);
    }
    if (!flag('apply')) console.log('DRY RUN — pass --apply to write.');
    return;
  }
  const leads = await loadRows({ source: 'TIKTOK' });
  const count = new Map<string, number>();
  for (const r of leads) {
    const hs = r.hostSourceId?.replace(/^tiktok:/, '') ?? '';
    count.set(hs, (count.get(hs) ?? 0) + 1);
  }
  const rows = hosts
    .map((h) => {
      const handle = String(h.tiktokHandle).replace(/^@/, '').toLowerCase();
      const name = String(h.name ?? '').trim();
      return { handle, name: name.replace(/^@/, '').toLowerCase() === handle ? '' : name, phone: phoneOf(h.phone as Phones | null), consent: (h.repostConsent as string | null) ?? '—', lang: (h.preferredLanguage as string | null) ?? null };
    })
    .sort((a, b) => (count.get(b.handle) ?? 0) - (count.get(a.handle) ?? 0));
  console.log('Broker repost consent (homes = their leads on /find):\n');
  for (const r of rows) console.log(`  @${r.handle.padEnd(24)} ${String(count.get(r.handle) ?? 0).padStart(3)} homes  ${r.consent.padEnd(6)} ${r.phone ? waLink(r.phone) : 'no phone'}`);
  console.log(`\nThe ask:\n\n${brokerAsk('<name>', '<handle>', PAGE)}\n\nAfter sending: pnpm tt:ask --mark=<handle,…> --as=ASKED --apply   (YES / NO when they answer)`);

  // --preview: remaster one of each top broker's homes into preview/ and put it in their ask.
  if (flag('preview')) return void (await askWithPreview(rows, leads, count));

  // --slack: the tap-through list for the phone that owns the page's WhatsApp.
  // Only brokers with homes, a number, and no answer yet.
  if (flag('slack')) {
    const due = rows.filter((r) => r.phone && (count.get(r.handle) ?? 0) > 0 && r.consent !== 'YES' && r.consent !== 'NO');
    if (!due.length) return void console.log('Nobody left to ask.');
    const lines = due.map((r) => `• <${waLink(r.phone!, brokerAsk(r.name, r.handle, PAGE, r.lang))}|@${r.handle}> — ${count.get(r.handle)} homes${r.consent === 'ASKED' ? ' (asked before)' : ''}`);
    const ok = await postToMkan(
      [`📣 *Broker repost asks for TikTok @${PAGE}* — open each on the phone with WhatsApp ${whatsapp()}; the message is typed in, tap send.`, ...lines, `Then: \`pnpm tt:ask --mark=${due.map((r) => r.handle).join(',')} --as=ASKED --apply\``].join('\n'),
    );
    console.log(ok ? `Posted ${due.length} asks to #mkan.` : 'Slack post failed.');
  }
}

// ── consent (record a broker's answer, keep their videos) ────────────────────
const ARCHIVE = join(DATA, 'archive.json');
const loadArchive = (): Record<string, string> => (existsSync(ARCHIVE) ? JSON.parse(readFileSync(ARCHIVE, 'utf8')) : {});
const handlesArg = (n: string): string[] => argv(n).split(',').map((s) => s.trim().replace(/^@/, '').toLowerCase()).filter(Boolean);
const YT_DLP_MP4 = ['-q', '--no-warnings', '-f', 'b[ext=mp4]/b', '-o'];

/**
 * A broker's answer to the repost ask, recorded with where it came from (a note on
 * their Twenty host), so the page can show who agreed and how. A YES puts their
 * homes into the daily pick from the next run, and their videos are kept (see keep).
 * Under the Hermes gateway only Abdout may record one: its free model can be talked
 * into running anything, so this does not trust the caller.
 */
async function consent(): Promise<void> {
  if (argv('keep')) return void (await keep(handlesArg('keep')));
  if (flag('from-line')) return void console.log(`${(await syncLineConsent()).length} new YES from the WhatsApp line`);
  const platform = process.env.HERMES_SESSION_PLATFORM ?? '';
  const allowed = (process.env.KUN_BRIDGE_USERS ?? 'U0AQ0GLDY04').split(',');
  if (platform && !allowed.includes(process.env.HERMES_SESSION_USER_ID ?? '')) throw new Error('only Abdout can record a broker\'s consent');
  const answers = [...handlesArg('yes').map((h) => [h, 'YES'] as const), ...handlesArg('no').map((h) => [h, 'NO'] as const)];
  if (!answers.length) throw new Error('nothing to record — pass --yes=<handle,…> and/or --no=<handle,…>');
  const source = argv('source').trim();
  const apply = flag('apply');
  if (apply && !source) throw new Error('say where the answer came from: --source="WhatsApp to the phone, per Abdout 11-01"');

  const client = twentyClient();
  const hosts = (await client.all('hosts', 0)).filter((h) => String(h.tiktokHandle ?? '').trim());
  const leads = await loadRows({ source: 'TIKTOK' });
  const consented = new Set([...(await consentedHandles()), ...answers.filter(([, a]) => a === 'YES').map(([h]) => h)]);
  const kept: string[] = [];
  for (const [handle, answer] of answers) {
    const h = hosts.find((x) => String(x.tiktokHandle).replace(/^@/, '').trim().toLowerCase() === handle);
    if (!h) {
      console.warn(`  ! @${handle}: no CRM host has that TikTok handle — check the spelling (pnpm tt:ask lists them)`);
      continue;
    }
    const theirs = leads.filter((r) => brokerHandle(r.hostSourceId) === handle);
    const postable = theirs.filter((r) => !ineligibleReason(r, consented));
    if (apply) {
      await recordConsent(client, String(h.id), handle, answer, source);
      if (answer === 'YES' && postable.length) kept.push(handle);
    }
    const line =
      answer === 'YES'
        ? `${theirs.length} homes from their videos, ${postable.length} can post (the rest lack photos or a monthly price, are taken, or were posted over ${FRESH_DAYS} days ago)`
        : `${theirs.length} homes stay off the page`;
    console.log(`  ${apply ? '✓' : '·'} @${handle} → ${answer} · ${line}`);
  }
  if (!apply) return void console.log('DRY RUN — pass --apply to write.');
  if (kept.length) {
    keepInBackground(kept);
    console.log(`Keeping their videos now (on this Mac and the CDN), so a post never depends on TikTok still having them. Posts start with the next daily run (07:00).`);
  }
}

/** The answer on the host, plus a note saying where it came from — the page can always show who agreed and how. */
async function recordConsent(client: ReturnType<typeof twentyClient>, hostId: string, handle: string, answer: 'YES' | 'NO', source: string): Promise<void> {
  await client.rest('PATCH', `hosts/${hostId}`, { repostConsent: answer });
  const day = new Date().toISOString().slice(0, 10);
  try {
    const note = (await client.rest('POST', 'notes', {
      title: `Repost consent ${answer} · ${day}`,
      bodyV2: { markdown: `@${handle} answered **${answer}** to reposting their homes' TikTok videos on @${PAGE}.\n\nSource: ${source}\n\nRecorded ${day} by tt:consent.` },
    })) as { data?: { createNote?: { id?: string } } };
    const noteId = note.data?.createNote?.id;
    if (noteId) await client.rest('POST', 'noteTargets', { noteId, targetHostId: hostId });
  } catch (e) {
    console.warn(`  ! @${handle}: consent is recorded, the note is not (${(e as Error).message.slice(0, 100)})`);
  }
}

/** Downloading videos takes minutes: it runs on its own, logged to post.log. */
function keepInBackground(handles: string[]): void {
  const log = openSync(join(DATA, 'post.log'), 'a');
  spawn('pnpm', ['-s', 'tt:consent', `--keep=${handles.join(',')}`], { cwd: join(__dirname, '..', '..'), detached: true, stdio: ['ignore', log, log] }).unref();
}

/**
 * Answers to the repost ask that came in on the WhatsApp line. The line's inbox
 * (src/components/agent/broker-inbox.ts) keeps each in WaState `repost-answer:<digits>`;
 * this records a plain YES or NO on the broker's CRM host once (an unclear one waits
 * for a person). Runs at the start of every pick, and as `tt:consent --from-line`.
 */
async function syncLineConsent(): Promise<string[]> {
  const { db } = await import('../../src/lib/db');
  const rows = await db.waState.findMany({ where: { key: { startsWith: 'repost-answer:' } }, select: { key: true, value: true } });
  const doneFile = join(DATA, 'consent-from-line.json');
  const done: Record<string, string> = existsSync(doneFile) ? JSON.parse(readFileSync(doneFile, 'utf8')) : {};
  const fresh = rows
    .map((r) => ({ digits: r.key.slice('repost-answer:'.length), v: r.value as { answer?: 'YES' | 'NO' | null; text?: string; at?: string } | null }))
    .filter((r) => r.v?.answer && r.v.at && !done[`${r.digits}@${r.v.at}`]);
  if (!fresh.length) return [];
  const client = twentyClient();
  const hosts = await client.all('hosts', 0);
  const handleOf = (h: Record<string, unknown> | undefined) => String(h?.tiktokHandle ?? '').replace(/^@/, '').trim().toLowerCase();
  const yes: string[] = [];
  for (const { digits, v } of fresh) {
    const last9 = digits.slice(-9);
    let host = hosts.find((h) => handleOf(h) && (phoneOf(h.phone as Phones | null) ?? '').replace(/\D/g, '').endsWith(last9));
    if (!host) {
      const b = await db.broker.findFirst({ where: { phones: { hasSome: [`+${digits}`, digits] } }, select: { tiktokHandle: true } });
      const bh = (b?.tiktokHandle ?? '').replace(/^@/, '').trim().toLowerCase();
      host = bh ? hosts.find((h) => handleOf(h) === bh) : undefined;
    }
    const key = `${digits}@${v!.at}`;
    if (!host) {
      console.warn(`  ! a repost answer (${v!.answer}) from …${digits.slice(-3)} has no CRM host with a TikTok handle — record it with tt:consent`);
      done[key] = 'unmatched';
      continue;
    }
    const handle = handleOf(host);
    await recordConsent(client, String(host.id), handle, v!.answer!, `WhatsApp reply on the mkan line, ${v!.at!.slice(0, 16).replace('T', ' ')} UTC: "${(v!.text ?? '').slice(0, 160)}"`);
    done[key] = new Date().toISOString();
    if (v!.answer === 'YES') yes.push(handle);
    console.log(`  ✓ @${handle} answered the repost ask on WhatsApp → ${v!.answer}`);
  }
  mkdirSync(DATA, { recursive: true });
  writeFileSync(doneFile, JSON.stringify(done, null, 2));
  if (yes.length) keepInBackground(yes);
  return yes;
}

/** The consented brokers' videos, kept: on this Mac (render's cache) and on the CDN. */
async function keep(handles: string[]): Promise<void> {
  const consented = await consentedHandles();
  const rows = (await loadRows({ source: 'TIKTOK' })).filter((r) => {
    const h = brokerHandle(r.hostSourceId);
    return !!h && handles.includes(h) && consented.has(h);
  });
  const archive = loadArchive();
  const srcDir = join(DATA, 'src');
  mkdirSync(srcDir, { recursive: true });
  let kept = 0;
  let missing = 0;
  for (const r of rows) {
    const url = brokerVideoUrl(r);
    if (!url) continue;
    const id = url.split('/').pop()!;
    const src = join(srcDir, `${id}.mp4`);
    if (!existsSync(src)) {
      try {
        execFileSync('yt-dlp', [...YT_DLP_MP4, src, url], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000 });
      } catch {
        missing += 1; // a photo post, or gone already
        continue;
      }
    }
    if (!archive[id]) {
      const cdn = await cdnCopy(src, `src/${id}.mp4`);
      if (cdn) archive[id] = cdn;
    }
    kept += 1;
  }
  mkdirSync(DATA, { recursive: true });
  writeFileSync(ARCHIVE, JSON.stringify(archive, null, 2));
  console.log(`kept ${kept} videos for @${handles.join(', @')} (${missing} photo posts or gone)`);
}

/**
 * The pitch, not just the ask: for the top `--top` brokers (default 5) with a
 * number and no answer yet, remaster their newest home that has a video into
 * preview/ (never posted — tt:upload refuses that folder), put it on the CDN
 * unlisted, and post the prefilled wa.me asks carrying the link to #mkan.
 */
async function askWithPreview(rows: { handle: string; name: string; phone: string | null; consent: string; lang: string | null }[], leads: PostRow[], count: Map<string, number>): Promise<void> {
  const top = Number(argv('top', '5')) || 5;
  const due = rows.filter((r) => r.phone && (count.get(r.handle) ?? 0) > 0 && r.consent !== 'YES' && r.consent !== 'NO').slice(0, top);
  const dir = join(DATA, 'preview');
  mkdirSync(dir, { recursive: true });
  const lines: string[] = [];
  for (const b of due) {
    const theirs = leads.filter((r) => r.hostSourceId?.replace(/^tiktok:/, '').toLowerCase() === b.handle && brokerVideoUrl(r)).sort((a, z) => z.id - a.id);
    if (!theirs.length) {
      console.warn(`  ! @${b.handle}: no home with a video — plain ask instead`);
      lines.push(`• <${waLink(b.phone!, brokerAsk(b.name, b.handle, PAGE, b.lang))}|@${b.handle}> — ${count.get(b.handle)} homes (no video to remaster)`);
      continue;
    }
    let made: { ref: string; url: string } | null = null;
    for (const r of theirs.slice(0, 3)) {
      try {
        // A rerun after a dropped connection reuses the remaster already on disk (~15 min each).
        const done = join(dir, `${refOf(r)}.mp4`);
        const out = existsSync(done) && !flag('rerender') ? done : (await renderOne(r, dir, whatsapp())).out;
        const url = await cdnCopy(out, `preview/${b.handle}-${refOf(r)}.mp4`);
        if (url) {
          made = { ref: refOf(r), url };
          break;
        }
      } catch (e) {
        console.warn(`  ! @${b.handle} ${refOf(r)}: ${(e as Error).message}`);
      }
    }
    if (!made) {
      lines.push(`• <${waLink(b.phone!, brokerAsk(b.name, b.handle, PAGE, b.lang))}|@${b.handle}> — ${count.get(b.handle)} homes (remaster failed)`);
      continue;
    }
    console.log(`  🎬 @${b.handle}: ${made.ref} → ${made.url}`);
    lines.push(`• <${waLink(b.phone!, brokerPreviewAsk(b.name, b.handle, PAGE, made.url, b.lang))}|@${b.handle}> — ${count.get(b.handle)} homes · preview <${made.url}|${made.ref}>`);
  }
  if (!lines.length) return void console.log('Nobody left to ask.');
  const ok = await postToMkan(
    [`📣 *Broker asks with their own home remastered* — open each on the phone with WhatsApp ${whatsapp()}; the message and the preview link are typed in, tap send. Nothing is posted until they reply YES.`, ...lines, `Then: \`pnpm tt:ask --mark=${due.map((r) => r.handle).join(',')} --as=ASKED --apply\``].join('\n'),
  );
  console.log(ok ? `Posted ${lines.length} preview asks to #mkan.` : 'Slack post failed.');
}


// ── main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  switch (cmd) {
    case 'pick':
      await pick();
      break;
    case 'render':
      await render();
      break;
    case 'card':
      await card();
      break;
    case 'buffer':
      await buffer();
      break;
    case 'reconcile':
      console.log(`${await reconcile()} ledger row(s) settled`);
      break;
    case 'run': {
      // One post per home, each its own video and caption. No bundles.
      // --slot (the 07:00 tick): render only what the first slot posts; each later slot renders its own.
      // --dry: render into dry/, no queue, no Slack card, no run record, no TikTokPost rows.
      const dry = flag('dry');
      const slot = flag('slot') && !dry;
      try {
        const picked = await pick();
        const queued = slot ? readQueue().length : picked.length;
        const outs = slot ? await render() : picked.length ? await render(picked) : [];
        if (dry) {
          console.log(`dry run: ${picked.length} picked, ${outs.length} rendered → ${join(DATA, 'dry', argv('date', today()))} (nothing queued, sent or posted)`);
          break;
        }
        const sent = outs.length ? await card() : 0;
        if (!queued && flag('notify')) await postToMkan(`🎬 TikTok @${PAGE}: nothing to post today — brokers to ask: \`pnpm tt:ask\``);
        const later = slot ? ` · the rest render in the day's slots` : '';
        await recordRun('tiktok-post', renderFailures === 0, `${picked.length} picked (${queued} in today's queue), ${outs.length} rendered, ${renderFailures} failed, ${sent} sent${later}`);
      } catch (e) {
        if (!dry) await recordRun('tiktok-post', false, (e as Error).message);
        throw e;
      }
      break;
    }
    case 'posted':
      posted();
      break;
    case 'stats':
      await stats();
      break;
    case 'ask':
      refuseUnattended('asking brokers on TikTok');
      await ask();
      break;
    case 'consent':
      refuseUnattended('asking brokers for consent');
      await consent();
      break;
    default:
      console.log(readFileSync(__filename, 'utf8').split('*/')[0]);
  }
}

main()
  .then(async () => {
    if (['pick', 'render', 'run', 'ask', 'consent', 'stats', 'buffer', 'reconcile'].includes(cmd)) await (await import('../../src/lib/db')).db.$disconnect();
  })
  .catch((e) => {
    console.error(`\n❌ ${errorText(e)}\n`);
    process.exit(1);
  });
