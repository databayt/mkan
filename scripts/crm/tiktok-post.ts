/**
 * mkan's own Kigali TikTok page — the daily video queue.
 *
 *   pnpm tt:run                     pick → render → card (the 07:00 launchd tick)
 *   pnpm tt:pick [--n=3] [--dry]    choose today's homes → .data/tiktok-post/<date>/queue.json
 *   pnpm tt:render [--id=5771] [--slideshow]   9:16 branded video per queued home (or one listing, for a look):
 *                                   the broker's own video enhanced, else a photo slideshow
 *   pnpm tt:card                    upload each video + its caption to Slack #mkan
 *   pnpm tt:posted <ref> <url>      the poster's receipt: the home rests 30 days
 *   pnpm tt:stats [--notify]        views / likes of our posts, read back by yt-dlp
 *   pnpm tt:ask [--mark=a,b --as=ASKED|YES|NO --apply]   broker repost consent
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
import { join } from 'node:path';
import sharp from 'sharp';
import { postToMkan, recordRun, uploadToMkan } from './notify';
import { twentyClient, phoneOf, type Phones } from './twenty-rest';
import {
  brandTimeline,
  brokerAsk,
  brokerHandle,
  brokerVideoUrl,
  captionFor,
  cornerSvg,
  endCardSvg,
  H,
  ineligibleReason,
  MAX_SLIDES,
  lowerThirdSvg,
  pillSvg,
  stingSvg,
  pickToday,
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

/**
 * The broker's own video, enhanced: stabilised, lightly denoised, graded,
 * sharpened, framed to 9:16 (a landscape clip sits on a blurred fill instead of
 * losing its sides) and muted — the poster adds a trending sound in the app.
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
  const grade = 'hqdn3d=1.5:1.5:6:6,eq=contrast=1.04:saturation=1.08,unsharp=5:5:0.5:5:5:0';
  let stab = '';
  if (hasFilter('vidstabdetect')) {
    const trf = join(work, 'shake.trf');
    ffmpeg(['-t', String(dur), '-i', src, '-vf', `vidstabdetect=shakiness=5:accuracy=15:result=${trf}`, '-f', 'null', '-']);
    stab = `vidstabtransform=input=${trf}:smoothing=20:optzoom=1,`;
  }
  const frame =
    info.w > info.h
      ? // landscape: blurred cover behind, the whole frame in front
        `split[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=40,eq=brightness=-0.06[bg];[b]scale=${W}:-2:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`
      : `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H}`;
  ffmpeg(['-t', String(dur), '-i', src, '-filter_complex', `[0:v]${stab}${grade},${frame},fps=30,setsar=1,format=yuv420p[v]`, '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', out]);
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
    const mezz = await brandPass(r, body, work, phone);

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
      ffmpeg(['-i', mezz, '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-profile:v', 'high', '-maxrate', '8M', '-bufsize', '16M', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', out]);
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
  const rows = id ? await loadRows({ id }) : readQueue();
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
async function cdnCopy(path: string, name: string): Promise<string | null> {
  try {
    const s3 = await import('@/lib/s3');
    if (!s3.isS3Configured()) return null;
    const ns = process.env.NEXT_PUBLIC_CDN_NAMESPACE?.trim() || 'mkan';
    return await s3.putObject({ key: `${ns}/uploads/tiktok-post/${name}`, body: readFileSync(path), contentType: 'video/mp4', cacheControl: 'public, max-age=31536000, immutable' });
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
    case 'run': {
      try {
        const picked = await pick();
        const outs = picked.length ? await render() : [];
        const sent = outs.length ? await card() : 0;
        if (!picked.length && flag('notify')) await postToMkan(`🎬 TikTok @${PAGE}: no home ready to post today — brokers to ask: \`pnpm tt:ask\``);
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
