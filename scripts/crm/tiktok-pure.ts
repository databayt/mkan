/**
 * The TikTok lane's pure core — no network, no disk. Everything the CLI
 * (`tiktok.ts`) decides about a video is decided here so it can be tested.
 *
 * Fixtures in tests/crm/tiktok.test.ts are anonymised: the repo is public.
 */
import { z } from 'zod';
import { extractJsonObject, toAsciiDigits } from './home-intake-pure';
import { normalizePhone } from '../../src/lib/phone';
import { placeToken } from '../../src/lib/geo/place-token';
import { districtForPlace } from '../../src/lib/geo/rwanda-places';

// ── the ledger ───────────────────────────────────────────────────────────────
/** `failed`: three fetches in a row went wrong (blocked, removed, no formats) — not retried. */
export type VideoState = 'discovered' | 'fetched' | 'read' | 'upserted' | 'skipped' | 'failed';

export interface VideoMeta {
  caption: string;
  uploader: string;
  channel: string | null;
  timestamp: number | null;
  duration: number | null;
  views: number | null;
  /** TikTok's secUid — `tiktokuser:<id>` lists the account when `@handle` pages break. */
  channelId?: string | null;
}

export interface VideoRow {
  videoId: string;
  url: string;
  handle: string;
  via: 'seed' | 'search';
  query?: string;
  discoveredAt: string;
  state: VideoState;
  skipReason?: string;
  meta?: VideoMeta;
  frames?: string[];
  transcript?: string;
  read?: TikTokRead;
  readVersion?: string;
  frameUrls?: string[];
  /** Fetch attempts that failed; three moves the row to `failed`. */
  attempts?: number;
  homeId?: string;
  hostId?: string;
  error?: string;
  /** The caption-only text read already came back short of facts for this prompt version — go straight to vision. */
  textMissVersion?: string;
  /** Photo-mode post: the frames are its cover images, not video stills. */
  photoMode?: boolean;
  /** Upserted as another poster's copy of a home already on the board. */
  mergedInto?: string;
  /** The Twenty `tiktokPost` record, and a hash of what was last written to it. */
  postId?: string;
  postHash?: string;
}

export interface SeedRow {
  /** `paused`: three listings in a row failed (private, renamed, gone) — re-tried weekly. */
  status: 'active' | 'proposed' | 'ignored' | 'paused';
  from: 'manual' | 'search';
  addedAt: string;
  hits?: number;
  /** TikTok's secUid, learnt from one of the account's videos. */
  channelId?: string;
  /** Runs in a row that could not list this account. */
  failStreak?: number;
  lastListedAt?: string;
  pausedAt?: string;
  pausedReason?: string;
  /** When its own recent captions were last read to promote or ignore it, and what they showed. */
  vettedAt?: string;
  vet?: string;
}

/** A seed that has failed three runs in a row stops being listed daily. */
export const SEED_PAUSE_STREAK = 3;
const WEEK_MS = 7 * 86_400_000;

/** Is this seed listed on this run? Active ones daily, paused ones once a week. */
export function seedIsDue(seed: SeedRow, nowMs = Date.now()): boolean {
  if (seed.status === 'active') return true;
  if (seed.status !== 'paused') return false;
  return !seed.pausedAt || nowMs - Date.parse(seed.pausedAt) >= WEEK_MS;
}

/**
 * A proposed account earns a seed once search keeps finding it AND one of its
 * posts already became a real home — 44 proposals sat unreviewed for a week.
 */
export function shouldPromote(seed: SeedRow, upsertedHomes: number): boolean {
  return seed.status === 'proposed' && (seed.hits ?? 0) >= 3 && upsertedHomes >= 1;
}

// ── discovery ────────────────────────────────────────────────────────────────
const VIDEO_URL = /tiktok\.com\/@([A-Za-z0-9._]{2,40})\/video\/(\d{15,21})/g;

