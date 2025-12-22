import { getListing } from "@/components/host/actions";
import { notFound } from "next/navigation";
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
  const { id } = await params;
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

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Layout - Preserved */}
      <div className="hidden md:block mx-14">
        <DetailsHeader />
        <ListingDetailsClient listing={listing} />
        <Location />
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden">
        <MobileListingDetails 
          listing={listing}
          images={listing.photoUrls || []}
        />
        <MobileReviews />
        <MobileReserve 
          pricePerNight={listing.pricePerNight || 700}
        />
      </div>
    </div>
  );
}
