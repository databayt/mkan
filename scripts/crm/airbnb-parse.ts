/**
 * Airbnb → normalized Home/Host record parsers (Epic G1.2).
 *
 * Pure functions over Airbnb's `data-deferred-state` JSON (no browser here — the
 * browser I/O lives in `airbnb-scrape.ts`), so they're unit-testable against a
 * saved payload. Field names on the output match `twenty-schema.ts` so the
 * upsert step maps 1:1.
 *
 * Structure (verified live 2026-07-03):
 *   search: niobeClientData[…].data.presentation.staysSearch.results.searchResults[]
 *     .demandStayListing.id      → base64 "DemandStayListing:<numericId>"
 *     .subtitle / .nameLocalized → listing name
 *     .title                     → "Hotel in Port Sudan" (category + city)
 *     .demandStayListing.location.coordinate → { latitude, longitude }
 *     .avgRatingLocalized        → "4.17 (6)"  (rating + review count)
 *     .structuredContent.primaryLine[] → "20 bedrooms" / "38 beds" / "21 baths"
 *     .structuredDisplayPrice    → nightly SR price
 *     .contextualPictures[].picture → card photos
 *   pdp: object with isSuperhost = host; htmlDescription.htmlText; roomType;
 *        seeAllAmenityGroups/previewAmenitiesGroups; all muscache photo URLs.
 */

export interface HomeRecord {
  source: 'AIRBNB';
  airbnbListingId: string;
  airbnbUrl: string;
  title: string | null;
  description: string | null;
  roomType: 'ENTIRE_HOME' | 'PRIVATE_ROOM' | 'SHARED_ROOM' | 'HOTEL_ROOM' | null;
  airbnbCategory: string | null;
  city: string;
  latitude: number | null;
  longitude: number | null;
  bedrooms: number | null;
  beds: number | null;
  bathrooms: number | null;
  guestCapacity: number | null;
  amenitiesRaw: string[];
  photoUrls: string[];
  photoCount: number;
  coverPhotoUrl: string | null;
  priceNightSar: number | null;
  avgRating: number | null;
  reviewCount: number | null;
  mkanPropertyType: string | null;
  hostAirbnbId: string | null; // link → HostRecord.airbnbHostId
}

export interface HostRecord {
  source: 'AIRBNB';
  airbnbHostId: string;
  airbnbProfileUrl: string | null;
  avatarUrl: string | null;
  name: string | null;
  superhost: boolean;
  hostSince: string | null; // ISO date (approx, from timeAsHost)
  responseRate: number | null;
  airbnbListingsCount: number | null;
  portfolioReviewsTotal: number | null;
  portfolioAvgRating: number | null;
}

// ── low-level helpers ────────────────────────────────────────────────────────

