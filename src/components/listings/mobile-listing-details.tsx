"use client";
import { cdn } from "@/lib/cdn";

import React, { useState, useRef, useCallback } from 'react';
import { MapPin, Bed, Bath, Users, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShareIcon, HeartIcon, Superhost, BackArrowIcon } from '@/components/atom/icons';
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
        :root {
            --typography-font-family-cereal-font-family: Circular, -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", sans-serif;
            --typography-weight-book400: 400;
            --typography-weight-medium500: 500;
            --typography-body-text_16_20-line-height: 20px;
            --typography-body-text_16_20-font-size: 16px;
            --typography-body-text_16_20-letter-spacing: normal;
            --palette-hof: #222222;
            --palette-bg-primary-core: #DE3151;
            --palette-bg-secondary-core-hover: #F7F7F7;
            --palette-bg-secondary-core: #222222;
            --typography-titles-semibold_26_30-line-height: 30px;
            --typography-titles-semibold_26_30-font-size: 26px;
            --dls19-pdp-listing-title-line-height: var(--typography-titles-semibold_26_30-line-height);
            --dls19-pdp-listing-title-size: var(--typography-titles-semibold_26_30-font-size);
            --dls19-pdp-listing-title-weight: var(--typography-weight-medium500);
        }

        .c1yo0219 {
            display: block;
            position: relative;
            z-index: 10;
            margin-top: -24px;
            border-top-left-radius: 24px;
            border-top-right-radius: 24px;
            background-color: var(--background, #ffffff);
            padding-top: 24px;
            padding-bottom: 20px;
            padding-left: 24px;
            padding-right: 24px;
            text-align: center;
        }
        ._1a6d9c4 {
            display: flex !important;
            justify-content: center !important;
            width: 100% !important;
        }
        .plmw1e5 {
            display: block;
            width: 100%;
            margin-left: auto;
            margin-right: auto;
            max-width: var(--maxWidth, 1120px);
        }
        .c1htwjs0 {
            display: block;
        }
        .tuj3gk2 {
            display: flex !important;
            justify-content: center !important;
        }
        .tq9gyrs {
            display: block;
            width: 100%;
        }
        .tglziin {
            display: flex !important;
            justify-content: center !important;
            text-align: center !important;
            width: 100%;
        }

        .hpipapi {
            font-family: var(--typography-font-family-cereal-font-family);
            color: var(--palette-hof);
            font-size: var(--dls19-pdp-listing-title-size);
            line-height: var(--dls19-pdp-listing-title-line-height);
            font-weight: var(--dls19-pdp-listing-title-weight);
            letter-spacing: -0.02em;
            margin: 0;
            text-align: center !important;
        }

        .atm_7l_1kw7nm4 {
            color: var(--palette-hof) !important;
        }
        .atm_c8_1x4eueo {
            font-size: var(--dls19-pdp-listing-title-size) !important;
        }
        .atm_cs_1kw7nm4 {
            font-weight: var(--dls19-pdp-listing-title-weight) !important;
        }
        .atm_g3_1kw7nm4 {
            line-height: var(--dls19-pdp-listing-title-line-height) !important;
        }
        .atm_9s_1nu9bjl {
            display: block !important;
        }

        .atm_bx_nm7nsd {
            font-family: var(--typography-font-family-cereal-font-family) !important;
        }
        .atm_cs_1dh25pa {
            font-weight: var(--typography-weight-book400) !important;
        }
        .atm_g3_1emqlh9 {
            line-height: var(--typography-body-text_16_20-line-height) !important;
        }
        .atm_c8_3w7ag0 {
            font-size: var(--typography-body-text_16_20-font-size) !important;
        }
        .atm_1mt8aov_fyhuej {
            --gp-section-standard-padding: 48px;
        }
        .atm_ptdwod_1vi7ecw {
            --gp-section-compact-padding: 32px;
        }
        .atm_18hoyap_1tcgj5g {
            --gp-section-standard-padding-condensed: 24px;
        }
        .atm_1zp5ph_exct8b {
            --gp-section-compact-padding-condensed: 16px;
        }
        .atm_7l_1dmvgf5 {
            color: var(--palette-hof) !important;
        }
        .atm_fr_helst {
            letter-spacing: var(--typography-body-text_16_20-letter-spacing) !important;
        }
        .atm_bmoam2_qrjoh0 {
            --dls19-brand-gradient-accent: var(--palette-bg-primary-core);
        }
        .atm_vvc489_1as5f3p {
            --dls19-brand-gradient-radial: var(--palette-bg-secondary-core-hover);
        }
        .atm_1strswt_x1skbv {
            --dls19-brand-gradient: var(--palette-bg-secondary-core);
        }
        .atm_ff14j6_1svvj8d {
            --dls19-pdp-listing-title-line-height: var(--typography-titles-semibold_26_30-line-height) !important;
        }
        .atm_n738wd_s4nkmm {
            --dls19-pdp-listing-title-size: var(--typography-titles-semibold_26_30-font-size) !important;
        }
        .atm_nmhd1s_1mexzig {
            --dls19-pdp-listing-title-weight: var(--typography-weight-medium500) !important;
        }
        .atm_m4qiaa_1dmvgf5 {
            --dls19-ui-brand-color: var(--palette-hof) !important;
        }
        .atm_1htbn05_qrjoh0 {
            --dls19-brand-color: var(--palette-bg-primary-core) !important;
        }
        .atm_1gwwzir_u29brm {
            --header_v2_height-px: 80px;
        }

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
        ._1o8y6fw9 {
            -webkit-box-align: center !important;
            display: flex !important;
            align-items: center !important;
            z-index: 10 !important;
            background: none !important;
            left: 0px !important;
            padding: 16px 13px 25px !important;
            position: absolute !important;
            right: 0px !important;
            top: 0px !important;
            height: 68px !important;
        }
        ._kv14gss {
            display: flex !important;
            align-items: center !important;
        }
        .c1oqql2t {
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
            margin-left: auto !important;
        }
        .l1ovpqvx {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 40px !important;
            height: 40px !important;
            border-radius: 50% !important;
            background-color: rgba(250, 250, 250, 0.72) !important;
            border: none !important;
            box-shadow: none !important;
            -webkit-backdrop-filter: blur(24px) saturate(1.6) !important;
            backdrop-filter: blur(24px) saturate(1.6) !important;
            color: #222222 !important;
            cursor: pointer !important;
            padding: 0 !important;
            transition: transform 0.2s ease, background-color 0.2s ease !important;
            outline: none !important;
        }
        .l1ovpqvx:active {
            transform: scale(0.96) !important;
            background-color: rgba(250, 250, 250, 0.9) !important;
        }
        .b164l090 {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
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
        <div className="_1o8y6fw9">
          {/* Left Side - Back Button */}
          <div className="_kv14gss" role="presentation">
            <button
              aria-label="Back"
              data-testid="back-button"
              data-material-type="regular"
              data-material-content-layer="true"
              type="button"
              onClick={handleBack}
              className="l1ovpqvx dir dir-ltr"
              style={{
                "--dls-button-or-anchor-width-px": "40",
                "--dls-button-or-anchor-height-px": "40"
              } as React.CSSProperties}
            >
              <span data-button-content="true" className="b164l090 dir dir-ltr">
                <div>
                  <div>
                    <BackArrowIcon className="rtl:rotate-180" />
                  </div>
                  <div className="_378jbf"></div>
                </div>
              </span>
            </button>
          </div>

          {/* Right Side - Share and Love */}
          <div className="c1oqql2t dir dir-ltr">
            <div>
              <button
                aria-label="Share"
                data-material-type="regular"
                data-material-content-layer="true"
                type="button"
                onClick={handleShare}
                className="l1ovpqvx dir dir-ltr"
                style={{
                  "--dls-button-or-anchor-width-px": "40",
                  "--dls-button-or-anchor-height-px": "40"
                } as React.CSSProperties}
              >
                <span data-button-content="true" className="b164l090 dir dir-ltr">
                  <ShareIcon />
                </span>
              </button>
            </div>
            <div className="s5pd5eb sjx59nb atm_gz_1fwxnve dir dir-ltr">
              <button
                aria-label={savedNow ? "Remove from wishlist" : "Save to wishlist"}
                data-testid={savedNow ? "pdp-save-button-saved" : "pdp-save-button-unsaved"}
                data-material-type="regular"
                data-material-content-layer="true"
                type="button"
                onClick={handleSave}
                className="l1ovpqvx dir dir-ltr"
                style={{
                  "--dls-button-or-anchor-width-px": "40",
                  "--dls-button-or-anchor-height-px": "40"
                } as React.CSSProperties}
              >
                <span data-button-content="true" className="b164l090 dir dir-ltr">
                  <HeartIcon fill={savedNow ? '#FF385C' : 'none'} className={savedNow ? 'text-[#FF385C]' : ''} />
                </span>
              </button>
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

      {/* Title and Rating Section */}
      <div data-pageslot="true" className="c1yo0219 atm_9s_1txwivl_vmtskl atm_92_1yyfdc7_vmtskl atm_9s_1txwivl_9in345 atm_92_1yyfdc7_9in345 dir dir-ltr">
        <div style={{ "--gp-section-max-width": "1120px" } as React.CSSProperties}>
          <div className="_1a6d9c4">
            <div className="plmw1e5 atm_e2_1osqo2v atm_gz_1wugsn5 atm_h0_1wugsn5 atm_vy_1osqo2v mq5rv0q atm_j3_1v7vjkn dir dir-ltr" style={{ "--maxWidth": "1120px" } as React.CSSProperties}>
              <div data-plugin-in-point-id="TITLE_DEFAULT" data-section-id="TITLE_DEFAULT">
                <div className="c1htwjs0 atm_lo_1tcgj5g atm_le_exct8b atm_le_idpfg4__oggzyc dir dir-ltr">
                  <section>
                    <div className="tuj3gk2 atm_h_esu3gu atm_9s_1txwivl atm_fc_1yb4nlp atm_cx_ftgil2 dir dir-ltr">
                      <div className="tq9gyrs atm_ax_kb7nvz atm_r3_1h6ojuz atm_by_1d54pid atm_r3_18uv5lq__oggzyc atm_by_18uv5lq__oggzyc dir dir-ltr">
                        <div className="tglziin atm_c8_1nvkso5 atm_g3_gtd3qd atm_cs_1ho43yb atm_w4_1hnarqo atm_9s_1nu9bjl dir dir-ltr">
                          <h1
                            tabIndex={-1}
                            role="heading"
                            aria-level={1}
                            className="hpipapi atm_7l_1kw7nm4 atm_c8_1x4eueo atm_cs_1kw7nm4 atm_g3_1kw7nm4 atm_gi_idpfg4 atm_l8_idpfg4 atm_kd_idpfg4_pfnrn2 i1pmzyw7 atm_9s_1nu9bjl dir dir-ltr"
                            {...{ elementtiming: "LCP-target" }}
                          >
                            {listing?.title || 'Beautiful Property'}
                          </h1>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center justify-center gap-1.5 text-[14px] text-[#222222] mt-3">
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

      {/* Property Info */}
      <div className="px-4 py-6 space-y-6">

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