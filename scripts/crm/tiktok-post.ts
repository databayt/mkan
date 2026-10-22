/**
 * mkan's own Kigali TikTok page — the daily video queue.
 *
 *   pnpm tt:run                     pick → render → card, then the carousel (the 07:00 launchd tick)
 *   pnpm tt:pick [--n=3] [--dry]    choose today's homes → .data/tiktok-post/<date>/queue.json
 *   pnpm tt:render [--id=5771] [--slideshow]   9:16 branded video per queued home (or one listing, for a look):
 *                                   the broker's own video enhanced, else a photo slideshow
 *   pnpm tt:carousel [--dry]        today's data carousel (facts only, any home) → slides + caption
 *   pnpm tt:datavideo [--notify]    the carousel as a picture video: photos on the beat of mkan's track, no voice
 *   pnpm tt:card                    upload each video + its caption to Slack #mkan
 *   pnpm tt:posted <ref> <url>      the poster's receipt: the home rests 30 days
 *   pnpm tt:stats [--notify]        views / likes of our posts, read back by yt-dlp
 *   pnpm tt:ask [--mark=a,b --as=ASKED|YES|NO --apply]   broker repost consent
 *   pnpm tt:ask --preview [--top=5]  remaster one home per top broker (preview/, never posted) and post the asks with it
 *
 * The page runs the way Kigali brokers run theirs: the WhatsApp number in the
 * bio, one short video per house, the price and area on screen.
 * The pipeline makes the video and the caption; a person posts it from the
 * phone and adds a trending sound in the TikTok app (posting through TikTok's
 * API stays private until an app audit passes). Inquiries arrive on WhatsApp
 * quoting the home's ref.
 *
 * Who is on the page: monthly homes with ≥4 photos and a price — owners' and
 * field-agent homes (MANUAL), Airbnb hosts who took a monthly price, and a
 * broker's TikTok lead only once that broker said YES (Twenty host
 * `repostConsent`). For a broker lead the source is that broker's own video,
 * stabilised, graded and muted; mkan's brand (kun brand-kit.json) wraps every piece.
 *
 * Env: MKAN_KIGALI_WHATSAPP (the number on the end card and in the caption),
 * TIKTOK_PAGE_HANDLE (default mkan.rw), TIKTOK_PAGE_SECUID (when yt-dlp's
 * @handle page breaks), KUN_DIR (for the shared reel encode; default ~/kun).
 */
import { config } from 'dotenv';
config({ override: true });

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { postToMkan, recordRun, uploadToMkan } from './notify';
import { twentyClient, phoneOf, type Phones } from './twenty-rest';
import {
  brandTimeline,
  brokerAsk,
  brokerPreviewAsk,
  brokerHandle,
  brokerVideoUrl,
  beatHolds,
  captionFor,
  carouselCaption,
  carouselCoverSvg,
  carouselEndSvg,
  carouselHomeSvg,
  type CarouselTheme,
  cornerSvg,
  endCardSvg,
  H,
  ineligibleReason,
  MAX_SLIDES,
  lowerThirdSvg,
  pillSvg,
  stingSvg,
  pickCarousel,
  pickToday,
  pickStock,
  photoCoverSvg,
  photoCredits,
  photoEndSvg,
  photoHomeSvg,
  type StockPhoto,
  refInText,
  refOf,
  timeline,
  W,
  waLink,
  type Ledger,
  type PostRow,
} from './tiktok-post-pure';

const argv = (n: string, d = ''): string => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.slice(n.length + 3) : d;
};
const flag = (n: string): boolean => process.argv.includes(`--${n}`);
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const cmd = positional[0] ?? 'help';

const DATA = join(__dirname, '.data', 'tiktok-post');
const LEDGER = join(DATA, 'posted.json');
const today = (): string => new Date().toISOString().slice(0, 10);
const dayDir = (d = argv('date', today())) => join(DATA, d);
const PAGE = (process.env.TIKTOK_PAGE_HANDLE ?? '').trim().replace(/^@/, '') || 'mkan.rw';
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
  }));
}

