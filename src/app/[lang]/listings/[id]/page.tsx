import { Metadata } from "next";
import { db } from "@/lib/db";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense, cache } from "react";
import ListingDetailsClient from "@/components/listing-details-client";
import Location from "@/components/listings/map";
import ListingsHeader from "@/components/listings/listings-header";
import MobileListingDetails from "@/components/listings/mobile-listing-details";
import MobileReserve from "@/components/listings/mobile-reserve";
import MobileReviews from "@/components/listings/mobile-reviews";
import MobileMap from "@/components/listings/mobile-map";
import { MobileBookingProvider, MobileBookingCalendar } from "@/components/listings/mobile-booking";
import MobileMeetHost from "@/components/listings/mobile-meet-host";
import MobileThingsToKnow from "@/components/listings/mobile-things-to-know";
import MobileReportListing from "@/components/listings/mobile-report-listing";
import MoreStaysNearby, { type NearbyStay } from "@/components/listings/more-stays-nearby";
import Review from "@/components/listings/review";
import MeetHost from "@/components/listings/meet-host";
import Footer from "@/components/site/footer";
import { createMetadata, SITE_URL } from "@/lib/metadata";
import { JsonLd, listingJsonLd, breadcrumbJsonLd } from "@/components/seo/json-ld";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { getListingReviews, getHostOtherReviewCount } from "@/lib/actions/review-actions";
import { auth } from "@/lib/auth";
import type { Locale } from "@/components/internationalization/config";
import { localize, localizeNested, getText } from "@/components/translation/localize";
import TrackView from "@/components/analytics/track-view";
import { listingSegment } from "@/lib/listing-code";

