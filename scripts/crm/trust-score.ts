/**
 * Trust-scoring rubric (Epic G1.3) — pure functions, no I/O.
 *
 * Implements docs/growth.md §3: a Host score (0–100) + a Home score (0–100),
 * blended into an Overall (0–100) with hard gates → a trust band. Also derives
 * the check fields (location / hotel-agency / data-completeness / price-sanity /
 * duplicate) from the available data. Reads fields defensively so it works on
 * both scraped records and Twenty records (same camelCase names).
 *
 * `rubricVersion` is bumped when weights change so old scores aren't confused
 * with new ones.
 */
export const RUBRIC_VERSION = 'v1';

// ── inputs (loose — scrape record or Twenty record) ──────────────────────────
export interface HostLike {
  superhost?: boolean | null;
  hostSince?: string | null; // ISO date
  portfolioReviewsTotal?: number | null;
  responseRate?: number | null;
  responseTime?: string | null; // WITHIN_HOUR | FEW_HOURS | WITHIN_DAY | ...
  whatsappStatus?: string | null; // UNKNOWN | INVALID | VALID_DELIVERED
  whatsapp?: unknown;
  phone?: unknown;
  facebookUrl?: unknown;
  crossSourceCorroborated?: string | null; // NONE | PARTIAL | CONFIRMED
  agencySuspected?: boolean | null;
  airbnbListingsCount?: number | null;
  identityVerified?: string | null; // UNVERIFIED | NAME_MATCHED | OWNERSHIP_CLAIMED | ID_SEEN
}
/** Outreach state (lives on the Opportunity). Absent for freshly-scraped records. */
export interface Engagement {
  repliedAt?: string | null;
  onboardingStage?: string | null;
}
export interface HomeLike {
  avgRating?: number | null;
  reviewCount?: number | null;
  photoCount?: number | null;
  photoQuality?: number | null; // manual 1–5
  priceNightSar?: number | null;
  priceNightSdg?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  roomType?: string | null;
  title?: string | null;
  description?: string | null;
  bedrooms?: number | null;
  beds?: number | null;
  bathrooms?: number | null;
  guestCapacity?: number | null;
  amenitiesRaw?: string[] | null;
  photosRehosted?: boolean | null;
  priceConfirmedByHost?: boolean | null;
}

export interface Checks {
  locationCheck: 'PASS' | 'SUDAN_ONLY' | 'FAIL' | 'UNCHECKED';
  hotelAgencyCheck: 'PASS' | 'LARGE_PORTFOLIO' | 'HOTEL' | 'UNCHECKED';
  dataCompletenessPct: number;
  priceSanityRatio: number | null;
  duplicateCheck: 'NONE' | 'SUSPECTED' | 'CONFIRMED' | 'UNCHECKED';
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const YEAR_MS = 365.25 * 24 * 3600 * 1000;

// ── city centroids for the location check ────────────────────────────────────
const CITY_CENTROID: Record<string, [number, number]> = {
  PORT_SUDAN: [19.62, 37.22],
  KHARTOUM: [15.5, 32.56],
  OMDURMAN: [15.64, 32.48],
  BAHRI: [15.63, 32.55],
  EAST_NILE: [15.6, 32.72],
};
const inSudan = (lat: number, lng: number) => lat >= 8.5 && lat <= 23.0 && lng >= 21.5 && lng <= 39.0;
function haversineKm(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [la1, lo1] = a, [la2, lo2] = b;
  const dLa = toRad(la2 - la1), dLo = toRad(lo2 - lo1);
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLo / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(s));
}

