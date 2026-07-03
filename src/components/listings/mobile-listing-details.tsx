"use client";
import { cdn } from "@/lib/cdn";

import React, { useState, useRef, useCallback } from 'react';
import { ArrowLeft, MapPin, Bed, Bath, Users, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShareIcon, HeartIcon, Superhost } from '@/components/atom/icons';
import { useRouter } from 'next/navigation';
import { useFavorites } from '@/components/favorites/favorites-context';
import MobileInfo from './mobile-info';
import MobileAmenities from './mobile-amenities';
// import MobileReviewsDetail from './mobile-reviews-detail';
import MobileMeetHost from './mobile-meet-host';
import HostedBy from './hosted-by';
import { PropertyImageFallback } from '@/components/atom/property-image-fallback';
import { PropertyImage } from '@/components/atom/property-image';
import { PHASE1 } from '@/config/phase-flags';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import { useLocale } from '@/components/internationalization/use-locale';
import { formatNumber } from '@/lib/i18n/formatters';

interface MobileListingDetailsProps {
  listing: any;
  images?: string[];
  onSave?: () => void;
  isSaved?: boolean;
  onShare?: () => void;
}

const MobileListingDetails: React.FC<MobileListingDetailsProps> = ({
  listing,
  images = [],
  onSave,
  isSaved = false,
  onShare
}) => {
  const router = useRouter();
  const dict = useDictionary();
  const { locale } = useLocale();
  const fav = useFavorites();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // The gallery is a native scroll-snap strip — the image tracks the finger
  // 1:1 with platform momentum/rubber-banding, instead of the old jump-cut on
  // touchend. We only listen to scroll (rAF-throttled) to keep the counter in
  // sync; |scrollLeft| handles RTL's negative offsets.
  const stripRef = useRef<HTMLDivElement | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const handleStripScroll = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = stripRef.current;
      if (!el || el.clientWidth === 0) return;
      const idx = Math.round(Math.abs(el.scrollLeft) / el.clientWidth);
      setCurrentImageIndex((prev) => (prev === idx ? prev : idx));
    });
  }, []);

  const handleBack = () => {
    router.back();
  };

  // If no images, use placeholder
  const displayImages = images && images.length > 0 ? images : [cdn.product("property-placeholder.svg")];

  // Safely format location string
  const getLocationString = () => {
    if (!listing?.location) return 'Location';
    if (typeof listing.location === 'string') return listing.location;
    return `${listing.location.city || ''}, ${listing.location.state || ''}`.trim() || 'Location';
  };

  // Handle share functionality
  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: listing.title || "Property Listing",
        url: window.location.href,
      });
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href);
    }
  };

  // Heart state lives in the shared favorites provider (server-persisted when
  // signed in, on-device for guests) — same source every card reads.
  const listingIdNum = typeof listing?.id === 'number' ? listing.id : Number(listing?.id);
  const savedNow = Number.isFinite(listingIdNum)
    ? fav.isFavorite(listingIdNum)
    : isSaved;
  const handleSave = () => {
    if (Number.isFinite(listingIdNum)) fav.toggle(listingIdNum);
    onSave?.();
  };

  return (
    <div className="md:hidden">
             {/* Full Screen Image Gallery — native scroll-snap strip */}
       <div className="relative w-full h-[50vh] bg-black">
        {images && images.length > 0 ? (
          <div
            ref={stripRef}
            onScroll={handleStripScroll}
            className="no-scrollbar flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
          >
            {displayImages.map((src, i) => (
              <div key={`${src}-${i}`} className="relative h-full w-full flex-none snap-center">
                <PropertyImage
                  src={src}
                  alt={`Property image ${i + 1}`}
                  variant="full"
                  sizes="100vw"
                  priority={i === 0}
                />
              </div>
            ))}
          </div>
        ) : (
          <PropertyImageFallback className="object-contain p-6 bg-muted/40" />
        )}

        {/* Overlay Gradient — pointer-events-none so it never eats the strip's swipe */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40" />

                 {/* Top Navigation Bar */}
         <div className="absolute top-0 inset-x-0 z-10 p-4">
           <div className="flex items-center justify-between">
             {/* Left Side - Back Button */}
             <Button
               variant="ghost"
               size="icon"
               onClick={handleBack}
               className="h-10 w-10 rounded-full bg-white/90 backdrop-blur-sm hover:bg-white"
               aria-label="Go back"
             >
               <ArrowLeft className="w-5 h-5 text-gray-700 rtl:rotate-180" />
             </Button>

             {/* Right Side - Share and Love */}
             <div className="flex items-center space-x-3">
               <Button
                 variant="ghost"
                 size="icon"
                 onClick={handleShare}
                 className="h-10 w-10 rounded-full bg-white/90 backdrop-blur-sm hover:bg-white"
                 aria-label="Share listing"
               >
                 <ShareIcon className="w-5 h-5 text-gray-700" />
               </Button>

               <Button
                 variant="ghost"
                 size="icon"
                 onClick={handleSave}
                 className="h-10 w-10 rounded-full bg-white/90 backdrop-blur-sm hover:bg-white"
                 aria-label={savedNow ? "Remove from saved" : "Save listing"}
               >
                 <HeartIcon className={`w-5 h-5 ${savedNow ? 'fill-red-500 text-red-500' : 'text-gray-700'}`} />
               </Button>
             </div>
           </div>
         </div>

                 {/* Image Counter */}
         {displayImages.length > 1 && (
           <div className="absolute bottom-4 end-4">
             <div className="bg-black/50 backdrop-blur-sm text-white px-3 py-1 rounded-full text-sm tabular-nums">
               {formatNumber(currentImageIndex + 1, locale)} / {formatNumber(displayImages.length, locale)}
             </div>
           </div>
         )}
      </div>

      {/* Property Info */}
      <div className="px-4 py-6 space-y-6">
        {/* Title and Rating */}
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            {listing?.title || 'Beautiful Property'}
          </h1>
          
          <div className="flex items-center gap-2 text-gray-600 mb-4">
            {(listing?.numberOfReviews ?? 0) > 0 && (
              <>
                <span className="text-sm">★ {formatNumber(listing?.averageRating ?? 0, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                <span className="text-sm">·</span>
                <span className="text-sm underline">
                  {(dict?.property?.detail?.reviews ?? "{count} reviews").replace("{count}", formatNumber(listing?.numberOfReviews ?? 0, locale))}
                </span>
                <span className="text-sm">·</span>
              </>
            )}
            <span className="text-sm underline">
              {getLocationString()}
            </span>
          </div>
        </div>

        {/* Property Details */}
        <div className="border-b border-gray-200 pb-6">
          {/* <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              {listing?.title || "Beautiful Property"}
            </h2>
            <div className="flex items-center space-x-2">
              <Badge variant="outline" className="text-sm">
                {listing?.propertyType || "Property"}
              </Badge>
              {listing?.isPetsAllowed && (
                <Badge variant="secondary" className="text-sm">
                  Pet Friendly
                </Badge>
              )}
            </div>
          </div> */}

          {/* Property Stats */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {listing?.bedrooms && (
              <div className="flex items-center gap-2">
                <Bed className="w-5 h-5 text-gray-600" />
                <span className="text-sm text-gray-700">
                  {(dict?.property?.detail?.bedrooms ?? "{count} bedrooms").replace("{count}", formatNumber(listing.bedrooms, locale))}
                </span>
              </div>
            )}
            {listing?.bathrooms && (
              <div className="flex items-center gap-2">
                <Bath className="w-5 h-5 text-gray-600" />
                <span className="text-sm text-gray-700">
                  {(dict?.property?.detail?.bathrooms ?? "{count} bathrooms").replace("{count}", formatNumber(listing.bathrooms, locale))}
                </span>
              </div>
            )}
            {listing?.guestCount && (
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-gray-600" />
                <span className="text-sm text-gray-700">
                  {(dict?.property?.detail?.guestsMax ?? "Up to {count} guests").replace("{count}", formatNumber(listing.guestCount, locale))}
                </span>
              </div>
            )}
            {PHASE1.showSqFt && listing?.squareFeet && (
              <div className="flex items-center space-x-2">
                <Square className="w-5 h-5 text-gray-600" />
                <span className="text-sm text-gray-700">
                  {formatNumber(listing.squareFeet, locale)} {dict?.rental?.property?.card?.sqft ?? "sq ft"}
                </span>
              </div>
            )}
          </div>

          {/* Location */}
          {listing?.location && (
            <div className="flex items-center space-x-2 mb-4">
              <MapPin className="w-4 h-4 text-gray-600" />
              <span className="text-sm text-gray-700">
                {listing.location.address}, {listing.location.city}, {listing.location.state}
              </span>
            </div>
          )}

          {/* Description */}
          {listing?.description && (
            <div className="prose prose-sm max-w-none">
              <p className="text-gray-700 leading-relaxed">
                {listing.description}
              </p>
            </div>
          )}
        </div>

                 {/* Hosted By */}
         <HostedBy host={listing?.host ?? null} />

          {/* Mobile Info — hidden in phase 1 (fabricated wifi/parking/cancellation); see phase-flags */}
          {PHASE1.showMobileInfoCards && <MobileInfo />}

          {/* Mobile Amenities — real listing.amenities, hidden when empty */}
          {PHASE1.showListingAmenities && <MobileAmenities amenities={listing.amenities} />}

          {/* Mobile Reviews Detail */}
          {/* <MobileReviewsDetail /> */}

          {/* Mobile Meet Host */}
          <MobileMeetHost
            hostUser={listing?.host ?? null}
            reviewsCount={listing?.numberOfReviews}
            averageRating={listing?.averageRating}
          />
        </div>
      </div>
    );
  };

export default MobileListingDetails; 