interface ListingPageProps {
  params: Promise<{
    id: string;
    lang: Locale;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

// Booking dates arrive as ?checkIn=yyyy-mm-dd (our /search convention) or
// Airbnb-style ?check_in — accepted so shared links land with the footer
// already priced. Anything malformed is dropped here; the client re-validates.
function pickDateParam(
  sp: Record<string, string | string[] | undefined>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const v = sp[key];
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  }
  return undefined;
}

export async function generateMetadata({
  params,
}: ListingPageProps): Promise<Metadata> {
  const { id, lang } = await params;
  const d = await getDictionary(lang);
  const listing = await fetchListing(id);
  if (!listing) {
    return createMetadata({
      title: d.rental?.listing?.details,
      description: d.rental?.listing?.viewDetails,
      locale: lang,
      path: `/listings/${id}`,
    });
  }
  // Canonical on the code, never on whichever id the visitor arrived with —
  // otherwise `/listings/1180` and `/listings/0001-01` each declare themselves
  // canonical and the same room competes with itself in the index.
  const canonicalPath = `/listings/${listingSegment(listing)}`;
  const [title, description, city] = await Promise.all([
    getText(listing?.title, lang),
    getText(listing?.description, lang),
    getText(listing?.location?.city, lang),
  ]);
  return createMetadata({
    // "<name> - <city>" mirrors how stay pages title themselves; the city is
    // the query most seekers actually type.
    title: [title || d.rental?.listing?.details, city].filter(Boolean).join(" - "),
    description: description || d.rental?.listing?.viewDetails,
    locale: lang,
    path: canonicalPath,
    image: listing?.photoUrls?.[0],
    // Unpublished/draft listings 404 in the page itself; keep any crawler
    // that raced the transition from indexing the URL.
    noIndex: !listing?.isPublished,
  });
}

// React cache() dedupes across generateMetadata and the page body within a
// single request — both consume the same row, so it runs once.
const fetchListing = cache(async (identifier: string) => {
  const numericId = parseInt(identifier, 10);
  const isSafeDbId = !isNaN(numericId) && numericId < 1_000_000 && /^\d+$/.test(identifier);
  return db.listing.findFirst({
    where: {
      OR: [
        // The mkan code (`0001-01`) is the canonical segment. `sourceListingId`
        // is kept resolvable because it was the code's home until 2026-08-24 —
        // links already shared with hosts must not break — and because the
        // scraped rows that have no code yet are reachable by Airbnb room id.
        { code: identifier },
        { sourceListingId: identifier },
        ...(isSafeDbId ? [{ id: numericId }] : []),
      ],
    },
    include: {
      location: true,
      host: {
        select: {
          id: true,
          email: true,
          phoneNumber: true,
          username: true,
          image: true,
          createdAt: true,
        }
      },
    }
  });
});

async function getListingById(identifier: string, lang: Locale) {
  const listing = await fetchListing(identifier);
  if (!listing) return listing;

  // Localize dynamic content (Arabic source) for the viewer's locale. No-op
  // when translation is disabled or the text is already in `lang`.
  let localized = (await localize([listing], ["title", "description"], lang))[0] ?? listing;
  // The detail page shows the full location line (address + city/state/country)
  // — localize the nested object through the same cache.
  localized = (await localizeNested([localized], "location", ["address", "city", "state", "country"], lang))[0] ?? localized;
  return localized;
}

export default async function ListingPage({ params, searchParams }: ListingPageProps) {
  const resolvedParams = await params;
  const { id, lang } = resolvedParams;
  const sp = (await searchParams) ?? {};
  const initialCheckIn = pickDateParam(sp, "checkIn", "check_in");
  const initialCheckOut = pickDateParam(sp, "checkOut", "check_out");

  let listing;
  try {
    listing = await getListingById(id, lang);
  } catch (error) {
    console.error("Error fetching listing:", error);
    notFound();
  }

  if (!listing || !listing.isPublished) {
    notFound();
  }

  // One listing, one URL. A visitor who arrived by row id or by Airbnb room id
  // is moved onto the code — permanently (308), so the index collapses the
  // duplicates instead of ranking the same room against itself. The query
  // string rides along: `?checkIn=…` is how a shared link lands already priced,
  // and dropping it here would silently unprice every one of those.
  const canonicalSegment = listingSegment(listing);
  if (id !== canonicalSegment) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      if (typeof value === "string") qs.append(key, value);
      else if (Array.isArray(value)) for (const v of value) qs.append(key, v);
    }
    const query = qs.toString();
    permanentRedirect(`/${lang}/listings/${canonicalSegment}${query ? `?${query}` : ""}`);
  }

  const listingId = listing.id;

  // Serialize the listing data to avoid Prisma serialization issues
  const serializedListing = JSON.parse(JSON.stringify(listing));

  const isSuperhost = (serializedListing.averageRating ?? 0) >= 4.8 && (serializedListing.numberOfReviews ?? 0) >= 10;
  const start = new Date(serializedListing.host?.createdAt || new Date());
  const end = new Date();
  const hostingMonths = Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()));

  // Heart state chains off the session promise inside the same wave — it used
  // to run as a separate awaited round trip after this Promise.all.
  const sessionPromise = auth();
  const savedTenantPromise = sessionPromise
    .then((s) =>
      s?.user?.id
        ? db.tenant.findUnique({
            where: { userId: s.user.id },
            select: { favorites: { where: { id: listingId }, select: { id: true } } },
          })
        : null
    )
    .catch(() => null);

  const [d, mobileReviewsResult, hostOtherReviews, session, nearbyRaw, savedTenant] = await Promise.all([
    getDictionary(lang),
    getListingReviews(listingId, { take: 8 }, lang).catch(() => ({ reviews: [], total: 0 })),
    getHostOtherReviewCount(listingId).catch(() => ({ count: 0, hostId: null, hostName: null })),
    sessionPromise,
    // Nearby stays only need the already-loaded listing's city, so they run in
    // this wave instead of a later sequential round-trip (fewer stacked latencies).
    db.listing
      .findMany({
        where: {
          isPublished: true,
          id: { not: listingId },
          ...(listing.location?.city ? { location: { city: listing.location.city } } : {}),
        },
        select: {
          id: true,
          code: true,
          sourceListingId: true,
          title: true,
          photoUrls: true,
          pricePerNight: true,
          averageRating: true,
        },
        take: 12,
        orderBy: { id: "asc" },
      })
      .catch(() => []),
    savedTenantPromise,
  ]);

  // Heart state comes from the tenant's persisted favorites, not localStorage.
  const initialIsSaved = (savedTenant?.favorites.length ?? 0) > 0;

  const mobileReviewItems = mobileReviewsResult.reviews.map((r) => ({
    id: r.id,
    author:
      r.reviewer?.username ??
      r.reviewer?.id?.slice(0, 8) ??
      ((d.rental?.reviewsList as Record<string, string> | undefined)?.guestAuthor ?? "Guest"),
    rating: r.rating,
    createdAt: r.createdAt as unknown as Date,
    comment: r.comment ?? null,
  }));

  // "More stays nearby" — localize the pre-fetched rows for the viewer's locale.
  // Soft-fails to an empty carousel (which renders null).
  let nearbyStays: NearbyStay[] = [];
  try {
    const localizedNearby = await localize(nearbyRaw, ["title"], lang);
    nearbyStays = localizedNearby.map((l) => ({
      id: listingSegment(l as { code?: string | null; sourceListingId?: string | null; id: number }),
      title: l.title ?? "Listing",
      image: l.photoUrls?.[0] ?? null,
      price: l.pricePerNight ?? 0,
      rating: l.averageRating ?? 0,
      city: listing.location?.city ?? "",
    }));
  } catch {
    nearbyStays = [];
  }

  const listingUrl = `${SITE_URL}/${lang}/listings/${canonicalSegment}`;

  return (
    <div className="min-h-screen bg-background">
      <JsonLd
        data={listingJsonLd({
          id: listingId,
          title: serializedListing.title ?? "Listing",
          description: serializedListing.description ?? "",
          url: listingUrl,
          locale: lang,
          photoUrls: serializedListing.photoUrls ?? [],
          propertyType: serializedListing.propertyType,
          bedrooms: serializedListing.bedrooms,
          bathrooms: serializedListing.bathrooms,
          guestCount: serializedListing.guestCount,
          isPetsAllowed: serializedListing.isPetsAllowed,
          location: serializedListing.location,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: lang === "ar" ? "الرئيسية" : "Home", url: `${SITE_URL}/${lang}` },
          { name: lang === "ar" ? "العقارات" : "Listings", url: `${SITE_URL}/${lang}/listings` },
          { name: serializedListing.title ?? "Listing", url: listingUrl },
        ])}
      />
      {/* Funnel: one VIEW per visitor per day. Mounted here, not inside the
          desktop/mobile trees below — both render on every request and are
          hidden with CSS, so a tracker inside them would double-count one
          human visit. */}
      <TrackView listingId={listing.id} />
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
              reviewsSlot={
                <Review
                  listingId={listingId}
                  lang={lang}
                  curatedGuestFavorite={serializedListing.isGuestFavorite ?? false}
                />
              }
              meetHostSlot={
                <MeetHost
                  listingId={listing.id}
                  hostUser={serializedListing.host ?? null}
                  reviewsCount={serializedListing.numberOfReviews ?? undefined}
                  averageRating={serializedListing.averageRating ?? undefined}
                  superhost={isSuperhost}
                  hostingMonths={hostingMonths}
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
            heading={d.rental?.listing?.moreStaysNearby ?? "More stays nearby"}
            newLabel={d.rental?.searchPage?.new ?? "New"}
          />
        </div>
      </div>

      {/* Mobile Layout — section order mirrors the live Airbnb PDP (room 40938334):
          overview/highlights/description/where-you-sleep/amenities
          (MobileListingDetails) → location → calendar → reviews → meet-your-host →
          things-to-know → similar listings → report → fixed reserve bar. The
          reviews block keeps id="mobile-reviews-section" so the overview rating
          banner still scroll-jumps to it. The site footer below is the last
          scrollable content and its own pb-24 clears the fixed reserve bar, so
          this only needs a small tail after the report row (not the full bar
          height). MobileBookingProvider keeps the inline calendar and the fixed
          footer on one date range, Airbnb-style. */}
      <div className="md:hidden pb-10">
        <MobileBookingProvider
          listingId={listingId}
          pricePerNight={serializedListing.pricePerNight || 700}
          cleaningFee={serializedListing.cleaningFee ?? 0}
          city={serializedListing.location?.city ?? ""}
          phone={serializedListing.host?.phoneNumber || "+249915494649"}
          rating={serializedListing.averageRating ?? 0}
          reviewsCount={serializedListing.numberOfReviews ?? 0}
          initialCheckIn={initialCheckIn}
          initialCheckOut={initialCheckOut}
        >
        <Suspense fallback={<div>{d.rental?.listing?.loading}</div>}>
          <MobileListingDetails
            listing={serializedListing}
            images={serializedListing.photoUrls || []}
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
        <MobileBookingCalendar />
        <Suspense fallback={<div>{d.rental?.listing?.loadingReviews}</div>}>
          <div id="mobile-reviews-section">
            <MobileReviews
              reviews={mobileReviewItems}
              averageRating={serializedListing.averageRating ?? undefined}
              totalReviews={serializedListing.numberOfReviews ?? mobileReviewsResult.total}
              hostReviewCount={hostOtherReviews.count}
              hostId={hostOtherReviews.hostId ?? undefined}
              curatedGuestFavorite={serializedListing.isGuestFavorite ?? false}
            />
          </div>
        </Suspense>
        <MobileMeetHost
          listingId={listing.id}
          hostUser={serializedListing.host ?? null}
          reviewsCount={serializedListing.numberOfReviews ?? undefined}
          averageRating={serializedListing.averageRating ?? undefined}
          superhost={isSuperhost}
          hostingMonths={hostingMonths}
        />
        <MobileThingsToKnow
          maxGuests={serializedListing.guestCount ?? undefined}
          petsAllowed={serializedListing.isPetsAllowed ?? false}
          checkInTime={serializedListing.checkInTime}
          checkOutTime={serializedListing.checkOutTime}
          checkInMethod={serializedListing.checkInMethod}
          houseRules={serializedListing.houseRules}
          cancellationPolicy={serializedListing.cancellationPolicy}
          amenities={serializedListing.amenities}
        />
        <div className="px-6">
          <MoreStaysNearby
            stays={nearbyStays}
            lang={lang}
            heading={d.rental?.listing?.moreStaysNearby ?? "More stays nearby"}
            newLabel={d.rental?.searchPage?.new ?? "New"}
          />
        </div>
        {/* REPORT_TO_AIRBNB — the closing row of the live mobile PDP (report →
            seo). Opens the reason → detail → confirmation report flow. */}
        <MobileReportListing listingId={listingId} />
        <MobileReserve />
        </MobileBookingProvider>
      </div>

      <div className="pb-32 md:pb-0 bg-gray-100">
        <Footer />
      </div>
    </div>
  );
}
