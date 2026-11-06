/**
 * The mkan Kigali TikTok page's pure core — which homes go out today, what the
 * caption says, where the broker's burned-in text and logos sit on the frames,
 * and which spoken spans carry a phone number. No I/O here; the runner is
 * `tiktok-post.ts`.
 *
 * One listing → one broker video → one post (Abdout, 2026-11-05). The video
 * carries no text, logo or branding at all — the broker's are stripped and
 * nothing of mkan's is burned on; the price, the code, the WhatsApp number and
 * the broker's credit live only in the post's caption. The viewer quotes the
 * home's ref ("K5771", or the `NNNN-NN` code a listing already has) on WhatsApp.
 */

export interface PostRow {
  id: number;
  code: string | null;
  source: 'AIRBNB' | 'FACEBOOK' | 'MANUAL' | 'TIKTOK' | 'WEB' | null;
  priceMonth: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  propertyType: string | null;
  photoUrls: string[];
  /** Neighbourhood (Location.address) and district (Location.state). */
  area: string | null;
  district: string | null;
  /** The listing host's `sourceHostId` — `tiktok:<handle>` for a broker lead. */
  hostSourceId: string | null;
  /**
   * When the listing went up (ISO): its `postedDate`, else when mkan got it. A
   * broker lead's own video date beats it (see sourcePostedAt).
   */
  postedAt: string | null;
  /** Set once the home is taken or its ad or video is gone (Listing.lostAt): it never goes out again. */
  lostAt: string | null;  /** Its TikTokPost row (set at pick; carried in queue.json to render and upload). */
  postId?: string;
}

export interface LedgerEntry {
  listingId: number;
  district: string | null;
  queuedAt: string;
  postedAt?: string;
  url?: string;
  views?: number;
  likes?: number;
  statsAt?: string;
}
export type Ledger = Record<string, LedgerEntry>;

export const MIN_PHOTOS = 4;
export const MAX_SLIDES = 6;
const DAY = 86_400_000;
/** A posted home rests this long before it can go out again. */
export const REPOST_AFTER_DAYS = 30;
/** A home queued but never posted frees up after this. */
export const QUEUED_HOLD_DAYS = 3;
/** Only homes whose source post is this fresh go out: an older one is most likely rented already. */
export const FRESH_DAYS = 14;

/** What the viewer sends on WhatsApp. */
export const refOf = (r: Pick<PostRow, 'id' | 'code'>): string => r.code?.trim() || `K${r.id}`;

export const brokerHandle = (hostSourceId: string | null): string | null =>
  hostSourceId?.startsWith('tiktok:') ? hostSourceId.slice(7).toLowerCase() : null;

/**
 * When the home's source post went up, in ms. A broker lead's frames carry
 * their TikTok video's id, and a TikTok id's top 32 bits are its unix seconds
 * (tiktok-pure tiktokIdTime) — the post's own date, where the listing only
 * knows when mkan read it. Anything else: the listing's postedAt.
 */