/** Every TikTok video URL in a page of search results (raw, %-encoded or redirect-wrapped). */
export function tiktokVideosIn(html: string): { handle: string; videoId: string; url: string }[] {
  let text = html;
  try {
    text = `${html}\n${decodeURIComponent(html.replace(/%(?![0-9a-f]{2})/gi, '%25'))}`;
  } catch {
    /* keep the raw page */
  }
  const out = new Map<string, { handle: string; videoId: string; url: string }>();
  for (const m of text.matchAll(VIDEO_URL)) {
    const handle = m[1].toLowerCase();
    const videoId = m[2];
    if (!out.has(videoId)) out.set(videoId, { handle, videoId, url: `https://www.tiktok.com/@${handle}/video/${videoId}` });
  }
  return [...out.values()];
}

/** The search phrases — English, Kinyarwanda, French, by district. */
export const SEARCH_QUERIES: string[] = [
  'house for rent kigali',
  'apartment for rent kigali',
  'furnished apartment kigali',
  'inzu ikodeshwa kigali',
  'inzu zikodeshwa',
  'inzu yo gukodesha kigali',
  'appartement à louer kigali',
  'house for rent kicukiro',
  'house for rent gasabo',
  'house for rent nyarugenge',
  'house for rent kimironko',
  'house for rent kibagabaga',
  'house for rent nyamirambo',
  'house for rent remera',
  'house for rent kacyiru',
  'house for rent gisozi',
  'studio for rent kigali',
  'house for rent kanombe',
  'house for rent kagarama',
  'house for rent niboye',
  'house for rent gikondo',
  'house for rent rebero',
  'house for rent kinyinya',
  'house for rent gacuriro',
  'house for rent kagugu',
  'house for rent nyarutarama',
  'house for rent kimihurura',
  'house for rent kiyovu',
  'house for rent kabeza',
  'house for rent busanza',
  'house for rent masaka kigali',
  'house for rent rusororo',
  'apartment for rent kimironko',
  'apartment for rent kicukiro',
  'apartment for rent kacyiru',
  'apartment for rent nyarutarama',
  'furnished house for rent kigali',
  'cheap house for rent kigali',
  'room for rent kigali',
  'self contained room kigali',
  'annex for rent kigali',
  'kigali real estate agent',
  'kigali houses for rent tiktok',
  'inzu ikodeshwa kicukiro',
  'inzu ikodeshwa gasabo',
  'inzu ikodeshwa kimironko',
  'inzu ikodeshwa kanombe',
  'inzu ikodeshwa nyamirambo',
  'icyumba gikodeshwa kigali',
  'maison à louer kigali',
];

const RENT_WORDS = /(rent|renting|for\s*rent|ikodesh|gukodesh|kodesha|louer|location|bed\s*rooms?|bedroom|chambre|studio|apartment|appartement|furnished|self[-\s]?contain|compound|annex|ibyumba|icyumba|inzu)/i;
const EXPLICIT_RENT = /(for\s*rent|to\s*let|ikodeshwa|irakodeshwa|gukodesha|à\s*louer|a\s*louer|per\s*month|\/\s*month|monthly)/i;
const SALE_WORDS = /(for\s*sale|on\s*sale|selling|iragurishwa|igurishwa|kugurisha|ikibanza|plots?\b|land\s+for|à\s*vendre|a\s*vendre)/i;

