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
  source: 'AIRBNB' | 'FACEBOOK' | 'MANUAL' | 'TIKTOK' | null;
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

export const W = 1080;
export const H = 1920;
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The text that rides over every photo. Kept inside TikTok's safe area: the top
 * 130 px (status bar, "Following | For You"), the bottom ~480 px (caption,
 * sound) and the right ~150 px (like / comment rail) stay clear.
 */
export function overlaySvg(r: PostRow): string {
  const x = 64;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.62"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
    <linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="0.6" stop-color="#000" stop-opacity="0.66"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
  </defs>
  <rect x="0" y="0" width="${W}" height="620" fill="url(#t)"/>
  <rect x="0" y="980" width="${W}" height="640" fill="url(#b)"/>
  <rect x="${x}" y="170" width="300" height="58" rx="29" fill="#16a34a"/>
  <text x="${x + 150}" y="210" font-family="${FONT}" font-size="30" font-weight="700" fill="#fff" text-anchor="middle" letter-spacing="2">FOR RENT</text>
  <text x="${x}" y="335" font-family="${FONT}" font-size="86" font-weight="800" fill="#fff">${esc(formatRwf(r.priceMonth ?? 0))}</text>
  <text x="${x}" y="398" font-family="${FONT}" font-size="44" font-weight="500" fill="#fff" fill-opacity="0.9">per month</text>
  <text x="${x}" y="1250" font-family="${FONT}" font-size="64" font-weight="800" fill="#fff">${esc(placeLine(r))}</text>
  <text x="${x}" y="1322" font-family="${FONT}" font-size="44" font-weight="500" fill="#fff" fill-opacity="0.92">${esc(factsLine(r))}</text>
  <rect x="${x}" y="1360" width="250" height="56" rx="12" fill="#fff" fill-opacity="0.95"/>
  <text x="${x + 125}" y="1399" font-family="${FONT}" font-size="32" font-weight="700" fill="#111" text-anchor="middle">Ref ${esc(refOf(r))}</text>
</svg>`;
}

/** The last 3 seconds: who to call and what to send. */
export function endCardSvg(r: PostRow, whatsapp: string): string {
  const cx = W / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#0b1220"/>
  <text x="${cx}" y="430" font-family="${FONT}" font-size="120" font-weight="800" fill="#fff" text-anchor="middle">mkan</text>
  <text x="${cx}" y="500" font-family="${FONT}" font-size="38" font-weight="500" fill="#fff" fill-opacity="0.7" text-anchor="middle">Homes for rent in Kigali</text>
  <rect x="120" y="640" width="${W - 240}" height="300" rx="36" fill="#16a34a"/>
  <text x="${cx}" y="735" font-family="${FONT}" font-size="44" font-weight="600" fill="#fff" text-anchor="middle">WhatsApp</text>
  <text x="${cx}" y="840" font-family="${FONT}" font-size="76" font-weight="800" fill="#fff" text-anchor="middle">${esc(whatsapp)}</text>
  <text x="${cx}" y="900" font-family="${FONT}" font-size="34" font-weight="500" fill="#fff" fill-opacity="0.9" text-anchor="middle">tap the WhatsApp button on our profile</text>
  <text x="${cx}" y="1070" font-family="${FONT}" font-size="50" font-weight="600" fill="#fff" text-anchor="middle">Send this code:</text>
  <text x="${cx}" y="1180" font-family="${FONT}" font-size="104" font-weight="800" fill="#fde047" text-anchor="middle">${esc(refOf(r))}</text>
  <text x="${cx}" y="1290" font-family="${FONT}" font-size="36" font-weight="500" fill="#fff" fill-opacity="0.7" text-anchor="middle">More homes: mkan.sd/find</text>
</svg>`;
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
