import { Metadata } from "next";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ListingDetailsClient from "@/components/listing-details-client";
import Location from "@/components/listings/map";
import DetailsHeader from "@/components/listings/detials-header";
import MobileListingDetails from "@/components/listings/mobile-listing-details";
import MobileReserve from "@/components/listings/mobile-reserve";
import MobileReviews from "@/components/listings/mobile-reviews";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";

interface ListingPageProps {
  params: Promise<{
    id: string;
    lang: Locale;
  }>;
}

export async function generateMetadata({
  params,
}: ListingPageProps): Promise<Metadata> {
  const { id, lang } = await params;
  const d = await getDictionary(lang);
  const listingId = parseInt(id);
  if (isNaN(listingId)) {
    return createMetadata({
      title: d.rental?.listing?.details,
      description: d.rental?.listing?.viewDetails,
      locale: lang,
      path: `/listings/${id}`,
    });
  }
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { title: true, description: true },
  });
  return createMetadata({
    title: listing?.title || d.rental?.listing?.details,
    description:
      listing?.description || d.rental?.listing?.viewDetails,
    locale: lang,
    path: `/listings/${id}`,
  });
}

async function getListingById(id: number) {
  const listing = await db.listing.findUnique({
    where: { id },
    include: {
      location: true,
      host: {
        select: {
          id: true,
          email: true,
          username: true,
        }
      },
    }
  });
  return listing;
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
    listing = await getListingById(listingId);
  } catch (error) {
    console.error("Error fetching listing:", error);
    notFound();
  }

  if (!listing || !listing.isPublished) {
    notFound();
  }

  // Serialize the listing data to avoid Prisma serialization issues
  const serializedListing = JSON.parse(JSON.stringify(listing));

  const d = await getDictionary(lang);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Layout - Preserved */}
      <div className="hidden md:block mx-14">
        <Suspense fallback={<div>{d.rental?.listing?.loadingHeader}</div>}>
          <DetailsHeader />
        </Suspense>
        <Suspense fallback={<div>{d.rental?.listing?.loadingDetails}</div>}>
          <ListingDetailsClient listing={serializedListing} />
        </Suspense>
        <Suspense fallback={<div>{d.rental?.listing?.loadingMap}</div>}>
          <Location />
        </Suspense>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden">
        <Suspense fallback={<div>{d.rental?.listing?.loading}</div>}>
          <MobileListingDetails
            listing={serializedListing}
            images={serializedListing.photoUrls || []}
          />
        </Suspense>
        <Suspense fallback={<div>{d.rental?.listing?.loadingReviews}</div>}>
          <MobileReviews />
        </Suspense>
        <Suspense fallback={<div>{d.rental?.listing?.loading}</div>}>
          <MobileReserve
            pricePerNight={serializedListing.pricePerNight || 700}
          />
        </Suspense>
      </div>
    </div>
  );
}
