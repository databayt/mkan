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
}

export interface SeedRow {
  status: 'active' | 'proposed' | 'ignored';
  from: 'manual' | 'search';
  addedAt: string;
  hits?: number;
  /** TikTok's secUid, learnt from one of the account's videos. */
  channelId?: string;
  /** Runs in a row that could not list this account. */
  failStreak?: number;
  lastListedAt?: string;
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
export function looksLikeRental(caption: string): boolean {
  if (RENT_WORDS.test(caption)) return !SALE_WORDS.test(caption) || EXPLICIT_RENT.test(caption);
  if (SALE_WORDS.test(caption)) return false;
  return captionWords(caption).length < 12;
}

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

/** Should this read become a CRM home? `null` = yes, otherwise the reason it is skipped. */
export function skipReasonFor(read: TikTokRead, minConfidence = 0.5): string | null {
  if (!read.isRental) return `not a rental${read.rejectReason ? `: ${read.rejectReason}` : ''}`;
  if (!read.inKigali) return 'outside Kigali';
  if (read.confidence < minConfidence) return `low confidence ${read.confidence}`;
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
export function dupKey(_handle: string, read: Pick<TikTokRead, 'priceRwf' | 'bedrooms' | 'neighbourhood'>): string | null {
  if (read.priceRwf == null || read.bedrooms == null) return null;
  const place = placeToken(read.neighbourhood);
  if (!place) return null;
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
    notesEn: [read.priceAsWritten ? `Price as written: ${read.priceAsWritten}` : null, read.priceRwf == null ? 'No price in the post — ask the broker.' : null, read.features.length ? `Features: ${read.features.join(', ')}` : null, `Read by tiktok ${opts.promptVersion}, confidence ${read.confidence}`]
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
    hotelAgencyCheck: read.posterKind === 'BROKER' ? 'LARGE_PORTFOLIO' : 'UNCHECKED',
    labels: ['SCRAPED'],
    homeStatus: 'SCRAPED',
    pipelineStage: 'VETTING',
    publishState: 'NOT_IMPORTED',
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
    notes: `TikTok @${row.handle} — https://www.tiktok.com/@${row.handle}`,
  };
}