/** What is left of a caption once hashtags, handles, links, phones and emoji are gone. */
export function captionWords(caption: string): string {
  return toAsciiDigits(caption)
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#@][\p{L}\p{N}_.]+/gu, ' ')
    .replace(/\+?\d[\d\s.-]{6,}\d/g, ' ')
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A cheap gate before the reader: is this worth a read at all?
 *
 * Sale and land posts say "bedroom" too — they were 26 wasted reads. And a
 * caption that is only hashtags, a phone number or nothing (29 dropped unread)
 * leaves the facts in the frames' on-screen text, so the reader gets those.
 */
export function looksLikeRental(caption: string, fromSeed = false): boolean {
  if (RENT_WORDS.test(caption)) return !SALE_WORDS.test(caption) || EXPLICIT_RENT.test(caption);
  if (SALE_WORDS.test(caption)) return false;
  // A seed is an account we already know posts rentals: its wordy, off-topic
  // captions ("beauty update", a story) still carry a house in the frames.
  return fromSeed || captionWords(caption).length < 12;
}

export const NOT_A_RENTAL_CAPTION = 'caption does not read as a rental';

// ── vetting a proposed account ───────────────────────────────────────────────
const RWANDA_WORDS =
  /(kigali|rwanda|\brwf\b|\bfrw\b|\+?250\s?7|kicukiro|gasabo|nyarugenge|kimironko|remera|kacyiru|kibagabaga|nyamirambo|gisozi|kanombe|kagarama|niboye|gikondo|rebero|kinyinya|gacuriro|kagugu|nyarutarama|kimihurura|kiyovu|rusororo|masaka|kabeza|busanza|kanserege|ikodesh|gukodesh|inzu)/i;

/** A caption that names a rental outright (unlike looksLikeRental, a short vague caption doesn't count). */
export const rentalCaption = (c: string): boolean => RENT_WORDS.test(c) && (!SALE_WORDS.test(c) || EXPLICIT_RENT.test(c));

/**
 * What an account's own recent captions say about it. Search proposes any
 * account that once matched a phrase; this reads its last posts instead:
 * mostly Kigali rentals → a seed; plenty of posts and none a rental, or none
 * in Rwanda → ignored; too little to tell → stays proposed.
 */
export function vetVerdict(captions: string[]): { verdict: 'promote' | 'ignore' | 'keep'; rental: number; total: number; rwanda: boolean } {
  const total = captions.length;
  const rental = captions.filter(rentalCaption).length;
  // One stray word isn't enough: a fifth of the captions must place it in Rwanda.
  const rwanda = total > 0 && captions.filter((c) => RWANDA_WORDS.test(c)).length >= Math.max(1, Math.ceil(total * 0.2));
  let verdict: 'promote' | 'ignore' | 'keep' = 'keep';
  if (rental >= 3 && rental / total >= 0.3 && rwanda) verdict = 'promote';
  else if (total >= 5 && (rental === 0 || !rwanda)) verdict = 'ignore';
  return { verdict, rental, total, rwanda };
}

/**
 * Rows the caption gate skipped that today's gate would let through — the
 * gate has been loosened twice and skipped rows were never looked at again
 * (98 of 135 on 2026-10-20). Young enough to still be on the market only.
 */
export function requeueable(row: VideoRow, fromSeed: boolean, maxAgeDays: number, nowMs = Date.now()): boolean {
  if (row.state !== 'skipped' || row.skipReason !== NOT_A_RENTAL_CAPTION || !row.meta) return false;
  if (row.meta.timestamp != null && nowMs / 1000 - row.meta.timestamp > maxAgeDays * 86400) return false;
  return looksLikeRental(row.meta.caption, fromSeed);
}

/**
 * Read order when the vision quota covers ~a third of the queue: a post that
 * names a phone and a price is a lead the agent can call today; then seeds
 * (known rental posters); then newest. Lower sorts first.
 */
export function readPriority(row: VideoRow, fromSeed: boolean): number[] {
  const text = `${row.meta?.caption ?? ''} ${row.handle} ${row.transcript ?? ''}`;
  const c = toAsciiDigits(row.meta?.caption ?? '').toLowerCase();
  const price = /(\d+(?:[.,]\d+)?\s*(?:k|m|million)\b|\d{1,3}(?:[,.\s]\d{3})+|\b(?:rwf|frw|usd)\b|\$\s*\d)/.test(c);
  return [rwandaPhonesInText(text).length ? 0 : 1, price ? 0 : 1, fromSeed ? 0 : 1, -(row.meta?.timestamp ?? 0)];
}

export const byPriority = (a: number[], b: number[]): number => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
};

