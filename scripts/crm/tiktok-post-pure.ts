/**
 * The mkan Kigali TikTok page's pure core — which homes go out today, what the
 * caption says, and the overlay / end-card artwork as SVG. No I/O here; the
 * runner is `tiktok-post.ts`.
 *
 * The page works the way Kigali brokers' pages do: one short video per house,
 * the price and the area on screen, every inquiry to one WhatsApp number. The
 * viewer quotes the home's ref ("K5771", or the `NNNN-NN` code a listing
 * already has) and the operator finds it on /find or in the CRM.
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

/** What the viewer sends on WhatsApp. */
export const refOf = (r: Pick<PostRow, 'id' | 'code'>): string => r.code?.trim() || `K${r.id}`;

export const brokerHandle = (hostSourceId: string | null): string | null =>
  hostSourceId?.startsWith('tiktok:') ? hostSourceId.slice(7).toLowerCase() : null;

/**
 * Why a home can't go on the page, or null when it can. A broker's lead needs
 * that broker's YES first — the frames are cut from their video.
 */
export function ineligibleReason(r: PostRow, consented: ReadonlySet<string>): string | null {
  if (!r.priceMonth || r.priceMonth < 50_000) return 'no monthly price';
  if (r.photoUrls.length < MIN_PHOTOS) return `under ${MIN_PHOTOS} photos`;
  if (!r.district && !r.area) return 'no area';
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
  const pool = rows.filter((r) => !ineligibleReason(r, consented) && !resting(ledger[refOf(r)], now));
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
    ...(brokerHandle(r.hostSourceId) ? [`🎥 @${brokerHandle(r.hostSourceId)}`] : []),
    '',
    [...new Set(tags)].join(' '),
  ].join('\n');
}

/** The message asking a seed broker for repost rights — EN, then Kinyarwanda. */
export function brokerAsk(name: string, handle = '', page = ''): string {
  const hi = name ? ` ${name}` : '';
  const yours = handle ? ` from @${handle}` : '';
  const zanyu = handle ? ` (@${handle})` : '';
  const ours = page ? ` (@${page})` : '';
  return [
    `Hello${hi} 👋 This is mkan (mkan.sd), a home-rental platform in Kigali.`,
    `We are starting a TikTok page${ours} for monthly rentals in Kigali. Can we repost your houses${yours} on it, with your name credited? When a tenant we bring rents one of yours, we share the commission with you. Reply YES and we start.`,
    '',
    `Muraho${hi} 👋 Turi mkan (mkan.sd), urubuga rw'ubukode bw'inzu i Kigali.`,
    `Dutangiye paji ya TikTok${ours} y'inzu zikodeshwa ku kwezi i Kigali. Mwatwemerera gushyira inzu zanyu${zanyu} kuri paji yacu, tuvuga izina ryanyu? Umukiriya tuzanye nakodesha inzu yanyu, tugabana komisiyo. Musubize YEGO dutangire.`,
  ].join('\n');
}

/** A wa.me link that opens the chat with `text` already typed — the person still taps send. */
export function waLink(phone: string, text = ''): string {
  const n = phone.replace(/\D/g, '');
  return text ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : `https://wa.me/${n}`;
}

// ── artwork (SVG → PNG via sharp in the runner) ──────────────────────────────
//
// mkan's brand kit (kun content/media/brand-kit.json → production.mkan): ivory
// canvas, slate ink, clay accent, Thmanyah type, the arch mark placed in post.
// Every layer stays inside TikTok's safe area: the top 130 px (status bar,
// "Following | For You"), the bottom ~480 px (caption, sound) and the right
// ~150 px (like / comment rail).

export const W = 1080;
export const H = 1920;
export const BRAND = { canvas: '#faf8f5', ink: '#1a2530', accent: '#e05638', soft: '#e5d9c5' } as const;
const SANS = "'Thmanyah Sans', 'Helvetica Neue', Arial, sans-serif";
const DISPLAY = "'Thmanyah Serif Display', Georgia, serif";
/** The arch mark (mkan public/logo.svg), 197 × 179. */
const MARK_PATH =
  'M68.3674 17.1638C81.5791 -5.72128 114.603 -5.72128 127.815 17.1638L191.532 127.507C204.746 150.392 188.227 179 161.801 179H144.681H34.3818C7.9559 179 -8.56365 150.392 4.65052 127.507L68.3674 17.1638ZM98.0913 93.1778L51.5021 179H144.681L98.0913 93.1778Z';
