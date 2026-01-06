import { getListing } from "@/components/host/actions";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ListingDetailsClient from "@/components/listing-details-client";
import Location from "@/components/listings/airbnb-map";
import DetailsHeader from "@/components/listings/detials-header";
import MobileListingDetails from "@/components/listings/mobile-listing-details";
import MobileReserve from "@/components/listings/mobile-reserve";
import MobileReviews from "@/components/listings/mobile-reviews";

interface ListingPageProps {
  params: Promise<{
    id: string;
    lang: string;
  }>;
}

export default async function ListingPage({ params }: ListingPageProps) {
  const resolvedParams = await params;
  const { id, lang } = resolvedParams;
  const listingId = parseInt(id);

  if (isNaN(listingId)) {
    notFound();
  }

  let listing;
  try {
    listing = await getListing(listingId);
  } catch (error) {
    console.error("Error fetching listing:", error);
    notFound();
  }

  if (!listing || !listing.isPublished) {
    notFound();
  }

  // Serialize the listing data to avoid Prisma serialization issues
  const serializedListing = JSON.parse(JSON.stringify(listing));

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Layout - Preserved */}
      <div className="hidden md:block mx-14">
        <Suspense fallback={<div>Loading header...</div>}>
          <DetailsHeader />
        </Suspense>
        <Suspense fallback={<div>Loading listing details...</div>}>
          <ListingDetailsClient listing={serializedListing} />
        </Suspense>
        <Suspense fallback={<div>Loading map...</div>}>
          <Location />
        </Suspense>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden">
        <Suspense fallback={<div>Loading...</div>}>
          <MobileListingDetails
            listing={serializedListing}
            images={serializedListing.photoUrls || []}
          />
        </Suspense>
        <Suspense fallback={<div>Loading reviews...</div>}>
          <MobileReviews />
        </Suspense>
        <Suspense fallback={<div>Loading...</div>}>
          <MobileReserve
            pricePerNight={serializedListing.pricePerNight || 700}
          />
        </Suspense>
      </div>
    </div>
  );
}