/**
 * Does the caption alone carry the facts (a price and a room count)? Those
 * posts are read as text — the vision model's daily quota (~30 reads) is kept
 * for captions that leave the facts to the on-screen text.
 */
export function captionCarriesFacts(caption: string): boolean {
  const c = toAsciiDigits(caption).toLowerCase();
  const price = /(\d+(?:[.,]\d+)?\s*(?:k|m|million)\b|\d{1,3}(?:[,.\s]\d{3})+|\b(?:rwf|frw|usd)\b|\$\s*\d)/.test(c);
  const rooms = /(\d+\s*(?:-|\s)?\s*(?:bed|bd|br|bedroom|chambre|ibyumba)|studio|single room|self[-\s]?contain)/.test(c);
  return price && rooms;
}

/** Six (or n) evenly spaced timestamps, skipping the first and last 5% (intro cards, end screens). */
export function frameTimes(duration: number, n = 8): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [0];
  const start = duration * 0.05;
  const span = duration * 0.9;
  return Array.from({ length: n }, (_, i) => +(start + (span * (i + 0.5)) / n).toFixed(2));
}

// ── phones ───────────────────────────────────────────────────────────────────
/**
 * A Rwandan mobile in any of the ways people write it → `+2507XXXXXXXX`.
 * 07xx xxx xxx · 7xxxxxxxx · +250 7… · 00250 7… · 250 7… · with spaces, dots, dashes.
 * MTN 078/079, Airtel 072/073. Returns null for anything else.
 */
export function normalizeRwandaPhone(raw: string | null | undefined): string | null {
  const n = normalizePhone(raw, 'RW');
  return n?.startsWith('+250') ? n : null;
}