const mark = (x: number, y: number, w: number, fill: string): string =>
  `<path transform="translate(${x} ${y}) scale(${(w / 197).toFixed(4)})" fill-rule="evenodd" d="${MARK_PATH}" fill="${fill}"/>`;

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The opening 1.4 s: the mark and the page's promise on ivory. */
export function stingSvg(): string {
  const cx = W / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${BRAND.canvas}"/>
  ${mark(cx - 120, 640, 240, BRAND.ink)}
  <text x="${cx}" y="1040" font-family="${DISPLAY}" font-size="150" font-weight="900" fill="${BRAND.ink}" text-anchor="middle">mkan</text>
  <rect x="${cx - 60}" y="1090" width="120" height="8" rx="4" fill="${BRAND.accent}"/>
  <text x="${cx}" y="1180" font-family="${SANS}" font-size="46" font-weight="500" fill="${BRAND.ink}" text-anchor="middle">Kigali · monthly rentals</text>
</svg>`;
}

/** Top-start corner, on for the whole body: the mark, the page, and the broker's credit. */
export function cornerSvg(credit: string | null): string {
  const x = 56;
  const chip = credit
    ? `<rect x="${x}" y="262" width="${Math.min(820, 120 + credit.length * 22)}" height="56" rx="28" fill="${BRAND.ink}" fill-opacity="0.72"/>
  <text x="${x + 28}" y="300" font-family="${SANS}" font-size="30" font-weight="500" fill="${BRAND.canvas}">Video @${esc(credit)}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BRAND.ink}" stop-opacity="0.55"/><stop offset="1" stop-color="${BRAND.ink}" stop-opacity="0"/></linearGradient></defs>
  <rect width="${W}" height="420" fill="url(#t)"/>
  ${mark(x, 160, 76, BRAND.canvas)}
  <text x="${x + 96}" y="222" font-family="${DISPLAY}" font-size="62" font-weight="900" fill="${BRAND.canvas}">mkan</text>
  ${chip}
</svg>`;
}

/** The lower third: price, place, rooms, the ref — slides up a beat after the body starts. */
export function lowerThirdSvg(r: PostRow): string {
  const x = 56;
  const top = 1000;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect x="${x}" y="${top}" width="${W - 2 * x - 120}" height="420" rx="36" fill="${BRAND.ink}" fill-opacity="0.9"/>
  <rect x="${x}" y="${top + 36}" width="10" height="150" rx="5" fill="${BRAND.accent}"/>
  <text x="${x + 44}" y="${top + 112}" font-family="${DISPLAY}" font-size="88" font-weight="900" fill="${BRAND.canvas}">${esc(formatRwf(r.priceMonth ?? 0))}</text>
  <text x="${x + 44}" y="${top + 172}" font-family="${SANS}" font-size="40" font-weight="500" fill="${BRAND.soft}">per month</text>
  <text x="${x + 44}" y="${top + 262}" font-family="${SANS}" font-size="54" font-weight="500" fill="${BRAND.canvas}">${esc(placeLine(r))}</text>
  <text x="${x + 44}" y="${top + 322}" font-family="${SANS}" font-size="40" font-weight="500" fill="${BRAND.soft}">${esc(factsLine(r))}</text>
  <rect x="${x + 44}" y="${top + 348}" width="230" height="52" rx="26" fill="${BRAND.accent}"/>
  <text x="${x + 159}" y="${top + 384}" font-family="${SANS}" font-size="30" font-weight="500" fill="#fff" text-anchor="middle">Ref ${esc(refOf(r))}</text>
</svg>`;
}

