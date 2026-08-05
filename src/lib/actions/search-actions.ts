"use server";

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import {
  searchFormSchema,
  listingFilterSchema,
  locationQuerySchema,
  SEARCH_CONFIG,
  type LocationSuggestion,
  type SearchFilters,
  type SearchResult,
} from "@/lib/schemas/search-schema";
import { localize, localizeNested } from "@/components/translation/localize";
import { SEARCH_LISTING_SELECT } from "@/lib/listing-select";
import { getDisplayLang } from "@/components/translation/locale";
import type { Lang } from "@/components/translation/types";
import {
  boundingBox,
  haversineKm,
  DEFAULT_NEARBY_RADIUS_KM,
  type Coords,
} from "@/lib/distance";

// Cache tags used to invalidate search results when listings change.
// Mutations in listing-actions.ts call `revalidateTag('listings')` on
// create/update/delete, which blows this cache + every `listing:${id}` tag.
const LISTINGS_TAG = "listings";
const SEARCH_TAG = "search";

// Row shape returned from the SQL aggregation. `n` is bigint because
// Postgres `COUNT(*)` returns an int8 — we cast to Number on the way out.
// `sim` is the per-group trigram similarity score (0..1); only set on
// the search path, omitted for the popular-locations path.
type LocationCountRow = {
  city: string;
  state: string;
  country: string;
  n: bigint;
  sim?: number;
};

// Escape SQL LIKE wildcards in user input. Without this, a query like
// "khar%" would match anything containing "khar" (the % is the SQL
// wildcard) instead of the literal four characters the user typed. The
// pg_trgm `%` operator takes the raw query — it doesn't interpret % as
// a wildcard — so we only escape for the ILIKE branch.
function escapeLike(s: string): string {
  return s.replace(/([%_\\])/g, "\\$1");
}

// Convert a raw aggregation row into the LocationSuggestion shape that
// callers expect. Centralised so the popular and search paths can't drift.
function toSuggestion(row: LocationCountRow): LocationSuggestion {
  return {
    city: row.city ?? "",
    state: row.state ?? "",
    country: row.country ?? "",
    displayName: row.city && row.state ? `${row.city}, ${row.state}` : row.city || row.state || "",
    listingCount: Number(row.n),
  };
}

/**
 * Get location suggestions based on search query.
 *
 * Aggregates published-listing counts per (city, state, country) directly
 * in SQL so the returned `listingCount` is the true number of matching
 * listings, regardless of how many denormalised Location rows back them.
 *
 * Match strategy is the OR of two complementary signals, both backed by
 * the same GIN trigram index from the pg_trgm migration:
 *   - ILIKE '%foo%' — substring match for partial typing ("khar" → "Khartoum").
 *   - `%` similarity — typo tolerance under the default 0.3 threshold
 *     ("khartom" → "Khartoum"). Returns `similarity(...)` for ranking
 *     so closer matches sort above looser ones within the same listing
 *     count tier.
 *
 * Cached for 1 hour. Validation runs outside the cache boundary so an
 * invalid query doesn't poison the cache with an empty entry.
 */
