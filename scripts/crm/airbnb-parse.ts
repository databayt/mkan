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
    beds: grab(/([\d.]+)\s+bed\b/i),
    bathrooms: grab(/([\d.]+)\s+(?:private\s+|shared\s+)?bath/i),
  };
}

/** Normalize the mkan `city` SELECT from the Airbnb title suffix ("… in Port Sudan"). */
export function deriveCity(title: string | null | undefined): string {
  const s = (title ?? '').toLowerCase();
  if (/port\s*sudan/.test(s)) return 'PORT_SUDAN';
  if (/khartoum\s*north|bahri/.test(s)) return 'BAHRI';
  if (/omdurman/.test(s)) return 'OMDURMAN';
  if (/east\s*nile/.test(s)) return 'EAST_NILE';
  if (/khartoum/.test(s)) return 'KHARTOUM';
  return 'OTHER';
}

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

/** PDP JSON + raw → enrichment fields (photos, description, amenities, roomType, host). */
export function parsePdp(json: any, raw: string, listingId: string): {
  description: string | null;
  roomType: string | null;
  amenities: string[];
  guestCapacity: number | null;
  photos: string[];
  host: Partial<HostRecord> | null;
} {
  const hostObj = findByKey(json, (o) => o.isSuperhost !== undefined && (o.userId !== undefined || o.name !== undefined));
  const amenObj = findByKey(json, (o) => Array.isArray(o.seeAllAmenityGroups)) ?? findByKey(json, (o) => Array.isArray(o.previewAmenitiesGroups));
  const descObj = findByKey(json, (o) => o.htmlDescription && typeof o.htmlDescription.htmlText === 'string');
  const rtObj = findByKey(json, (o) => typeof o.roomType === 'string');
  const capObj = findByKey(json, (o) => typeof o.personCapacity === 'number');

  const groups = amenObj?.seeAllAmenityGroups ?? amenObj?.previewAmenitiesGroups ?? [];
  const amenities = groups
    .flatMap((g: any) => (g?.amenities ?? []).map((a: any) => a?.title))
    .filter((t: any): t is string => typeof t === 'string' && t.length > 0);

  let host: Partial<HostRecord> | null = null;
  if (hostObj) {
    const stats: any[] = Array.isArray(hostObj.stats) ? hostObj.stats : [];
    const respStat = stats.find((s) => /response rate/i.test(`${s?.label ?? ''}`));
    const respRate = respStat ? parseInt(String(respStat.value).replace(/[^\d]/g, ''), 10) : null;
    host = {
      airbnbHostId: decodeAirbnbId(hostObj.userId) ?? undefined,
      name: hostObj.name ?? null,
      avatarUrl: hostObj.profilePictureUrl ?? null,
      superhost: !!hostObj.isSuperhost,
      hostSince: hostSinceFromTitle(hostObj.titleText),
      responseRate: Number.isFinite(respRate as number) ? (respRate as number) : null,
      portfolioReviewsTotal: typeof hostObj.ratingCount === 'number' ? hostObj.ratingCount : null,
      portfolioAvgRating: typeof hostObj.ratingAverage === 'number' ? hostObj.ratingAverage : null,
    };
  }

  return {
    description: descObj?.htmlDescription?.htmlText ?? null,
    roomType: rtObj?.roomType ?? null,
    amenities,
    guestCapacity: capObj?.personCapacity ?? null,
    photos: extractPdpPhotos(raw, listingId),
    host,
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