/** After the lower third leaves: a small price pill, so the house gets the screen back. */
export function pillSvg(r: PostRow): string {
  const x = 56;
  const y = 1330;
  const text = `${formatRwf(r.priceMonth ?? 0)} / mo · ${placeLine(r)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect x="${x}" y="${y}" width="${Math.min(W - 2 * x - 120, 80 + text.length * 21)}" height="76" rx="38" fill="${BRAND.ink}" fill-opacity="0.85"/>
  <rect x="${x + 24}" y="${y + 26}" width="24" height="24" rx="12" fill="${BRAND.accent}"/>
  <text x="${x + 64}" y="${y + 50}" font-family="${SANS}" font-size="34" font-weight="500" fill="${BRAND.canvas}">${esc(text)}</text>
</svg>`;
}

/** The last 3 seconds: who to message and what to send. */
export function endCardSvg(r: PostRow, whatsapp: string): string {
  const cx = W / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${BRAND.ink}"/>
  ${mark(cx - 70, 250, 140, BRAND.canvas)}
  <text x="${cx}" y="520" font-family="${DISPLAY}" font-size="110" font-weight="900" fill="${BRAND.canvas}" text-anchor="middle">mkan</text>
  <text x="${cx}" y="590" font-family="${SANS}" font-size="40" font-weight="500" fill="${BRAND.soft}" text-anchor="middle">Homes for rent in Kigali</text>
  <rect x="110" y="680" width="${W - 220}" height="270" rx="36" fill="${BRAND.accent}"/>
  <text x="${cx}" y="770" font-family="${SANS}" font-size="44" font-weight="500" fill="#fff" text-anchor="middle">WhatsApp</text>
  <text x="${cx}" y="880" font-family="${DISPLAY}" font-size="80" font-weight="900" fill="#fff" text-anchor="middle">${esc(whatsapp)}</text>
  <text x="${cx}" y="1070" font-family="${SANS}" font-size="48" font-weight="500" fill="${BRAND.canvas}" text-anchor="middle">Send this code</text>
  <text x="${cx}" y="1190" font-family="${DISPLAY}" font-size="110" font-weight="900" fill="${BRAND.soft}" text-anchor="middle">${esc(refOf(r))}</text>
  <text x="${cx}" y="1300" font-family="${SANS}" font-size="36" font-weight="500" fill="${BRAND.soft}" text-anchor="middle">More homes: mkan.sd/find</text>
</svg>`;
}

/** The TikTok video a broker lead came from: its frames live at …/uploads/tiktok/<videoId>/<n>.jpg. */
export function brokerVideoUrl(r: Pick<PostRow, 'photoUrls' | 'hostSourceId'>): string | null {
  const handle = brokerHandle(r.hostSourceId);
  const id = r.photoUrls.map((u) => u.match(/\/uploads\/tiktok\/(\d{8,})\//)?.[1]).find(Boolean);
  return handle && id ? `https://www.tiktok.com/@${handle}/video/${id}` : null;
}

/**
 * Sting → body → end card, joined by crossfades. Returns each join's offset and
 * the total length; `body` is the enhanced video or the slideshow, in seconds.
 */
export function brandTimeline(body: number, sting = 1.4, end = 3, fade = 0.35): { bodyAt: number; endAt: number; total: number } {
  const bodyAt = +(sting - fade).toFixed(3);
  const endAt = +(bodyAt + body - fade).toFixed(3);
  return { bodyAt, endAt, total: +(endAt + end).toFixed(3) };
}

// ── data carousel ────────────────────────────────────────────────────────────
//
// A photo-mode post made only of facts from the CRM — price, place, rooms, the
// ref — in mkan's own artwork. No broker photo or footage appears, so any
// Kigali monthly home can be on it; a tenant who sends the ref is put in touch
// with the agent or owner (co-broking).

export const CAROUSEL_HOMES = 5;
/** A home shown in a carousel rests this long before it can be shown again. */
export const CAROUSEL_REST_DAYS = 14;

export type CarouselTheme = { kind: 'district' | 'budget' | 'beds'; key: string; title: string; rw: string; slug: string };

