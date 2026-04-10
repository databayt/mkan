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

interface ListingPageProps {
  params: Promise<{
    id: string;
    lang: string;
  }>;
}

export async function generateMetadata({
  params,
}: ListingPageProps): Promise<Metadata> {
  const { id, lang } = await params;
  const listingId = parseInt(id);
  if (isNaN(listingId)) {
    return createMetadata({
      title: lang === "ar" ? "تفاصيل العقار" : "Listing Details",
      description:
        lang === "ar"
          ? "عرض تفاصيل العقار"
          : "View property listing details",
      locale: lang,
      path: `/listings/${id}`,
    });
  }
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { title: true, description: true },
  });
  return createMetadata({
    title: listing?.title || (lang === "ar" ? "تفاصيل العقار" : "Listing Details"),
    description:
      listing?.description ||
      (lang === "ar"
        ? "عرض تفاصيل العقار"
        : "View property listing details"),
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

  const isAr = lang === "ar";

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Layout - Preserved */}
      <div className="hidden md:block mx-14">
        <Suspense fallback={<div>{isAr ? "جاري التحميل..." : "Loading header..."}</div>}>
          <DetailsHeader />
        </Suspense>
        <Suspense fallback={<div>{isAr ? "جاري تحميل التفاصيل..." : "Loading listing details..."}</div>}>
          <ListingDetailsClient listing={serializedListing} />
        </Suspense>
        <Suspense fallback={<div>{isAr ? "جاري تحميل الخريطة..." : "Loading map..."}</div>}>
          <Location />
        </Suspense>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden">
        <Suspense fallback={<div>{isAr ? "جاري التحميل..." : "Loading..."}</div>}>
          <MobileListingDetails
            listing={serializedListing}
            images={serializedListing.photoUrls || []}
          />
        </Suspense>
        <Suspense fallback={<div>{isAr ? "جاري تحميل التقييمات..." : "Loading reviews..."}</div>}>
          <MobileReviews />
        </Suspense>
        <Suspense fallback={<div>{isAr ? "جاري التحميل..." : "Loading..."}</div>}>
          <MobileReserve
            pricePerNight={serializedListing.pricePerNight || 700}
          />
        </Suspense>
      </div>
    </div>
  );
}
