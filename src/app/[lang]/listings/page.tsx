import { Suspense } from "react";
import { getListings } from "@/components/host/actions";
import ListingsHeader from "@/components/listings/listings-header";
import MobileListingsHeader from "@/components/listings/mobile-listings-header";
import { PropertyContent } from "@/components/listings/property/content";
import { Listing } from "@/types/listing";

async function getPublishedListings() {
  try {
    const listings = await getListings({ publishedOnly: true });
    return listings as Listing[];
  } catch (error) {
    console.error("Error fetching published listings:", error);
    return [];
  }
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

export default async function ListingsPage() {
  const listings = await getPublishedListings();

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Header - Hidden on mobile */}
      <div className="hidden md:block sticky top-0 z-50">
        <ListingsHeader />
      </div>

      {/* Mobile Header - Hidden on desktop */}
      <MobileListingsHeader />

      <div className="layout-container py-8">
        <Suspense fallback={<PropertySkeleton />}>
          <PropertyContent properties={listings} />
        </Suspense>
      </div>
    </div>
  );
}
