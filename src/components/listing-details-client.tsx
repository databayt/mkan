"use client";

import React, { useEffect, useState } from "react";
import { type DateRange } from "react-day-picker";
import { Phone } from "lucide-react";
import { useFavorites } from "@/components/favorites/favorites-context";
import { getBlockedDates } from "@/lib/actions/booking-actions";
import AirbnbPropertyHeader from "@/components/atom/property-header";
import AirbnbReserve from "@/components/atom/property-reserve";
import AmenityViewer from "@/components/listings/amenity-viewer";
import { Listing } from "@/types/listing";
import PropertyGallery from "@/components/atom/property-gallery";
import AirbnbInfo from "./atom/property-info";
import HostedBy from "./listings/hosted-by";
import WhereYouSleep from "./listings/where-you-sleep";
import ThingsToKnow from "./listings/things-to-know";
import GuestFavoriteCard from "./listings/guest-favorite-card";
import RatingStar from "./listings/rating-star";
import { qualifiesAsGuestFavorite } from "@/lib/guest-favorite";
import AvailabilityCalendar from "./listings/availability-calendar";
import StickyListingHeader from "./listings/sticky-listing-header";
import { PHASE1 } from "@/config/phase-flags";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { useLocale } from "@/components/internationalization/use-locale";
import { formatCurrency, formatNumber } from "@/lib/i18n/formatters";

interface ListingDetailsClientProps {
    listing: Listing;
    /**
     * Reviews are rendered server-side and threaded in as children so the
     * client island doesn't have to re-fetch on hydrate.
     */
    reviewsSlot?: React.ReactNode;
    /** Same pattern for the host detail card. */
    meetHostSlot?: React.ReactNode;
    /** Server-computed: is this listing in the signed-in tenant's favorites? */
    initialIsSaved?: boolean;
}

// Airbnb's "Prices include all fees" pink price-tag — the gradient recreation
// (stops #F65C86→#EF366C, white eyelet) used across the search results, kept
// consistent here so the reserve-side promo reads identically.
function PriceTagIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <defs>
                <linearGradient id="reserve-fees-tag" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#F65C86" />
                    <stop offset="1" stopColor="#EF366C" />
                </linearGradient>
            </defs>
            <path
                d="M12.6 2.1H6.2A2.1 2.1 0 0 0 4.1 4.2v6.4c0 .56.22 1.09.62 1.48l8.4 8.4a2.1 2.1 0 0 0 2.97 0l5.99-5.99a2.1 2.1 0 0 0 0-2.97l-8.4-8.4a2.1 2.1 0 0 0-1.48-.62Z"
                fill="url(#reserve-fees-tag)"
            />
            <circle cx="8.4" cy="6.4" r="1.5" fill="#fff" />
        </svg>
    );
}