export function sourcePostedAt(r: Pick<PostRow, 'photoUrls' | 'postedAt'>): number | null {
  const id = r.photoUrls.map((u) => u.match(/\/uploads\/tiktok\/(\d{15,20})\//)?.[1]).find(Boolean);
  const s = id ? Number(BigInt(id) >> BigInt(32)) : 0;
  if (s > 1_472_000_000) return s * 1000; // after TikTok's launch (2016-09), else not a TikTok id
  const t = r.postedAt ? Date.parse(r.postedAt) : NaN;
  return Number.isFinite(t) ? t : null;
}

/**
 * Why a home can't go on the page, or null when it can. A broker's lead needs
 * that broker's YES first — the frames are cut from their video.
 */
/**
 * Above this a "monthly rent" is a sale price read as rent: Kigali's dearest rentals sit well
 * under ~10M RWF ($7k). 11-06: K6525 posted at RWF 140,000,000/month ("140 million", a sale).
 */
export const MAX_MONTHLY_RENT = 15_000_000;

export function ineligibleReason(r: PostRow, consented: ReadonlySet<string>, now = Date.now()): string | null {
  if (r.lostAt) return 'taken, or its ad is gone';
  if (!r.priceMonth || r.priceMonth < 50_000) return 'no monthly price';
  if (r.priceMonth > MAX_MONTHLY_RENT) return 'price looks like a sale';
  if (r.photoUrls.length < MIN_PHOTOS) return `under ${MIN_PHOTOS} photos`;
  if (!r.district && !r.area) return 'no area';
  const posted = sourcePostedAt(r);
  if (posted === null) return 'no source post date';
  if (now - posted > FRESH_DAYS * DAY) return `source post over ${FRESH_DAYS} days old`;
  if (r.source === 'TIKTOK') {
    const h = brokerHandle(r.hostSourceId);
    if (!h || !consented.has(h)) return 'broker has not agreed to reposts';
    return null;
  }
  if (r.source === 'MANUAL' || r.source === 'AIRBNB') return null;
  return `source ${r.source ?? 'unknown'}`;
}

function resting(e: LedgerEntry | undefined, now: number): boolean {
  if (!e) return false;
  if (e.postedAt) return now - Date.parse(e.postedAt) < REPOST_AFTER_DAYS * DAY;
  return now - Date.parse(e.queuedAt) < QUEUED_HOLD_DAYS * DAY;
}

/**
 * Today's `n` homes: eligible, not resting, spread across districts — the
 * district posted least in the last week goes first, newest home within it,
 * and no district twice in a day while another one has homes left.
 */
export function pickToday(rows: PostRow[], ledger: Ledger, consented: ReadonlySet<string>, n: number, now = Date.now()): PostRow[] {
  const pool = rows.filter((r) => !ineligibleReason(r, consented, now) && !resting(ledger[refOf(r)], now));
  const recent = new Map<string, number>();
  for (const e of Object.values(ledger)) {
    const at = Date.parse(e.postedAt ?? e.queuedAt);
    if (now - at < 7 * DAY) recent.set(e.district ?? '', (recent.get(e.district ?? '') ?? 0) + 1);
  }
  const byDistrict = new Map<string, PostRow[]>();
  for (const r of [...pool].sort((a, b) => b.id - a.id)) {
    const d = r.district ?? '';
    byDistrict.set(d, [...(byDistrict.get(d) ?? []), r]);
  }
  const picked: PostRow[] = [];
  while (picked.length < n && byDistrict.size) {
    const order = [...byDistrict.keys()].sort((a, b) => (recent.get(a) ?? 0) - (recent.get(b) ?? 0) || a.localeCompare(b));
    for (const d of order) {
      if (picked.length >= n) break;
      const list = byDistrict.get(d)!;
      picked.push(list.shift()!);
      recent.set(d, (recent.get(d) ?? 0) + 1);
      if (!list.length) byDistrict.delete(d);
    }
  }
  return picked;
}

export const formatRwf = (n: number): string => `RWF ${Math.round(n).toLocaleString('en-US')}`;

const KIND_EN: Record<string, string> = { Apartment: 'apartment', Villa: 'villa', Townhouse: 'townhouse', Cottage: 'cottage', Rooms: 'room', Tinyhouse: 'studio' };
export const kindEn = (r: Pick<PostRow, 'propertyType'>): string => KIND_EN[r.propertyType ?? ''] ?? 'house';

export function placeLine(r: Pick<PostRow, 'area' | 'district'>): string {
  const a = r.area?.trim();
  const d = r.district?.trim();
  if (a && d && a.toLowerCase() !== d.toLowerCase()) return `${a}, ${d}`;
  return a || d || 'Kigali';
}

export function headline(r: PostRow): string {
  const beds = r.bedrooms ? `${r.bedrooms}-bedroom ` : '';
  return `${beds}${kindEn(r)} for rent`;
}

export function factsLine(r: PostRow): string {
  const parts: string[] = [];
  if (r.bedrooms) parts.push(`${r.bedrooms} bed${r.bedrooms > 1 ? 's' : ''}`);
  if (r.bathrooms) parts.push(`${r.bathrooms} bath${r.bathrooms > 1 ? 's' : ''}`);
  parts.push('monthly');
  return parts.join(' · ');
}

const tag = (s: string): string => `#${s.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

/** The text pasted under the video: English, one Kinyarwanda line, the ask, hashtags. */
export function captionFor(r: PostRow, whatsapp: string): string {
  const ref = refOf(r);
  const place = placeLine(r);
  const price = formatRwf(r.priceMonth ?? 0);
  const rooms = r.bedrooms ? ` ifite ibyumba ${r.bedrooms}` : '';
  const tags = ['kigali', 'houseforrent', 'kigalirealestate', 'inzuikodeshwa', 'rwanda', r.district ?? '', r.area ?? '']
    .filter(Boolean)
    .map(tag);
  return [
    `🏠 ${headline(r)} — ${place}`,
    `💰 ${price} / month`,
    `📲 WhatsApp ${whatsapp} — send "${ref}"`,
    `🇷🇼 Inzu ikodeshwa${rooms} i ${place} — ${price} ku kwezi. Ohereza "${ref}" kuri WhatsApp.`,
    // The broker agreed to reposts with their name on them: credited here, never on screen.
    ...(brokerHandle(r.hostSourceId) ? [`Video: @${brokerHandle(r.hostSourceId)}`] : []),
    '',
    [...new Set(tags)].join(' '),
  ].join('\n');
}

/**
 * Two blocks in the broker's language first: the ads say which (the TikTok
 * lane's brokerProfile → host.preferredLanguage). English is the second block
 * for a French or Kinyarwanda writer, Kinyarwanda for everyone else — every
 * Kigali broker reads one of the two.
 */
export function inTheirLanguage(lang: string | null | undefined, blocks: { EN: string[]; RW: string[]; FR: string[] }): string {
  const order: (keyof typeof blocks)[] = lang === 'RW' ? ['RW', 'EN'] : lang === 'FR' ? ['FR', 'EN'] : ['EN', 'RW'];
  return order.map((l) => blocks[l].join('\n')).join('\n\n');
}

/** The message asking a seed broker for repost rights — their language first, then a second one. */
export function brokerAsk(name: string, handle = '', page = '', lang?: string | null): string {
  const hi = name ? ` ${name}` : '';
  const yours = handle ? ` from @${handle}` : '';
  const zanyu = handle ? ` (@${handle})` : '';
  const ours = page ? ` (@${page})` : '';
  return inTheirLanguage(lang, {
    EN: [
      `Hello${hi} 👋 This is mkan (mkan.sd), a home-rental platform in Kigali.`,
      `We are starting a TikTok page${ours} for monthly rentals in Kigali. Can we repost your houses${yours} on it, with your name credited? When a tenant we bring rents one of yours, we share the commission with you. Reply YES and we start.`,
    ],
    RW: [
      `Muraho${hi} 👋 Turi mkan (mkan.sd), urubuga rw'ubukode bw'inzu i Kigali.`,
      `Dutangiye paji ya TikTok${ours} y'inzu zikodeshwa ku kwezi i Kigali. Mwatwemerera gushyira inzu zanyu${zanyu} kuri paji yacu, tuvuga izina ryanyu? Umukiriya tuzanye nakodesha inzu yanyu, tugabana komisiyo. Musubize YEGO dutangire.`,
    ],
    FR: [
      `Bonjour${hi} 👋 Ici mkan (mkan.sd), une plateforme de location de maisons à Kigali.`,
      `Nous lançons une page TikTok${ours} pour les locations au mois à Kigali. Pouvons-nous y republier vos maisons${zanyu}, avec votre nom ? Quand un locataire que nous amenons loue l'une d'elles, nous partageons la commission avec vous. Répondez OUI (ou YES) et nous commençons.`,
    ],
  });
}

/**
 * The ask with the pitch in it: one of the broker's own homes, cleaned by mkan
 * (sharper, steadier, every burned-in text and logo off, their own sound kept),
 * sent to them privately (an unlisted CDN link — nothing is posted). Their name
 * goes in the caption, never on the video.
 */