const BUDGETS: { key: string; lo: number; hi: number; title: string; rw: string }[] = [
  { key: 'u300', lo: 50_000, hi: 300_000, title: 'Under RWF 300,000 a month', rw: 'Munsi ya 300,000 ku kwezi' },
  { key: '300-600', lo: 300_000, hi: 600_000, title: 'RWF 300k – 600k a month', rw: '300,000 – 600,000 ku kwezi' },
  { key: '600-1m', lo: 600_000, hi: 1_000_000, title: 'RWF 600k – 1M a month', rw: '600,000 – 1,000,000 ku kwezi' },
  { key: '1m', lo: 1_000_000, hi: 10_000_000, title: 'RWF 1M+ a month', rw: 'Hejuru ya 1,000,000 ku kwezi' },
];

const okForCarousel = (r: PostRow): boolean => !!r.priceMonth && r.priceMonth >= 50_000 && r.priceMonth <= 10_000_000 && !!(r.area || r.district);

/** Every theme the pool could fill, with the homes that fit it. */
export function carouselThemes(rows: PostRow[]): { theme: CarouselTheme; homes: PostRow[] }[] {
  const ok = rows.filter(okForCarousel);
  const out: { theme: CarouselTheme; homes: PostRow[] }[] = [];
  for (const d of [...new Set(ok.map((r) => r.district?.trim()).filter((d): d is string => !!d))]) {
    out.push({ theme: { kind: 'district', key: d, title: `Homes for rent in ${d}`, rw: `Inzu zikodeshwa i ${d}`, slug: `district-${d.toLowerCase()}` }, homes: ok.filter((r) => r.district?.trim() === d) });
  }
  for (const b of BUDGETS) {
    out.push({ theme: { kind: 'budget', key: b.key, title: b.title, rw: b.rw, slug: `budget-${b.key}` }, homes: ok.filter((r) => r.priceMonth! >= b.lo && r.priceMonth! < b.hi) });
  }
  for (const n of [1, 2, 3, 4]) {
    const fits = (r: PostRow) => (n === 4 ? (r.bedrooms ?? 0) >= 4 : r.bedrooms === n);
    const label = n === 4 ? '4+ bedroom' : `${n}-bedroom`;
    out.push({ theme: { kind: 'beds', key: String(n), title: `${label} homes in Kigali`, rw: `Inzu z'ibyumba ${n === 4 ? '4+' : n} i Kigali`, slug: `beds-${n}` }, homes: ok.filter(fits) });
  }
  return out;
}

/**
 * Today's carousel: the theme kind rotates by day (district → budget → beds),
 * and within it the theme with the most homes not shown in the last 14 days.
 * Homes are listed cheapest first. Null when no theme has enough fresh homes.
 */
export function pickCarousel(
  rows: PostRow[],
  shown: Record<string, string>,
  now = Date.now(),
  n = CAROUSEL_HOMES,
): { theme: CarouselTheme; homes: PostRow[] } | null {
  const fresh = (r: PostRow) => {
    const at = shown[refOf(r)];
    return !at || now - Date.parse(at) >= CAROUSEL_REST_DAYS * DAY;
  };
  const kinds = ['district', 'budget', 'beds'] as const;
  const day = Math.floor(now / DAY);
  const options = carouselThemes(rows)
    .map((o) => ({ theme: o.theme, homes: o.homes.filter(fresh) }))
    .filter((o) => o.homes.length >= Math.min(n, 3));
  for (let k = 0; k < kinds.length; k++) {
    const kind = kinds[(day + k) % kinds.length];
    const best = options.filter((o) => o.theme.kind === kind).sort((a, b) => b.homes.length - a.homes.length)[0];
    if (best) {
      // Spread the price range rather than taking the n cheapest.
      const sorted = [...best.homes].sort((a, b) => a.priceMonth! - b.priceMonth!);
      const step = sorted.length / Math.min(n, sorted.length);
      const homes = Array.from({ length: Math.min(n, sorted.length) }, (_, i) => sorted[Math.floor(i * step)]!);
      return { theme: best.theme, homes };
    }
  }
  return null;
}