// ── derived checks ───────────────────────────────────────────────────────────
export function deriveChecks(
  home: HomeLike,
  host: HostLike | undefined,
  market: { medianPrice: number | null; isDuplicate: boolean },
): Checks {
  // location
  let locationCheck: Checks['locationCheck'] = 'UNCHECKED';
  const { latitude: lat, longitude: lng } = home;
  if (lat != null && lng != null && !(lat === 0 && lng === 0)) {
    if (!inSudan(lat, lng)) locationCheck = 'FAIL';
    else {
      const centroid = CITY_CENTROID[home.city ?? ''];
      locationCheck = centroid && haversineKm([lat, lng], centroid) <= 25 ? 'PASS' : 'SUDAN_ONLY';
    }
  } else if (lat === 0 && lng === 0) {
    locationCheck = 'FAIL';
  }

  // hotel / agency
  const portfolio = host?.airbnbListingsCount ?? 0;
  let hotelAgencyCheck: Checks['hotelAgencyCheck'];
  if (home.roomType === 'HOTEL_ROOM' || home.roomType === 'SHARED_ROOM') hotelAgencyCheck = 'HOTEL';
  else if (host?.agencySuspected || portfolio > 15) hotelAgencyCheck = 'HOTEL';
  else if (portfolio >= 9) hotelAgencyCheck = 'LARGE_PORTFOLIO';
  else if (home.roomType) hotelAgencyCheck = 'PASS';
  else hotelAgencyCheck = 'UNCHECKED';

  // data completeness — 10 core fields
  const raw = home.amenitiesRaw ?? [];
  const core = [
    !!home.title,
    (home.description?.length ?? 0) >= 100,
    home.bedrooms != null,
    home.beds != null,
    home.bathrooms != null,
    home.guestCapacity != null,
    lat != null && lng != null,
    raw.length >= 5,
    (home.photoCount ?? 0) >= 3,
    home.priceNightSar != null || home.priceNightSdg != null,
  ];
  const dataCompletenessPct = Math.round((core.filter(Boolean).length / core.length) * 100);

  // price sanity (currency-agnostic ratio; SAR pre-conversion works fine)
  const price = home.priceNightSdg ?? home.priceNightSar ?? null;
  const priceSanityRatio = price != null && market.medianPrice ? +(price / market.medianPrice).toFixed(2) : null;

  const duplicateCheck: Checks['duplicateCheck'] = market.isDuplicate ? 'SUSPECTED' : 'NONE';

  return { locationCheck, hotelAgencyCheck, dataCompletenessPct, priceSanityRatio, duplicateCheck };
}

// ── host score (§3.1) ────────────────────────────────────────────────────────
export function hostScore(host: HostLike, opp?: Engagement): number {
  let s = 0;
  if (host.superhost) s += 12;

  const tenureY = host.hostSince ? (Date.now() - Date.parse(host.hostSince)) / YEAR_MS : null;
  s += tenureY == null ? 0 : tenureY >= 5 ? 12 : tenureY >= 3 ? 9 : tenureY >= 1 ? 5 : 2;

  const rev = host.portfolioReviewsTotal ?? 0;
  s += rev >= 100 ? 15 : rev >= 30 ? 10 : rev >= 10 ? 6 : rev >= 1 ? 3 : 0;

  const rr = host.responseRate ?? -1;
  s += rr >= 90 ? 8 : rr >= 70 ? 5 : rr >= 50 ? 2 : 0;

  s += host.responseTime === 'WITHIN_HOUR' ? 4 : host.responseTime === 'FEW_HOURS' ? 3 : host.responseTime === 'WITHIN_DAY' ? 1 : 0;

  // contact reachability
  s += host.whatsappStatus === 'VALID_DELIVERED' ? 15 : host.phone || host.whatsapp ? 8 : host.facebookUrl ? 4 : 0;

  // outreach engagement
  const replied = !!opp?.repliedAt;
  const stageRank = ['SCRAPED', 'CONTACT_HUNT', 'CONTACTED', 'IN_CONVERSATION', 'ONBOARDING', 'TRUST_REVIEW', 'LIVE'].indexOf(opp?.onboardingStage ?? 'SCRAPED');
  const identityStrong = host.identityVerified === 'OWNERSHIP_CLAIMED' || host.identityVerified === 'ID_SEEN';
  s += identityStrong || (replied && stageRank >= 3) ? 25 : replied ? 15 : host.whatsappStatus === 'VALID_DELIVERED' ? 3 : 0;

  s += host.crossSourceCorroborated === 'CONFIRMED' ? 9 : host.crossSourceCorroborated === 'PARTIAL' ? 4 : 0;

  if (host.agencySuspected || (host.airbnbListingsCount ?? 0) > 8) s -= 15;

  return clamp(Math.round(s));
}
export const hostBand = (s: number) => (s >= 70 ? 'TRUSTED' : s >= 45 ? 'PROMISING' : s >= 25 ? 'HOLD' : 'LOW');