export function brokerPreviewAsk(name: string, handle: string, page: string, previewUrl: string, lang?: string | null): string {
  const hi = name ? ` ${name}` : '';
  const ours = page ? ` (@${page})` : '';
  return inTheirLanguage(lang, {
    EN: [
      `Hello${hi} 👋 This is mkan (mkan.sd), a home-rental platform in Kigali.`,
      `We cleaned up one of your homes from @${handle} — sharper picture, steadier, the text on screen taken off — just for you to see: ${previewUrl}`,
      `Can we post your houses like this on our TikTok page${ours} for monthly rentals, crediting you by name in the caption? When a tenant we bring rents one of yours, we share the commission with you. Reply YES and we start. Nothing is posted until you say YES.`,
    ],
    RW: [
      `Muraho${hi} 👋 Turi mkan (mkan.sd), urubuga rw'ubukode bw'inzu i Kigali.`,
      `Twatunganyije video y'inzu yanyu (@${handle}), tuyikuraho inyandiko, ngo muyirebe: ${previewUrl}`,
      `Mwatwemerera gushyira inzu zanyu kuri paji yacu ya TikTok${ours} gutya, tuvuga izina ryanyu mu nyandiko iherekeje video? Umukiriya tuzanye nakodesha inzu yanyu, tugabana komisiyo. Musubize YEGO dutangire. Nta kintu dushyiraho mutaravuga YEGO.`,
    ],
    FR: [
      `Bonjour${hi} 👋 Ici mkan (mkan.sd), une plateforme de location de maisons à Kigali.`,
      `Nous avons retravaillé une vidéo de l'une de vos maisons (@${handle}) — image plus nette, plus stable, le texte à l'écran retiré — rien que pour vous : ${previewUrl}`,
      `Pouvons-nous publier vos maisons ainsi sur notre page TikTok${ours} de locations au mois, en vous citant par votre nom dans la légende ? Quand un locataire que nous amenons loue l'une d'elles, nous partageons la commission avec vous. Répondez OUI (ou YES) et nous commençons. Rien n'est publié avant votre OUI.`,
    ],
  });
}

/** A wa.me link that opens the chat with `text` already typed — the person still taps send. */
export function waLink(phone: string, text = ''): string {
  const n = phone.replace(/\D/g, '');
  return text ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : `https://wa.me/${n}`;
}

/** The 9:16 frame every post is delivered in. */
export const W = 1080;
export const H = 1920;
/** The TikTok video a broker lead came from: its frames live at …/uploads/tiktok/<videoId>/<n>.jpg. */
export function brokerVideoUrl(r: Pick<PostRow, 'photoUrls' | 'hostSourceId'>): string | null {
  const handle = brokerHandle(r.hostSourceId);
  const id = r.photoUrls.map((u) => u.match(/\/uploads\/tiktok\/(\d{8,})\//)?.[1]).find(Boolean);
  return handle && id ? `https://www.tiktok.com/@${handle}/video/${id}` : null;
}

// ── the broker's own text, off ───────────────────────────────────────────────
//
// A broker's video carries their captions, phone number, @handle and logo
// burned in; on mkan's page those send the tenant straight to the broker. The
// remaster reads where text sits on frames sampled STRIP_FPS times a second
// (Apple Vision: ocr-frames.swift --boxes), finds the overlays that hold still
// while the scene moves (staticOverlayRegions: logos, watermarks), and wipes
// each place for as long as it is there. Nothing is put back on.

/** Frames read per second of body when looking for text. */
export const STRIP_FPS = 2;

/** One line Vision read on a frame: fractions of the frame from its top-left corner. */
export interface TextBox {
  x: number;
  y: number;
  w: number;
  h: number;
  conf: number;
  text?: string;
}
export interface TextFrame {
  t: number;
  boxes: TextBox[];
}
/** A place to wipe, in output pixels, and the seconds of body it is wiped for. */
export interface TextRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  start: number;
  end: number;
}

export interface TextRegionOpts {
  /** The frame the boxes map into (the 9:16 output). */
  width?: number;
  height?: number;
  /** Seconds between sampled frames: text seen at t may have been there since the sample before and until the next one. */
  step?: number;
  /** A little more on each side of that. */
  margin?: number;
  /** Sightings of one place this many seconds apart are one region (Vision missed the frames between). */
  gap?: number;
  /** Under this a box is a texture Vision half-read, not text. */
  minConf?: number;
  /** Boxes thinner than this many output pixels are noise. */
  minPx?: number;
  /** Past this many regions the closest merge (wiped places grow; none is dropped). */
  maxRegions?: number;
  /** The body's length: no region runs past it. */
  duration?: number;
  /** Grows every box's pad (the retry after a strip that left text: 1.6). */
  padScale?: number;
}

const vol = (r: TextRegion): number => r.w * r.h * (r.end - r.start);
const union = (a: TextRegion, b: TextRegion): TextRegion => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y, start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) };
};

/**
 * Text seen across sampled frames → the places to wipe, each with when. Every
 * box is padded (Vision's box hugs the glyphs; a caption's plate, and an emoji
 * Vision does not read, sit around them) and held from a sample before it was
 * seen to a sample after; boxes that touch while on screen merge into one. A
 * region is never dropped to stay under maxRegions — the two whose merge wipes
 * the least extra merge instead — so the cap can only grow what is wiped.
 */