/** Breaks `text` into lines of at most `max` characters, on spaces. */
export function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/)) {
    if (cur && (cur + ' ' + w).length > max) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

const bigMark = (fill: string): string => mark(W - 520, 1180, 640, fill);

export function carouselCoverSvg(theme: CarouselTheme, count: number): string {
  const x = 80;
  const lines = wrap(theme.title, 14);
  const head = lines.map((l, i) => `<text x="${x}" y="${560 + i * 130}" font-family="${DISPLAY}" font-size="112" font-weight="900" fill="${BRAND.canvas}">${esc(l)}</text>`).join('\n  ');
  const y = 560 + lines.length * 130;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${BRAND.ink}"/>
  ${bigMark('#22303c')}
  ${mark(x, 190, 70, BRAND.canvas)}
  <text x="${x + 90}" y="250" font-family="${DISPLAY}" font-size="58" font-weight="900" fill="${BRAND.canvas}">mkan</text>
  <text x="${x}" y="400" font-family="${SANS}" font-size="38" font-weight="500" fill="${BRAND.accent}" letter-spacing="4">THIS WEEK IN KIGALI</text>
  ${head}
  <text x="${x}" y="${y + 20}" font-family="${SANS}" font-size="48" font-weight="500" fill="${BRAND.soft}">${esc(theme.rw)}</text>
  <rect x="${x}" y="${y + 90}" width="360" height="84" rx="42" fill="${BRAND.accent}"/>
  <text x="${x + 180}" y="${y + 145}" font-family="${SANS}" font-size="38" font-weight="500" fill="#fff" text-anchor="middle">${count} homes · swipe →</text>
</svg>`;
}

/** One home per slide: the facts large, the ref and the WhatsApp line under them. */
export function carouselHomeSvg(r: PostRow, i: number, total: number, whatsapp: string): string {
  const x = 80;
  const bg = i % 2 ? BRAND.soft : BRAND.canvas;
  const type = r.propertyType && r.propertyType !== 'Rooms' ? r.propertyType : r.propertyType === 'Rooms' ? 'Room' : 'Home';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  ${bigMark(i % 2 ? '#dccdb5' : '#efe9df')}
  ${mark(x, 190, 56, BRAND.ink)}
  <text x="${x + 72}" y="238" font-family="${DISPLAY}" font-size="46" font-weight="900" fill="${BRAND.ink}">mkan</text>
  <text x="${W - 190}" y="238" font-family="${SANS}" font-size="36" font-weight="500" fill="${BRAND.ink}" fill-opacity="0.6" text-anchor="end">${i}/${total}</text>
  <text x="${x}" y="470" font-family="${SANS}" font-size="44" font-weight="500" fill="${BRAND.accent}" letter-spacing="3">${esc(type.toUpperCase())} FOR RENT</text>
  <text x="${x}" y="620" font-family="${DISPLAY}" font-size="120" font-weight="900" fill="${BRAND.ink}">${esc(formatRwf(r.priceMonth ?? 0))}</text>
  <text x="${x}" y="690" font-family="${SANS}" font-size="46" font-weight="500" fill="${BRAND.ink}" fill-opacity="0.7">per month</text>
  <rect x="${x}" y="740" width="140" height="10" rx="5" fill="${BRAND.accent}"/>
  ${wrap(placeLine(r), 18).slice(0, 2).map((l, k) => `<text x="${x}" y="${860 + k * 90}" font-family="${DISPLAY}" font-size="80" font-weight="900" fill="${BRAND.ink}">${esc(l)}</text>`).join('\n  ')}
  <text x="${x}" y="1080" font-family="${SANS}" font-size="52" font-weight="500" fill="${BRAND.ink}">${esc(factsLine(r))}</text>
  <rect x="${x}" y="1170" width="${W - 2 * x - 110}" height="230" rx="32" fill="${BRAND.ink}"/>
  <text x="${x + 40}" y="1250" font-family="${SANS}" font-size="38" font-weight="500" fill="${BRAND.soft}">WhatsApp ${esc(whatsapp)}</text>
  <text x="${x + 40}" y="1350" font-family="${SANS}" font-size="44" font-weight="500" fill="${BRAND.canvas}">send</text>
  <text x="${x + 150}" y="1352" font-family="${DISPLAY}" font-size="78" font-weight="900" fill="${BRAND.accent}">${esc(refOf(r))}</text>
</svg>`;
}

export function carouselEndSvg(whatsapp: string): string {
  const cx = W / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${BRAND.accent}"/>
  ${mark(cx - 80, 300, 160, '#fff')}
  <text x="${cx}" y="640" font-family="${DISPLAY}" font-size="104" font-weight="900" fill="#fff" text-anchor="middle">Want one?</text>
  <text x="${cx}" y="740" font-family="${SANS}" font-size="46" font-weight="500" fill="#fff" text-anchor="middle">Send its code on WhatsApp</text>
  <rect x="110" y="820" width="${W - 220}" height="170" rx="36" fill="${BRAND.ink}"/>
  <text x="${cx}" y="935" font-family="${DISPLAY}" font-size="80" font-weight="900" fill="${BRAND.canvas}" text-anchor="middle">${esc(whatsapp)}</text>
  <text x="${cx}" y="1090" font-family="${SANS}" font-size="40" font-weight="500" fill="#fff" text-anchor="middle">We connect you with the agent or owner.</text>
  <text x="${cx}" y="1160" font-family="${SANS}" font-size="40" font-weight="500" fill="#fff" text-anchor="middle">Ohereza kode kuri WhatsApp.</text>
  <text x="${cx}" y="1300" font-family="${SANS}" font-size="36" font-weight="500" fill="#fff" fill-opacity="0.85" text-anchor="middle">More homes: mkan.sd/find</text>
</svg>`;
}

export function carouselCaption(theme: CarouselTheme, homes: PostRow[], whatsapp: string): string {
  const tags = ['kigali', 'houseforrent', 'kigalirealestate', 'inzuikodeshwa', 'rwanda', ...(theme.kind === 'district' ? [theme.key] : [])].map(tag);
  return [
    `🏠 ${theme.title} — this week`,
    ...homes.map((r) => `• ${refOf(r)} — ${formatRwf(r.priceMonth ?? 0)}/mo, ${placeLine(r)}${r.bedrooms ? `, ${r.bedrooms} bd` : ''}`),
    `📲 WhatsApp ${whatsapp} — send the code. We connect you with the agent or owner; availability changes, so ask first.`,
    `🇷🇼 ${theme.rw}. Ohereza kode kuri WhatsApp ${whatsapp}.`,
    '',
    [...new Set(tags)].join(' '),
  ].join('\n');
}

// ── voiced data video ────────────────────────────────────────────────────────
//
// The day's carousel slides, one narrated line each (a Google stock voice via
// kun's `media.sh voice`). Numbers stay digits: the voice reads them as words,
// and kun's gate compares Whisper's transcript (which writes digits) to this
// text letter by letter. A ref is hyphenated so it is read out one character
// at a time.

/** K5877 → "K-5-8-7-7"; 0005-01 → "0-0-0-5-0-1". */
export const spokenRef = (ref: string): string => ref.replace(/-/g, '').split('').join('-');

const fmt = (n: number): string => n.toLocaleString('en-US');
const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** Counts read as words, the way Whisper writes them back ("five bedrooms"); prices stay digits. */
const count = (n: number): string => SMALL[n] ?? String(n);
const Count = (n: number): string => count(n).replace(/^./, (c) => c.toUpperCase());

const BUDGET_SPOKEN: Record<string, string> = {
  u300: 'under 300,000 francs a month',
  '300-600': 'between 300,000 and 600,000 francs a month',
  '600-1m': 'between 600,000 and 1,000,000 francs a month',
  '1m': 'from 1,000,000 francs a month',
};

/** One line per slide: the cover, each home, the call to action. */
export function carouselNarration(theme: CarouselTheme, homes: PostRow[]): string[] {
  const n = `${Count(homes.length)} home${homes.length === 1 ? '' : 's'}`;
  const beds = Number(theme.key);
  const cover =
    theme.kind === 'district'
      ? `${n} for rent in ${theme.key} this week.`
      : theme.kind === 'budget'
        ? `${n} in Kigali, ${BUDGET_SPOKEN[theme.key] ?? 'this week'}.`
          : `${n} in Kigali with ${beds >= 4 ? 'four bedrooms or more' : `${count(beds)} bedroom${beds === 1 ? '' : 's'}`}.`;
  const lines = homes.map((r) => {
    const type = (r.propertyType && r.propertyType !== 'Rooms' ? r.propertyType : r.propertyType === 'Rooms' ? 'room' : 'home').toLowerCase();
    const article = /^[aeiou]/.test(type) ? 'An' : 'A';
    const rooms = [r.bedrooms ? `${count(r.bedrooms)} bedroom${r.bedrooms > 1 ? 's' : ''}` : '', r.bathrooms ? `${count(r.bathrooms)} bathroom${r.bathrooms > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ');
    return [`${article} ${type} in ${placeLine(r)}.`, rooms ? `${rooms[0]!.toUpperCase()}${rooms.slice(1)}.` : '', `${fmt(r.priceMonth ?? 0)} francs a month.`, `Code ${spokenRef(refOf(r))}.`].filter(Boolean).join(' ');
  });
  return [cover, ...lines, 'Want one? Send its code on WhatsApp, to the number on screen. We connect you with the agent or owner.'];
}