export const getLocationSuggestions = unstable_cache(
  async (
    query: string,
    limit: number = SEARCH_CONFIG.MAX_LOCATION_RESULTS
  ): Promise<LocationSuggestion[]> => {
    const validated = locationQuerySchema.safeParse({ query, limit });
    if (!validated.success) return [];

    try {
      const pattern = `%${escapeLike(query)}%`;
      // Flat query: compute COUNT and MAX(similarity) directly in the
      // SELECT, GROUP BY (city, state, country), then ORDER BY n + sim
      // and LIMIT.
      //
      // An earlier version wrapped this in a subquery to keep
      // `similarity(l.city, ...)` out of an aggregate, but that version
      // shipped a Postgres bug where the outer LIMIT leaked into the
      // inner COUNT — every result returned `listingCount = limit`
      // regardless of the true row count. The flat form with MAX() of
      // the per-row GREATEST is grammatically correct (similarity is a
      // function of the GROUP BY column, MAX collapses it idempotently)
      // and avoids the planner pathology.
      const rows = await db.$queryRaw<LocationCountRow[]>`
        SELECT l.city, l.state, l.country,
               COUNT(li.id)::bigint AS n,
               MAX(GREATEST(
                 similarity(l.city,    ${query}),
                 similarity(l.state,   ${query}),
                 similarity(l.country, ${query})
               )) AS sim
        FROM "Location" l
        JOIN "Listing" li ON li."locationId" = l.id
        WHERE li."isPublished" = true AND li.draft = false
          AND (
            l.city    ILIKE ${pattern} OR l.city    % ${query} OR
            l.state   ILIKE ${pattern} OR l.state   % ${query} OR
            l.country ILIKE ${pattern} OR l.country % ${query}
          )
        GROUP BY l.city, l.state, l.country
        ORDER BY n DESC, sim DESC
        LIMIT ${limit};
      `;
      return rows.map(toSuggestion);
    } catch {
      return [];
    }
  },
  ["location-suggestions"],
  // Tagged with LISTINGS_TAG so the existing updateTag("listings") calls
  // in listing-actions.ts (create/update/publish/unpublish/delete) bust
  // the autocomplete cache too. Without this, autocomplete kept serving
  // pre-mutation results for up to an hour — a deploy that introduced
  // pg_trgm errors had its empty results cached, and that empty cache
  // outlived the migration fix.
  { revalidate: 3600, tags: [LISTINGS_TAG] }
);

/**
 * Get popular locations (no search query).
 *
 * Same SQL-side aggregation as `getLocationSuggestions` minus the WHERE
 * filter — returns the cities with the most published listings.
 * Previously fetched the entire Location table and dedup'd in JS, which
 * scaled linearly with row count.
 *
 * Cached for 1 hour. Tagged with LISTINGS_TAG so listing mutations
 * invalidate it (the popular-cities ranking changes whenever a listing
 * is added or removed in a city).
 */
export const getPopularLocations = unstable_cache(
  async (
    limit: number = SEARCH_CONFIG.DEFAULT_POPULAR_LOCATIONS_COUNT
  ): Promise<LocationSuggestion[]> => {
    try {
      const rows = await db.$queryRaw<LocationCountRow[]>`
        SELECT l.city, l.state, l.country, COUNT(li.id)::bigint AS n
        FROM "Location" l
        JOIN "Listing" li ON li."locationId" = l.id
        WHERE li."isPublished" = true AND li.draft = false
        GROUP BY l.city, l.state, l.country
        ORDER BY n DESC
        LIMIT ${limit};
      `;
      return rows.map(toSuggestion);
    } catch {
      return [];
    }
  },
  ["popular-locations"],
  { revalidate: 3600, tags: [LISTINGS_TAG] }
);

/**
 * Core search query — the part that hits Prisma. Wrapped by `unstable_cache`
 * below, so every distinct stringified-filters key is cached for 60s. The
 * 60s ceiling balances freshness (new listings appear ~1 min after
 * publish, which matches user expectations for a marketplace) with DB
 * load. Mutations in `listing-actions.ts` call `revalidateTag('listings')`
 * for immediate invalidation when editing.
 */
/**
 * The proximity centre for a filter set, or null when this isn't a Nearby
 * search. Both halves are required — a lone `lat` is a malformed request, and
 * treating it as a centre would silently search a band around a latitude.
 */
function nearbyCentre(f: ReturnType<typeof listingFilterSchema.parse>): Coords | null {
  if (f.lat === undefined || f.lng === undefined) return null;
  return { lat: f.lat, lng: f.lng };
}

/**
 * Ceiling on the coordinate rows pulled in to rank a Nearby search.
 *
 * Ordering by haversine can't be pushed into Prisma's `orderBy`, so ranking
 * happens in the application. To keep that cheap the ranking pass fetches only
 * `{ id, latitude, longitude }` — three columns, no card payload — which is why
 * this can sit far above any realistic in-radius count instead of truncating
 * (500 was already too low: 500 of the catalog's 580 published stays fall
 * within the default radius of Port Sudan). Full card rows are then fetched for
 * the page window alone, at most `take` of them.
 *
 * If a catalog ever does exceed this inside one radius, the honest fix is a
 * `$queryRaw` with an ORDER BY on the distance expression, not a bigger number.
 */