export function textRegions(frames: TextFrame[], opts: TextRegionOpts = {}): TextRegion[] {
  const { width = W, height = H, step = 1 / STRIP_FPS, margin = 0.15, gap = 1, minConf = 0.3, minPx = 12, maxRegions = 32, duration = Infinity, padScale = 1 } = opts;
  const hold = step + margin;
  let regions: TextRegion[] = [];
  for (const f of frames) {
    for (const b of f.boxes) {
      const bw = b.w * width;
      const bh = b.h * height;
      if (!(b.conf >= minConf) || bh < minPx || bw < minPx) continue;
      const px = (12 + 1.5 * bh) * padScale;
      const py = (6 + 0.5 * bh) * padScale;
      // One pixel of frame stays on every side: delogo fills from the pixels around a region.
      const x0 = Math.max(1, Math.floor(b.x * width - px));
      const y0 = Math.max(1, Math.floor(b.y * height - py));
      const x1 = Math.min(width - 1, Math.ceil(b.x * width + bw + px));
      const y1 = Math.min(height - 1, Math.ceil(b.y * height + bh + py));
      // Hundredths, rounded outward (the epsilon keeps 4.35 from flooring to 4.34).
      const start = Math.max(0, Math.floor((f.t - hold) * 100 + 1e-6) / 100);
      const end = Math.min(duration, Math.ceil((f.t + hold) * 100 - 1e-6) / 100);
      if (x1 - x0 < 2 || y1 - y0 < 2 || end <= start) continue;
      regions.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, start, end });
    }
  }
  const near = (a: TextRegion, b: TextRegion): boolean =>
    a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h && a.start <= b.end + gap && b.start <= a.end + gap;
  // Merge until nothing touches: a grown region can reach one it missed before.
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i < regions.length; i++) {
      for (let j = regions.length - 1; j > i; j--) {
        if (!near(regions[i]!, regions[j]!)) continue;
        regions[i] = union(regions[i]!, regions[j]!);
        regions.splice(j, 1);
        merged = true;
        j = regions.length; // rescan against the grown region
      }
    }
  }
  while (regions.length > maxRegions) {
    let best: [number, number] = [0, 1];
    let cost = Infinity;
    for (let i = 0; i < regions.length; i++) {
      for (let j = i + 1; j < regions.length; j++) {
        const c = vol(union(regions[i]!, regions[j]!)) - vol(regions[i]!) - vol(regions[j]!);
        if (c < cost) [cost, best] = [c, [i, j]];
      }
    }
    regions[best[0]] = union(regions[best[0]]!, regions[best[1]]!);
    regions.splice(best[1], 1);
  }
  regions = regions.sort((a, b) => a.start - b.start || a.y - b.y || a.x - b.x);
  return regions;
}

/**
 * The ffmpeg graph ([0:v] → [v]) that wipes each region while text is there:
 * delogo fills it from the pixels around it, so no trace of the letters is left
 * to read, then the fill is softened (on a busy edge — a railing, stairs —
 * delogo alone leaves a plaid of streaks). `timed: false` wipes a still.
 */
export function stripGraph(regions: TextRegion[], timed = true): string {
  if (!regions.length) return '[0:v]null[v]';
  return regions
    .map((r, i) => {
      const on = timed ? `:enable='between(t,${r.start},${r.end})'` : '';
      const sigma = Math.round(Math.min(24, Math.max(6, Math.min(r.w, r.h) / 8)));
      const from = i ? `[s${i}]` : '[0:v]';
      const to = i === regions.length - 1 ? '[v]' : `[s${i + 1}]`;
      return `${from}delogo=x=${r.x}:y=${r.y}:w=${r.w}:h=${r.h}${on},split[k${i}][c${i}];[c${i}]crop=${r.w}:${r.h}:${r.x}:${r.y},gblur=sigma=${sigma}${on}[p${i}];[k${i}][p${i}]overlay=${r.x}:${r.y}${on}${to}`;
    })
    .join(';');
}

// ── full-width caption bands: cut off, not wiped ─────────────────────────────

/** A rectangle on the body frame, in output pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BandCropOpts {
  /** A region at least this share of the picture's width is a banner (the caption plate reaches the edges; Vision's box hugs the glyphs). */
  minWidth?: number;
  /** A top band starts in this top share of the picture (a bottom band ends in the bottom share). */
  edge?: number;
  /** The cut never keeps less than this share of the picture's height. */
  minKeep?: number;
}

/**
 * Where a full-width caption banner should be CUT OFF rather than wiped. On a
 * banner, delogo fills from what is above and below (11-06, K6516: black bars
 * over a photo), so a frosted block is left across the picture. A region that
 * spans the picture (`minWidth`) and starts in its top quarter (or ends in its
 * bottom quarter) is a band; the picture keeps the rows between the bands,
 * which renderOne re-fits to 9:16 (fitGraph). A cut that would keep under
 * `minKeep` of the picture drops that band (it is wiped as before). Null when
 * there is nothing to cut — every smaller box is still delogo'd.
 */
export function bandCrop(regions: TextRegion[], pic: Rect, opts: BandCropOpts = {}): { keep: Rect; top: number; bottom: number } | null {
  const { minWidth = 0.75, edge = 0.25, minKeep = 0.55 } = opts;
  const wide = regions.filter((r) => {
    const x0 = Math.max(r.x, pic.x);
    const x1 = Math.min(r.x + r.w, pic.x + pic.w);
    return x1 - x0 >= minWidth * pic.w && r.y < pic.y + pic.h && r.y + r.h > pic.y;
  });
  let top = 0; // rows cut off the picture's top
  let bottom = 0;
  for (const r of wide) {
    if (r.y <= pic.y + edge * pic.h) top = Math.max(top, r.y + r.h - pic.y);
    else if (r.y + r.h >= pic.y + (1 - edge) * pic.h) bottom = Math.max(bottom, pic.y + pic.h - r.y);
  }
  // Both cuts too much: the bigger one that fits on its own, else none (those bands are wiped as before).
  const fits = (t: number, b: number): boolean => pic.h - t - b >= minKeep * pic.h;
  if (!fits(top, bottom)) {
    const one = ([[top, 0], [0, bottom]] as const).filter(([t, b]) => (t || b) && fits(t, b)).sort((a, b) => b[0] + b[1] - a[0] - a[1])[0];
    [top, bottom] = one ? [one[0], one[1]] : [0, 0];
  }
  if (!top && !bottom) return null;
  const even = (n: number): number => Math.floor(n / 2) * 2;
  const y0 = Math.ceil((pic.y + top) / 2) * 2;
  const h = even(pic.y + pic.h - bottom - y0);
  return { keep: { x: even(pic.x), y: y0, w: even(pic.w), h }, top, bottom };
}

/**
 * How a w × h picture fills the W × H frame (an ffmpeg chain, no labels at its
 * ends): cover — scaled up and its sides cut — while that keeps at least
 * `minSide` of its width; otherwise (a landscape picture) whole, on a blurred
 * cover of itself.
 */
