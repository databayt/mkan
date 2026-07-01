"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { type DateRange } from "react-day-picker";
import { Phone } from "lucide-react";
import { addFavoriteProperty, removeFavoriteProperty } from "@/lib/actions/user-actions";
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
import AvailabilityCalendar from "./listings/availability-calendar";
import StickyListingHeader from "./listings/sticky-listing-header";

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
    const { data: session } = useSession();
    const reserveRef = React.useRef<HTMLDivElement>(null);
    const [isCallButtonInHeader, setIsCallButtonInHeader] = useState(false);
    // Signed-in users persist the heart to the tenant's favorites; signed-out
    // users fall back to localStorage so the heart still remembers on-device.
    const storageKey = `mkan:saved:${listing.id ?? "anon"}`;
    const [isSaved, setIsSaved] = useState<boolean>(() => {
        if (initialIsSaved) return true;
        if (typeof window === "undefined") return false;
        return window.localStorage.getItem(storageKey) === "1";
    });
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
        : "Location not available";

    // Airbnb overview line: "Entire {type} in {city}, {country}". Falls back to
    // just the type when a listing has no location row.
    const typeLabel = (listing.propertyType ?? "place").toLowerCase();
    const overviewTitle = listing.location
        ? `Entire ${typeLabel} in ${listing.location.city}, ${listing.location.country}`
        : `Entire ${typeLabel}`;

    // Specs line mirrors the reference order: guests · bedrooms · bathrooms.
    // The Listing model has no per-bed count, so "beds" is omitted (vs Airbnb's
    // guests · bedrooms · beds · baths).
    const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;
    const specs = [
        typeof listing.guestCount === "number" ? plural(listing.guestCount, "guest") : null,
        typeof listing.bedrooms === "number" ? plural(listing.bedrooms, "bedroom") : null,
        typeof listing.bathrooms === "number" ? plural(listing.bathrooms, "bathroom") : null,
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

    const handleSave = async () => {
        const next = !isSaved;
        setIsSaved(next);

        if (session?.user?.id && typeof listing.id === "number") {
            try {
                if (next) {
                    await addFavoriteProperty(session.user.id, listing.id);
                } else {
                    await removeFavoriteProperty(session.user.id, listing.id);
                }
            } catch {
                // Roll back the optimistic flip — e.g. user has no tenant profile.
                setIsSaved(!next);
            }
            return;
        }

        if (typeof window !== "undefined") {
            if (next) window.localStorage.setItem(storageKey, "1");
            else window.localStorage.removeItem(storageKey);
        }
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
                ownerPhone={listing.host?.email || "+249123456789"}
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
                        {(listing.numberOfReviews ?? 0) > 0 && (
                            <div className="mt-6">
                                <GuestFavoriteCard
                                    rating={listing.averageRating || 4.5}
                                    reviewCount={listing.numberOfReviews || 0}
                                />
                            </div>
                        )}
                    </section>

                    {/* Host row */}
                    <div className="border-b border-[#DDDDDD]">
                        <HostedBy host={listing.host ?? null} superhost={isSuperhost} />
                    </div>

                    {/* Highlights */}
                    <section className="border-b border-[#DDDDDD] py-8">
                        <AirbnbInfo />
                    </section>

                    {/* Description */}
                    {listing.description && (
                        <section className="border-b border-[#DDDDDD] py-8">
                            <p className="whitespace-pre-line text-base leading-6 text-[#222222]">
                                {listing.description}
                            </p>
                        </section>
                    )}

                    {/* Where you'll sleep */}
                    <WhereYouSleep bedrooms={listing.bedrooms} />

                    {/* Amenities */}
                    <section className="border-b border-[#DDDDDD] py-12">
                        <AmenityViewer />
                    </section>
                </div>

                {/* Reservation column — Airbnb pushes it right of a flexible gap */}
                <div ref={reserveRef} className="w-full flex-shrink-0 lg:w-[372px]" data-reserve-section>
                    <div className="sticky top-28 space-y-4">
                        {/* "Prices include all fees" promo card above the reserve box */}
                        <div className="flex items-center justify-center gap-2 rounded-xl border border-[#DDDDDD] py-4">
                            <PriceTagIcon />
                            <span className="text-sm font-medium text-[#222222]">
                                Prices include all fees
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
                            buttonText="Call"
                            hideButton={isCallButtonInHeader}
                        />
                    </div>
                </div>
            </div>

            {/* Full-width sections below the fold — inline calendar, reviews,
                host, things to know. Real review data flows through the slot. */}
            <AvailabilityCalendar
                city={listing.location?.city ?? ""}
                range={range}
                onRangeChange={setRange}
                blockedDates={blockedDates}
            />
            {reviewsSlot}
            {meetHostSlot}
            <ThingsToKnow
                maxGuests={listing.guestCount}
                petsAllowed={listing.isPetsAllowed}
            />
            </div>
        </>
    );
}