/** Decode an Airbnb global id: raw numeric, or base64 "DemandStayListing:123" / "DemandUser:123". */
export function decodeAirbnbId(v: string | number | undefined | null): string | null {
  if (v == null) return null;
  const s = String(v);
  if (/^\d+$/.test(s)) return s;
  try {
    const decoded = Buffer.from(s, 'base64').toString('utf8'); // "DemandStayListing:123"
    const id = decoded.split(':').pop();
    return id && /^\d+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
export const decodeListingId = decodeAirbnbId;

export function parseRating(s: string | undefined): { rating: number | null; reviews: number | null } {
  if (!s) return { rating: null, reviews: null };
  const m = s.match(/([\d.]+)\s*\((\d+)\)/); // "4.17 (6)"
  if (m) return { rating: parseFloat(m[1]), reviews: parseInt(m[2], 10) };
  return { rating: null, reviews: null };
}

const num = (s: string) => parseFloat(s.replace(/,/g, ''));

/** Nightly SR price from structuredDisplayPrice (prefers the "x SR <n>" line). */
export function parsePriceSar(sdp: any): number | null {
  const details = sdp?.explanationData?.priceDetails ?? [];
  for (const g of details) {
    for (const it of g?.items ?? []) {
      const m = String(it?.description ?? '').match(/x\s*SR\s*([\d,.]+)/i); // "5 nights x SR 490.30"
      if (m) return num(m[1]);
    }
  }
  // Fallback: total ÷ nights from the primary line.
  const label = sdp?.primaryLine?.accessibilityLabel ?? '';
  const t = label.match(/SR\s*([\d,.]+)\s*for\s*(\d+)\s*night/i); // "SR 2,452 for 5 nights"
  if (t) return Math.round(num(t[1]) / parseInt(t[2], 10));
  const p = String(sdp?.primaryLine?.price ?? '').match(/SR\s*([\d,.]+)/i);
  return p ? num(p[1]) : null;
}

/** bedrooms / beds / baths from the structuredContent primaryLine messages. */
export function parseBedInfo(primaryLine: any[]): { bedrooms: number | null; beds: number | null; bathrooms: number | null } {
  const join = (primaryLine ?? []).map((m) => String(m?.body ?? '')).join(' · ');
  const grab = (re: RegExp) => {
    const m = join.match(re);
    return m ? parseFloat(m[1]) : null;
  };
  return {
    bedrooms: grab(/([\d.]+)\s+bedroom/i),
    beds: grab(/([\d.]+)\s+beds?\b/i),
    bathrooms: grab(/([\d.]+)\s+(?:private\s+|shared\s+)?bath/i),
  };
}

// City derivation moved to `sudan-places.ts`. The version that lived here knew
// five cities and matched on the English title suffix, so a national sweep
// could not be expressed even once the crawl found the listings — and it had no
// way to tell a Sudanese listing from a foreign one. Use `checkPlace()`, which
// weighs coordinates against the place named in the card category.
export { deriveCityFromTitle, checkPlace, classifyPoint } from './sudan-places';

export function mapRoomType(raw: string | null | undefined, category: string | null | undefined): HomeRecord['roomType'] {
  const s = `${raw ?? ''} ${category ?? ''}`.toLowerCase();
  if (/hotel/.test(s)) return 'HOTEL_ROOM';
  if (/shared\s*room/.test(s)) return 'SHARED_ROOM';
  if (/private\s*room/.test(s)) return 'PRIVATE_ROOM';
  if (/entire/.test(s)) return 'ENTIRE_HOME';
  return category ? 'ENTIRE_HOME' : null;
}

/** mkan PropertyType from the Airbnb category title ("Hotel in Port Sudan" → …). */
export function mapPropertyType(category: string | null | undefined, roomType: HomeRecord['roomType']): string | null {
  const s = (category ?? '').toLowerCase();
  if (roomType === 'PRIVATE_ROOM' || roomType === 'SHARED_ROOM') return 'Rooms';
  if (/tiny\s*home|tinyhouse/.test(s)) return 'Tinyhouse';
  if (/villa|entire (?:home|house)|\bhome\b/.test(s)) return 'Villa';
  if (/townhouse/.test(s)) return 'Townhouse';
  if (/guesthouse|guest suite|cottage|bungalow|farm/.test(s)) return 'Cottage';
  if (/apart|rental unit|condo|serviced|loft|flat/.test(s)) return 'Apartment';
  if (/hotel/.test(s)) return null; // excluded from the pipeline (hard gate)
  return 'Apartment';
}

// ── walkers over the deferred JSON ───────────────────────────────────────────

function findByKey(root: any, predicate: (o: any) => boolean): any {
  let hit: any = null;
  const walk = (o: any) => {
    if (hit || !o || typeof o !== 'object') return;
    if (Array.isArray(o)) return o.forEach(walk);
    if (predicate(o)) { hit = o; return; }
    for (const k in o) walk(o[k]);
  };
  walk(root);
  return hit;
}

/** The `results` object (holds searchResults[] + paginationInfo). */
export function findSearchResults(json: any): { searchResults: any[]; paginationInfo: any } | null {
  const results = findByKey(json, (o) => Array.isArray(o.searchResults) && o.searchResults.some((r: any) => r?.demandStayListing));
  return results ? { searchResults: results.searchResults, paginationInfo: results.paginationInfo ?? null } : null;
}

// ── public parsers ───────────────────────────────────────────────────────────

/** One search-results element → a partial Home (enriched later by the PDP). */
export function parseSearchResult(e: any, city: string): HomeRecord | null {
  const id = decodeListingId(e?.demandStayListing?.id);
  if (!id) return null;
  const name = e?.nameLocalized?.localizedStringWithTranslationPreference ?? e?.subtitle ?? null;
  const category = e?.title ?? null;
  const coord = e?.demandStayListing?.location?.coordinate ?? {};
  const { rating, reviews } = parseRating(e?.avgRatingLocalized);
  const bed = parseBedInfo(e?.structuredContent?.primaryLine);
  const photos = (e?.contextualPictures ?? []).map((p: any) => p?.picture).filter(Boolean);
  const roomType = mapRoomType(null, category);
  return {
    source: 'AIRBNB',
    airbnbListingId: id,
    airbnbUrl: `https://www.airbnb.com/rooms/${id}`,
    title: name,
    description: null,
    roomType,
    airbnbCategory: category,
    city,
    latitude: coord?.latitude ?? null,
    longitude: coord?.longitude ?? null,
    bedrooms: bed.bedrooms,
    beds: bed.beds,
    bathrooms: bed.bathrooms,
    guestCapacity: null,
    amenitiesRaw: [],
    photoUrls: photos,
    photoCount: photos.length,
    coverPhotoUrl: photos[0] ?? null,
    priceNightSar: parsePriceSar(e?.structuredDisplayPrice),
    avgRating: rating,
    reviewCount: reviews,
    mkanPropertyType: mapPropertyType(category, roomType),
    hostAirbnbId: null,
  };
}

/**
 * All listing-gallery photos from the raw PDP JSON. Keeps only hosting/miso
 * folders (drops host avatars under /user/ and UI images), then returns the
 * single largest `Hosting-<folderId>` group — the listing's own gallery — so
 * stray "similar listings" photos don't leak in. (Airbnb's photo folder id
 * differs from the listing id, so we group rather than match the listing id.)
 */
export function extractPdpPhotos(raw: string, _listingId?: string): string[] {
  const out = new Set<string>();
  const rx = /https:\/\/a0\.muscache\.com\/im\/pictures\/[^\s"'\\]+?\.(?:jpe?g|png|webp)/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(raw))) out.add(m[0].split('?')[0]);
  const gallery = [...out].filter((u) => /\/im\/pictures\/(?:hosting|miso)\//.test(u));
  if (!gallery.length) return [];
  const byFolder = new Map<string, string[]>();
  for (const u of gallery) {
    const f = (u.match(/Hosting-(\d+)/)?.[1]) ?? '_';
    if (!byFolder.has(f)) byFolder.set(f, []);
    byFolder.get(f)!.push(u);
  }
  let best: string[] = [];
  for (const arr of byFolder.values()) if (arr.length > best.length) best = arr;
  return best;
}

/**
 * The PDP's named sections, keyed by `sectionId`.
 *
 * Reading by section id instead of walking the whole document is what keeps
 * `SIMILAR_LISTINGS_CAROUSEL` — which carries other listings and their hosts —
 * from contaminating this listing's fields.
 */
export function pdpSections(json: any): Record<string, any> {
  const container = findByKey(
    json,
    (o) => Array.isArray(o.sections) && o.sections.some((s: any) => typeof s?.sectionId === 'string' && s?.section),
  );
  const out: Record<string, any> = {};
  for (const s of container?.sections ?? []) {
    if (typeof s?.sectionId === 'string' && s.section && !out[s.sectionId]) out[s.sectionId] = s.section;
  }
  return out;
}

/**
 * Airbnb's own analytics payload. Authoritative for the fields it carries —
 * notably `descriptionLanguage`, which states outright which language the host
 * wrote in, and so which side of an AR/EN pair is machine translation.
 */
export function pdpEventData(json: any): any | null {
  return findByKey(json, (o) => o.__typename === 'PdpEventData' && typeof o.listingId === 'string');
}

export type HostSource = 'MEET_YOUR_HOST' | 'EVENT_DATA' | 'HEURISTIC' | null;

export interface PdpParse {
  description: string | null;
  title: string | null;
  roomType: string | null;
  amenities: string[];
  guestCapacity: number | null;
  photos: string[];
  host: Partial<HostRecord> | null;
  /** Which rule resolved the host. HEURISTIC results are not safe to import. */
  hostSource: HostSource;
  coHostIds: string[];
  /** Free-text host bio — the richest contact-hunt surface on the page. */
  hostAbout: string | null;
  /** "Port Sudan, Red Sea, Sudan" — Airbnb's own geocoded place string. */
  locationSubtitle: string | null;
  latitude: number | null;
  longitude: number | null;
  houseRules: string[];
  /** ISO 639-1 language the host authored the description in, per Airbnb. */
  descriptionLanguage: string | null;
  /** True when Airbnb is showing a translation with a "show original" toggle. */
  machineTranslated: boolean | null;
}

/** PDP JSON + raw → every field worth having, read by section rather than walked. */
export function parsePdp(json: any, raw: string, listingId: string): PdpParse {
  const S = pdpSections(json);
  const ev = pdpEventData(json);

  const meetYourHost = S.MEET_YOUR_HOST ?? null;
  const descSection = S.DESCRIPTION_DEFAULT ?? null;
  const locSection = S.LOCATION_DEFAULT ?? null;
  const policies = S.POLICIES_DEFAULT ?? null;

  // ── host, in order of trustworthiness ──────────────────────────────────────
  // The old rule was a first-match walk for `isSuperhost`, which has no idea
  // which section it landed in: a co-host or a carousel listing's host could
  // win on key order alone, and silently own the import.
  let hostCard = meetYourHost?.cardData ?? null;
  let hostSource: HostSource = hostCard ? 'MEET_YOUR_HOST' : null;
  if (!hostCard) {
    const fallback = findByKey(
      json,
      (o) => o.__typename === 'PassportCardData' && (o.userId !== undefined || o.name !== undefined),
    );
    if (fallback) {
      hostCard = fallback;
      hostSource = 'HEURISTIC';
    }
  }

  let host: Partial<HostRecord> | null = null;
  if (hostCard) {
    const stats: any[] = Array.isArray(hostCard.stats) ? hostCard.stats : [];
    const detailText = [
      ...(Array.isArray(meetYourHost?.hostDetails) ? meetYourHost.hostDetails : []),
      ...stats.map((s) => `${s?.label ?? ''} ${s?.value ?? ''}`),
      hostCard.titleText ?? '',
    ].join(' · ');
    const respMatch = detailText.match(/response rate[:\s]*(\d+)/i);

    // `timeAsHost` is structured; the old code parsed it out of display text.
    const t = hostCard.timeAsHost;
    const months = t ? (Number(t.years) || 0) * 12 + (Number(t.months) || 0) : null;
    const since = months != null ? new Date() : null;
    if (since && months != null) since.setMonth(since.getMonth() - months);

    host = {
      airbnbHostId: decodeAirbnbId(hostCard.userId) ?? undefined,
      name: hostCard.name ?? null,
      avatarUrl: hostCard.profilePictureUrl ?? null,
      superhost: !!hostCard.isSuperhost,
      hostSince: since ? since.toISOString().slice(0, 10) : hostSinceFromTitle(hostCard.titleText),
      responseRate: respMatch ? parseInt(respMatch[1], 10) : null,
      portfolioReviewsTotal: typeof hostCard.ratingCount === 'number' ? hostCard.ratingCount : null,
      portfolioAvgRating: typeof hostCard.ratingAverage === 'number' ? hostCard.ratingAverage : null,
    };
  }

  const coHostIds: string[] = (Array.isArray(meetYourHost?.cohosts) ? meetYourHost.cohosts : [])
    .map((c: any) => decodeAirbnbId(c?.userId ?? c?.id))
    .filter((v: string | null): v is string => !!v);

  // ── amenities ──────────────────────────────────────────────────────────────
  const amenObj =
    findByKey(json, (o) => Array.isArray(o.seeAllAmenityGroups)) ??
    findByKey(json, (o) => Array.isArray(o.previewAmenitiesGroups));
  const amenities: string[] = (amenObj?.seeAllAmenityGroups ?? amenObj?.previewAmenitiesGroups ?? [])
    .flatMap((g: any) => (g?.amenities ?? []).map((a: any) => a?.title))
    .filter((t: any): t is string => typeof t === 'string' && t.length > 0);

  // ── house rules ────────────────────────────────────────────────────────────
  const houseRules: string[] = [
    ...(Array.isArray(policies?.houseRules) ? policies.houseRules : []).map((r: any) => r?.title),
    ...(Array.isArray(policies?.additionalHouseRules) ? policies.additionalHouseRules : []).map(
      (r: any) => (typeof r === 'string' ? r : r?.title),
    ),
  ].filter((t: any): t is string => typeof t === 'string' && t.length > 0);

  // A "show original" toggle means what we are reading is Airbnb's translation.
  const machineTranslated = descSection
    ? !!(descSection.ugcTranslationButton || descSection.htmlDescription?.showOriginalButton)
    : null;

  return {
    description: descSection?.htmlDescription?.htmlText ?? null,
    title: S.TITLE_DEFAULT?.title ?? null,
    roomType: ev?.roomType ?? findByKey(json, (o) => typeof o.roomType === 'string')?.roomType ?? null,
    amenities,
    guestCapacity: typeof ev?.personCapacity === 'number' ? ev.personCapacity : null,
    photos: extractPdpPhotos(raw, listingId),
    host,
    hostSource,
    coHostIds,
    hostAbout: typeof meetYourHost?.about === 'string' && meetYourHost.about.trim() ? meetYourHost.about : null,
    locationSubtitle: typeof locSection?.subtitle === 'string' ? locSection.subtitle : null,
    latitude: typeof locSection?.lat === 'number' ? locSection.lat : (ev?.listingLat ?? null),
    longitude: typeof locSection?.lng === 'number' ? locSection.lng : (ev?.listingLng ?? null),
    houseRules,
    descriptionLanguage: typeof ev?.descriptionLanguage === 'string' ? ev.descriptionLanguage : null,
    machineTranslated,
  };
}

/** "Superhost · 3 years hosting" → an approx ISO date (years back from a base). */
export function hostSinceFromTitle(title: string | undefined, baseIso?: string): string | null {
  if (!title) return null;
  const y = title.match(/(\d+)\s*year/i);
  const mo = title.match(/(\d+)\s*month/i);
  if (!y && !mo) return null;
  const base = baseIso ? new Date(baseIso) : new Date();
  const months = (y ? parseInt(y[1], 10) * 12 : 0) + (mo ? parseInt(mo[1], 10) : 0);
  base.setMonth(base.getMonth() - months);
  return base.toISOString().slice(0, 10);
}