const NEARBY_CANDIDATE_CAP = 5000;

/** Ranking-pass projection: the minimum needed to sort by distance. */
const NEARBY_RANK_SELECT = {
  id: true,
  location: { select: { latitude: true, longitude: true } },
} as const satisfies Prisma.ListingSelect;

/**
 * IDs of the listings inside `radiusKm` of `centre`, nearest first.
 *
 * Shared by the page and count paths so the two can't disagree about which
 * stays are "nearby" — a mismatch there shows up as a header promising more
 * results than paging can reach.
 */
async function rankNearbyIds(
  where: Prisma.ListingWhereInput,
  centre: Coords,
  radiusKm: number
): Promise<number[]> {
  const rows = await db.listing.findMany({
    where,
    select: NEARBY_RANK_SELECT,
    // Deterministic tiebreak so equidistant stays keep a stable page order
    // across requests (two listings at the same address are common).
    orderBy: { id: "asc" },
    take: NEARBY_CANDIDATE_CAP,
  });

  return rows
    .flatMap((row) =>
      row.location
        ? [
            {
              id: row.id,
              distanceKm: haversineKm(centre, {
                lat: row.location.latitude,
                lng: row.location.longitude,
              }),
            },
          ]
        : []
    )
    .filter((row) => row.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .map((row) => row.id);
}

// Build the Prisma where clause from a normalized filters object. Shared
// by the findMany and count paths so they can't drift apart.
function buildSearchWhere(
  f: ReturnType<typeof listingFilterSchema.parse>
): Prisma.ListingWhereInput {
  const where: Prisma.ListingWhereInput = {
    isPublished: true,
    draft: false,
  };

  if (f.location) {
    // A selected suggestion arrives as a human label that may carry several
    // comma-separated parts ("Port Sudan, Red Sea", "Coral Coast, Port Sudan").
    // Matching the whole comma-joined string against any single column never
    // hits — no column equals "Port Sudan, Red Sea" — so the search silently
    // returned zero. Split into parts and match each against
    // city/state/country/address. `address` is included so district / landmark
    // tokens ("Coral Coast", "Marina District") narrow to their part of town
    // instead of falling through to nothing.
    const terms = f.location
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const matchTerms = terms.length > 0 ? terms : [f.location.trim()];
    where.location = {
      OR: matchTerms.flatMap((term) => [
        { city: { contains: term, mode: "insensitive" } },
        { state: { contains: term, mode: "insensitive" } },
        { country: { contains: term, mode: "insensitive" } },
        { address: { contains: term, mode: "insensitive" } },
      ]),
    };
  }

  // Proximity prefilter ("Nearby"). A circle can't be expressed as a range
  // scan, so we narrow to the smallest box containing it — which the existing
  // @@index([latitude, longitude]) serves directly — and let the caller drop
  // the corner rows with a real haversine pass. Applied before the viewport
  // filter so that panning the map while Nearby is active intersects the two
  // rather than replacing one with the other.
  const near = nearbyCentre(f);
  if (near) {
    const box = boundingBox(near, f.radiusKm ?? DEFAULT_NEARBY_RADIUS_KM);
    where.location = {
      ...(where.location as Prisma.LocationWhereInput | undefined),
      latitude: { gte: box.minLat, lte: box.maxLat },
      longitude: { gte: box.minLng, lte: box.maxLng },
    };
  }

  // Map-viewport filter ("search as I move the map"). Only applied when the
  // full bounding box is present. Merges onto any existing location relation
  // (AND semantics) so a text location + bounds can co-exist, though in
  // practice the map drives bounds without a location string.
  if (
    f.minLat !== undefined &&
    f.maxLat !== undefined &&
    f.minLng !== undefined &&
    f.maxLng !== undefined
  ) {
    const existing = where.location as Prisma.LocationWhereInput | undefined;
    // Intersect with any Nearby box rather than overwriting it — the tighter
    // of the two bounds on each edge wins.
    const prevLat = existing?.latitude as Prisma.FloatFilter | undefined;
    const prevLng = existing?.longitude as Prisma.FloatFilter | undefined;
    where.location = {
      ...existing,
      latitude: {
        gte: Math.max(f.minLat, (prevLat?.gte as number) ?? -90),
        lte: Math.min(f.maxLat, (prevLat?.lte as number) ?? 90),
      },
      longitude: {
        gte: Math.max(f.minLng, (prevLng?.gte as number) ?? -180),
        lte: Math.min(f.maxLng, (prevLng?.lte as number) ?? 180),
      },
    };
  }

  const totalGuests = f.guests || (f.adults || 0) + (f.children || 0);
  if (totalGuests > 0) {
    where.guestCount = { gte: totalGuests };
  }

  if (f.priceMin !== undefined || f.priceMax !== undefined) {
    where.pricePerNight = {
      ...(f.priceMin !== undefined ? { gte: f.priceMin } : {}),
      ...(f.priceMax !== undefined ? { lte: f.priceMax } : {}),
    };
  }

  if (f.beds !== undefined) where.bedrooms = { gte: f.beds };
  if (f.baths !== undefined) where.bathrooms = { gte: f.baths };
  // A multi-select structure set (IN ...) supersedes the single propertyType.
  if (f.propertyTypes && f.propertyTypes.length > 0) {
    where.propertyType = { in: f.propertyTypes };
  } else if (f.propertyType) {
    where.propertyType = f.propertyType;
  }

  if (f.amenities && f.amenities.length > 0) {
    where.amenities = { hasEvery: f.amenities };
  }

  // Booking options (backed by real Listing columns).
  if (f.instantBook) where.instantBook = true;
  if (f.petsAllowed) where.isPetsAllowed = true;
  if (f.selfCheckIn) where.checkInMethod = "SelfCheckIn";

  if (f.checkIn && f.checkOut) {
    where.bookings = {
      none: {
        status: { in: ["Confirmed", "Pending"] },
        AND: [
          { checkIn: { lt: new Date(f.checkOut) } },
          { checkOut: { gt: new Date(f.checkIn) } },
        ],
      },
    };
  }

  return where;
}

// Explicit select that mirrors the `Listing` interface in src/types/listing.ts.
// `include` would return every column, including booking-flow fields the
// listings card never reads (houseRules JSON, checkInTime, minStay,
// cancellationPolicy, etc.) plus internal timestamps. Listing those fields
// here cuts the row payload by ~30-40% — meaningful when 20 rows ship per
// page request and the cache TTL is only 60 s.
//
// Keep this list in sync with `Listing` in src/types/listing.ts. The
// Prisma payload type below derives from this select, so a typo here
// surfaces immediately as a tsc error in pages that consume it.
// Moved to src/lib/listing-select.ts so non-search readers (getListings,
// the published API) share the same card-level row shape.

/**
 * Homepage listings — a cached, narrow-select reader for the featured carousels.
 * Reuses SEARCH_LISTING_SELECT (card fields only — no host phone/PII over-fetch)
 * and caches for 5 min, tagged LISTINGS_TAG so publish/unpublish invalidates it.
 * localize() is per-locale and MUST run outside this cache — call it on the result.
 */
export const getHomeListings = unstable_cache(
  async (limit: number = 36) => {
    try {
      return await db.listing.findMany({
        where: { isPublished: true, draft: false },
        select: SEARCH_LISTING_SELECT,
        orderBy: { id: "desc" },
        take: limit,
      });
    } catch {
      return [];
    }
  },
  ["home-listings"],
  { revalidate: 300, tags: [LISTINGS_TAG] }
);

/**
 * Title/description full-text search via the existing
 * `idx_listing_fulltext` GIN(to_tsvector(...)) index.
 *
 * Returns the IDs of matching published listings; the caller adds an
 * `id IN (...)` predicate to its where-clause. Two-step instead of one
 * `$queryRaw` for the whole search because the rest of the where-clause
 * (price ranges, amenity arrays, date overlap subquery) is much cleaner
 * to express through Prisma's typed query builder.
 *
 * `plainto_tsquery` (not `to_tsquery`) so the user input doesn't need to
 * be operator-quoted — "luxury beach" parses as `luxury & beach`, and
 * stop words / punctuation are handled by the parser. The 'english'
 * dictionary is what the index was built with, so the operator can use
 * the index directly.
 */
async function getFullTextMatchingIds(query: string): Promise<number[]> {
  try {
    const rows = await db.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM "Listing"
      WHERE "isPublished" = true AND draft = false
        AND to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(description, ''))
            @@ plainto_tsquery('english', ${query})
    `;
    return rows.map((r) => r.id);
  } catch {
    // If pg_trgm / fulltext isn't available (e.g., the migration that
    // created idx_listing_fulltext hasn't run), bail gracefully — the
    // outer search will return all listings instead of zero.
    return [];
  }
}

const cachedListingSearch = unstable_cache(
  async (
    normalized: string
  ): Promise<Prisma.ListingGetPayload<{ select: typeof SEARCH_LISTING_SELECT }>[]> => {
    const f = JSON.parse(normalized) as ReturnType<typeof listingFilterSchema.parse>;
    const where = buildSearchWhere(f);
    const take = Math.min(f.take ?? 20, 50);
    const skip = f.skip ?? 0;

    // Full-text branch: when query is set, intersect the where-clause
    // with the IDs returned by the GIN index. An empty match short-
    // circuits the page query — avoids a `WHERE id IN ()` round-trip.
    if (f.query) {
      const ids = await getFullTextMatchingIds(f.query);
      if (ids.length === 0) return [];
      where.id = { in: ids };
    }

    // Nearby branch: rank by true distance instead of recency, in two phases.
    // Phase 1 ranks on coordinates alone (cheap); phase 2 loads full card rows
    // for just this page's window. Doing it in one pass would mean fetching the
    // whole card payload for every in-radius listing only to discard all but
    // `take` of them.
    const near = nearbyCentre(f);
    if (near) {
      const rankedIds = await rankNearbyIds(
        where,
        near,
        f.radiusKm ?? DEFAULT_NEARBY_RADIUS_KM
      );
      const pageIds = rankedIds.slice(skip, skip + take);
      if (pageIds.length === 0) return [];

      const rows = await db.listing.findMany({
        where: { id: { in: pageIds } },
        select: SEARCH_LISTING_SELECT,
      });

      // `IN (...)` returns rows in whatever order Postgres likes, so restore
      // the distance ranking the ids already encode.
      const order = new Map(pageIds.map((id, index) => [id, index]));
      return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    }

    return db.listing.findMany({
      where,
      select: SEARCH_LISTING_SELECT,
      orderBy: { postedDate: "desc" },
      take,
      skip,
    });
  },
  ["search-listings"],
  { revalidate: 60, tags: [LISTINGS_TAG, SEARCH_TAG] }
);

// Total-count companion to cachedListingSearch, cached on the same filter
// key minus take/skip so paging within a filter reuses one cache entry.
const cachedListingCount = unstable_cache(
  async (normalized: string): Promise<number> => {
    const parsed = JSON.parse(normalized) as ReturnType<typeof listingFilterSchema.parse>;
    const where = buildSearchWhere(parsed);

    // Same full-text intersection as the page query so the count
    // matches what the user actually sees.
    if (parsed.query) {
      const ids = await getFullTextMatchingIds(parsed.query);
      if (ids.length === 0) return 0;
      where.id = { in: ids };
    }

    // A Nearby search can't use COUNT(*): the where-clause covers the bounding
    // box, so counting it would include the corner rows the page query drops —
    // the header would promise more stays than paging could ever reach. Reuse
    // the page's own ranking pass so the total is exactly the set being paged.
    const near = nearbyCentre(parsed);
    if (near) {
      const rankedIds = await rankNearbyIds(
        where,
        near,
        parsed.radiusKm ?? DEFAULT_NEARBY_RADIUS_KM
      );
      return rankedIds.length;
    }

    return db.listing.count({ where });
  },
  ["search-listings-count"],
  { revalidate: 60, tags: [LISTINGS_TAG, SEARCH_TAG] }
);

/**
 * Search listings with server-side filtering.
 *
 * Validation is done OUTSIDE the cache boundary so invalid filters don't
 * populate the cache with empty error responses.
 */
export async function searchListings(
  filters: SearchFilters,
  lang?: Lang
): Promise<SearchResult<Prisma.ListingGetPayload<{ select: typeof SEARCH_LISTING_SELECT }>[]>> {
  // Use the query-level schema so price/beds/type/amenities are actually
  // validated. `searchFormSchema` is form-level (rejects past dates), not
  // query-level — it silently dropped extra fields.
  const validated = listingFilterSchema.safeParse(filters);

  if (!validated.success) {
    return {
      success: false,
      error: validated.error.issues[0]?.message || "Invalid search parameters",
      data: [],
    };
  }

  try {
    // Stringify *after* zod has normalized the shape so the cache key is
    // deterministic — two callers with the same logical filters hit the
    // same cache entry regardless of object property order.
    //
    // Count and page results are fetched in parallel; they share a where
    // clause but use different cache keys so paging doesn't invalidate
    // the total.
    const pageKey = JSON.stringify(validated.data);
    const { take: _take, skip: _skip, ...countData } = validated.data;
    const countKey = JSON.stringify(countData);

    const [listings, total] = await Promise.all([
      cachedListingSearch(pageKey),
      cachedListingCount(countKey),
    ]);

    // Localize Arabic listing copy for the viewer's locale. `lang` comes from
    // server pages (params.lang); client re-queries omit it, so fall back to
    // the ambient NEXT_LOCALE cookie. No-op when translation is disabled or
    // the text is already in `lang`.
    const displayLang = lang ?? (await getDisplayLang());
    let data = await localize(listings, ["title", "description"], displayLang);
    // City/state/country show on every card — localize the nested location the
    // same way (curated cache rows: Port Sudan ⇄ بورتسودان etc.).
    data = await localizeNested(data, "location", ["city", "state", "country"], displayLang);

    return {
      success: true,
      data,
      count: data.length,
      total,
    };
  } catch {
    return {
      success: false,
      error: "Failed to search listings. Please try again.",
      data: [],
    };
  }
}

/**
 * Cross-catalog min/max nightly price for the listings filter slider.
 *
 * Previously inlined in `/[lang]/listings/page.tsx` and ran on every
 * page request — a full aggregate over the published-listing set per
 * pageview. Now wrapped in `unstable_cache` with the `listings` tag so
 * mutations in listing-actions.ts invalidate it the same way they
 * invalidate the search-results cache.
 *
 * 1-hour TTL is generous because price bounds change rarely (only when
 * a host raises/lowers the cheapest or priciest listing in the catalog).
 */
/**
 * Slider ceiling when the aggregate is unavailable or the catalogue is empty.
 *
 * SDG per night. The old value was 1,000, which is below the cheapest real
 * listing — so on any aggregate failure the filter rendered a range that
 * excluded the entire catalogue rather than degrading to "show everything".
 */
const FALLBACK_MAX_PRICE = 500_000;

export const getPriceBounds = unstable_cache(
  async (): Promise<{ min: number; max: number }> => {
    try {
      const agg = await db.listing.aggregate({
        where: { isPublished: true, draft: false, pricePerNight: { not: null } },
        _min: { pricePerNight: true },
        _max: { pricePerNight: true },
      });
      return {
        min: agg._min.pricePerNight ?? 0,
        max: agg._max.pricePerNight ?? FALLBACK_MAX_PRICE,
      };
    } catch {
      // If the aggregate fails, fall back to safe defaults so the filter
      // slider still renders. The listings query has its own try/catch
      // so this can't bring the page down.
      return { min: 0, max: FALLBACK_MAX_PRICE };
    }
  },
  ["listings-price-bounds"],
  { revalidate: 3600, tags: [LISTINGS_TAG] }
);
