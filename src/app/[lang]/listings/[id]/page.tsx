import { Metadata } from "next";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ListingDetailsClient from "@/components/listing-details-client";
import Location from "@/components/listings/map";
import ListingsHeader from "@/components/listings/listings-header";
import MobileListingDetails from "@/components/listings/mobile-listing-details";
import MobileReserve from "@/components/listings/mobile-reserve";
import MobileReviews from "@/components/listings/mobile-reviews";
import MobileMap from "@/components/listings/mobile-map";
import MoreStaysNearby, { type NearbyStay } from "@/components/listings/more-stays-nearby";
import Review from "@/components/listings/review";
import MeetHost from "@/components/listings/meet-host";
import Footer from "@/components/site/footer";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { getListingReviews } from "@/lib/actions/review-actions";
import { auth } from "@/lib/auth";
import type { Locale } from "@/components/internationalization/config";
import { localize, getText } from "@/components/translation/localize";

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
  const [title, description] = await Promise.all([
    getText(listing?.title, lang),
    getText(listing?.description, lang),
  ]);
  return createMetadata({
    title: title || d.rental?.listing?.details,
    description: description || d.rental?.listing?.viewDetails,
    locale: lang,
    path: `/listings/${id}`,
  });
}

async function getListingById(id: number, lang: Locale) {
  const listing = await db.listing.findUnique({
    where: { id },
    include: {
      location: true,
      host: {
        select: {
          id: true,
          email: true,
          phoneNumber: true,
          username: true,
        }
      },
    }
  });
  if (!listing) return listing;

  // Localize dynamic content (Arabic source) for the viewer's locale. No-op
  // when translation is disabled or the text is already in `lang`.
  const localized = (await localize([listing], ["title", "description"], lang))[0] ?? listing;
  if (localized.location?.address) {
    localized.location = {
      ...localized.location,
      address: await getText(localized.location.address, lang),
    };
  }
  return localized;
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
    listing = await getListingById(listingId, lang);
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

  // "More stays nearby" — other published listings in the same city, localized
  // for the viewer's locale. Soft-fails to an empty carousel (which renders null).
  let nearbyStays: NearbyStay[] = [];
  try {
    const nearbyRaw = await db.listing.findMany({
      where: {
        isPublished: true,
        id: { not: listingId },
        ...(listing.location?.city ? { location: { city: listing.location.city } } : {}),
      },
      select: {
        id: true,
        title: true,
        photoUrls: true,
        pricePerNight: true,
        averageRating: true,
      },
      take: 12,
      orderBy: { id: "asc" },
    });
    const localizedNearby = await localize(nearbyRaw, ["title"], lang);
    nearbyStays = localizedNearby.map((l) => ({
      id: l.id,
      title: l.title ?? "Listing",
      image: l.photoUrls?.[0] ?? null,
      price: l.pricePerNight ?? 0,
      rating: l.averageRating ?? 0,
      city: listing.location?.city ?? "",
    }));
  } catch {
    nearbyStays = [];
  }

  // The Dictionary type doesn't expose every leaf as a string; the booking/
  // common copy is read via this flat cast (same pattern as the reserve card).
  const dictStrings = d as unknown as Record<string, Record<string, string>>;

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Layout - Preserved. Header matches /listings: the compact
          search pill expands into the big search (opening the clicked segment),
          and the hamburger menu + avatar behave identically. disableScrollExpand
          keeps it pill-only here so the big bar never occupies the detail page
          until the user opens it. NOTE: Header is NOT fixed here — it scrolls away
          so the sticky reserve header can appear and animate smoothly. */}
      <div className="hidden md:block">
        <div>
          <ListingsHeader disableScrollExpand />
        </div>
        {/* Listing column capped at 1120px (px-8 → 1120 content at 1440), the
            live room page's content width — keeps the gallery at 1120×560. */}
        <div className="mx-auto w-full max-w-[1184px] px-8">
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
          <MoreStaysNearby
            stays={nearbyStays}
            lang={lang}
            perNight={dictStrings.booking?.perNight ?? "night"}
            currency={dictStrings.common?.currency ?? "$"}
          />
        </div>
      </div>

      {/* Mobile Layout — pb-24 clears the fixed MobileReserve bar */}
      <div className="md:hidden pb-24">
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
            hostEmail={serializedListing.host?.phoneNumber || "+249915494649"}
          />
        </Suspense>
      </div>

      <div className="pb-24 md:pb-0 bg-gray-100">
        <Footer />
      </div>
    </div>
  );
}
