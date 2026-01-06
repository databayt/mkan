import { Suspense } from "react";
import { searchListings } from "@/lib/actions/search-actions";
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
  }>;
}

async function getFilteredListings(searchParams: ListingsPageProps["searchParams"]) {
  const params = await searchParams;
  const hasFilters =
    params.location ||
    params.guests ||
    params.checkIn ||
    params.checkOut;

  // If no search filters, get all published listings
  if (!hasFilters) {
    try {
      const listings = await getListings({ publishedOnly: true });
      return listings as Listing[];
    } catch (error) {
      console.error("Error fetching listings:", error);
      return [];
    }
  }

  // Use server-side filtering when search params are present
  const filters: SearchFilters = {
    location: params.location,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    guests: params.guests ? parseInt(params.guests) : undefined,
    adults: params.adults ? parseInt(params.adults) : undefined,
    children: params.children ? parseInt(params.children) : undefined,
    infants: params.infants ? parseInt(params.infants) : undefined,
  };

  const result = await searchListings(filters);

  if (!result.success) {
    console.error("Search error:", result.error);
    // Fallback to all published listings on error
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

export default async function ListingsPage({ searchParams }: ListingsPageProps) {
  const listings = await getFilteredListings(searchParams);
  const params = await searchParams;

  // Build search summary for display
  const searchSummary = [];
  if (params.location) searchSummary.push(params.location);
  if (params.guests) searchSummary.push(`${params.guests} guest${parseInt(params.guests) > 1 ? "s" : ""}`);
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
              {listings.length} {listings.length === 1 ? "place" : "places"}
              {params.location && ` in ${params.location}`}
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
              No exact matches
            </h2>
            <p className="text-gray-500 mb-4">
              Try adjusting your search by changing your dates, removing filters,
              or searching for a different location.
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
