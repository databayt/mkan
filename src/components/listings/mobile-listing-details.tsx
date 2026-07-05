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
import GuestFavoriteCard from './guest-favorite-card';
import AirbnbInfo from '@/components/atom/property-info';
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

  const FALLBACK_AVATAR = "https://cdn.databayt.org/mkan/stock/photo-1506905925346-21bda4d32df4.jpg";
  const isSuperhost = (listing?.averageRating ?? 0) >= 4.8 && (listing?.numberOfReviews ?? 0) >= 10;
  const displayName = listing?.host?.username ?? listing?.host?.email?.split("@")[0] ?? "Host";

  const typeLabels = dict?.rental?.property?.types as Record<string, string> | undefined;
  const typeLabel = (listing?.propertyType && typeLabels?.[listing?.propertyType]) || (listing?.propertyType ?? "place");
  const overviewTitle = listing?.location
    ? (dict?.property?.detail?.entireIn ?? "Entire {type} in {location}")
        .replace("{type}", typeLabel)
        .replace("{location}", `${listing.location.city || ''}, ${listing.location.country || ''}`)
    : (dict?.property?.detail?.entire ?? "Entire {type}").replace("{type}", typeLabel);

  const spec = (n: number, key: "guests" | "bedrooms" | "bathrooms") =>
    (dict?.property?.detail?.[key] ?? `{count} ${key}`).replace("{count}", formatNumber(n, locale));
  const specs = [
    typeof listing?.guestCount === "number" ? spec(listing.guestCount, "guests") : null,
    typeof listing?.bedrooms === "number" ? spec(listing.bedrooms, "bedrooms") : null,
    typeof listing?.bathrooms === "number" ? spec(listing.bathrooms, "bathrooms") : null,
  ].filter(Boolean).join(" · ");

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
      <style dangerouslySetInnerHTML={{__html: `
        .dir.atm_5j_nw3v2p {
            border-radius: var(--AirImage-border-radius, var(--dls-liteimage-border-radius, 0px));
        }
        .atm_vy_4hg7yc {
            width: var(--AirImage-width, var(--dls-liteimage-width, 100%));
        }
        .atm_e2_jngzkn {
            height: var(--AirImage-height, var(--dls-liteimage-height, auto));
        }
        .atm_1w_1xbheko {
            aspect-ratio: var(--AirImage-aspect-ratio, var(--dls-liteimage-aspect-ratio, 100 / 95));
        }
        .atm_vh_yfq0k3 {
            vertical-align: bottom;
        }
        .atm_mk_h2mmj6 {
            position: relative;
        }
        .atm_vy_1osqo2v {
            width: 100%;
        }
        .atm_e2_1osqo2v {
            height: 100%;
        }
        .atm_jp_sm7xtg {
            object-fit: cover;
        }
      `}} />

      {/* Full Screen Image Gallery — Airbnb Aspect Ratio aspect-[100/95] container */}
      <div className="relative w-full aspect-[100/95] bg-[#ebebeb] overflow-hidden">
        {images && images.length > 0 ? (
          <div
            ref={stripRef}
            onScroll={handleStripScroll}
            className="no-scrollbar flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
          >
            {displayImages.map((src, i) => (
              <div key={`${src}-${i}`} className="relative h-full w-full flex-none snap-center">
                <div 
                  className="i1y91qbp atm_mk_h2mmj6 atm_1w_1xbheko atm_e2_jngzkn atm_vy_4hg7yc atm_5j_nw3v2p atm_vh_yfq0k3 dir dir-ltr w-full h-full"
                  role="img" 
                  aria-busy="false" 
                  aria-label={`Property image ${i + 1}`}
                  style={{
                    "--AirImage-height": "100%",
                    "--AirImage-width": "100%",
                    "--AirImage-background-image": "none",
                    "--AirImage-aspect-ratio": "100 / 95",
                  } as React.CSSProperties}
                >
                  <picture className="p1lr305w atm_vy_1osqo2v atm_e2_1osqo2v dir dir-ltr w-full h-full block">
                    <source srcSet={`${src}?im_w=320 1x, ${src}?im_w=720 2x`} media="(min-width: 0px)" />
                    <img 
                      className="i11046vh atm_e2_1osqo2v atm_vy_1osqo2v atm_jp_sm7xtg atm_jr_xm9jbw atm_5j_nw3v2p atm_vh_yfq0k3 iekrptg atm_8w_1t7jgwy dir dir-ltr w-full h-full object-cover" 
                      aria-hidden="true" 
                      alt={`Property image ${i + 1}`}
                      {...{ elementtiming: "FMP-target" }}
                      id={`FMP-target-${i}`}
                      src={`${src}?im_w=720`} 
                      data-original-uri={src} 
                      data-shared-element-id={`listing-${listing?.id}-hero-image-${i}`} 
                      width="100%" 
                      height="100%" 
                    />
                  </picture>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="relative w-full h-full flex items-center justify-center bg-muted/40">
            <PropertyImageFallback className="object-contain p-6 bg-muted/40" />
          </div>
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
          <h1 className="text-[26px] font-semibold leading-[30px] tracking-[-0.0325rem] text-[#222222] mb-3">
            {listing?.title || 'Beautiful Property'}
          </h1>
          
          <div className="flex items-center gap-1.5 text-[14px] text-[#222222]">
            {(listing?.numberOfReviews ?? 0) > 0 ? (
              <>
                <span className="font-semibold">★ {formatNumber(listing?.averageRating ?? 0, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                <span className="text-[#6A6A6A]">·</span>
                <span className="underline font-semibold cursor-pointer">
                  {(dict?.property?.detail?.reviews ?? "{count} reviews").replace("{count}", formatNumber(listing?.numberOfReviews ?? 0, locale))}
                </span>
                <span className="text-[#6A6A6A]">·</span>
              </>
            ) : null}
            <span className="underline font-semibold cursor-pointer">
              {getLocationString()}
            </span>
          </div>
        </div>

        {/* Guest Favorite Card */}
        {(listing?.numberOfReviews ?? 0) > 0 && (
          <div className="pt-2">
            <GuestFavoriteCard
              rating={listing?.averageRating ?? 0}
              reviewCount={listing?.numberOfReviews ?? 0}
              label={dict?.property?.guestFavorite?.title ?? "Guest favorite"}
              blurb={dict?.property?.guestFavorite?.blurb ?? "One of the most loved homes on Mkan, according to guests"}
              reviewsLabel={dict?.property?.guestFavorite?.reviews ?? "Reviews"}
            />
          </div>
        )}

        {/* Overview & Host Row */}
        <div className="border-t border-[#DDDDDD] pt-6 mt-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <h2 className="text-[22px] font-medium leading-[26px] tracking-[-0.44px] text-[#222222]">
                {overviewTitle}
              </h2>
              {specs && (
                <p className="text-[16px] leading-[20px] text-[#222222] font-normal">
                  {specs}
                </p>
              )}
            </div>
            <div className="relative flex-shrink-0">
              <div className="w-[40px] h-[40px] rounded-full overflow-hidden relative">
                <img
                  src={listing?.host?.image || FALLBACK_AVATAR}
                  alt={displayName}
                  className="w-full h-full object-cover"
                />
              </div>
              {isSuperhost && (
                <div className="absolute -bottom-0.5 -end-[5px]">
                  <Superhost className="w-4 h-4" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Highlights Section */}
        {PHASE1.showListingHighlights && (listing?.highlights?.length ?? 0) > 0 && (
          <div className="border-t border-[#DDDDDD] pt-6 mt-6">
            <AirbnbInfo highlights={listing.highlights} />
          </div>
        )}

        {/* Description Section */}
        {listing?.description && (
          <div className="border-t border-[#DDDDDD] pt-6 mt-6 space-y-3">
            <h3 className="text-[22px] font-medium leading-[26px] tracking-[-0.44px] text-[#222222]">
              {locale === "ar" ? "عن هذا المكان" : "About this space"}
            </h3>
            <p className="whitespace-pre-line text-base leading-6 text-[#222222] font-normal">
              {listing.description}
            </p>
          </div>
        )}

        {/* Mobile Info — hidden in phase 1 (fabricated wifi/parking/cancellation); see phase-flags */}
        {PHASE1.showMobileInfoCards && (
          <div className="border-t border-[#DDDDDD] pt-6 mt-6">
            <MobileInfo />
          </div>
        )}

        {/* Mobile Amenities — real listing.amenities, hidden when empty */}
        {PHASE1.showListingAmenities && (listing?.amenities?.length ?? 0) > 0 && (
          <div className="border-t border-[#DDDDDD] pt-6 mt-6">
            <MobileAmenities amenities={listing.amenities} />
          </div>
        )}

        {/* Mobile Meet Host */}
        <div className="border-t border-[#DDDDDD] pt-6 mt-6">
          <MobileMeetHost
            hostUser={listing?.host ?? null}
            reviewsCount={listing?.numberOfReviews}
            averageRating={listing?.averageRating}
          />
        </div>
      </div>
    </div>
  );
};

export default MobileListingDetails;