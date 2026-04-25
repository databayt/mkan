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
import { db } from "@/lib/db";
import ListingsHeader from "@/components/listings/listings-header";
import MobileListingsHeader from "@/components/listings/mobile-listings-header";
import { PropertyContent } from "@/components/listings/property/content";
import { ListingsFiltersPanel } from "@/components/listings/filters-panel";
import { ListingsPagination } from "@/components/listings/pagination";
import { Listing } from "@/types/listing";
import { type SearchFilters } from "@/lib/schemas/search-schema";
import { Amenity, PropertyType } from "@prisma/client";

const PAGE_SIZE = 20;

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

  // Pagination: `page` param is 1-indexed for humans; take/skip are 0-indexed.
  const page = Math.max(1, toInt(params.page) ?? 1);

  // searchListings() runs even without filters now — it's the only path that
  // returns both paginated data AND a total count for the pagination UI.
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
    take: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
  };

  const result = await searchListings(filters);

  if (!result.success) {
    console.error("Search error:", result.error);
    try {
      const listings = await getListings({ publishedOnly: true });
      return { listings: listings as Listing[], total: listings.length, page };
    } catch (error) {
      console.error("Error fetching listings:", error);
      return { listings: [] as Listing[], total: 0, page };
    }
  }

  return {
    listings: result.data as Listing[],
    total: result.total ?? result.data.length,
    page,
  };
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
  // Parallelize independent data fetches — resolve params, listings, and
  // the cross-catalog price bounds concurrently. Price bounds feed the
  // filters-panel slider so it snaps to the actual catalog range.
  const [listingsResult, params, { lang }, priceAgg] = await Promise.all([
    getFilteredListings(searchParams),
    searchParams,
    pageParams,
    db.listing.aggregate({
      where: { isPublished: true, draft: false, pricePerNight: { not: null } },
      _min: { pricePerNight: true },
      _max: { pricePerNight: true },
    }),
  ]);
  const { listings, total: totalListings, page: currentPage } = listingsResult;
  const totalPages = Math.max(1, Math.ceil(totalListings / PAGE_SIZE));
  const d = await getDictionary(lang);

  const priceBounds = {
    min: priceAgg._min.pricePerNight ?? 0,
    max: priceAgg._max.pricePerNight ?? 1000,
  };

  // Dictionary keys live at `rental.property.filters` and `rental.property.amenities`.
  // Graceful fallbacks keep the UI readable even if a key is missing mid-rollout.
  const rentalProperty = (d.rental?.property ?? {}) as Record<string, unknown>;
  const rentalFilters = (rentalProperty.filters ?? {}) as Record<string, string>;
  const rentalAmenities = (rentalProperty.amenities ?? {}) as Record<string, string>;
  const rentalPropertyTypes = (rentalProperty.types ?? {}) as Record<string, string>;

  const filtersDict = {
    filters: {
      title: rentalFilters.title ?? (lang === "ar" ? "الفلاتر" : "Filters"),
      clearAll: rentalFilters.clearFilters ?? (lang === "ar" ? "مسح الكل" : "Clear all"),
      showResults:
        rentalFilters.showResults ?? (lang === "ar" ? "عرض {count} عقار" : "Show {count} places"),
    },
    price: {
      label: rentalFilters.minPrice ?? (lang === "ar" ? "نطاق السعر" : "Price range"),
      currency: "$",
    },
    bedrooms: rentalFilters.bedrooms ?? (lang === "ar" ? "غرف النوم" : "Bedrooms"),
    bathrooms: rentalFilters.bathrooms ?? (lang === "ar" ? "الحمامات" : "Bathrooms"),
    propertyType: rentalFilters.propertyType ?? (lang === "ar" ? "نوع العقار" : "Property type"),
    amenitiesLabel: rentalFilters.amenities ?? (lang === "ar" ? "المرافق" : "Amenities"),
    anyLabel: lang === "ar" ? "الكل" : "Any",
    mobileTriggerLabel: rentalFilters.title ?? (lang === "ar" ? "الفلاتر" : "Filters"),
    propertyTypes: rentalPropertyTypes as Partial<Record<PropertyType, string>>,
    amenityLabels: rentalAmenities as Partial<Record<Amenity, string>>,
  };

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

        <div className="flex flex-col lg:flex-row gap-6">
          <Suspense fallback={null}>
            <ListingsFiltersPanel
              priceBounds={priceBounds}
              totalListings={listings.length}
              dict={filtersDict}
            />
          </Suspense>
          <div className="flex-1 min-w-0">
            <Suspense fallback={<PropertySkeleton />}>
              <PropertyContent properties={listings} />
            </Suspense>
            <ListingsPagination
              currentPage={currentPage}
              totalPages={totalPages}
              lang={lang}
              baseParams={params}
              dict={{
                previous: lang === "ar" ? "السابق" : "Previous",
                next: lang === "ar" ? "التالي" : "Next",
                pageOf:
                  lang === "ar"
                    ? "الصفحة {current} من {total}"
                    : "Page {current} of {total}",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