export function fitGraph(w: number, h: number, minSide = 0.65): string {
  const kept = W / H / (w / h);
  if (kept >= minSide) return `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H}`;
  return `split[fa][fb];[fa]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=40,eq=brightness=-0.06[fbg];[fb]scale=${W}:-2:flags=lanczos[ffg];[fbg][ffg]overlay=(W-w)/2:(H-h)/2`;
}

/** Where a w × h source sits on the body videoBody framed it into: a portrait one covers it, a landscape one is a centred strip. */
export function pictureRect(w: number, h: number): Rect {
  if (w <= h) return { x: 0, y: 0, w: W, h: H };
  const ph = Math.min(H, Math.round((W * h) / w / 2) * 2);
  return { x: 0, y: Math.round((H - ph) / 2), w: W, h: ph };
}

/**
 * Phone numbers and @handles in a line of on-screen text — what a broker's
 * video must never carry onto mkan's page. Digits split by spaces, dots or
 * dashes are joined first ("0788 123 456"); `allow` holds our own numbers.
 */
export function contactLeaks(text: string, allow: string[] = []): string[] {
  const own = new Set(allow.map((p) => p.replace(/\D/g, '').slice(-9)).filter((d) => d.length === 9));
  const joined = text
    .replace(/[Oo](?=\d{5,})|(?<=\d)[Oo]/g, '0') // Vision's O for 0 inside a number
    .replace(/(\d)[\s.\-–—()/]+(?=\+?\d)/g, '$1');
  const found = new Set<string>();
  for (const m of joined.match(/\+?\d{9,}|(?<!\d)(?:\+?250|0)7\d{5,}/g) ?? []) {
    if (!own.has(m.replace(/\D/g, '').slice(-9))) found.add(m);
  }
  for (const m of text.match(/@[a-z0-9._]{3,30}/gi) ?? []) {
    if (!/^@\d+[km]?$/i.test(m)) found.add(m); // "@600k" is a price
  }
  return [...found];
}

/**
 * The strict gate after the strip: what Vision still reads on the cleaned
 * frames. A phone number or @handle fails it at any size; any other text fails
 * it once it is a readable size (`minArea`, a fraction of the frame — 0.0012 is
 * ~100 × 25 px of 1080 × 1920) and Vision is sure of it. Smaller, unsure reads
 * on a wiped patch are the blur's texture, not text. Empty means clean.
 */
export function leftoverText(frames: TextFrame[], opts: { minConf?: number; minArea?: number; allow?: string[] } = {}): string[] {
  const { minConf = 0.5, minArea = 0.0012, allow = [] } = opts;
  const out: string[] = [];
  for (const f of frames) {
    for (const b of f.boxes) {
      const text = (b.text ?? '').trim();
      const leak = contactLeaks(text, allow);
      if (leak.length) out.push(`"${leak[0]}" at ${f.t} s`);
      else if (b.conf >= minConf && b.w * b.h >= minArea && (text.match(/[\p{L}\p{N}]/gu) ?? []).length >= 2) out.push(`"${text.slice(0, 40)}" at ${f.t} s`);
    }
  }
  return out;
}

// ── text added on top, not text in the scene (Abdout, 2026-11-06) ─────────────
//
// "Strip the text" means the text that was ADDED to the video afterwards — the broker's captions,
// prices, phone number, @handle — never text that is part of the scene: a shop sign through the
// window, a label on the fridge, a street name. Each line Vision reads is followed across the
// sampled frames: one that holds still on the screen while the camera moves was put on top; one
// that moves with the picture is in the scene and stays. Contact details and listing words are
// wiped wherever they are. With the camera still, position cannot tell them apart, so only bold,
// caption-placed text counts as added.

/** The camera moving (so something fixed on the screen was put on top), still, or too few frames to say. */
export type SceneMotion = 'moving' | 'still' | 'unknown';

/** Whether the picture moves at time t: each window's median per-pixel spread (as staticOverlayRegions reads it). */
export function sceneMotion(frames: GrayFrame[], opts: { gw: number; gh: number; window?: number; motionMin?: number }): (t: number) => SceneMotion {
  const { gw, gh, window = 8, motionMin = 6 } = opts;
  const N = gw * gh;
  if (frames.length < 4 || !N) return () => 'unknown';
  const spans: { from: number; to: number; motion: SceneMotion }[] = [];
  for (let i = 0; i < frames.length; i += window) {
    let chunk = frames.slice(i, i + window);
    if (chunk.length < 4 && spans.length) {
      // A short tail joins the window before it.
      chunk = frames.slice(Math.max(0, i - window), i + window);
      spans.pop();
    }
    if (chunk.length < 4) continue;
    const mean = new Float32Array(N);
    const sd = new Float32Array(N);
    for (const f of chunk) for (let p = 0; p < N; p++) mean[p]! += f.data[p]! / chunk.length;
    for (const f of chunk) for (let p = 0; p < N; p++) sd[p]! += (f.data[p]! - mean[p]!) ** 2 / chunk.length;
    for (let p = 0; p < N; p++) sd[p] = Math.sqrt(sd[p]!);
    const median = Float32Array.from(sd).sort()[Math.floor(N / 2)]!;
    spans.push({ from: chunk[0]!.t, to: chunk[chunk.length - 1]!.t, motion: median >= motionMin ? 'moving' : 'still' });
  }
  return (t) => spans.find((s) => t >= s.from - 0.5 && t <= s.to + 0.5)?.motion ?? 'unknown';
}

/** Words of a rental ad: a line carrying them is the broker's caption wherever it sits. */
const LISTING_TEXT =
  /\b\d+\s*(?:k|m|rwf|frw|usd|\$)\b|\$\s*\d|\b(?:rwf|frw)\b|\b(?:bed(?:room)?s?|bath(?:room)?s?|for\s+rent|to\s+let|rent|price|deposit|furnished|available|call|whatsapp|dm|inbox|contact|per\s+month|monthly|kigali|kimironko|kicukiro|gasabo|nyarugenge|remera|kacyiru|kibagabaga|gisozi|kanombe|nyarutarama|kimihurura)\b|inzu|ibyumba|icyumba|ikodeshwa|irakodeshwa|amafaranga|ukwezi/i;

