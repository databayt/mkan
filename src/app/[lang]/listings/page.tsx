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
import { InfiniteListings } from "@/components/listings/infinite-listings";
import { Listing } from "@/types/listing";
import { type SearchFilters } from "@/lib/schemas/search-schema";
import Footer from "@/components/site/footer";

const PAGE_SIZE = 20;

interface ListingsPageProps {
  searchParams: Promise<{
    /**
     * Free-text title/description search. Matched server-side against
     * the GIN(to_tsvector) full-text index. `q` is the conventional
     * short URL param for keyword search; `query` is accepted as an
     * alias for clarity.
     */
    q?: string;
    query?: string;
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

async function getFilteredListings(
  searchParams: ListingsPageProps["searchParams"],
  pageParams?: Promise<{ lang: "en" | "ar" }>,
) {
  const params = await searchParams;
  const lang = pageParams ? (await pageParams).lang : undefined;

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

  // Title/description full-text search. `q` is the conventional short
  // form; `query` is accepted as an alias. Trim is also done in the
  // server-action zod schema, but the URL-bar copy is friendlier with
  // a leading trim here.
  const rawQuery = (params.q ?? params.query ?? "").trim();

  // searchListings() runs even without filters now — it's the only path that
  // returns both paginated data AND a total count for the pagination UI.
  const filters: SearchFilters = {
    query: rawQuery || undefined,
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

  // Filters re-sent to the client for the infinite-scroll fetches. take/skip
  // are stripped because the InfiniteListings component owns paging — it
  // supplies a fresh `skip` per page based on how many rows are already loaded.
  const { take: _take, skip: _skip, ...clientFilters } = filters;

  const result = await searchListings(filters, lang);

  if (!result.success) {
    console.error("Search error:", result.error);
    try {
      const listings = await getListings({ publishedOnly: true });
      return { listings: listings as Listing[], total: listings.length, page, filters: clientFilters };
    } catch (error) {
      console.error("Error fetching listings:", error);
      return { listings: [] as Listing[], total: 0, page, filters: clientFilters };
    }
  }

  return {
    listings: result.data as Listing[],
    total: result.total ?? result.data.length,
    page,
    filters: clientFilters,
  };
}

function PropertySkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-[4/3] bg-gray-200 rounded-md" />
          <div className="mt-2 h-4 bg-gray-200 rounded w-3/4" />
          <div className="mt-1 h-3 bg-gray-200 rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}

export default async function ListingsPage({ searchParams, params: pageParams }: ListingsPageProps & { params: Promise<{ lang: "en" | "ar" }> }) {
  // Parallelize independent data fetches — resolve params and listings
  // concurrently. The filters panel and its price-bounds aggregation are
  // intentionally hidden on this page; URL filters still work because the
  // server action reads them directly from `searchParams`.
  const [listingsResult, params, { lang }] = await Promise.all([
    getFilteredListings(searchParams, pageParams),
    searchParams,
    pageParams,
  ]);
  const { listings, total: totalListings, filters: clientFilters } = listingsResult;
  const d = await getDictionary(lang);

  // Build search summary for display. `q`/`query` get a quoted-keyword
  // chip so users can see what they searched for and why a result set
  // looks unfamiliar.
  const searchSummary = [];
  const summaryQuery = (params.q ?? params.query ?? "").trim();
  if (summaryQuery) searchSummary.push(`"${summaryQuery}"`);
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
              {totalListings} {totalListings === 1
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

        <div>
          <Suspense fallback={<PropertySkeleton />}>
            {/* Infinite scroll: the first page is server-rendered, then the
                client appends pages as the user nears the bottom — replacing
                the old prev/next pager. `key` resets the accumulated list
                whenever the active filters change. */}
            <InfiniteListings
              key={JSON.stringify(clientFilters)}
              initialListings={listings}
              total={totalListings}
              pageSize={PAGE_SIZE}
              filters={clientFilters}
            />
          </Suspense>
        </div>
      </div>
      <Footer />
    </div>
  );
}
