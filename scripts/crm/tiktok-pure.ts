/**
 * The TikTok lane's pure core — no network, no disk. Everything the CLI
 * (`tiktok.ts`) decides about a video is decided here so it can be tested.
 *
 * Fixtures in tests/crm/tiktok.test.ts are anonymised: the repo is public.
 */
import { z } from 'zod';
import { extractJsonObject, toAsciiDigits } from './home-intake-pure';
import { normalizePhone } from '../../src/lib/phone';
import { districtForPlace } from '../../src/lib/geo/rwanda-places';

// ── the ledger ───────────────────────────────────────────────────────────────
export type VideoState = 'discovered' | 'fetched' | 'read' | 'upserted' | 'skipped';

export interface VideoMeta {
  caption: string;
  uploader: string;
  channel: string | null;
  timestamp: number | null;
  duration: number | null;
  views: number | null;
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
  homeId?: string;
  hostId?: string;
  error?: string;
}

export interface SeedRow {
  status: 'active' | 'proposed' | 'ignored';
  from: 'manual' | 'search';
  addedAt: string;
  hits?: number;
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

/** A cheap gate before the reader: does the caption look like a rental post at all? */
export function looksLikeRental(caption: string): boolean {
  return /(rent|renting|for\s*rent|ikodesh|gukodesh|kodesha|louer|location|bed\s*rooms?|bedroom|chambre|studio|apartment|appartement|furnished|self[-\s]?contain|compound|annex|ibyumba|icyumba|inzu)/i.test(
    caption,
  );
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
  propertyFrames: z.array(z.number().int()).optional().default([]),
  titleEn: nullableStr,
  titleRw: nullableStr,
  descriptionEn: nullableStr,
  confidence: z.number().min(0).max(1).catch(0.5),
});
export type TikTokRead = z.infer<typeof TikTokReadSchema>;

/** The reader's text → a validated read. Throws with the zod message on a bad shape. */
export function parseTikTokRead(text: string): TikTokRead {
  return TikTokReadSchema.parse(extractJsonObject(text));
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

/** Same broker + same facts = probably the same house posted twice. */
export function dupKey(handle: string, read: TikTokRead): string | null {
  if (read.priceRwf == null || read.bedrooms == null) return null;
  return [handle, read.bedrooms, read.priceRwf, (read.neighbourhood ?? '').toLowerCase()].join('|');
}

const linkList = (urls: string[], label = '') =>
  urls.length
    ? { primaryLinkUrl: urls[0], primaryLinkLabel: label, secondaryLinks: urls.slice(1).map((url) => ({ url, label })) }
    : undefined;
const rwf = (n: number | null) => (n != null ? { amountMicros: Math.round(n * 1_000_000), currencyCode: 'RWF' } : undefined);

/** The Twenty `home` body for one read video. Undefined values are dropped by the caller. */
export function homeBody(row: VideoRow, read: TikTokRead, opts: { frameUrls: string[]; phone: string | null; hostName: string; promptVersion: string; duplicate: boolean }) {
  const district = resolveDistrict(read, row.meta?.caption ?? '');
  const title = read.titleEn ?? fallbackTitle(read);
  return {
    source: 'TIKTOK',
    sourceId: `tiktok:${row.videoId}`,
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
    notesEn: [read.priceAsWritten ? `Price as written: ${read.priceAsWritten}` : null, read.features.length ? `Features: ${read.features.join(', ')}` : null, `Read by tiktok ${opts.promptVersion}, confidence ${read.confidence}`]
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
