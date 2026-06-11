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
import MobileMap from "@/components/listings/mobile-map";
import Review from "@/components/listings/review";
import MeetHost from "@/components/listings/meet-host";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { getListingReviews } from "@/lib/actions/review-actions";
import { auth } from "@/lib/auth";
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

  const [d, mobileReviewsResult, session] = await Promise.all([
    getDictionary(lang),
    getListingReviews(listingId, { take: 8 }).catch(() => ({ reviews: [], total: 0 })),
    auth(),
  ]);

  // Heart state comes from the tenant's persisted favorites, not localStorage.
  let initialIsSaved = false;
  if (session?.user?.id) {
    const tenant = await db.tenant
      .findUnique({
        where: { userId: session.user.id },
        select: { favorites: { where: { id: listingId }, select: { id: true } } },
      })
      .catch(() => null);
    initialIsSaved = (tenant?.favorites.length ?? 0) > 0;
  }

  const mobileReviewItems = mobileReviewsResult.reviews.map((r) => ({
    id: r.id,
    author: r.reviewer?.username ?? r.reviewer?.id?.slice(0, 8) ?? "Guest",
    rating: r.rating,
    createdAt: r.createdAt as unknown as Date,
    comment: r.comment ?? null,
  }));

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Layout - Preserved */}
      <div className="hidden md:block mx-14">
        <Suspense fallback={<div>{d.rental?.listing?.loadingHeader}</div>}>
          <DetailsHeader />
        </Suspense>
        <Suspense fallback={<div>{d.rental?.listing?.loadingDetails}</div>}>
          <ListingDetailsClient
            listing={serializedListing}
            initialIsSaved={initialIsSaved}
            reviewsSlot={<Review listingId={listingId} lang={lang} />}
            meetHostSlot={
              <MeetHost
                hostUser={serializedListing.host ?? null}
                reviewsCount={serializedListing.numberOfReviews ?? undefined}
                averageRating={serializedListing.averageRating ?? undefined}
              />
            }
          />
        </Suspense>
        <Suspense fallback={<div>{d.rental?.listing?.loadingMap}</div>}>
          <Location
            latitude={serializedListing.location?.latitude}
            longitude={serializedListing.location?.longitude}
            city={serializedListing.location?.city}
            state={serializedListing.location?.state}
            country={serializedListing.location?.country}
          />
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
          <MobileReviews
            reviews={mobileReviewItems}
            averageRating={serializedListing.averageRating ?? undefined}
            totalReviews={mobileReviewsResult.total}
          />
        </Suspense>
        <Suspense fallback={<div>{d.rental?.listing?.loadingMap}</div>}>
          <MobileMap
            latitude={serializedListing.location?.latitude}
            longitude={serializedListing.location?.longitude}
            city={serializedListing.location?.city}
            state={serializedListing.location?.state}
            country={serializedListing.location?.country}
          />
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
