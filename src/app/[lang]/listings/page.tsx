export const dynamic = 'force-dynamic';

import { Metadata } from "next";
import { Suspense } from "react";
import { createMetadata } from "@/lib/metadata";
import { searchListings } from "@/lib/actions/search-actions";
import { getDictionary } from "@/components/internationalization/dictionaries";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: "en" | "ar" }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const d = await getDictionary(lang);
  return createMetadata({
    title: d.rental?.listing?.title ?? "Listings",
    description: d.rental?.hero?.subtitle ?? "Browse available properties for rent",
    locale: lang,
    path: "/listings",
  });
}
import { getListings } from "@/components/host/actions";
import ListingsHeader from "@/components/listings/listings-header";
import MobileListingsHeader from "@/components/listings/mobile-listings-header";
import { PropertyContent } from "@/components/listings/property/content";
import { Listing } from "@/types/listing";
import { type SearchFilters } from "@/lib/schemas/search-schema";

interface ListingsPageProps {
  searchParams: Promise<{
    location?: string;
    checkIn?: string;
    checkOut?: string;
    guests?: string;
    adults?: string;
    children?: string;
    infants?: string;
    priceMin?: string;
    priceMax?: string;
    // `priceRange` is emitted by the legacy filter-bar as "min,max".
    // Accept it for backwards compat until Epic 3.1 (nuqs) lands.
    priceRange?: string;
    beds?: string;
    baths?: string;
    propertyType?: string;
    amenities?: string | string[];
    page?: string;
  }>;
}

// Safe int parser: blocks NaN / negatives / absurd values at the page edge
// before they reach the server action. The action itself validates again,
// but doing it here yields a sharper 400-style experience in the URL bar.
function toInt(v: string | undefined, max?: number) {
  if (!v) return undefined;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return max !== undefined ? Math.min(n, max) : n;
}

async function getFilteredListings(searchParams: ListingsPageProps["searchParams"]) {
  const params = await searchParams;

  // Normalize amenities param — it can arrive as "a,b" or ["a","b"].
  const rawAmenities = Array.isArray(params.amenities)
    ? params.amenities
    : typeof params.amenities === "string"
      ? params.amenities.split(",").filter(Boolean)
      : [];

  // Back-compat: legacy filter bar emits `priceRange=min,max`. Split it into
  // priceMin/priceMax here so the server action only needs one shape.
  let legacyPriceMin: string | undefined;
  let legacyPriceMax: string | undefined;
  if (params.priceRange) {
    const [lo, hi] = params.priceRange.split(",");
    if (lo) legacyPriceMin = lo;
    if (hi) legacyPriceMax = hi;
  }

  const hasFilters = Boolean(
    params.location ||
    params.guests ||
    params.checkIn ||
    params.checkOut ||
    params.priceMin ||
    params.priceMax ||
    params.priceRange ||
    params.beds ||
    params.baths ||
    params.propertyType ||
    rawAmenities.length > 0
  );

  // If no search filters, get all published listings (unpaginated first page).
  if (!hasFilters) {
    try {
      const listings = await getListings({ publishedOnly: true });
      return listings as Listing[];
    } catch (error) {
      console.error("Error fetching listings:", error);
      return [];
    }
  }

  // Pagination: `page` param is 1-indexed for humans; take/skip are 0-indexed.
  const page = Math.max(1, toInt(params.page) ?? 1);
  const pageSize = 20;

  const filters: SearchFilters = {
    location: params.location,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    guests: toInt(params.guests, 16),
    adults: toInt(params.adults, 16),
    children: toInt(params.children, 10),
    infants: toInt(params.infants, 5),
    priceMin: toInt(params.priceMin ?? legacyPriceMin, 100000),
    priceMax: toInt(params.priceMax ?? legacyPriceMax, 100000),
    beds: toInt(params.beds, 20),
    baths: toInt(params.baths, 20),
    propertyType: params.propertyType as SearchFilters["propertyType"],
    amenities: rawAmenities as SearchFilters["amenities"],
    take: pageSize,
    skip: (page - 1) * pageSize,
  };

  const result = await searchListings(filters);

  if (!result.success) {
    console.error("Search error:", result.error);
    try {
      const listings = await getListings({ publishedOnly: true });
      return listings as Listing[];
    } catch (error) {
      console.error("Error fetching listings:", error);
      return [];
    }
  }

  return result.data as Listing[];
}

function PropertySkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-square bg-gray-200 rounded-lg" />
          <div className="mt-2 h-4 bg-gray-200 rounded w-3/4" />
          <div className="mt-1 h-3 bg-gray-200 rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}

export default async function ListingsPage({ searchParams, params: pageParams }: ListingsPageProps & { params: Promise<{ lang: "en" | "ar" }> }) {
  // Parallelize independent data fetches — resolve params and listings concurrently
  const [listings, params, { lang }] = await Promise.all([
    getFilteredListings(searchParams),
    searchParams,
    pageParams,
  ]);
  const d = await getDictionary(lang);

  // Build search summary for display
  const searchSummary = [];
  if (params.location) searchSummary.push(params.location);
  if (params.guests) searchSummary.push(
    `${params.guests} ${parseInt(params.guests) > 1
      ? (d.rental?.searchPage?.guestPlural ?? "guests")
      : (d.rental?.searchPage?.guestSingular ?? "guest")}`
  );
  if (params.checkIn && params.checkOut) {
    searchSummary.push(`${params.checkIn} - ${params.checkOut}`);
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Header - Hidden on mobile */}
      <div className="hidden md:block sticky top-0 z-50">
        <ListingsHeader />
      </div>

      {/* Mobile Header - Hidden on desktop */}
      <MobileListingsHeader />

      <div className="layout-container py-8">
        {/* Search Summary */}
        {searchSummary.length > 0 && (
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-gray-900">
              {listings.length} {listings.length === 1
                ? (d.rental?.searchPage?.placeSingular ?? "place")
                : (d.rental?.searchPage?.placePlural ?? "places")}
              {params.location && ` ${(d.rental?.searchPage?.inLocation ?? "in {location}").replace("{location}", params.location)}`}
            </h1>
            <p className="text-gray-500 mt-1">
              {searchSummary.join(" · ")}
            </p>
          </div>
        )}

        {/* No Results Message */}
        {listings.length === 0 && searchSummary.length > 0 && (
          <div className="text-center py-12">
            <h2 className="text-xl font-medium text-gray-900 mb-2">
              {d.rental?.searchPage?.noExactMatches ?? "No exact matches"}
            </h2>
            <p className="text-gray-500 mb-4">
              {d.rental?.searchPage?.tryAdjusting ?? "Try adjusting your search by changing your dates, removing filters, or searching for a different location."}
            </p>
          </div>
        )}

        <Suspense fallback={<PropertySkeleton />}>
          <PropertyContent properties={listings} />
        </Suspense>
      </div>
    </div>
  );
}