/** Every Rwandan mobile written inside free text, in order, deduped. */
export function rwandaPhonesInText(text: string): string[] {
  const found = toAsciiDigits(text).match(/(?:\+|00)?\d[\d\s.-]{7,15}\d/g) ?? [];
  const out: string[] = [];
  for (const f of found) {
    const n = normalizeRwandaPhone(f);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

/** Twenty PHONES composite for a normalised `+250…` number. */
export function rwPhonesComposite(e164: string | null | undefined) {
  if (!e164) return undefined;
  return {
    primaryPhoneNumber: e164.replace(/^\+?250/, ''),
    primaryPhoneCountryCode: 'RW',
    primaryPhoneCallingCode: '+250',
    additionalPhones: [],
  };
}

// ── the reader's result ──────────────────────────────────────────────────────
const nullableStr = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : null));
const nullableNum = z
  .union([z.number(), z.string()])
  .nullable()
  .optional()
  .transform((v) => {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : Number(toAsciiDigits(String(v)).replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : null;
  });

export const PROPERTY_TYPES = ['Apartment', 'Villa', 'Townhouse', 'Cottage', 'Tinyhouse', 'Rooms'] as const;

export const TikTokReadSchema = z.object({
  isRental: z.boolean(),
  rejectReason: nullableStr,
  inKigali: z.boolean(),
  period: z.enum(['MONTH', 'NIGHT', 'UNKNOWN']).catch('UNKNOWN'),
  priceRwf: nullableNum,
  priceAsWritten: nullableStr,
  propertyType: z.enum(PROPERTY_TYPES).nullable().optional().catch(null).transform((v) => v ?? null),
  roomType: z.enum(['ENTIRE_HOME', 'PRIVATE_ROOM', 'SHARED_ROOM']).nullable().optional().catch(null).transform((v) => v ?? null),
  bedrooms: nullableNum,
  bathrooms: nullableNum,
  furnished: z.boolean().nullable().optional().transform((v) => v ?? null),
  district: z.enum(['GASABO', 'KICUKIRO', 'NYARUGENGE']).nullable().optional().catch(null).transform((v) => v ?? null),
  neighbourhood: nullableStr,
  phones: z.array(z.string()).optional().default([]),
  posterKind: z.enum(['BROKER', 'OWNER', 'UNKNOWN']).catch('UNKNOWN'),
  features: z.array(z.string()).optional().default([]),
  units: z
    .array(z.object({ bedrooms: nullableNum, priceRwf: nullableNum, propertyType: z.enum(PROPERTY_TYPES).nullable().optional().catch(null).transform((v) => v ?? null) }))
    .optional()
    .default([])
    .catch([]),
  propertyFrames: z.array(z.number().int()).optional().default([]),
  titleEn: nullableStr,
  titleRw: nullableStr,
  descriptionEn: nullableStr,
  // tiktok-v3: the ad's own words, for the TikTok post record.
  onScreenText: nullableStr,
  brokerName: nullableStr,
  confidence: z.number().min(0).max(1).catch(0.5),
});
export type TikTokRead = z.infer<typeof TikTokReadSchema>;

/** The reader's text → a validated read. Throws with the zod message on a bad shape. */
export function parseTikTokRead(text: string): TikTokRead {
  const read = TikTokReadSchema.parse(extractJsonObject(text));
  // No price, no period: readers default to MONTH, which reads as a fact it isn't.
  return read.priceRwf == null ? { ...read, period: 'UNKNOWN' } : read;
}

// ── what a read becomes ──────────────────────────────────────────────────────
export type District = 'GASABO' | 'KICUKIRO' | 'NYARUGENGE';

/**
 * The district, trusting a named sector/neighbourhood over the reader's own
 * guess — the gazetteer knows Kimironko is Gasabo; the reader only thinks so.
 */
export function resolveDistrict(read: Pick<TikTokRead, 'district' | 'neighbourhood'>, caption = ''): District | null {
  for (const text of [read.neighbourhood, caption]) {
    const d = districtForPlace(text);
    if (d !== 'UNKNOWN') return d;
  }
  return read.district ?? null;
}

/** The phones to file: the reader's, validated, plus any the caption spells out. */
export function phonesFor(read: Pick<TikTokRead, 'phones'>, caption: string): string[] {
  const out: string[] = [];
  for (const p of [...read.phones.map(normalizeRwandaPhone), ...rwandaPhonesInText(caption)]) if (p && !out.includes(p)) out.push(p);
  return out;
}

/** "hafi ya Kigali", "near Kigali", "près de Kigali" — said of homes that are NOT in it. */
const NEAR_KIGALI = /(hafi\s+(?:ya|y'|y’)\s*kigali|near\s+kigali|close\s+to\s+kigali|pr[eè]s\s+de\s+kigali|outside\s+kigali)/i;

/**
 * Is the home in Kigali? The gazetteer outranks the reader: it filed a
 * Norvege flat (Nyarugenge) as "outside Kigali" and a Kamonyi house captioned
 * "hafi ya kigali" as inside. The named neighbourhood decides first, then
 * the caption, then the reader.
 */
export function inKigaliFor(read: Pick<TikTokRead, 'inKigali' | 'neighbourhood'>, caption = ''): boolean {
  const hood = districtForPlace(read.neighbourhood);
  if (hood !== 'UNKNOWN') return true;
  if (NEAR_KIGALI.test(caption) || NEAR_KIGALI.test(read.neighbourhood ?? '')) return false;
  if (districtForPlace(caption) !== 'UNKNOWN') return true;
  return read.inKigali;
}

/** Should this read become a CRM home? `null` = yes, otherwise the reason it is skipped. */
export function skipReasonFor(read: TikTokRead, opts: { caption?: string; minConfidence?: number } = {}): string | null {
  if (!read.isRental) return `not a rental${read.rejectReason ? `: ${read.rejectReason}` : ''}`;
  if (!inKigaliFor(read, opts.caption)) return 'outside Kigali';
  // "?bd ? RWF" at 0.6 reached VETTING four times from one account (10-20).
  if (read.priceRwf == null && read.bedrooms == null && !read.units?.length) return 'no price and no rooms';
  const min = opts.minConfidence ?? 0.6;
  if (read.confidence < min) return `low confidence ${read.confidence}`;
  return null;
}

/**
 * Kigali rents people actually ask (2026-10: 1bd ~150k, villas ~3M a month).
 * Outside the band is usually a misread ("20000" was a deposit, "300" was
 * USD) — kept, but flagged so nobody quotes it.
 */
export const PRICE_BAND = { MONTH: [60_000, 15_000_000], NIGHT: [10_000, 1_000_000] } as const;
export function priceLooksWrong(read: Pick<TikTokRead, 'priceRwf' | 'period'>): boolean {
  if (read.priceRwf == null || read.period === 'UNKNOWN') return false;
  const [lo, hi] = PRICE_BAND[read.period];
  return read.priceRwf < lo || read.priceRwf > hi;
}

/** The currency the post wrote the price in, when it was not RWF. */
export function currencyAsWritten(priceAsWritten: string | null | undefined): 'USD' | 'EUR' | null {
  const s = priceAsWritten ?? '';
  if (/\$|\busd\b|dollars?/i.test(s)) return 'USD';
  if (/€|\beur(?:o|os)?\b/i.test(s)) return 'EUR';
  return null;
}

/** Frame paths the reader said show the property (1-based), falling back to none rather than faces. */
export function propertyFramePaths(frames: string[], picks: number[], max = 6): string[] {
  const seen = new Set<number>();
  const out: string[] = [];
  for (const p of picks) {
    if (p >= 1 && p <= frames.length && !seen.has(p)) {
      seen.add(p);
      out.push(frames[p - 1]);
    }
    if (out.length >= max) break;
  }
  return out;
}

/** A one-line title when the reader gave none: "2-bedroom apartment in Nyamirambo". */
export function fallbackTitle(read: TikTokRead): string {
  const beds = read.bedrooms ? `${read.bedrooms}-bedroom ` : '';
  const type = (read.propertyType ?? 'home').toLowerCase().replace('rooms', 'room');
  const where = read.neighbourhood ?? 'Kigali';
  return `${beds}${type} in ${where}`.replace(/^\w/, (c) => c.toUpperCase());
}

export { placeToken };

/**
 * Same facts = probably the same house — posted twice by one broker, or by two
 * brokers sharing a listing (Kigali brokers re-post each other's homes, so the
 * handle is not part of the key). Prices are bucketed to 5% to absorb "450k"
 * against "450,000 + commission".
 */
const BROAD_PLACES = new Set(['kigali', 'kigali city', 'rwanda', 'kigali rwanda']);

export function dupKey(_handle: string, read: Pick<TikTokRead, 'priceRwf' | 'bedrooms' | 'neighbourhood'>): string | null {
  if (read.priceRwf == null || read.bedrooms == null) return null;
  const place = placeToken(read.neighbourhood);
  // "Kigali" names a city, not a street: two 1-bedrooms at one price there are two homes.
  if (!place || BROAD_PLACES.has(place)) return null;
  const bucket = Math.round(Math.log(read.priceRwf) / Math.log(1.05));
  return [read.bedrooms, bucket, place].join('|');
}

/**
 * One post, one or several homes. A broker's "1bd 600k / 2bd 700k / 3bd 800k"
 * is three homes; the first keeps the video's own `tiktok:<id>` and the rest
 * get `tiktok:<id>#2`, `#3` so each has a stable key of its own.
 */
export function unitReads(videoId: string, read: TikTokRead): { sourceId: string; read: TikTokRead }[] {
  // Reads stored before tiktok-v2 have no `units` at all.
  if ((read.units ?? []).length < 2) return [{ sourceId: `tiktok:${videoId}`, read }];
  return read.units.map((u, i) => {
    const unit: TikTokRead = {
      ...read,
      bedrooms: u.bedrooms ?? read.bedrooms,
      priceRwf: u.priceRwf ?? read.priceRwf,
      propertyType: u.propertyType ?? read.propertyType,
      units: [],
    };
    // The reader's title names the first unit; the others get a factual one.
    if (i > 0) Object.assign(unit, { titleEn: null, titleRw: null });
    return { sourceId: i === 0 ? `tiktok:${videoId}` : `tiktok:${videoId}#${i + 1}`, read: unit };
  });
}

const linkList = (urls: string[], label = '') =>
  urls.length
    ? { primaryLinkUrl: urls[0], primaryLinkLabel: label, secondaryLinks: urls.slice(1).map((url) => ({ url, label })) }
    : undefined;
const rwf = (n: number | null) => (n != null ? { amountMicros: Math.round(n * 1_000_000), currencyCode: 'RWF' } : undefined);

/** The Twenty `home` body for one read video. Undefined values are dropped by the caller. */
export function homeBody(row: VideoRow, read: TikTokRead, opts: { frameUrls: string[]; phone: string | null; hostName: string; promptVersion: string; duplicate: boolean; sourceId?: string }) {
  const district = resolveDistrict(read, row.meta?.caption ?? '');
  const title = read.titleEn ?? fallbackTitle(read);
  const currency = currencyAsWritten(read.priceAsWritten);
  // The board's own chips: a wrong-looking price outranks a missing phone,
  // since a call fixes the phone but a quoted misread loses the tenant.
  const qualificationStatus = priceLooksWrong(read) ? 'PRICE_ANOMALY' : !opts.phone ? 'UNREACHABLE_HOST' : undefined;
  return {
    source: 'TIKTOK',
    sourceId: opts.sourceId ?? `tiktok:${row.videoId}`,
    sourceUrl: linkList([row.url], 'TikTok'),
    scrapedAt: new Date().toISOString(),
    country: 'RWANDA',
    city: 'KIGALI',
    zone: district ? `KIGALI_${district}` : undefined,
    homeState: district ?? undefined,
    homeAddress: read.neighbourhood ? { addressStreet1: read.neighbourhood, addressCity: 'Kigali', addressCountry: 'Rwanda' } : undefined,
    hostName: opts.hostName,
    hostPhone: rwPhonesComposite(opts.phone),
    title,
    titleEn: title,
    titleRw: read.titleRw ?? undefined,
    description: read.descriptionEn ?? row.meta?.caption ?? undefined,
    descriptionEn: read.descriptionEn ?? undefined,
    notesEn: [
      read.priceAsWritten ? `Price as written: ${read.priceAsWritten}` : null,
      currency ? `Currency as written: ${currency} — RWF price is converted, confirm with the broker.` : null,
      read.priceRwf == null ? 'No price in the post — ask the broker.' : null,
      priceLooksWrong(read) ? `Price ${read.priceRwf} RWF/${read.period.toLowerCase()} is outside the usual Kigali band — check before quoting.` : null,
      !opts.phone ? 'No phone in the post — reach the poster on TikTok.' : null,
      row.photoMode ? 'Photo-mode post: the photos are its cover images.' : null, read.features.length ? `Features: ${read.features.join(', ')}` : null, `Read by tiktok ${opts.promptVersion}, confidence ${read.confidence}`]
      .filter(Boolean)
      .join('\n'),
    // Twenty keys SELECT options in UPPER_SNAKE (live: APARTMENT, VILLA, …).
    propertyType: read.propertyType ? read.propertyType.toUpperCase() : undefined,
    roomType: read.roomType ?? undefined,
    bedrooms: read.bedrooms ?? undefined,
    bathrooms: read.bathrooms ?? undefined,
    amenitiesRaw: read.features.length ? read.features : undefined,
    rentPeriod: read.period,
    priceMonthLocal: read.period === 'MONTH' ? rwf(read.priceRwf) : undefined,
    priceNightLocal: read.period === 'NIGHT' ? rwf(read.priceRwf) : undefined,
    priceConfirmedByHost: false,
    photoUrls: linkList(opts.frameUrls),
    coverPhotoUrl: linkList(opts.frameUrls.slice(0, 1)),
    photoCount: opts.frameUrls.length,
    photosRehosted: opts.frameUrls.length > 0,
    photoStage: opts.frameUrls.length ? 'INCOMPLETE' : 'NOT_FOUND',
    duplicateCheck: opts.duplicate ? 'SUSPECTED' : 'NONE',
    qualificationStatus,
    hotelAgencyCheck: read.posterKind === 'BROKER' ? 'LARGE_PORTFOLIO' : 'UNCHECKED',
    labels: ['SCRAPED'],
    homeStatus: 'SCRAPED',
    pipelineStage: 'VETTING',
    publishState: 'NOT_IMPORTED',
  };
}

/**
 * Which ledger rows get a TikTok post record: every video the reader judged or
 * is waiting to judge. Rows the caption gate or the age gate dropped unread
 * have nothing worth keeping beyond the ledger.
 */
export function wantsPost(row: VideoRow): boolean {
  if (!row.meta) return false;
  if (row.state === 'fetched' || row.state === 'read' || row.state === 'upserted') return true;
  return row.state === 'skipped' && !!row.read;
}

export function postStatus(row: VideoRow): 'WAITING' | 'LISTING' | 'JOINED_EXISTING' | 'SKIPPED' {
  if (row.state === 'upserted') return row.mergedInto ? 'JOINED_EXISTING' : 'LISTING';
  if (row.state === 'skipped') return 'SKIPPED';
  return 'WAITING';
}

/** The Twenty `tiktokPost` body for one video: the ad as posted. Undefined values are dropped by the caller. */
export function postBody(row: VideoRow) {
  const read = row.read;
  const published = row.meta?.timestamp ? new Date(row.meta.timestamp * 1000) : null;
  const broker = read?.brokerName ?? row.meta?.channel ?? row.handle;
  const phones = read ? phonesFor(read, `${row.meta?.caption ?? ''} ${row.handle} ${row.transcript ?? ''}`) : rwandaPhonesInText(`${row.meta?.caption ?? ''} ${row.handle}`);
  return {
    name: `${broker} · ${published ? published.toISOString().slice(0, 10) : row.videoId}`,
    videoId: row.videoId,
    videoUrl: linkList([row.url], 'TikTok'),
    tiktokHandle: row.handle,
    accountName: row.meta?.channel ?? undefined,
    brokerName: broker,
    publishedAt: published?.toISOString(),
    caption: row.meta?.caption || undefined,
    onScreenText: read?.onScreenText ?? undefined,
    transcript: row.transcript || undefined,
    phonesSeen: phones.length ? phones.join(', ') : undefined,
    views: row.meta?.views ?? undefined,
    durationSec: row.meta?.duration ?? undefined,
    postStatus: postStatus(row),
    skipReason: row.state === 'skipped' ? row.skipReason : undefined,
    coverUrl: linkList(row.frameUrls ?? []),
    readVersion: row.readVersion,
    scrapedAt: row.discoveredAt,
    homeId: row.state === 'upserted' ? (row.mergedInto ?? row.homeId) : undefined,
    hostId: row.state === 'upserted' ? row.hostId : undefined,
  };
}

/** The Twenty `host` body for a TikTok poster. */
export function hostBody(row: VideoRow, read: TikTokRead, phone: string | null) {
  return {
    name: row.meta?.channel || row.handle,
    source: 'TIKTOK',
    tiktokHandle: row.handle,
    phone: rwPhonesComposite(phone),
    contactFoundVia: 'TIKTOK',
    preferredLanguage: 'RW',
    agencySuspected: read.posterKind === 'BROKER',
    contactConfidence: phone ? undefined : 'NONE',
    notes: `TikTok @${row.handle} — https://www.tiktok.com/@${row.handle}`,
  };
}