// ── home score (§3.2) ────────────────────────────────────────────────────────
export function homeScore(home: HomeLike, c: Checks): number {
  let s = 0;
  const r = home.avgRating;
  s += r == null ? 6 : r >= 4.8 ? 18 : r >= 4.5 ? 14 : r >= 4.0 ? 9 : r >= 3.5 ? 4 : 0;

  const rc = home.reviewCount ?? 0;
  s += rc >= 50 ? 12 : rc >= 20 ? 9 : rc >= 5 ? 6 : rc >= 1 ? 3 : 0;

  const pc = home.photoCount ?? 0;
  s += pc >= 10 ? 10 : pc >= 6 ? 7 : pc >= 3 ? 4 : 0;

  const pq = home.photoQuality ?? 0;
  s += pq === 5 ? 6 : pq === 4 ? 5 : pq === 3 ? 3 : 0;

  const psr = c.priceSanityRatio;
  s += psr == null ? 0 : psr >= 0.5 && psr <= 2.0 ? 10 : psr >= 0.33 && psr <= 3.0 ? 5 : 0;

  s += Math.round((c.dataCompletenessPct / 100) * 10);

  s += c.locationCheck === 'PASS' ? 12 : c.locationCheck === 'SUDAN_ONLY' ? 5 : 0;
  s += c.duplicateCheck === 'NONE' ? 12 : 0;
  s += c.hotelAgencyCheck === 'PASS' ? 10 : c.hotelAgencyCheck === 'LARGE_PORTFOLIO' ? 5 : 0;

  return clamp(Math.round(s));
}

// ── overall + hard gates (§3.3) ──────────────────────────────────────────────
export interface TrustResult {
  hostScore: number;
  hostBand: string;
  homeScore: number;
  overallTrustScore: number;
  trustBand: 'AUTO_ONBOARD' | 'MANUAL_REVIEW' | 'HOLD' | 'REJECT';
  publishReady: boolean;
  checks: Checks;
  rubricVersion: string;
  gateNote: string | null;
}

export function scoreOne(
  home: HomeLike,
  host: HostLike | undefined,
  market: { medianPrice: number | null; isDuplicate: boolean },
  opp?: Engagement,
): TrustResult {
  const checks = deriveChecks(home, host, market);
  const hs = host ? hostScore(host, opp) : 0;
  const hm = homeScore(home, checks);
  const overall = Math.round(0.45 * hs + 0.55 * hm);

  // band from score, then hard gates override
  let band: TrustResult['trustBand'] = overall >= 75 ? 'AUTO_ONBOARD' : overall >= 55 ? 'MANUAL_REVIEW' : overall >= 35 ? 'HOLD' : 'REJECT';
  let gate: string | null = null;
  if (checks.duplicateCheck === 'CONFIRMED') gate = 'duplicate';
  else if (checks.locationCheck === 'FAIL') { band = 'REJECT'; gate = 'location-fail'; }
  else if (checks.hotelAgencyCheck === 'HOTEL') { band = 'REJECT'; gate = 'hotel-excluded'; }

  const replied = !!opp?.repliedAt;
  const publishReady =
    (band === 'AUTO_ONBOARD' || band === 'MANUAL_REVIEW') &&
    replied &&
    !!home.priceConfirmedByHost &&
    !!home.photosRehosted &&
    checks.duplicateCheck !== 'CONFIRMED' &&
    gate === null;

  return { hostScore: hs, hostBand: hostBand(hs), homeScore: hm, overallTrustScore: overall, trustBand: band, publishReady, checks, rubricVersion: RUBRIC_VERSION, gateNote: gate };
}

// ── batch helpers (market context) ───────────────────────────────────────────
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Median nightly price per (city|roomType) bucket across the batch. */
export function priceMedians(homes: HomeLike[]): Map<string, number> {
  const buckets = new Map<string, number[]>();
  for (const h of homes) {
    const p = h.priceNightSdg ?? h.priceNightSar;
    if (p == null) continue;
    const k = `${h.city ?? '?'}|${h.roomType ?? '?'}`;
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(p);
  }
  const out = new Map<string, number>();
  for (const [k, xs] of buckets) { const m = median(xs); if (m != null) out.set(k, m); }
  return out;
}
export const priceBucketKey = (h: HomeLike) => `${h.city ?? '?'}|${h.roomType ?? '?'}`;

/**
 * Duplicate suspects: homes sharing ~coords (≤~110 m) AND a similar title.
 * Returns the set of listing ids that are the *non-canonical* member of a cluster.
 */
export function duplicateSuspects(homes: (HomeLike & { airbnbListingId?: string })[]): Set<string> {
  const seen = new Map<string, string>(); // cluster key → first id
  const dups = new Set<string>();
  for (const h of homes) {
    if (h.latitude == null || h.longitude == null || !h.airbnbListingId) continue;
    const key = `${h.latitude.toFixed(3)},${h.longitude.toFixed(3)}|${(h.title ?? '').toLowerCase().slice(0, 10)}`;
    if (seen.has(key)) dups.add(h.airbnbListingId);
    else seen.set(key, h.airbnbListingId);
  }
  return dups;
}