/** Handles of brokers who said YES. Twenty down → nobody (fail closed). */
async function consentedHandles(): Promise<Set<string>> {
  try {
    const hosts = await twentyClient().all('hosts', 0);
    return new Set(hosts.filter((h) => h.repostConsent === 'YES').map((h) => String(h.tiktokHandle ?? '').replace(/^@/, '').trim().toLowerCase()).filter(Boolean));
  } catch (e) {
    console.warn(`  ! CRM unreachable (${(e as Error).message.slice(0, 80)}) — broker leads held back today`);
    return new Set();
  }
}

// ── pick ─────────────────────────────────────────────────────────────────────
async function pick(): Promise<PostRow[]> {
  const n = Number(argv('n', process.env.TIKTOK_POSTS_PER_DAY ?? '3')) || 3;
  const [rows, consented] = await Promise.all([loadRows({}), consentedHandles()]);
  const ledger = loadLedger();
  const why = new Map<string, number>();
  for (const r of rows) {
    const w = ineligibleReason(r, consented);
    if (w) why.set(w, (why.get(w) ?? 0) + 1);
  }
  const picked = pickToday(rows, ledger, consented, n);
  console.log(`Kigali monthly homes: ${rows.length} · brokers consented: ${consented.size} · held back: ${[...why].map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}`);
  for (const r of picked) console.log(`  ${refOf(r).padEnd(8)} #${r.id}  ${r.bedrooms ?? '?'}bd  RWF ${r.priceMonth}/mo  ${r.area ?? ''}, ${r.district ?? ''}  (${r.source})`);
  if (!picked.length) console.log('  nothing to post today — the pool fills when brokers say YES (tt:ask) or owners send homes');
  if (flag('dry')) return picked;
  mkdirSync(dayDir(), { recursive: true });
  writeFileSync(join(dayDir(), 'queue.json'), JSON.stringify(picked, null, 2));
  const now = new Date().toISOString();
  for (const r of picked) ledger[refOf(r)] = { ...(ledger[refOf(r)] ?? {}), listingId: r.id, district: r.district, queuedAt: now };
  saveLedger(ledger);
  return picked;
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
 * deflickered, graded to mkan's daylight look, framed to 9:16 (a landscape clip
 * sits on a blurred fill instead of losing its sides). Its own sound is dropped;
 * mkan's track goes under the whole piece in renderOne.
 * Null when there is no video to get (a photo post, a deleted video).
 */
