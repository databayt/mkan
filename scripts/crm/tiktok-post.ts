/**
 * mkan's own Kigali TikTok page — the daily video queue.
 *
 *   pnpm tt:run                     pick → render → card (the 07:00 launchd tick)
 *   pnpm tt:pick [--n=3] [--dry]    choose today's homes → .data/tiktok-post/<date>/queue.json
 *   pnpm tt:render [--id=5771]      9:16 slideshow per queued home (or one listing, for a look)
 *   pnpm tt:card                    upload each video + its caption to Slack #mkan
 *   pnpm tt:posted <ref> <url>      the poster's receipt: the home rests 30 days
 *   pnpm tt:stats [--notify]        views / likes of our posts, read back by yt-dlp
 *   pnpm tt:ask [--mark=a,b --as=ASKED|YES|NO --apply]   broker repost consent
 *
 * The page runs the way Kigali brokers run theirs: a business account with the
 * WhatsApp button, one short video per house, the price and area on screen.
 * The pipeline makes the video and the caption; a person posts it from the
 * phone and adds a trending sound in the TikTok app (posting through TikTok's
 * API stays private until an app audit passes). Inquiries arrive on WhatsApp
 * quoting the home's ref.
 *
 * Who is on the page: monthly homes with ≥4 photos and a price — owners' and
 * field-agent homes (MANUAL), Airbnb hosts who took a monthly price, and a
 * broker's TikTok lead only once that broker said YES (Twenty host
 * `repostConsent`). The frames are cut from the broker's own video.
 *
 * Env: MKAN_KIGALI_WHATSAPP (the number on the end card and in the caption),
 * TIKTOK_PAGE_HANDLE (default mkan), TIKTOK_PAGE_SECUID (when yt-dlp's
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
  brokerAsk,
  captionFor,
  endCardSvg,
  H,
  ineligibleReason,
  MAX_SLIDES,
  overlaySvg,
  pickToday,
  refInText,
  refOf,
  timeline,
  W,
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
const PAGE = (process.env.TIKTOK_PAGE_HANDLE ?? '').trim().replace(/^@/, '') || 'mkan';
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
function ffmpeg(args: string[]): void {
  try {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
  } catch (e) {
    throw new Error(`ffmpeg: ${String((e as { stderr?: string }).stderr ?? (e as Error).message).trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/** One home → `<dir>/<ref>.mp4`, ~16 s: photos with a slow push-in, the overlay, the end card. */
async function renderOne(r: PostRow, dir: string, phone: string): Promise<string> {
  const ref = refOf(r);
  const work = join(dir, `.work-${ref}`);
  mkdirSync(work, { recursive: true });
  try {
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
    const overlay = join(work, 'overlay.png');
    const end = join(work, 'end.png');
    await sharp(Buffer.from(overlaySvg(r))).png().toFile(overlay);
    await sharp(Buffer.from(endCardSvg(r, phone))).png().toFile(end);

    const SLIDE = 2.6;
    const FADE = 0.4;
    const t = timeline(slides.length, SLIDE, FADE);
    const frames = Math.round(SLIDE * 30);
    const inputs = slides.flatMap((s) => ['-i', s]);
    const f: string[] = slides.map(
      (_, i) =>
        `[${i}:v]zoompan=z='min(zoom+0.0009,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=30,setsar=1,format=yuv420p[v${i}]`,
    );
    let last = 'v0';
    t.offsets.forEach((off, i) => {
      f.push(`[${last}][v${i + 1}]xfade=transition=fade:duration=${FADE}:offset=${off}[x${i + 1}]`);
      last = `x${i + 1}`;
    });
    const ovIdx = slides.length;
    const endIdx = slides.length + 1;
    f.push(`[${ovIdx}:v]format=rgba[ov]`, `[${last}][ov]overlay=0:0:shortest=1,format=yuv420p[body]`);
    f.push(`[${endIdx}:v]scale=${W}:${H},setsar=1,fps=30,format=yuv420p[end]`);
    f.push(`[body][end]xfade=transition=fade:duration=${FADE}:offset=${t.endOffset}[out]`);
    const mezz = join(work, 'mezz.mp4');
    ffmpeg([...inputs, '-loop', '1', '-i', overlay, '-loop', '1', '-t', '3', '-i', end, '-filter_complex', f.join(';'), '-map', '[out]', '-t', String(t.total), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', mezz]);

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
    .map((h) => ({ handle: String(h.tiktokHandle).replace(/^@/, '').toLowerCase(), name: String(h.name ?? '').trim() || String(h.tiktokHandle), phone: phoneOf(h.phone as Phones | null), consent: (h.repostConsent as string | null) ?? '—' }))
    .sort((a, b) => (count.get(b.handle) ?? 0) - (count.get(a.handle) ?? 0));
  console.log('Broker repost consent (homes = their leads on /find):\n');
  for (const r of rows) console.log(`  @${r.handle.padEnd(24)} ${String(count.get(r.handle) ?? 0).padStart(3)} homes  ${r.consent.padEnd(6)} ${r.phone ? `https://wa.me/${r.phone.replace(/\D/g, '')}` : 'no phone'}`);
  console.log(`\nThe ask (edit the name):\n\n${brokerAsk('<name>')}\n\nAfter sending: pnpm tt:ask --mark=<handle,…> --as=ASKED --apply   (YES / NO when they answer)`);
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
