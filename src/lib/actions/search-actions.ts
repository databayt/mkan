"use server";

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import {
  searchFormSchema,
  locationQuerySchema,
  SEARCH_CONFIG,
  type LocationSuggestion,
  type SearchFilters,
  type SearchResult,
} from "@/lib/schemas/search-schema";

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
      console.error("Invalid location query:", validated.error);
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
    } catch (error) {
      console.error("Error fetching location suggestions:", error);
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
    } catch (error) {
      console.error("Error fetching popular locations:", error);
      return [];
    }
  },
  ["popular-locations"],
  { revalidate: 3600 } // Cache for 1 hour
);

/**
 * Search listings with server-side filtering
 * Validates input and returns filtered listings
 */
export async function searchListings(
  filters: SearchFilters
): Promise<SearchResult<Prisma.ListingGetPayload<{ include: { location: true; host: { select: { id: true; email: true; username: true } } } }>[]>> {
  // Validate input
  const validated = searchFormSchema.safeParse(filters);

  if (!validated.success) {
    return {
      success: false,
      error: validated.error.errors[0]?.message || "Invalid search parameters",
      data: [],
    };
  }

  try {
    const where: Prisma.ListingWhereInput = {
      isPublished: true,
      draft: false,
    };

    // Location filter - search in city, state, or country
    if (filters.location) {
      where.location = {
        OR: [
          { city: { contains: filters.location, mode: "insensitive" } },
          { state: { contains: filters.location, mode: "insensitive" } },
          { country: { contains: filters.location, mode: "insensitive" } },
        ],
      };
    }

    // Guest capacity filter - listing must accommodate total guests
    const totalGuests =
      filters.guests || (filters.adults || 0) + (filters.children || 0);
    if (totalGuests > 0) {
      where.guestCount = { gte: totalGuests };
    }

    const listings = await db.listing.findMany({
      where,
      include: {
        location: true,
        host: {
          select: {
            id: true,
            email: true,
            username: true,
          },
        },
      },
      orderBy: {
        postedDate: "desc",
      },
    });

    return {
      success: true,
      data: listings,
      count: listings.length,
    };
  } catch (error) {
    console.error("Error searching listings:", error);
    return {
      success: false,
      error: "Failed to search listings. Please try again.",
      data: [],
    };
  }
}