async function videoBody(r: PostRow, work: string): Promise<{ path: string; dur: number } | null> {
  const url = brokerVideoUrl(r);
  if (!url) return null;
  const id = url.split('/').pop()!;
  const srcDir = join(DATA, 'src');
  mkdirSync(srcDir, { recursive: true });
  const src = join(srcDir, `${id}.mp4`);
  if (!existsSync(src)) {
    try {
      execFileSync('yt-dlp', ['-q', '--no-warnings', '-f', 'b[ext=mp4]/b', '-o', src, url], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000 });
    } catch (e) {
      console.warn(`  … ${refOf(r)}: no broker video (${String((e as { stderr?: string }).stderr ?? '').trim().split('\n').pop()?.slice(0, 100)}) — slideshow instead`);
      return null;
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
  ffmpeg(['-t', String(dur), '-i', input, '-filter_complex', `[0:v]${stab}${grade},${frame},fps=30,setsar=1,format=yuv420p[v]`, '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', out]);
  return { path: out, dur: probe(out)?.dur || dur };
}

/** No video: the home's photos with a slow push-in, crossfaded. */
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

/**
 * The brand pass over any body: the ivory sting, the corner mark with the
 * broker's credit fading in, the lower third sliding up, the WhatsApp end card.
 */
async function brandPass(r: PostRow, body: { path: string; dur: number }, work: string, phone: string): Promise<string> {
  const png = async (name: string, svg: string) => {
    const p = join(work, name);
    await sharp(Buffer.from(svg)).png().toFile(p);
    return p;
  };
  const [sting, corner, lower, pill, end] = await Promise.all([
    png('sting.png', stingSvg()),
    png('corner.png', cornerSvg(brokerHandle(r.hostSourceId))),
    png('lower.png', lowerThirdSvg(r)),
    png('pill.png', pillSvg(r)),
    png('end.png', endCardSvg(r, phone)),
  ]);
  const t = brandTimeline(body.dur);
  // The lower third holds 7 s, then hands over to the pill — on a short slideshow it simply stays.
  const hold = body.dur > 11;
  const f = [
    `[1:v]scale=${W * 2}:${H * 2},zoompan=z='1+0.0012*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=42:s=${W}x${H}:fps=30,setsar=1,format=yuv420p[sting]`,
    `[0:v]fps=30,setsar=1,format=yuv420p[raw]`,
    `[2:v]format=rgba,fade=in:st=0.3:d=0.4:alpha=1[corner]`,
    `[3:v]format=rgba,fade=in:st=0.7:d=0.35:alpha=1${hold ? ',fade=out:st=7:d=0.4:alpha=1' : ''}[lower]`,
    `[4:v]format=rgba,fade=in:st=7.3:d=0.4:alpha=1[pill]`,
    `[raw][corner]overlay=0:0:shortest=1[b1]`,
    `[b1][lower]overlay=x=0:y='if(lt(t,0.7),240,max(0,240-(t-0.7)*640))':eval=frame:shortest=1[b2]`,
    hold ? `[b2][pill]overlay=0:0:shortest=1,format=yuv420p[body]` : `[b2]format=yuv420p[body];[4:v]nullsink`,
    `[5:v]scale=${W}:${H},setsar=1,fps=30,format=yuv420p[end]`,
    `[sting][body]xfade=transition=fade:duration=0.35:offset=${t.bodyAt}[sb]`,
    `[sb][end]xfade=transition=fade:duration=0.35:offset=${t.endAt}[out]`,
  ];
  const mezz = join(work, 'mezz.mp4');
  ffmpeg([
    '-i', body.path,
    '-loop', '1', '-t', '1.4', '-i', sting,
    '-loop', '1', '-i', corner,
    '-loop', '1', '-i', lower,
    '-loop', '1', '-i', pill,
    '-loop', '1', '-t', '3', '-i', end,
    '-filter_complex', f.join(';'), '-map', '[out]', '-t', String(t.total), '-an',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', mezz,
  ]);
  return mezz;
}

/** One home → `<dir>/<ref>.mp4`: source (broker video, else photos) → enhance → brand → reel encode. */
async function renderOne(r: PostRow, dir: string, phone: string): Promise<string> {
  const ref = refOf(r);
  const work = join(dir, `.work-${ref}`);
  mkdirSync(work, { recursive: true });
  try {
    const video = flag('slideshow') ? null : await videoBody(r, work);
    const body = video ?? (await slideshowBody(r, work));
    console.log(`  … ${ref}: ${video ? 'broker video, enhanced' : 'photo slideshow'} (${body.dur.toFixed(1)} s)`);
    const mezz = withBed(await brandPass(r, body, work, phone), brandTimeline(body.dur).total, work);

    const out = join(dir, `${ref}.mp4`);
    const media = join(KUN, '.claude/skills/edit/scripts/media.sh');
    let encoded = false;
    if (existsSync(media)) {
      // The shared delivery profile: 1080×1920 H.264 high, BT.709 tags, faststart, 60 s cap.
      // It refuses under its disk floor (10 GiB); a 5 MB clip doesn't need that, so fall through.
      try {
        execFileSync('bash', [media, 'encode', 'reel', mezz, out], { stdio: ['ignore', 'pipe', 'pipe'] });
        encoded = true;
      } catch (e) {
        console.warn(`  … reel profile declined (${String((e as { stderr?: string }).stderr ?? '').trim().split('\n').pop()}) — encoding directly`);
      }
    }
    if (!encoded) {
      ffmpeg(['-i', mezz, '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-profile:v', 'high', '-maxrate', '8M', '-bufsize', '16M', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-c:a', 'copy', '-movflags', '+faststart', out]);
    }
    writeFileSync(join(dir, `${ref}.txt`), captionFor(r, phone));
    return out;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function render(): Promise<string[]> {
  const phone = whatsapp();
  const id = Number(argv('id', '0'));
  // --id renders any one listing for a look, eligible or not — into preview/, never the queue.
  let rows = id ? await loadRows({ id }) : readQueue();
  if (!id) {
    // The queue was written at pick time; a broker can withdraw a YES in between.
    const consented = await consentedHandles();
    const held = rows.filter((r) => r.source === 'TIKTOK' && !consented.has(brokerHandle(r.hostSourceId) ?? ''));
    for (const r of held) console.warn(`  ! ${refOf(r)}: broker has no YES on file — not rendered`);
    rows = rows.filter((r) => !held.includes(r));
  }
  if (!rows.length) {
    console.log(id ? `no Kigali monthly listing #${id}` : `queue for ${argv('date', today())} is empty — run tt:pick`);
    return [];
  }
  const dir = id ? join(DATA, 'preview') : dayDir();
  mkdirSync(dir, { recursive: true });
  const outs: string[] = [];
  for (const r of rows) {
    try {
      const out = await renderOne(r, dir, phone);
      console.log(`  🎬 ${refOf(r)} → ${out}`);
      outs.push(out);
    } catch (e) {
      console.warn(`  ! ${refOf(r)}: ${(e as Error).message}`);
    }
  }
  return outs;
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
    const comment = [
      `🎬 *TikTok @${PAGE}* — ${ref} (#${r.id})`,
      'Save the video → TikTok → add a trending sound → paste the caption → post. Then: `pnpm tt:posted ' + ref + ' <tiktok url>`',
      '```',
      caption,
      '```',
    ].join('\n');
    if (await uploadToMkan(mp4, comment, { title: `${ref}.mp4` })) {
      sent += 1;
      continue;
    }
    // No `files:write` on the bot (or Slack refused): put the clip on the CDN and post the link —
    // the phone opens it, long-presses, saves to Photos.
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

async function stats(): Promise<void> {
  const secUid = (process.env.TIKTOK_PAGE_SECUID ?? '').trim();
  const target = secUid ? `tiktokuser:${secUid}` : `https://www.tiktok.com/@${PAGE}`;
  const raw = execFileSync('yt-dlp', ['--no-warnings', '--flat-playlist', '-J', '--playlist-end', '60', target], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120_000 });
  const entries = ((JSON.parse(raw) as { entries?: Record<string, unknown>[] }).entries ?? []);
  const ledger = loadLedger();
  let matched = 0;
  for (const v of entries) {
    const ref = refInText((v.description as string) ?? (v.title as string));
    if (!ref || !ledger[ref]) continue;
    const url = (v.url as string) || `https://www.tiktok.com/@${PAGE}/video/${v.id}`;
    ledger[ref] = { ...ledger[ref], postedAt: ledger[ref].postedAt ?? new Date(Number(v.timestamp ?? Date.now() / 1000) * 1000).toISOString(), url, views: Number(v.view_count ?? 0), likes: Number(v.like_count ?? 0), statsAt: new Date().toISOString() };
    matched += 1;
  }
  saveLedger(ledger);
  const live = Object.entries(ledger).filter(([, e]) => e.statsAt);
  const views = live.reduce((s, [, e]) => s + (e.views ?? 0), 0);
  const top = [...live].sort((a, b) => (b[1].views ?? 0) - (a[1].views ?? 0)).slice(0, 3);
  const line = `📈 TikTok @${PAGE}: ${entries.length} videos on the page, ${matched} matched to homes · ${views.toLocaleString('en-US')} views total · top: ${top.map(([r, e]) => `${r} ${e.views}`).join(', ') || '—'}`;
  console.log(line);
  if (flag('notify')) await postToMkan(line);
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
      return { handle, name: name.replace(/^@/, '').toLowerCase() === handle ? '' : name, phone: phoneOf(h.phone as Phones | null), consent: (h.repostConsent as string | null) ?? '—' };
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
    const lines = due.map((r) => `• <${waLink(r.phone!, brokerAsk(r.name, r.handle, PAGE))}|@${r.handle}> — ${count.get(r.handle)} homes${r.consent === 'ASKED' ? ' (asked before)' : ''}`);
    const ok = await postToMkan(
      [`📣 *Broker repost asks for TikTok @${PAGE}* — open each on the phone with WhatsApp ${whatsapp()}; the message is typed in, tap send.`, ...lines, `Then: \`pnpm tt:ask --mark=${due.map((r) => r.handle).join(',')} --as=ASKED --apply\``].join('\n'),
    );
    console.log(ok ? `Posted ${due.length} asks to #mkan.` : 'Slack post failed.');
  }
}

/**
 * The pitch, not just the ask: for the top `--top` brokers (default 5) with a
 * number and no answer yet, remaster their newest home that has a video into
 * preview/ (never posted — tt:upload refuses that folder), put it on the CDN
 * unlisted, and post the prefilled wa.me asks carrying the link to #mkan.
 */
async function askWithPreview(rows: { handle: string; name: string; phone: string | null; consent: string }[], leads: PostRow[], count: Map<string, number>): Promise<void> {
  const top = Number(argv('top', '5')) || 5;
  const due = rows.filter((r) => r.phone && (count.get(r.handle) ?? 0) > 0 && r.consent !== 'YES' && r.consent !== 'NO').slice(0, top);
  const dir = join(DATA, 'preview');
  mkdirSync(dir, { recursive: true });
  const lines: string[] = [];
  for (const b of due) {
    const theirs = leads.filter((r) => r.hostSourceId?.replace(/^tiktok:/, '').toLowerCase() === b.handle && brokerVideoUrl(r)).sort((a, z) => z.id - a.id);
    if (!theirs.length) {
      console.warn(`  ! @${b.handle}: no home with a video — plain ask instead`);
      lines.push(`• <${waLink(b.phone!, brokerAsk(b.name, b.handle, PAGE))}|@${b.handle}> — ${count.get(b.handle)} homes (no video to remaster)`);
      continue;
    }
    let made: { ref: string; url: string } | null = null;
    for (const r of theirs.slice(0, 3)) {
      try {
        // A rerun after a dropped connection reuses the remaster already on disk (~15 min each).
        const done = join(dir, `${refOf(r)}.mp4`);
        const out = existsSync(done) && !flag('rerender') ? done : await renderOne(r, dir, whatsapp());
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
      lines.push(`• <${waLink(b.phone!, brokerAsk(b.name, b.handle, PAGE))}|@${b.handle}> — ${count.get(b.handle)} homes (remaster failed)`);
      continue;
    }
    console.log(`  🎬 @${b.handle}: ${made.ref} → ${made.url}`);
    lines.push(`• <${waLink(b.phone!, brokerPreviewAsk(b.name, b.handle, PAGE, made.url))}|@${b.handle}> — ${count.get(b.handle)} homes · preview <${made.url}|${made.ref}>`);
  }
  if (!lines.length) return void console.log('Nobody left to ask.');
  const ok = await postToMkan(
    [`📣 *Broker asks with their own home remastered* — open each on the phone with WhatsApp ${whatsapp()}; the message and the preview link are typed in, tap send. Nothing is posted until they reply YES.`, ...lines, `Then: \`pnpm tt:ask --mark=${due.map((r) => r.handle).join(',')} --as=ASKED --apply\``].join('\n'),
  );
  console.log(ok ? `Posted ${lines.length} preview asks to #mkan.` : 'Slack post failed.');
}

// ── carousel ─────────────────────────────────────────────────────────────────
const SHOWN = join(DATA, 'carousel.json');

/**
 * Today's data carousel → `<date>/carousel/<n>.jpg` + `caption.txt`: a cover,
 * one slide per home, the WhatsApp slide. Facts only, so every Kigali monthly
 * home qualifies, consent or not. --notify puts the slides on the CDN and the
 * links + caption in #mkan for the phone to post as a photo carousel.
 */
async function carousel(): Promise<string[]> {
  const phone = whatsapp();
  const rows = await loadRows({});
  const shown: Record<string, string> = existsSync(SHOWN) ? JSON.parse(readFileSync(SHOWN, 'utf8')) : {};
  const pickd = pickCarousel(rows, shown);
  if (!pickd) {
    console.log('carousel: no theme has enough homes not shown in the last 14 days');
    return [];
  }
  const { theme, homes } = pickd;
  console.log(`carousel: ${theme.title} — ${homes.map(refOf).join(', ')}`);
  if (flag('dry')) return [];
  const dir = join(dayDir(), 'carousel');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const svgs = [carouselCoverSvg(theme, homes.length), ...homes.map((r, i) => carouselHomeSvg(r, i + 1, homes.length, phone)), carouselEndSvg(phone)];
  const files: string[] = [];
  for (const [i, svg] of svgs.entries()) {
    const f = join(dir, `${i + 1}.jpg`);
    await sharp(Buffer.from(svg)).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(f);
    files.push(f);
  }
  const caption = carouselCaption(theme, homes, phone);
  writeFileSync(join(dir, 'caption.txt'), caption);
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ theme, homes }, null, 2));
  const now = new Date().toISOString();
  for (const r of homes) shown[refOf(r)] = now;
  writeFileSync(SHOWN, JSON.stringify(shown, null, 2));
  console.log(`  🖼  ${files.length} slides → ${dir}`);

  if (flag('notify')) {
    const date = argv('date', today());
    const urls: string[] = [];
    for (const [i, f] of files.entries()) {
      const u = await cdnCopy(f, `${date}/carousel-${theme.slug}-${refOf(homes[0]!)}-${i + 1}.jpg`, 'image/jpeg');
      if (u) urls.push(u);
    }
    if (urls.length === files.length) {
      await postToMkan(
        [
          `🖼 *TikTok @${PAGE} carousel — ${theme.title}* (${files.length} slides). Save each, then TikTok → + → photos, in order, add a sound, paste the caption.`,
          urls.map((u, i) => `<${u}|${i + 1}>`).join(' · '),
          '```' + caption + '```',
        ].join('\n'),
      );
    } else console.warn('  ! carousel: CDN upload incomplete — not posted to Slack');
  }
  return files;
}

// ── voiced data video ────────────────────────────────────────────────────────
const MEDIA_SH = () => join(KUN, '.claude/skills/edit/scripts/media.sh');

/**
 * mkan's track under a silent cut → `<work>/bed.mp4`: faded in and out, levelled
 * to -14 LUFS, limited below -2 dBTP (resampled to 48 kHz first, or the overs
 * come back). Every piece carries it, so TikTok gets one sound across the page.
 */
function withBed(silent: string, total: number, work: string): string {
  const bed = join(KUN, 'public/brands/mkan-bed.m4a');
  if (!existsSync(bed)) throw new Error(`no music bed at ${bed} — kun brand-kit production.mkan.audio`);
  const out = join(work, 'bed.mp4');
  ffmpeg(['-i', silent, '-stream_loop', '-1', '-i', bed, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', `afade=t=in:d=0.4,afade=t=out:st=${(total - 1.8).toFixed(2)}:d=1.8,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,alimiter=limit=0.79:level=false`, '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-t', String(total), out]);
  return out;
}

/** The delivery encode every piece shares, with the direct-encode fallback (audio is mixed and levelled upstream, so it is copied). */
function reelEncode(mezz: string, out: string): void {
  if (existsSync(MEDIA_SH())) {
    try {
      execFileSync('bash', [MEDIA_SH(), 'encode', 'reel', mezz, out], { stdio: ['ignore', 'pipe', 'pipe'] });
      return;
    } catch (e) {
      console.warn(`  … reel profile declined (${String((e as { stderr?: string }).stderr ?? '').trim().split('\n').pop()}) — encoding directly`);
    }
  }
  ffmpeg(['-i', mezz, '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-profile:v', 'high', '-maxrate', '8M', '-bufsize', '16M', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-c:a', 'copy', '-movflags', '+faststart', out]);
}

/**
 * Today's carousel as a picture video → `<date>/carousel/video.mp4`: no voice,
 * mkan's music track (kun brand-kit production.mkan.audio), every slide a
 * photograph — the home's own photo when we may post it, else a reviewed CC
 * photo of Kigali tagged "area photo" — under a transparent overlay, cut on the
 * beat. The photo drifts in; the type stays still.
 */
async function dataVideo(): Promise<string | null> {
  const dir = join(dayDir(), 'carousel');
  if (!existsSync(join(dir, 'meta.json'))) await carousel();
  if (!existsSync(join(dir, 'meta.json'))) return null;
  const { theme, homes } = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as { theme: CarouselTheme; homes: PostRow[] };
  const work = join(dir, '.video');
  mkdirSync(work, { recursive: true });

  // Pictures: a home's own photo only when it may be posted; area photos fill the rest.
  const consented = await consentedHandles();
  const own = (r: PostRow): string | null => {
    const ok = r.source !== 'TIKTOK' || consented.has(brokerHandle(r.hostSourceId) ?? '');
    return ok && r.photoUrls[0] ? r.photoUrls[0] : null;
  };
  const stockAll = (JSON.parse(readFileSync(join(__dirname, 'stock', 'kigali.json'), 'utf8')) as { photos: StockPhoto[] }).photos;
  const used = existsSync(STOCK_USED) ? (JSON.parse(readFileSync(STOCK_USED, 'utf8')) as Record<string, string>) : {};
  const ownHome = homes.map(own);
  const stock = pickStock(stockAll, used, 2 + ownHome.filter((u) => !u).length);
  let si = 0;
  const frames: { src: string; area: boolean; overlay: string }[] = [
    { src: '', area: true, overlay: '' },
    ...homes.map((r, i) => ({ src: ownHome[i] ?? '', area: !ownHome[i], overlay: '' })),
    { src: '', area: true, overlay: '' },
  ];
  for (const f of frames) if (!f.src) f.src = stock[si++]!.url;
  frames[0]!.overlay = photoCoverSvg(theme, homes.length, frames[0]!.area);
  homes.forEach((r, i) => (frames[i + 1]!.overlay = photoHomeSvg(r, i + 1, homes.length, frames[i + 1]!.area)));
  frames[frames.length - 1]!.overlay = photoEndSvg(whatsapp());

  const inputs: string[] = [];
  for (const [i, f] of frames.entries()) {
    const photo = join(work, `p${i}.jpg`);
    const buf = await fetchPhoto(f.src);
    await sharp(buf).rotate().resize(W * 2, H * 2, { fit: 'cover', position: 'attention' }).jpeg({ quality: 92 }).toFile(photo);
    const ov = join(work, `o${i}.png`);
    await sharp(Buffer.from(f.overlay)).png().toFile(ov);
    inputs.push(photo, ov);
  }

  const holds = beatHolds(homes.length);
  const FADE = 0.3;
  const starts: number[] = [];
  holds.reduce((t, h, i) => (starts.push(+t.toFixed(3)), t + h - (i < holds.length - 1 ? FADE : 0)), 0);
  const total = +(starts[starts.length - 1]! + holds[holds.length - 1]!).toFixed(3);
  const f: string[] = frames.map((_, i) => {
    const n = Math.round(holds[i]! * 30);
    return `[${2 * i}:v]zoompan=z='min(zoom+0.0009,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${n}:s=${W}x${H}:fps=30,setsar=1[z${i}];[z${i}][${2 * i + 1}:v]overlay=0:0,format=yuv420p,trim=duration=${holds[i]}[v${i}]`;
  });
  let last = 'v0';
  for (let i = 1; i < frames.length; i++) {
    f.push(`[${last}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${starts[i]}[x${i}]`);
    last = `x${i}`;
  }
  const silent = join(work, 'silent.mp4');
  ffmpeg([...inputs.flatMap((p) => ['-loop', '1', '-i', p]), '-filter_complex', f.join(';'), '-map', `[${last}]`, '-t', String(total), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', silent]);
  const mezz = withBed(silent, total, work);
  const out = join(dir, 'video.mp4');
  reelEncode(mezz, out);

  const area = frames.some((x) => x.area);
  const caption = carouselCaption(theme, homes, whatsapp()).replace(/\n\n(#)/, `\n${area ? photoCredits(stock) + '\n' : ''}🎵 Music: mkan (AI-generated)\n\n$1`);
  writeFileSync(join(dir, 'video-caption.txt'), caption);
  const at = new Date().toISOString();
  for (const p of stock) used[p.id] = at;
  writeFileSync(STOCK_USED, JSON.stringify(used, null, 2));
  rmSync(work, { recursive: true, force: true });
  console.log(`  🎬 ${theme.title} — ${total.toFixed(1)} s, ${frames.filter((x) => !x.area).length} home photos + ${stock.length} area photos → ${out}`);

  if (flag('notify')) {
    const url = await cdnCopy(out, `${argv('date', today())}/datavideo-${theme.slug}-${refOf(homes[0]!)}.mp4`);
    if (url) await postToMkan([`🎬 *TikTok @${PAGE} video — ${theme.title}* (${total.toFixed(0)} s, photos + mkan track). Posts itself at the end of this run.`, url, '```' + caption + '```'].join('\n'));
    else console.warn('  ! data video: CDN upload failed — not posted to Slack');
  }
  return out;
}

const STOCK_USED = join(DATA, 'stock-used.json');
const STOCK_CACHE = join(DATA, 'stock');

/** A photo by URL: Commons originals are cached on disk (they are big and never change). */
async function fetchPhoto(url: string): Promise<Buffer> {
  const commons = url.includes('upload.wikimedia.org');
  const cached = commons ? join(STOCK_CACHE, url.split('/').pop()!) : '';
  if (cached && existsSync(cached)) return readFileSync(cached);
  const res = await fetch(url, { headers: { 'User-Agent': 'mkan-tiktok/1.0 (https://mkan.sd; osman@databayt.org)' } });
  if (!res.ok) throw new Error(`photo ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (cached) {
    mkdirSync(STOCK_CACHE, { recursive: true });
    writeFileSync(cached, buf);
  }
  return buf;
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
    case 'carousel':
      await carousel();
      break;
    case 'datavideo':
      await dataVideo();
      break;
    case 'card':
      await card();
      break;
    case 'run': {
      try {
        const picked = await pick();
        const outs = picked.length ? await render() : [];
        const sent = outs.length ? await card() : 0;
        // The carousel goes out every day: facts only, so it never waits on a broker's YES.
        const slides = await carousel();
        // The picture video of the same carousel; a failed render costs the video, not the run.
        if (slides.length) await dataVideo().catch((e) => console.warn(`  ! data video: ${(e as Error).message}`));
        if (!picked.length && !slides.length && flag('notify')) await postToMkan(`🎬 TikTok @${PAGE}: nothing to post today — brokers to ask: \`pnpm tt:ask\``);
        await recordRun('tiktok-post', outs.length === picked.length, `${picked.length} picked, ${outs.length} rendered, ${sent} sent`);
      } catch (e) {
        await recordRun('tiktok-post', false, (e as Error).message);
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
      await ask();
      break;
    default:
      console.log(readFileSync(__filename, 'utf8').split('*/')[0]);
  }
}

main()
  .then(async () => {
    if (['pick', 'render', 'run', 'ask'].includes(cmd)) await (await import('../../src/lib/db')).db.$disconnect();
  })
  .catch((e) => {
    console.error(`\n❌ ${(e as Error).message}\n`);
    process.exit(1);
  });