const normText = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Only the text added on top of the video, as frames textRegions can wipe. A line is followed across
 * frames by its words (or, when Vision reads it differently, by where it sits and its size); it is
 * added when it carries a contact or listing words, or holds still on screen while the camera moves,
 * or — with the camera still — is bold and sits where captions sit. Text that moves with the picture,
 * or is small and ordinary in a still shot, is the scene: it stays (2026-11-06).
 */
export function addedText(frames: TextFrame[], opts: { motion: (t: number) => SceneMotion; allow?: string[]; step?: number }): TextFrame[] {
  const { motion, allow = [], step = 1 / STRIP_FPS } = opts;
  type Sighting = { fi: number; bi: number; t: number; b: TextBox };
  const tracks: Sighting[][] = [];
  const cx = (b: TextBox) => b.x + b.w / 2;
  const cy = (b: TextBox) => b.y + b.h / 2;
  const iou = (a: TextBox, b: TextBox) => {
    const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const i = x * y;
    return i / (a.w * a.h + b.w * b.h - i || 1);
  };
  frames.forEach((f, fi) =>
    f.boxes.forEach((b, bi) => {
      const key = normText(b.text ?? '');
      // The track this line continues: same words within a couple of samples, or the same place and size.
      const track = tracks.find((tr) => {
        const last = tr[tr.length - 1]!;
        if (f.t - last.t > 2.5 * step + 1e-6 || last.fi === fi) return false;
        return (key.length >= 3 && normText(last.b.text ?? '') === key) || (iou(last.b, b) > 0.5 && Math.abs(last.b.h - b.h) < 0.3 * Math.max(last.b.h, b.h));
      });
      const s = { fi, bi, t: f.t, b };
      if (track) track.push(s);
      else tracks.push([s]);
    }),
  );
  const keep = new Set<string>();
  for (const tr of tracks) {
    const texts = tr.map((s) => s.b.text ?? '').join(' ');
    let added = contactLeaks(texts, allow).length > 0 || LISTING_TEXT.test(texts);
    if (!added) {
      const moving = tr.some((s) => motion(s.t) === 'moving');
      if (moving && tr.length >= 2) {
        // Fixed on the screen while the picture moves: put on top. Moving with it: in the scene.
        let drift = 0;
        for (let i = 1; i < tr.length; i++) {
          const a = tr[i - 1]!.b;
          const b = tr[i]!.b;
          drift = Math.max(drift, Math.hypot(cx(a) - cx(b), cy(a) - cy(b)) / Math.max(a.h, b.h, 1e-6));
        }
        added = drift < 0.35;
      } else if (!moving) {
        // A still camera (or a photo): bold and where captions sit, or big — that is a caption.
        const b = tr.reduce((m, s) => (s.b.w * s.b.h > m.w * m.h ? s.b : m), tr[0]!.b);
        const sure = tr.every((s) => s.b.conf >= 0.9);
        const captionBand = b.y + b.h <= 0.25 || b.y >= 0.7;
        added = sure && (b.h >= 0.035 || (captionBand && b.w >= 0.3));
      }
      // Seen once while the camera moves: a glimpse of the scene (a caption stays on screen longer).
    }
    if (added) for (const s of tr) keep.add(`${s.fi}:${s.bi}`);
  }
  return frames.map((f, fi) => ({ t: f.t, boxes: f.boxes.filter((_, bi) => keep.has(`${fi}:${bi}`)) }));
}

/** How many lines of scene text a strip leaves on purpose (for the log). */
export const sceneTextKept = (all: TextFrame[], added: TextFrame[]) =>
  all.reduce((n, f, i) => n + f.boxes.length - (added[i]?.boxes.length ?? 0), 0);

// ── logos and watermarks: what holds still while the scene moves ─────────────

/** A sampled frame, greyscale, `gw × gh` (row-major, 0–255). */
export interface GrayFrame {
  t: number;
  data: ArrayLike<number>;
}

export interface StaticOverlayOpts {
  /** The grey grid the frames were scaled to. */
  gw: number;
  gh: number;
  /** The output frame the regions map into. */
  width?: number;
  height?: number;
  /** Frames per analysis window: a TikTok watermark jumps corners, a logo can come and go. */
  window?: number;
  /** Seconds between frames. */
  step?: number;
  duration?: number;
  /** The window's median per-pixel spread (0–255) below this = the camera is still: nothing tells a logo from the room, skip it. */
  motionMin?: number;
  /** A pixel whose spread stays under this is fixed on the screen. */
  staticMax?: number;
  /** …and counts only where the averaged image has an edge this strong (a logo's outline, a letter). */
  edgeMin?: number;
  /** Fewer fixed edge cells than this is noise. */
  minCells?: number;
  /** One region over this share of the frame is the scene, not an overlay. */
  maxRegionFrac?: number;
  /** All of a window's regions together stay under this share. */
  maxTotalFrac?: number;
  /** More than this share of the frame fixed = a still shot (a photo slideshow): skip the window. */
  maxStaticFrac?: number;
  /** Grid cells added around each region. */
  pad?: number;
  maxRegions?: number;
}

/**
 * Burned-in logos and watermarks (the broker's mark, TikTok's own) in the shape
 * textRegions returns, so both feed stripGraph. Apple Vision finds letters, not
 * marks; a mark is what stays put on screen while the picture under it moves.
 * Per window of frames: each grid cell's spread over time, and the edges of the
 * window's mean image; cells that barely change and carry an edge are the
 * overlay. Guarded against wiping the house: a window whose camera is still, or
 * that is mostly fixed, is skipped; a region over `maxRegionFrac` of the frame
 * is dropped; a window's regions stop at `maxTotalFrac` of it.
 */
