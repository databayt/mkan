"use client";

import React, { useState } from "react";
import AirbnbPropertyHeader from "@/components/atom/property-header";
import AirbnbImages from "@/components/atom/property-images";
import AirbnbReviews from "@/components/atom/reviews";
import AirbnbReserve from "@/components/atom/property-reserve";
import AmenityViewer from "@/components/listings/amenity-viewer";
import { Badge } from "@/components/ui/badge";
import { MapPin, Bed, Bath, Users, Square } from "lucide-react";
import { Listing } from "@/types/listing";
import PropertyGallery from "@/components/atom/property-gallery";
import AirbnbInfo from "./atom/property-info";
import HostedBy from "./listings/hosted-by";

interface ListingDetailsClientProps {
    listing: Listing;
    /**
     * Reviews are rendered server-side and threaded in as children so the
     * client island doesn't have to re-fetch on hydrate.
     */
    reviewsSlot?: React.ReactNode;
    /** Same pattern for the host detail card. */
    meetHostSlot?: React.ReactNode;
}

export default function ListingDetailsClient({ listing, reviewsSlot, meetHostSlot }: ListingDetailsClientProps) {
    // Local-only saved state for the v1.0 ship; persistence (User.savedListings)
    // is tracked in Story 8.1 follow-up. We use localStorage so the heart icon
    // remembers across reloads on the same device — good enough for launch.
    const storageKey = `mkan:saved:${listing.id ?? "anon"}`;
    const [isSaved, setIsSaved] = useState<boolean>(() => {
        if (typeof window === "undefined") return false;
        return window.localStorage.getItem(storageKey) === "1";
    });
    const [galleryOpen, setGalleryOpen] = useState(false);

    const locationString = listing.location
        ? `${listing.location.city}, ${listing.location.state}`
        : "Location not available";

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
        const next = !isSaved;
        setIsSaved(next);
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Property Header */}
            <AirbnbPropertyHeader
                title={listing.title || "Beautiful Property"}
                location={locationString}
                rating={listing.averageRating || 4.5}
                reviewCount={listing.numberOfReviews || 0}
                // Derive superhost from rating + review count — at v1.0 we
                // don't surface a separate Superhost program, so this is a
                // simple proxy that highlights consistently great hosts.
                isSuperhost={(listing.averageRating ?? 0) >= 4.8 && (listing.numberOfReviews ?? 0) >= 10}
                onShare={handleShare}
                onSave={handleSave}
                isSaved={isSaved}
                className="mb-4"
            />

            {/* Main Content */}

            <PropertyGallery
                images={listing.photoUrls || []}
                onSave={handleSave}
                isSaved={isSaved}
                onShowAllPhotos={handleShowAllPhotos}
                listingId={listing.id?.toString()}
            />
            <div className="space-y-8">
                {/* Images */}
                {/* <AirbnbImages
                    images={listing.photoUrls || []}
                    onSave={handleSave}
                    isSaved={false}
                    onShowAllPhotos={handleShowAllPhotos}
                    className="mb-8"
                /> */}
                <div className="flex gap-20 mt-10">
                    
                    <div className="flex-1 max-w-2xl">
                        {/* Property Details */}
                        <div className="border-b border-gray-200 pb-8">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-semibold text-gray-900">
                                    {listing.title || "Beautiful Property"}
                                </h2>
                                <div className="flex items-center space-x-2">
                                    <Badge variant="outline" className="text-sm">
                                        {listing.propertyType || "Property"}
                                    </Badge>
                                    {listing.isPetsAllowed && (
                                        <Badge variant="secondary" className="text-sm">
                                            Pet Friendly
                                        </Badge>
                                    )}
                                </div>
                            </div>

                            {/* Property Stats */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                {listing.bedrooms && (
                                    <div className="flex items-center space-x-2">
                                        <Bed className="w-5 h-5 text-gray-600" />
                                        <span className="text-sm text-gray-700">
                                            {listing.bedrooms} bedroom{listing.bedrooms !== 1 ? 's' : ''}
                                        </span>
                                    </div>
                                )}
                                {listing.bathrooms && (
                                    <div className="flex items-center space-x-2">
                                        <Bath className="w-5 h-5 text-gray-600" />
                                        <span className="text-sm text-gray-700">
                                            {listing.bathrooms} bathroom{listing.bathrooms !== 1 ? 's' : ''}
                                        </span>
                                    </div>
                                )}
                                {listing.guestCount && (
                                    <div className="flex items-center space-x-2">
                                        <Users className="w-5 h-5 text-gray-600" />
                                        <span className="text-sm text-gray-700">
                                            Up to {listing.guestCount} guests
                                        </span>
                                    </div>
                                )}
                                {listing.squareFeet && (
                                    <div className="flex items-center space-x-2">
                                        <Square className="w-5 h-5 text-gray-600" />
                                        <span className="text-sm text-gray-700">
                                            {listing.squareFeet} sq ft
                                        </span>
                                    </div>
                                )}
                            </div>


                            {/* Location */}
                            {listing.location && (
                                <div className="flex items-center space-x-2 mb-4">
                                    <MapPin className="w-4 h-4 text-gray-600" />
                                    <span className="text-sm text-gray-700">
                                        {listing.location.address}, {listing.location.city}, {listing.location.state}
                                    </span>
                                </div>
                            )}

                            {/* Description */}
                            {listing.description && (
                                <div className="prose prose-sm max-w-none">
                                    <p className="text-gray-700 leading-relaxed">
                                        {listing.description}
                                    </p>
                                </div>
                            )}
                        </div>
                        <HostedBy host={listing.host ?? null} />

                        <AirbnbInfo />

                        {/* Amenities */}
                        <div className="border-b border-gray-200 pb-8">
                            <AmenityViewer />
                        </div>
                    </div>
                    {/* Reservation Widget - Fixed position */}
                    <div className="w-80 flex-shrink-0">
                        <div className="sticky top-24">
                            <AirbnbReserve
                                listingId={listing.id}
                                pricePerNight={listing.pricePerNight || 0}
                                cleaningFee={listing.cleaningFee ?? null}
                                maxGuests={listing.guestCount ?? 10}
                                rating={listing.averageRating || 4.5}
                                reviewCount={listing.numberOfReviews || 0}
                                className="w-full"
                            />
                        </div>
                    </div>

                </div>

                {/* Reviews */}
                <AirbnbReviews
                    overallRating={listing.averageRating || 4.5}
                    totalReviews={listing.numberOfReviews || 0}
                    className="border-b border-gray-200 pb-8"
                />

                {reviewsSlot}
                {meetHostSlot}

                {/* Host Information */}
                {/* <div className="border-b border-gray-200 pb-8">
                    <h3 className="text-xl font-semibold text-gray-900 mb-4">
                        Hosted by {listing.host?.username || "Host"}
                    </h3>
                    <div className="flex items-center space-x-4">
                        <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center">
                            <span className="text-lg font-semibold text-gray-600">
                                {listing.host?.username?.charAt(0).toUpperCase() || "H"}
                            </span>
                        </div>
                        <div>
                            <p className="font-medium text-gray-900">
                                {listing.host?.username || "Host"}
                            </p>
                            <p className="text-sm text-gray-600">
                                Member since {listing.postedDate ? new Date(listing.postedDate).getFullYear() : "2024"}
                            </p>
                        </div>
                    </div>
                </div> */}
            </div>
        </div>
    );
} 