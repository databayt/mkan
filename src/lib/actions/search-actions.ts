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

/**
 * Get location suggestions based on search query
 * Queries unique cities from published listings with listing count
 * Cached for 1 hour
 */
export const getLocationSuggestions = unstable_cache(
  async (
    query: string,
    limit: number = SEARCH_CONFIG.MAX_LOCATION_RESULTS
  ): Promise<LocationSuggestion[]> => {
    const validated = locationQuerySchema.safeParse({ query, limit });

    if (!validated.success) {
      // Invalid location query
      return [];
    }

    try {
      // Use Prisma groupBy for efficient grouping
      const locations = await db.location.findMany({
        where: {
          AND: [
            {
              listings: {
                some: {
                  isPublished: true,
                  draft: false,
                },
              },
            },
            {
              OR: [
                { city: { contains: query, mode: "insensitive" } },
                { state: { contains: query, mode: "insensitive" } },
                { country: { contains: query, mode: "insensitive" } },
              ],
            },
          ],
        },
        select: {
          city: true,
          state: true,
          country: true,
          _count: {
            select: {
              listings: {
                where: {
                  isPublished: true,
                  draft: false,
                },
              },
            },
          },
        },
        take: limit,
      });

      // Group by city, state, country and aggregate counts
      const groupedLocations = new Map<string, LocationSuggestion>();

      for (const loc of locations) {
        const key = `${loc.city}-${loc.state}-${loc.country}`;
        const existing = groupedLocations.get(key);

        if (existing) {
          existing.listingCount += loc._count.listings;
        } else {
          groupedLocations.set(key, {
            city: loc.city || "",
            state: loc.state || "",
            country: loc.country || "",
            displayName: loc.city && loc.state ? `${loc.city}, ${loc.state}` : loc.city || loc.state || "",
            listingCount: loc._count.listings,
          });
        }
      }

      // Sort by listing count and return
      return Array.from(groupedLocations.values())
        .filter((loc) => loc.listingCount > 0)
        .sort((a, b) => b.listingCount - a.listingCount)
        .slice(0, limit);
    } catch {
      return [];
    }
  },
  ["location-suggestions"],
  { revalidate: 3600 } // Cache for 1 hour
);

/**
 * Get popular locations (no search query)
 * Returns locations with most published listings
 * Cached for 1 hour
 */
export const getPopularLocations = unstable_cache(
  async (
    limit: number = SEARCH_CONFIG.DEFAULT_POPULAR_LOCATIONS_COUNT
  ): Promise<LocationSuggestion[]> => {
    try {
      const locations = await db.location.findMany({
        where: {
          listings: {
            some: {
              isPublished: true,
              draft: false,
            },
          },
        },
        select: {
          city: true,
          state: true,
          country: true,
          _count: {
            select: {
              listings: {
                where: {
                  isPublished: true,
                  draft: false,
                },
              },
            },
          },
        },
      });

      // Group by city, state, country and aggregate counts
      const groupedLocations = new Map<string, LocationSuggestion>();

      for (const loc of locations) {
        const key = `${loc.city}-${loc.state}-${loc.country}`;
        const existing = groupedLocations.get(key);

        if (existing) {
          existing.listingCount += loc._count.listings;
        } else {
          groupedLocations.set(key, {
            city: loc.city || "",
            state: loc.state || "",
            country: loc.country || "",
            displayName: loc.city && loc.state ? `${loc.city}, ${loc.state}` : loc.city || loc.state || "",
            listingCount: loc._count.listings,
          });
        }
      }

      // Sort by listing count and return top results
      return Array.from(groupedLocations.values())
        .filter((loc) => loc.listingCount > 0)
        .sort((a, b) => b.listingCount - a.listingCount)
        .slice(0, limit);
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
const cachedListingSearch = unstable_cache(
  async (
    normalized: string
  ): Promise<
    Prisma.ListingGetPayload<{
      include: { location: true; host: { select: { id: true; email: true; username: true } } };
    }>[]
  > => {
    const f = JSON.parse(normalized) as ReturnType<typeof listingFilterSchema.parse>;

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

    // Price band. `pricePerNight` is nullable in the schema; the `gte/lte`
    // still matches non-null rows, and null rows drop out implicitly when a
    // price filter is active (matches user intent: "show me what's priced").
    if (f.priceMin !== undefined || f.priceMax !== undefined) {
      where.pricePerNight = {
        ...(f.priceMin !== undefined ? { gte: f.priceMin } : {}),
        ...(f.priceMax !== undefined ? { lte: f.priceMax } : {}),
      };
    }

    if (f.beds !== undefined) where.bedrooms = { gte: f.beds };
    if (f.baths !== undefined) where.bathrooms = { gte: f.baths };
    if (f.propertyType) where.propertyType = f.propertyType;

    // `hasEvery` = AND semantics ("listing has ALL requested amenities").
    // Flip to `hasSome` if product decides OR is better for marketing filters.
    if (f.amenities && f.amenities.length > 0) {
      where.amenities = { hasEvery: f.amenities };
    }

    // Availability filter — exclude listings with overlapping confirmed or
    // pending bookings in the requested window. Only runs when BOTH dates
    // are provided so users browsing without dates still see everything.
    // Note: this subquery means date-based searches can't share a cache
    // with undated searches, which is fine — the cache keys diverge.
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

    const take = Math.min(f.take ?? 20, 50);
    const skip = f.skip ?? 0;

    return db.listing.findMany({
      where,
      include: {
        location: true,
        host: {
          select: { id: true, email: true, username: true },
        },
      },
      orderBy: { postedDate: "desc" },
      take,
      skip,
    });
  },
  ["search-listings"],
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
): Promise<SearchResult<Prisma.ListingGetPayload<{ include: { location: true; host: { select: { id: true; email: true; username: true } } } }>[]>> {
  // Use the query-level schema so price/beds/type/amenities are actually
  // validated. `searchFormSchema` is form-level (rejects past dates), not
  // query-level — it silently dropped extra fields.
  const validated = listingFilterSchema.safeParse(filters);

  if (!validated.success) {
    return {
      success: false,
      error: validated.error.errors[0]?.message || "Invalid search parameters",
      data: [],
    };
  }

  try {
    // Stringify *after* zod has normalized the shape so the cache key is
    // deterministic — two callers with the same logical filters hit the
    // same cache entry regardless of object property order.
    const listings = await cachedListingSearch(JSON.stringify(validated.data));
    return {
      success: true,
      data: listings,
      count: listings.length,
    };
  } catch {
    return {
      success: false,
      error: "Failed to search listings. Please try again.",
      data: [],
    };
  }
}