/** How long each slide holds: its line plus breathing room, never under `min`. */
export function slideHolds(lineSeconds: number[], pad = 0.7, min = 2.5): number[] {
  return lineSeconds.map((d) => +Math.max(min, d + pad).toFixed(3));
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

// ── picture video ────────────────────────────────────────────────────────────
//
// The daily video since 2026-10-21: no narration, mkan's music track, and every
// frame a photograph — the home's own photo when we may post it (an owner's or
// field agent's listing, or a broker who said YES), otherwise a hand-reviewed
// CC0 / CC BY photo of Kigali, tagged on screen as an area photo. The overlay
// is a transparent SVG over that photo; slides change on the track's beat.

/** The mkan bed is generated at this tempo (kun brand-kit production.mkan.audio). */
export const BED_BPM = 112;

/** Slide holds on the beat grid: the cover 4 beats, each home and the end card 8. */
export function beatHolds(homes: number, bpm = BED_BPM): number[] {
  const beat = 60 / bpm;
  return [4, ...Array.from({ length: homes }, () => 8), 8].map((b) => +(b * beat).toFixed(3));
}

export interface StockPhoto {
  id: string;
  label: string;
  title: string;
  license: string;
  artist: string;
  page: string;
  url: string;
}

/** The `n` area photos used longest ago (never-used first), deterministic within a day. */
export function pickStock(photos: StockPhoto[], used: Record<string, string>, n: number): StockPhoto[] {
  return [...photos].sort((a, b) => (used[a.id] ?? '').localeCompare(used[b.id] ?? '') || a.id.localeCompare(b.id)).slice(0, n);
}

/** CC BY needs author + licence next to the work; CC0 gets credited anyway. */
export function photoCredits(photos: StockPhoto[]): string {
  const seen = new Map<string, Set<string>>();
  for (const p of photos) seen.set(p.artist, (seen.get(p.artist) ?? new Set()).add(p.license));
  return `📷 Kigali area photos, not the listed homes — ${[...seen].map(([a, l]) => `${a} (${[...l].join(', ')})`).join(', ')}, via Wikimedia Commons`;
}

const scrim = (id: string, y1: number, y2: number, top: number, bottom: number): string =>
  `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1117" stop-opacity="${top}"/><stop offset="1" stop-color="#0b1117" stop-opacity="${bottom}"/></linearGradient></defs><rect y="${y1}" width="${W}" height="${y2 - y1}" fill="url(#${id})"/>`;

/** mkan wordmark top-left, and the area-photo tag when the frame is not the home. */
const photoHeader = (areaTag: boolean): string => `${scrim('top', 0, 420, 0.55, 0)}
  ${mark(80, 170, 60, BRAND.canvas)}
  <text x="156" y="220" font-family="${DISPLAY}" font-size="50" font-weight="900" fill="${BRAND.canvas}">mkan</text>${
    areaTag ? `\n  <rect x="80" y="262" width="300" height="52" rx="26" fill="#0b1117" fill-opacity="0.55"/><text x="230" y="297" font-family="${SANS}" font-size="28" font-weight="500" fill="${BRAND.canvas}" text-anchor="middle">Kigali · area photo</text>` : ''
  }`;

export function photoCoverSvg(theme: CarouselTheme, count: number, areaTag: boolean): string {
  const x = 80;
  const lines = wrap(theme.title, 15);
  const top = 1300 - lines.length * 118;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  ${photoHeader(areaTag)}
  ${scrim('bot', 760, H, 0, 0.88)}
  <text x="${x}" y="${top - 40}" font-family="${SANS}" font-size="38" font-weight="500" fill="${BRAND.accent}" letter-spacing="4">THIS WEEK IN KIGALI</text>
  ${lines.map((l, i) => `<text x="${x}" y="${top + 100 + i * 118}" font-family="${DISPLAY}" font-size="108" font-weight="900" fill="${BRAND.canvas}">${esc(l)}</text>`).join('\n  ')}
  <rect x="${x}" y="1350" width="330" height="76" rx="38" fill="${BRAND.accent}"/>
  <text x="${x + 165}" y="1400" font-family="${SANS}" font-size="36" font-weight="500" fill="#fff" text-anchor="middle">${count} homes →</text>
</svg>`;
}

/** One home: price chip, place, facts, the code to send — the lower third, clear of TikTok's rails. */
export function photoHomeSvg(r: PostRow, i: number, total: number, areaTag: boolean): string {
  const x = 80;
  const place = wrap(placeLine(r), 20).slice(0, 2);
  const price = formatRwf(r.priceMonth ?? 0);
  const py = 1010 - (place.length - 1) * 84;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  ${photoHeader(areaTag)}
  <text x="${W - 190}" y="220" font-family="${SANS}" font-size="34" font-weight="500" fill="${BRAND.canvas}" fill-opacity="0.85" text-anchor="end">${i}/${total}</text>
  ${scrim('bot', 820, H, 0, 0.9)}
  <rect x="${x}" y="${py - 96}" width="${price.length * 44 + 170}" height="92" rx="46" fill="${BRAND.accent}"/>
  <text x="${x + 36}" y="${py - 34}" font-family="${DISPLAY}" font-size="58" font-weight="900" fill="#fff">${esc(price)}<tspan font-family="${SANS}" font-size="32" font-weight="500" dx="10">/mo</tspan></text>
  ${place.map((l, k) => `<text x="${x}" y="${py + 90 + k * 84}" font-family="${DISPLAY}" font-size="76" font-weight="900" fill="${BRAND.canvas}">${esc(l)}</text>`).join('\n  ')}
  <text x="${x}" y="${py + 90 + place.length * 84 + 10}" font-family="${SANS}" font-size="44" font-weight="500" fill="${BRAND.soft}">${esc(factsLine(r))}</text>
  <rect x="${x}" y="1330" width="420" height="96" rx="24" fill="${BRAND.canvas}"/>
  <text x="${x + 32}" y="1393" font-family="${SANS}" font-size="36" font-weight="500" fill="${BRAND.ink}">send</text>
  <text x="${x + 132}" y="1396" font-family="${DISPLAY}" font-size="58" font-weight="900" fill="${BRAND.accent}">${esc(refOf(r))}</text>
</svg>`;
}

export function photoEndSvg(whatsapp: string): string {
  const cx = W / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#0b1117" fill-opacity="0.62"/>
  ${mark(cx - 70, 470, 140, BRAND.canvas)}
  <text x="${cx}" y="780" font-family="${DISPLAY}" font-size="104" font-weight="900" fill="${BRAND.canvas}" text-anchor="middle">Want one?</text>
  <text x="${cx}" y="870" font-family="${SANS}" font-size="44" font-weight="500" fill="${BRAND.soft}" text-anchor="middle">Send its code on WhatsApp</text>
  <rect x="110" y="940" width="${W - 220}" height="160" rx="36" fill="${BRAND.accent}"/>
  <text x="${cx}" y="1045" font-family="${DISPLAY}" font-size="76" font-weight="900" fill="#fff" text-anchor="middle">${esc(whatsapp)}</text>
  <text x="${cx}" y="1200" font-family="${SANS}" font-size="38" font-weight="500" fill="${BRAND.canvas}" text-anchor="middle">Ohereza kode kuri WhatsApp.</text>
</svg>`;
}