export function staticOverlayRegions(frames: GrayFrame[], opts: StaticOverlayOpts): TextRegion[] {
  const {
    gw, gh, width = W, height = H, window = 8, step = 1 / STRIP_FPS, duration = Infinity,
    motionMin = 6, staticMax = 3, edgeMin = 40, minCells = 6, maxRegionFrac = 0.12, maxTotalFrac = 0.25, maxStaticFrac = 0.5, pad = 1, maxRegions = 12,
  } = opts;
  const N = gw * gh;
  if (frames.length < 4 || !N) return [];
  // Windows of `window` frames; a short tail joins the window before it.
  const chunks: GrayFrame[][] = [];
  for (let i = 0; i < frames.length; i += window) chunks.push(frames.slice(i, i + window));
  if (chunks.length > 1 && chunks[chunks.length - 1]!.length < 4) chunks[chunks.length - 2]!.push(...chunks.pop()!);

  const sx = width / gw;
  const sy = height / gh;
  let regions: TextRegion[] = [];
  chunks.forEach((chunk, ci) => {
    if (chunk.length < 4) return;
    const mean = new Float32Array(N);
    const sd = new Float32Array(N);
    for (const f of chunk) for (let p = 0; p < N; p++) mean[p]! += f.data[p]! / chunk.length;
    for (const f of chunk) for (let p = 0; p < N; p++) sd[p]! += (f.data[p]! - mean[p]!) ** 2 / chunk.length;
    for (let p = 0; p < N; p++) sd[p] = Math.sqrt(sd[p]!);
    const sorted = Float32Array.from(sd).sort();
    if (sorted[Math.floor(N / 2)]! < motionMin) return; // the camera is still
    let fixed = 0;
    for (let p = 0; p < N; p++) if (sd[p]! < staticMax) fixed++;
    if (fixed / N > maxStaticFrac) return; // mostly still: a slideshow, a tripod shot
    const mask = new Uint8Array(N);
    for (let y = 1; y < gh - 1; y++) {
      for (let x = 1; x < gw - 1; x++) {
        const p = y * gw + x;
        if (sd[p]! >= staticMax) continue;
        const g = Math.abs(mean[p + 1]! - mean[p - 1]!) + Math.abs(mean[p + gw]! - mean[p - gw]!);
        if (g > edgeMin) mask[p] = 1;
      }
    }
    // Grow by `pad` so a mark's letters join into one region.
    const grown = new Uint8Array(N);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (!mask[y * gw + x]) continue;
        for (let dy = -pad; dy <= pad; dy++) for (let dx = -pad; dx <= pad; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) grown[yy * gw + xx] = 1;
        }
      }
    }
    const seen = new Uint8Array(N);
    const found: { x0: number; y0: number; x1: number; y1: number; cells: number }[] = [];
    for (let s = 0; s < N; s++) {
      if (!grown[s] || seen[s]) continue;
      const stack = [s];
      seen[s] = 1;
      let x0 = gw, y0 = gh, x1 = -1, y1 = -1, cells = 0;
      while (stack.length) {
        const p = stack.pop()!;
        const x = p % gw;
        const y = (p - x) / gw;
        if (mask[p]) cells++;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy < 0 || yy >= gh || xx < 0 || xx >= gw) continue;
          const q = yy * gw + xx;
          if (grown[q] && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
      const bw = x1 - x0 + 1;
      const bh = y1 - y0 + 1;
      if (cells < minCells || bw < 3 || bh < 2) continue;
      if (bw / bh > 25 || bh / bw > 25) continue; // a line: a frame edge, not a mark
      if ((bw * bh) / N > maxRegionFrac) continue;
      found.push({ x0, y0, x1, y1, cells });
    }
    found.sort((a, b) => b.cells - a.cells);
    let total = 0;
    const first = chunk[0]!.t;
    const last = chunk[chunk.length - 1]!.t;
    const start = Math.max(0, Math.floor((first - step) * 100 + 1e-6) / 100);
    const end = ci === chunks.length - 1 && Number.isFinite(duration) ? duration : Math.min(duration, Math.ceil((last + step) * 100 - 1e-6) / 100);
    for (const c of found) {
      const area = ((c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1)) / N;
      if (total + area > maxTotalFrac) continue;
      total += area;
      const x0 = Math.max(1, Math.floor(c.x0 * sx));
      const y0 = Math.max(1, Math.floor(c.y0 * sy));
      const x1 = Math.min(width - 1, Math.ceil((c.x1 + 1) * sx));
      const y1 = Math.min(height - 1, Math.ceil((c.y1 + 1) * sy));
      if (x1 - x0 >= 2 && y1 - y0 >= 2 && end > start) regions.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, start, end });
    }
  });
  // One mark across windows is one region.
  const overlap = (a: TextRegion, b: TextRegion): boolean => {
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return ix * iy > 0.3 * Math.min(a.w * a.h, b.w * b.h) && a.start <= b.end + step && b.start <= a.end + step;
  };
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i < regions.length && !merged; i++) {
      for (let j = i + 1; j < regions.length; j++) {
        if (!overlap(regions[i]!, regions[j]!)) continue;
        regions[i] = union(regions[i]!, regions[j]!);
        regions.splice(j, 1);
        merged = true;
        break;
      }
    }
  }
  regions = regions.sort((a, b) => vol(b) - vol(a)).slice(0, maxRegions);
  return regions.sort((a, b) => a.start - b.start || a.y - b.y || a.x - b.x);
}

// ── the broker's voice: kept, with spoken numbers muted ──────────────────────

/** One word of a local Whisper transcript (mlx_whisper --word-timestamps). */
export interface SpokenWord {
  word: string;
  start: number;
  end: number;
}
export interface MuteSpan {
  start: number;
  end: number;
  what: string;
}

const DIGIT_WORDS: Record<string, string> = {
  zero: '0', oh: '0', o: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  // Kinyarwanda
  zeru: '0', rimwe: '1', kabiri: '2', gatatu: '3', kane: '4', gatanu: '5', gatandatu: '6', karindwi: '7', umunani: '8', icyenda: '9',
  // French
  zéro: '0', un: '1', deux: '2', trois: '3', quatre: '4', cinq: '5', sept: '7', huit: '8', neuf: '9',
};
const REPEAT: Record<string, number> = { double: 2, triple: 3 };