export default function ListingDetailsClient({ listing, reviewsSlot, meetHostSlot, initialIsSaved = false }: ListingDetailsClientProps) {
    const dict = useDictionary();
    const { locale } = useLocale();
    // Phase 1 is contact-only: the guest calls the host. Falls back to the
    // market support line when a host has no phone on file.
    const ownerPhone = listing.host?.phoneNumber || "+249915494649";
    const reserveRef = React.useRef<HTMLDivElement>(null);
    const [isCallButtonInHeader, setIsCallButtonInHeader] = useState(false);
    // Heart state lives in the shared favorites provider (server-persisted
    // when signed in — with Tenant upsert — on-device for guests). The server
    // seed keeps the first paint correct until the provider hydrates.
    const fav = useFavorites();
    const isSaved = fav.ready && typeof listing.id === "number"
        ? fav.isFavorite(listing.id)
        : initialIsSaved;
    const [, setGalleryOpen] = useState(false);

    // Booking date range is lifted here so the inline availability calendar and
    // the sticky reserve card share one selection. Blocked dates are fetched
    // once and handed to both (the reserve card skips its own fetch when given).
    const [range, setRange] = useState<DateRange | undefined>();
    const [blockedDates, setBlockedDates] = useState<Date[]>([]);
    useEffect(() => {
        if (typeof listing.id !== "number") return;
        getBlockedDates(listing.id)
            .then((ranges) => {
                const dates: Date[] = [];
                for (const r of ranges as Array<{ startDate: Date; endDate: Date }>) {
                    const start = new Date(r.startDate);
                    const end = new Date(r.endDate);
                    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                        dates.push(new Date(d));
                    }
                }
                setBlockedDates(dates);
            })
            .catch(() => {
                // Soft-fail — the reserve card's server-side availability check
                // still guards against booking a conflicting range.
            });
    }, [listing.id]);

    const locationString = listing.location
        ? `${listing.location.city}, ${listing.location.state}`
        : (dict?.property?.detail?.locationUnavailable ?? "Location not available");

    // Airbnb overview line: "Entire {type} in {city}, {country}". Type label is
    // localized via the shared propertyType enum map; falls back to just the type.
    const typeLabels = dict?.rental?.property?.types as Record<string, string> | undefined;
    const typeLabel = (listing.propertyType && typeLabels?.[listing.propertyType]) || (listing.propertyType ?? "place");
    const overviewTitle = listing.location
        ? (dict?.property?.detail?.entireIn ?? "Entire {type} in {location}")
            .replace("{type}", typeLabel)
            .replace("{location}", `${listing.location.city}, ${listing.location.country}`)
        : (dict?.property?.detail?.entire ?? "Entire {type}").replace("{type}", typeLabel);

    // Specs line mirrors the reference order: guests · bedrooms · bathrooms.
    // The Listing model has no per-bed count, so "beds" is omitted.
    const spec = (n: number, key: "guests" | "bedrooms" | "bathrooms") =>
        (dict?.property?.detail?.[key] ?? `{count} ${key}`).replace("{count}", formatNumber(n, locale));
    const specs = [
        typeof listing.guestCount === "number" ? spec(listing.guestCount, "guests") : null,
        typeof listing.bedrooms === "number" ? spec(listing.bedrooms, "bedrooms") : null,
        typeof listing.bathrooms === "number" ? spec(listing.bathrooms, "bathrooms") : null,
    ].filter(Boolean).join(" · ");

    // Superhost is a rating+volume proxy at v1.0 (no separate program yet).
    const isSuperhost = (listing.averageRating ?? 0) >= 4.8 && (listing.numberOfReviews ?? 0) >= 10;

    const handleShare = () => {
        if (navigator.share) {
            navigator.share({
                title: listing.title || "Property Listing",
                url: window.location.href,
            });
        } else {
            navigator.clipboard.writeText(window.location.href);
        }
    };

    const handleSave = () => {
        if (typeof listing.id === "number") fav.toggle(listing.id);
    };

    const handleShowAllPhotos = () => {
        setGalleryOpen(true);
        // Defer the real lightbox modal to v1.0.1; for now we scroll to the
        // photo grid which already supports keyboard navigation.
        const grid = document.querySelector("[data-photo-grid]");
        grid?.scrollIntoView({ behavior: "smooth" });
    };

    return (
        <>
            <StickyListingHeader
                price={listing.pricePerNight || 0}
                rating={listing.averageRating || 4.5}
                reviewCount={listing.numberOfReviews || 0}
                ownerPhone={ownerPhone}
                reserveElement={reserveRef}
                onCallButtonMerge={setIsCallButtonInHeader}
            />
            <div className="py-8">
            {/* Property Header — PRESERVED title block (title · rating · reviews ·
                location · Share · Save) per the clone scope. The whole listing
                column is capped at 1120px by the page wrapper (mirrors the live
                room page), so the gallery lands at Airbnb's exact 1120×560 (2:1)
                rather than ballooning to the full width (~608px tall). */}
            <AirbnbPropertyHeader
                title={listing.title || "Beautiful Property"}
                location={locationString}
                rating={listing.averageRating || 4.5}
                reviewCount={listing.numberOfReviews || 0}
                isSuperhost={isSuperhost}
                onShare={handleShare}
                onSave={handleSave}
                isSaved={isSaved}
                className="mb-6"
            />

            <PropertyGallery
                images={listing.photoUrls || []}
                onSave={handleSave}
                isSaved={isSaved}
                onShowAllPhotos={handleShowAllPhotos}
                listingId={listing.id?.toString()}
            />

            {/* Two-column fold: left = overview/host/highlights/description/
                sleeping/amenities, right = sticky reserve. Mirrors the live room
                page; the reserve column is pushed right with a flexible gap. */}
            <div className="mt-10 flex flex-col justify-between gap-12 lg:flex-row">
                <div className="w-full max-w-[640px]">
                    {/* Overview — Airbnb subtitle + specs + guest-favorite card */}
                    <section className="border-b border-[#DDDDDD] pb-8">
                        <h2 className="text-[22px] font-medium leading-[26px] tracking-[-0.44px] text-[#222222]">
                            {overviewTitle}
                        </h2>
                        {specs && (
                            <p className="mt-1 text-base leading-5 text-[#222222]">{specs}</p>
                        )}
                        {/* Guest-favorite slot — mirrors Airbnb's GUEST_FAVORITE_BANNER:
                            the laurel card renders ONLY for qualifying homes (curated flag
                            or ≥4.9 across ≥5 reviews); everything else with reviews gets
                            the plain "★ 4.75 · 4 reviews" row, and the slot stays empty
                            otherwise (probed live on rooms 40938334 / 1562136998451248859). */}
                        {qualifiesAsGuestFavorite(listing) ? (
                            <div className="mt-6">
                                {(listing.numberOfReviews ?? 0) > 0 ? (
                                    <GuestFavoriteCard
                                        rating={listing.averageRating ?? 0}
                                        reviewCount={listing.numberOfReviews ?? 0}
                                        label={dict?.property?.guestFavorite?.title ?? "Guest favorite"}
                                        blurb={dict?.property?.guestFavorite?.blurb ?? "One of the most loved homes on Mkan, according to guests"}
                                        reviewsLabel={dict?.property?.guestFavorite?.reviews ?? "Reviews"}
                                    />
                                ) : (
                                    <GuestFavoriteCard
                                        badgeOnly
                                        label={dict?.property?.guestFavorite?.title ?? "Guest favorite"}
                                        blurb={locale === "ar" ? "من أكثر المنازل المحبوبة على مكان" : "One of the most loved homes on Mkan"}
                                    />
                                )}
                            </div>
                        ) : (listing.numberOfReviews ?? 0) > 0 ? (
                            <div className="mt-2 flex items-center gap-1.5 text-base font-medium text-[#222222]">
                                <RatingStar size={14} />
                                <span>
                                    {formatNumber(listing.averageRating ?? 0, locale, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}
                                </span>
                                <span aria-hidden>·</span>
                                <span className="underline underline-offset-2">
                                    {(dict?.rental?.reviewsList?.reviewsCount ?? "{n} reviews").replace(
                                        "{n}",
                                        formatNumber(listing.numberOfReviews ?? 0, locale)
                                    )}
                                </span>
                            </div>
                        ) : null}
                    </section>

                    {/* Host row */}
                    <div className="border-b border-[#DDDDDD]">
                        <HostedBy host={listing.host ?? null} superhost={isSuperhost} />
                    </div>

                    {/* About this room Section (only for Rooms property type) */}
                    {listing.propertyType === "Rooms" && (
                        <section className="border-b border-[#DDDDDD] py-8">
                            <h2 className="text-[22px] font-semibold leading-[26px] tracking-[-0.44px] text-[#222222] mb-4">
                                {locale === "ar" ? "عن هذه الغرفة" : "About this room"}
                            </h2>
                            <div className="grid grid-cols-3 gap-3">
                                {/* Bedroom details */}
                                <div className="flex flex-col justify-between gap-6 rounded-xl border border-[#DDDDDD] p-4 text-start">
                                    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="presentation" focusable="false" className="h-6 w-6 text-[#222222]" style={{ display: "block", fill: "none", stroke: "currentColor", strokeWidth: "2.5" }}>
                                        <path d="M2 26V6h4v14h20V6h4v20M6 12h10m4 0h6m-20 4v4m20-4v4" />
                                    </svg>
                                    <div>
                                        <div className="text-sm font-semibold text-[#222222] leading-tight">
                                            {locale === "ar" ? "غرفة النوم" : "Bedroom"}
                                        </div>
                                        <div className="text-[13px] text-[#6A6A6A] mt-1 leading-tight">
                                            {typeof listing.bedrooms === 'number' && listing.bedrooms > 0
                                                ? (locale === 'ar' ? `${listing.bedrooms} غرفة` : `${listing.bedrooms} bedroom`)
                                                : (locale === 'ar' ? 'سرير مزدوج' : '1 double bed')}
                                        </div>
                                    </div>
                                </div>

                                {/* Bathroom details */}
                                <div className="flex flex-col justify-between gap-6 rounded-xl border border-[#DDDDDD] p-4 text-start">
                                    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="presentation" focusable="false" className="h-6 w-6 text-[#222222]" style={{ display: "block", fill: "none", stroke: "currentColor", strokeWidth: "2.5" }}>
                                        <path d="M26 6a3 3 0 0 1 3 3v19H3V9a3 3 0 0 1 3-3zm1 20V9a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v17" />
                                        <circle cx="16" cy="14" r="3" />
                                    </svg>
                                    <div>
                                        <div className="text-sm font-semibold text-[#222222] leading-tight">
                                            {locale === "ar" ? "الحمام" : "Bathroom"}
                                        </div>
                                        <div className="text-[13px] text-[#6A6A6A] mt-1 leading-tight">
                                            {locale === "ar" ? "حمام خاص" : "Private"}
                                        </div>
                                    </div>
                                </div>

                                {/* Room Privacy details */}
                                <div className="flex flex-col justify-between gap-6 rounded-xl border border-[#DDDDDD] p-4 text-start">
                                    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="presentation" focusable="false" className="h-6 w-6 text-[#222222]" style={{ display: "block", fill: "none", stroke: "currentColor", strokeWidth: "2.5" }}>
                                        <rect x="6" y="14" width="20" height="14" rx="4" />
                                        <path d="M10 14V9a6 6 0 0 1 12 0v5" />
                                    </svg>
                                    <div>
                                        <div className="text-sm font-semibold text-[#222222] leading-tight">
                                            {locale === "ar" ? "خصوصية الغرفة" : "Room privacy"}
                                        </div>
                                        <div className="text-[13px] text-[#6A6A6A] mt-1 leading-tight">
                                            {locale === "ar" ? "قفل على الباب" : "Lock on door"}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Highlights — real listing.highlights, hidden when empty */}
                    {PHASE1.showListingHighlights && (listing.highlights?.length ?? 0) > 0 && (
                        <section className="border-b border-[#DDDDDD] py-8">
                            <AirbnbInfo highlights={listing.highlights} />
                        </section>
                    )}

                    {/* Description */}
                    {listing.description && (
                        <section className="border-b border-[#DDDDDD] py-8">
                            <p className="whitespace-pre-line text-base leading-6 text-[#222222]">
                                {listing.description}
                            </p>
                        </section>
                    )}

                    {/* Where you'll sleep — hidden in phase 1 (fabricated per-room beds); see phase-flags */}
                    {PHASE1.showWhereYouSleep && <WhereYouSleep bedrooms={listing.bedrooms} />}

                    {/* Amenities — real listing.amenities, hidden when empty */}
                    {PHASE1.showListingAmenities && (listing.amenities?.length ?? 0) > 0 && (
                        <section className="border-b border-[#DDDDDD] py-12">
                            <AmenityViewer amenities={listing.amenities} />
                        </section>
                    )}
                </div>

                {/* Reservation column — Airbnb pushes it right of a flexible gap */}
                <div ref={reserveRef} className="w-full flex-shrink-0 lg:w-[372px]" data-reserve-section>
                    <div className="sticky top-28 space-y-4">
                        {PHASE1.enableOnlineBooking ? (
                          <>
                            {/* "Prices include all fees" promo card above the reserve box */}
                            <div className="flex items-center justify-center gap-2 rounded-xl border border-[#DDDDDD] py-4">
                                <PriceTagIcon />
                                <span className="text-sm font-medium text-[#222222]">
                                    {dict?.rental?.searchPage?.pricesIncludeFees ?? "Prices include all fees"}
                                </span>
                            </div>

                            <AirbnbReserve
                                listingId={listing.id}
                                pricePerNight={listing.pricePerNight || 0}
                                cleaningFee={listing.cleaningFee ?? null}
                                maxGuests={listing.guestCount ?? 10}
                                rating={listing.averageRating || 4.5}
                                reviewCount={listing.numberOfReviews || 0}
                                range={range}
                                onRangeChange={setRange}
                                blockedDates={blockedDates}
                                className="w-full"
                                buttonText={dict?.property?.contactHost?.call ?? "Call"}
                                hideButton={isCallButtonInHeader}
                            />
                          </>
                        ) : (
                            /* Phase 1: contact-only. The booking widget is flagged off; the
                               guest calls the host directly (see phase-flags). */
                            <div className="rounded-2xl border border-[#DDDDDD] p-6 shadow-[0_6px_16px_rgba(0,0,0,0.12)]">
                                <div className="mb-4 flex items-baseline gap-1.5">
                                    <span className="text-[22px] font-semibold text-[#222222]">
                                        {formatCurrency(listing.pricePerNight || 0, locale)}
                                    </span>
                                    <span className="text-base text-[#222222]">
                                        {dict?.property?.contactHost?.perNight ?? "per night"}
                                    </span>
                                </div>
                                <a
                                    href={`tel:${ownerPhone}`}
                                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#E61E4D] via-[#E31C5F] to-[#D70466] px-6 py-3.5 text-base font-medium text-white transition-all duration-200 hover:shadow-lg active:scale-[0.99]"
                                    title={`${dict?.property?.contactHost?.callHost ?? "Call host"} ${ownerPhone}`}
                                >
                                    <Phone className="h-5 w-5 flex-shrink-0" />
                                    <span>{dict?.property?.contactHost?.callHost ?? "Call host"}</span>
                                </a>
                                <p className="mt-3 text-center text-xs text-[#6A6A6A]">
                                    {dict?.property?.contactHost?.availabilityNote ?? "Call to check availability & book"}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Full-width sections below the fold — inline calendar, reviews,
                host, things to know. Real review data flows through the slot. */}
            {PHASE1.enableOnlineBooking && (
                <AvailabilityCalendar
                    city={listing.location?.city ?? ""}
                    range={range}
                    onRangeChange={setRange}
                    blockedDates={blockedDates}
                />
            )}
            {reviewsSlot}
            {meetHostSlot}
            {PHASE1.showThingsToKnow && (
                <ThingsToKnow
                    maxGuests={listing.guestCount}
                    petsAllowed={listing.isPetsAllowed}
                />
            )}
            </div>
        </>
    );
}
