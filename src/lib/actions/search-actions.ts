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
      // Inner query: do the join + filter + aggregation. Outer query:
      // sort by listing-count then similarity, then take the limit.
      // We can't ORDER BY before GROUP BY, and putting `similarity()` in
      // the GROUP BY would defeat the grouping — wrapping in a subquery
      // is the cleanest expression.
      const rows = await db.$queryRaw<LocationCountRow[]>`
        SELECT city, state, country, n, sim FROM (
          SELECT l.city, l.state, l.country, COUNT(li.id)::bigint AS n,
                 GREATEST(
                   similarity(l.city,    ${query}),
                   similarity(l.state,   ${query}),
                   similarity(l.country, ${query})
                 ) AS sim
          FROM "Location" l
          JOIN "Listing" li ON li."locationId" = l.id
          WHERE li."isPublished" = true AND li.draft = false
            AND (
              l.city    ILIKE ${pattern} OR l.city    % ${query} OR
              l.state   ILIKE ${pattern} OR l.state   % ${query} OR
              l.country ILIKE ${pattern} OR l.country % ${query}
            )
          GROUP BY l.city, l.state, l.country
        ) sub
        ORDER BY n DESC, sim DESC
        LIMIT ${limit};
      `;
      return rows.map(toSuggestion);
    } catch {
      return [];
    }
  },
  ["location-suggestions"],
  { revalidate: 3600 } // Cache for 1 hour
);

/**
 * Get popular locations (no search query).
 *
 * Same SQL-side aggregation as `getLocationSuggestions` minus the WHERE
 * filter — returns the cities with the most published listings.
 * Previously fetched the entire Location table and dedup'd in JS, which
 * scaled linearly with row count.
 *
 * Cached for 1 hour.
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
  { revalidate: 3600 } // Cache for 1 hour
);

/**
 * Core search query — the part that hits Prisma. Wrapped by `unstable_cache`
 * below, so every distinct stringified-filters key is cached for 60s. The
 * 60s ceiling balances freshness (new listings appear ~1 min after
 * publish, which matches user expectations for a marketplace) with DB
 * load. Mutations in `listing-actions.ts` call `revalidateTag('listings')`
 * for immediate invalidation when editing.
 */
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
    where.location = {
      OR: [
        { city: { contains: f.location, mode: "insensitive" } },
        { state: { contains: f.location, mode: "insensitive" } },
        { country: { contains: f.location, mode: "insensitive" } },
      ],
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
  if (f.propertyType) where.propertyType = f.propertyType;

  if (f.amenities && f.amenities.length > 0) {
    where.amenities = { hasEvery: f.amenities };
  }

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
const SEARCH_LISTING_SELECT = {
  id: true,
  title: true,
  description: true,
  pricePerNight: true,
  securityDeposit: true,
  applicationFee: true,
  cleaningFee: true,
  weeklyDiscount: true,
  monthlyDiscount: true,
  photoUrls: true,
  amenities: true,
  highlights: true,
  isPetsAllowed: true,
  isParkingIncluded: true,
  bedrooms: true,
  bathrooms: true,
  squareFeet: true,
  guestCount: true,
  propertyType: true,
  postedDate: true,
  averageRating: true,
  numberOfReviews: true,
  draft: true,
  isPublished: true,
  instantBook: true,
  location: {
    select: {
      id: true,
      address: true,
      city: true,
      state: true,
      country: true,
      postalCode: true,
      latitude: true,
      longitude: true,
    },
  },
  host: {
    select: { id: true, email: true, username: true },
  },
} as const satisfies Prisma.ListingSelect;

const cachedListingSearch = unstable_cache(
  async (
    normalized: string
  ): Promise<Prisma.ListingGetPayload<{ select: typeof SEARCH_LISTING_SELECT }>[]> => {
    const f = JSON.parse(normalized) as ReturnType<typeof listingFilterSchema.parse>;
    const where = buildSearchWhere(f);
    const take = Math.min(f.take ?? 20, 50);
    const skip = f.skip ?? 0;

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
  filters: SearchFilters
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

    return {
      success: true,
      data: listings,
      count: listings.length,
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
        max: agg._max.pricePerNight ?? 1000,
      };
    } catch {
      // If the aggregate fails, fall back to safe defaults so the filter
      // slider still renders. The listings query has its own try/catch
      // so this can't bring the page down.
      return { min: 0, max: 1000 };
    }
  },
  ["listings-price-bounds"],
  { revalidate: 3600, tags: [LISTINGS_TAG] }
);