/**
 * Spans of the broker's own sound that say how to reach them: a phone number
 * read out (7+ digits in a row — "0788 123 456", "zero seven eight eight…",
 * "double seven"), or an @handle. A grouped amount ("1,500,000") is a price,
 * not a number to call. Each span is padded by `pad` seconds; the runner mutes
 * them and keeps the rest of the voice.
 */
export function spokenContactSpans(words: SpokenWord[], pad = 0.25): MuteSpan[] {
  const spans: MuteSpan[] = [];
  let run: { digits: string; start: number; end: number } | null = null;
  let repeat = 1;
  const close = () => {
    if (run && run.digits.length >= 7) spans.push({ start: run.start, end: run.end, what: `number ${run.digits.slice(0, 3)}…` });
    run = null;
    repeat = 1;
  };
  for (const [i, w] of words.entries()) {
    const raw = w.word.trim();
    const t = raw.toLowerCase().replace(/^[^\p{L}\p{N}@+]+|[^\p{L}\p{N}]+$/gu, '');
    if (/@[a-z0-9._]{3,}/i.test(raw) || (t === 'at' && /^(?:follow|on|handle)$/i.test(words[i - 1]?.word.trim().replace(/\W/g, '') ?? '') && words[i + 1])) {
      close();
      const next = /@/.test(raw) ? w : words[i + 1]!;
      spans.push({ start: w.start, end: next.end, what: 'a handle' });
      continue;
    }
    if (t in REPEAT) {
      run ??= { digits: '', start: w.start, end: w.end };
      repeat = REPEAT[t]!;
      continue;
    }
    let digits = '';
    if (/^\d{1,3}(?:,\d{3})+$/.test(t)) digits = ''; // a price
    else if (/^\+?[\d\s.\-]+$/.test(t)) digits = t.replace(/\D/g, '');
    else if (t in DIGIT_WORDS) digits = DIGIT_WORDS[t]!;
    if (!digits) {
      close();
      continue;
    }
    run ??= { digits: '', start: w.start, end: w.end };
    run.digits += digits.length === 1 ? digits.repeat(repeat) : digits;
    run.end = w.end;
    repeat = 1;
  }
  close();
  // Padded, and joined where they touch.
  const out: MuteSpan[] = [];
  for (const s of spans.map((s) => ({ ...s, start: Math.max(0, +(s.start - pad).toFixed(2)), end: +(s.end + pad).toFixed(2) })).sort((a, b) => a.start - b.start)) {
    const prev = out[out.length - 1];
    if (prev && s.start <= prev.end) prev.end = Math.max(prev.end, s.end);
    else out.push(s);
  }
  return out;
}

/** The ffmpeg audio filter that silences each span; null when there is nothing to mute. */
export function muteFilter(spans: MuteSpan[]): string | null {
  return spans.length ? spans.map((s) => `volume=enable='between(t,${s.start},${s.end})':volume=0`).join(',') : null;
}

/** Render folders (`YYYY-MM-DD`) older than `keepDays` — the disk floor frees these first. */
export function oldRenderDays(names: string[], now = Date.now(), keepDays = 14): string[] {
  return names.filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n) && now - Date.parse(`${n}T00:00:00Z`) > keepDays * DAY);
}

/** xfade timeline: n slides of `slide` s each, `fade` s crossfades, then the end card. */
export function timeline(n: number, slide = 2.6, fade = 0.4, end = 3): { offsets: number[]; slidesLen: number; endOffset: number; total: number } {
  const offsets = Array.from({ length: Math.max(0, n - 1) }, (_, i) => +((i + 1) * (slide - fade)).toFixed(3));
  const slidesLen = +(n * slide - (n - 1) * fade).toFixed(3);
  const endOffset = +(slidesLen - fade).toFixed(3);
  return { offsets, slidesLen, endOffset, total: +(endOffset + end).toFixed(3) };
}

/** Ref quoted in one of our own posts' descriptions, if any. */
export function refInText(text: string | null | undefined): string | null {
  const m = (text ?? '').match(/"(K\d+|\d{4}-\d{2})"/) ?? (text ?? '').match(/\b(K\d{2,}|\d{4}-\d{2})\b/);
  return m?.[1] ?? null;
}

// Moved to its own module (2026-11-02) so the directory and demand scripts share it.
export { errorText } from './error-text';

/** One video on the page, as yt-dlp reads it back. */
export interface PageVideo {
  views: number;
  likes: number;
  /** Posted, epoch ms. */
  at: number;
  text: string;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The page in one #mkan line: every video on it (the daily picture videos carry
 * several refs and are in no home's ledger, so the old line read "0 views" over a
 * page with ~1,000), the ones posted in the last 7 days, the best one, and the
 * broker videos matched to homes.
 */
export function pageStatsLine(page: string, vids: PageVideo[], homes: { matched: number; views: number }, now = Date.now()): string {
  const n = (x: number) => x.toLocaleString('en-US');
  const sum = (xs: PageVideo[], k: 'views' | 'likes') => xs.reduce((t, v) => t + v[k], 0);
  const week = vids.filter((v) => v.at > now - 7 * 86_400_000);
  const best = [...vids].sort((a, b) => b.views - a.views)[0];
  const title = (t: string) => (t.split(/\s+[—•]\s+/)[0] ?? '').replace(/^\p{Extended_Pictographic}\s*/u, '').trim().slice(0, 48);
  const day = (ms: number) => {
    const d = new Date(ms + 2 * 3_600_000); // Kigali
    return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
  };
  return [
    `📈 TikTok @${page}: ${vids.length} posts, ${n(sum(vids, 'views'))} views, ${n(sum(vids, 'likes'))} likes`,
    `posted in the last 7 days: ${week.length}, ${n(sum(week, 'views'))} views`,
    best && best.views > 0 ? `best: "${title(best.text)}" ${n(best.views)} (${day(best.at)})` : null,
    `broker videos matched to homes: ${homes.matched}${homes.matched ? ` (${n(homes.views)} views)` : ''}`,
  ]
    .filter(Boolean)
    .join(' · ');
}
