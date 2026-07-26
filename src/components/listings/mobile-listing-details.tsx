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
import Laurel from './laurel';
import AirbnbInfo from '@/components/atom/property-info';
import WhereYouSleep from './where-you-sleep';
import HostedBy from './hosted-by';
import { PropertyImageFallback } from '@/components/atom/property-image-fallback';
import { PropertyImage } from '@/components/atom/property-image';
import cdnVariantLoader from '@/lib/image-loader';
import { PHASE1 } from '@/config/phase-flags';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import { useLocale } from '@/components/internationalization/use-locale';
import { formatNumber } from '@/lib/i18n/formatters';
import { qualifiesAsGuestFavorite } from '@/lib/guest-favorite';

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
  const [descExpanded, setDescExpanded] = useState(false);

  const FALLBACK_AVATAR = "https://cdn.databayt.org/mkan/stock/photo-1506905925346-21bda4d32df4.jpg";
  const isSuperhost = (listing?.averageRating ?? 0) >= 4.8 && (listing?.numberOfReviews ?? 0) >= 10;
  // Airbnb's GUEST_FAVORITE_BANNER only renders for qualifying homes; other
  // reviewed homes get the plain "★ 4.75 · 4 reviews" row (probed live).
  const isGuestFavorite = qualifiesAsGuestFavorite(listing ?? {});
  const displayName = listing?.host?.username ?? listing?.host?.email?.split("@")[0] ?? "Host";
  const avatar = listing?.host?.image ?? FALLBACK_AVATAR;
  const hostCreatedDate = listing?.host?.createdAt ? new Date(listing.host.createdAt) : null;
  const yearsHosting = hostCreatedDate
    ? Math.max(1, new Date().getFullYear() - hostCreatedDate.getFullYear())
    : 12; // Fallback to 12 years if not available (matching the HTML payload)

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
            --dls19-pdp-listing-title-line-height: 28px;
            --dls19-pdp-listing-title-size: var(--typography-titles-semibold_26_30-font-size);
            --dls19-pdp-listing-title-weight: var(--typography-weight-medium500);
        }

        .c1yo0219 {
            display: block;
            position: relative;
            background-color: var(--background, #ffffff);
            padding-top: 24px;
            padding-bottom: 24px;
            padding-left: 24px;
            padding-right: 24px;
            text-align: center;
        }
        /* Section divider — inset from the screen edges (not full-bleed) */
        .c1yo0219::after {
            content: "";
            position: absolute;
            left: 24px;
            right: 24px;
            bottom: 0;
            height: 1px;
            background: #DDDDDD;
        }
        .c1yo0219--first {
            z-index: 10;
            margin-top: -24px;
            padding-bottom: 8px;
            border-top-left-radius: 24px;
            border-top-right-radius: 24px;
        }
        .c1yo0219--first::after {
            display: none;
        }
        /* Overview sits tight under the title, mirroring Airbnb (title→subtitle ≈14px) */
        .c1yo0219--ov {
            padding-top: 8px;
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
            letter-spacing: normal;
            margin: 0;
            text-align: center !important;
        }
 
        .m4x54cm {
            display: block;
            text-align: center;
        }
        .o1sio90k {
            margin-top: -2px !important;
        }
        .lgx66tx {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            list-style: none;
            padding: 0;
            margin: 0;
        }
        .ov-subtitle {
            font-family: var(--typography-font-family-cereal-font-family);
            font-size: 14px;
            line-height: 14px;
            font-weight: 400;
            color: #6a6a6a;
            text-align: center;
            margin: 0;
        }
        .l7n4lsf {
            display: inline-flex;
            align-items: center;
            font-size: 14px;
            line-height: 14px;
            color: #6a6a6a;
        }
        .axjq0r, .pen26si {
            display: inline-block;
        }
        .s1b4clln {
            margin: 0 4px;
            color: #6a6a6a;
        }
        .rnzkkgj {
            display: flex;
            align-items: center;
            justify-content: center;
            margin-top: 12px;
            font-size: 16px;
            line-height: 20px;
            color: #222222;
            gap: 4px;
        }
        .r12esahm {
            font-weight: 600;
        }
        .cchlee2 {
            display: flex;
            justify-content: center;
            list-style: none;
            padding: 0;
            margin: 16px 0 0 0;
        }
        .p10iyp1o {
            display: inline-flex;
            align-items: center;
            background-color: var(--palette-bg-secondary-core-hover, #F7F7F7);
            border-radius: 100px;
            padding: 6px 12px;
            font-size: 14px;
            font-weight: 500;
            color: #222222;
        }
        .l1ovpqvx_link {
            background: none;
            border: none;
            padding: 0;
            font: inherit;
            color: inherit;
            text-decoration: underline;
            cursor: pointer;
        }
        .cuspirs {
            display: flex !important;
            align-items: center !important;
            text-align: left !important;
        }
        [dir="rtl"] .cuspirs {
            text-align: right !important;
        }
        .c17nk5xs {
            position: relative !important;
            width: 40px !important;
            height: 40px !important;
            flex-shrink: 0 !important;
        }
        ._1t82b7sc {
            background: none !important;
            border: none !important;
            padding: 0 !important;
            width: 40px !important;
            height: 40px !important;
            border-radius: 50% !important;
            overflow: hidden !important;
            cursor: pointer !important;
            display: block !important;
            box-shadow: none !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
        }
        .i1j4t3kq {
            width: 40px !important;
            height: 40px !important;
            border-radius: 50% !important;
            overflow: hidden !important;
        }
        .bf5onxa {
            position: absolute !important;
            bottom: -4px !important;
            right: -6px !important;
            z-index: 1 !important;
        }
        [dir="rtl"] .bf5onxa {
            right: auto !important;
            left: -6px !important;
        }
        .t1nltagi {
            display: flex !important;
            flex-direction: column !important;
            justify-content: center !important;
            margin-left: 12px !important;
            text-align: left !important;
        }
        [dir="rtl"] .t1nltagi {
            margin-left: 0 !important;
            margin-right: 12px !important;
            text-align: right !important;
        }
        .t1avz7ro {
            font-family: var(--typography-font-family-cereal-font-family) !important;
            font-size: 16px !important;
            line-height: 20px !important;
            font-weight: 500 !important;
            color: #222222 !important;
        }
        .sxfuxpq {
            margin-top: 2px !important;
        }
        .sxfuxpq .lgx66tx {
            justify-content: flex-start !important;
        }
        [dir="rtl"] .sxfuxpq .lgx66tx {
            justify-content: flex-start !important;
        }
        .sxfuxpq .l7n4lsf {
            font-size: 14px !important;
            line-height: 18px !important;
            color: #6a6a6a !important;
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
        .o18020l1 {
            position: absolute !important;
            bottom: 0px !important;
            right: 0px !important;
            left: 0px !important;
            top: 0px !important;
            background-color: rgba(0, 0, 0, 0) !important;
            display: flex !important;
            align-items: flex-end !important;
            justify-content: flex-end !important;
            pointer-events: none !important;
        }
        .ckfv83h {
            display: block !important;
            background-color: rgba(34, 34, 34, 0.66) !important;
            color: rgb(255, 255, 255) !important;
            border-radius: 4px !important;
            padding: 3px 10px !important;
            font-size: 12px !important;
            font-weight: 500 !important;
            line-height: 16px !important;
            margin: 0px 12px 40px 0px !important;
        }
        [dir="rtl"] .o18020l1 {
            justify-content: flex-start !important;
        }
        [dir="rtl"] .ckfv83h {
            margin: 0px 0px 40px 12px !important;
        }
        .s1emndxt {
            display: block;
            margin-top: 24px;
            width: 100%;
        }
        .s159e3yo {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            margin: 0 auto;
        }
        .adheeqt, .r1rvafoe {
            display: flex;
            flex-direction: column;
            align-items: center;
            flex: 1;
            text-align: center;
            background: none;
            border: none;
            padding: 0;
            cursor: pointer;
            color: var(--foreground, #222222);
        }
        .d1rieilq {
            width: 1px;
            height: 32px;
            background-color: var(--border, #DDDDDD);
            margin: 0 8px;
            flex-shrink: 0;
        }
        .g1421erf {
            display: flex;
            align-items: center;
            justify-content: center;
            flex: 1.2;
            text-align: center;
            color: var(--foreground, #222222);
        }
        .l1xqscq2 {
            font-size: 14px;
            font-weight: 500;
            color: var(--foreground, #222222);
            line-height: 16px;
            margin: 0 4px;
            text-align: center;
            white-space: pre-line;
            letter-spacing: normal;
        }
        .ccutbh9 {
            display: flex;
            align-items: center;
            margin-top: 4px;
        }
        .rqlvfu0 {
            font-size: 18px;
            font-weight: 500;
            color: var(--foreground, #222222);
            line-height: 24px;
        }
        .rr9m0ar {
            font-size: 12px;
            font-weight: 500;
            color: var(--foreground, #222222);
            line-height: 16px;
            margin-top: 2px;
        }
        /* Guest-favorite BADGE — shown when a listing is a curated favorite but has
           no reviews yet, so no rating/review numbers are rendered (honest, no fake
           stats). The full rating·laurel·reviews banner above takes over once real
           reviews exist. */
        .gf-badge {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            width: 100%;
        }
        .gf-badge-mark {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 2px;
        }
        .gf-badge-label {
            font-size: 18px;
            font-weight: 500;
            line-height: 20px;
            color: var(--foreground, #222222);
            text-align: center;
            white-space: pre-line;
            letter-spacing: normal;
            margin: 0 2px;
        }
        .gf-badge-blurb {
            font-size: 14px;
            line-height: 18px;
            font-weight: 400;
            color: #6a6a6a;
            text-align: center;
            margin-top: 8px;
            max-width: 280px;
        }
        .a8jt5op {
            border: 0 !important;
            clip: rect(0, 0, 0, 0) !important;
            height: 1px !important;
            margin: -1px !important;
            overflow: hidden !important;
            padding: 0 !important;
            position: absolute !important;
            width: 1px !important;
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
                  aria-label={(dict?.listings?.detail?.propertyImageAlt ?? "Property image {number}").replace("{number}", String(i + 1))}
                  style={{
                    "--AirImage-height": "100%",
                    "--AirImage-width": "100%",
                    "--AirImage-background-image": "none",
                    "--AirImage-aspect-ratio": "100 / 95",
                  } as React.CSSProperties}
                >
                  <picture className="p1lr305w atm_vy_1osqo2v atm_e2_1osqo2v dir dir-ltr w-full h-full block">
                    {/* ?im_w= is an Airbnb/ImageKit param our CDN ignores — these
                        URLs shipped the full-size original for every slide. Route
                        through the shared loader (pre-made stock variants, or the
                        Vercel optimizer for uploads) at real 1x/2x widths, and lazy
                        the off-screen slides so only the first one loads eagerly. */}
                    <source
                      srcSet={`${cdnVariantLoader({ src, width: 640 })} 1x, ${cdnVariantLoader({ src, width: 828 })} 2x`}
                      media="(min-width: 0px)"
                    />
                    <img
                      className="i11046vh atm_e2_1osqo2v atm_vy_1osqo2v atm_jp_sm7xtg atm_jr_xm9jbw atm_5j_nw3v2p atm_vh_yfq0k3 iekrptg atm_8w_1t7jgwy dir dir-ltr w-full h-full object-cover"
                      aria-hidden="true"
                      alt={(dict?.listings?.detail?.propertyImageAlt ?? "Property image {number}").replace("{number}", String(i + 1))}
                      {...{ elementtiming: "FMP-target" }}
                      id={`FMP-target-${i}`}
                      src={cdnVariantLoader({ src, width: 828 })}
                      loading={i === 0 ? "eager" : "lazy"}
                      fetchPriority={i === 0 ? "high" : undefined}
                      decoding="async"
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

        {/* Top Navigation Bar */}
        <div className="_1o8y6fw9">
          {/* Left Side - Back Button */}
          <div className="_kv14gss" role="presentation">
            <button
              aria-label={dict?.common?.back ?? "Back"}
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
                aria-label={dict?.rental?.listing?.share ?? "Share"}
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
                aria-label={savedNow ? (dict?.rental?.property?.card?.removeFromWishlist ?? "Remove from wishlist") : (dict?.listings?.detail?.saveToWishlist ?? "Save to wishlist")}
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
          <div className="o18020l1 dir dir-ltr">
            <span className="a8jt5op dir dir-ltr" aria-atomic="true" aria-live="polite">
              {(dict?.listings?.detail?.showingPhotoOf ?? "Showing photo {current} of {total}")
                .replace("{current}", String(currentImageIndex + 1))
                .replace("{total}", String(displayImages.length))}
            </span>
            <div aria-hidden="true" className="ckfv83h dir dir-ltr">
              {formatNumber(currentImageIndex + 1, locale)} / {formatNumber(displayImages.length, locale)}
            </div>
          </div>
        )}
      </div>

      {/* Title Section (TITLE_DEFAULT) */}
      <div data-pageslot="true" className="c1yo0219 c1yo0219--first atm_9s_1txwivl_vmtskl atm_92_1yyfdc7_vmtskl atm_9s_1txwivl_9in345 atm_92_1yyfdc7_9in345 dir dir-ltr">
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
      </div>

      {/* Overview Section (OVERVIEW_DEFAULT_V2) */}
      <div data-pageslot="true" className="c1yo0219 c1yo0219--ov atm_9s_1txwivl_vmtskl atm_92_1yyfdc7_vmtskl atm_9s_1txwivl_9in345 atm_92_1yyfdc7_9in345 dir dir-ltr">
        <div style={{ "--gp-section-max-width": "1120px" } as React.CSSProperties}>
          <div className="_1a6d9c4">
            <div className="plmw1e5 atm_e2_1osqo2v atm_gz_1wugsn5 atm_h0_1wugsn5 atm_vy_1osqo2v mq5rv0q atm_j3_1v7vjkn dir dir-ltr" style={{ "--maxWidth": "1120px" } as React.CSSProperties}>
              <div data-plugin-in-point-id="OVERVIEW_DEFAULT_V2" data-section-id="OVERVIEW_DEFAULT_V2" style={{ paddingBottom: "12px" }}>
                <div style={{ display: "contents" }}>
                  <section className="m4x54cm atm_c8_1u0fjfs atm_g3_kyllue atm_fr_1qxn676 atm_cs_hfq2vn atm_r3_1h6ojuz atm_7l_gyfspu dir dir-ltr">
                    <div>
                      <h2
                        tabIndex={-1}
                        role="heading"
                        aria-level={2}
                        className="ov-subtitle dir dir-ltr"
                        {...{ elementtiming: "LCP-target" }}
                      >
                        {overviewTitle}
                      </h2>
                    </div>
                    {specs && (
                      <div className="o1sio90k atm_c8_1h3mmnw atm_g3_1vnrj90 atm_fr_b3emyl atm_h3_1y44olf atm_c8_3w7ag0__oggzyc atm_g3_1emqlh9__oggzyc atm_fr_helst__oggzyc dir dir-ltr">
                        <ol className="lgx66tx atm_gi_idpfg4 atm_l8_idpfg4 dir dir-ltr">
                          {[
                            typeof listing?.guestCount === "number" ? spec(listing.guestCount, "guests") : null,
                            typeof listing?.bedrooms === "number" ? spec(listing.bedrooms, "bedrooms") : null,
                            typeof listing?.bathrooms === "number" ? spec(listing.bathrooms, "bathrooms") : null,
                          ]
                            .filter(Boolean)
                            .map((label, i) => (
                              <li key={i} className="l7n4lsf atm_9s_1o8liyq_keqd55 dir dir-ltr">
                                {i > 0 && (
                                  <span className="pen26si dir dir-ltr">
                                    <span className="s1b4clln atm_mj_glywfm atm_vb_glywfm atm_vv_1jtmq4 atm_lk_idpfg4 atm_ll_idpfg4 dir dir-ltr" aria-hidden="true"> · </span>
                                  </span>
                                )}
                                {label}
                              </li>
                            ))}
                        </ol>
                      </div>
                    )}
                    
                    {isGuestFavorite && (listing?.numberOfReviews ?? 0) > 0 ? (
                      <div className="s1emndxt atm_40_iod1ro atm_le_1vi7ecw dir dir-ltr">
                        <div className="s159e3yo atm_h_1h6ojuz atm_9s_11p5wf0 atm_dz_1mnjxsr atm_cs_1mexzig atm_cx_1y44olf atm_l8_816mvl atm_gi_idpfg4 dir dir-ltr">
                          {/* Rating Button Column */}
                          <button
                            type="button"
                            onClick={() => {
                              const el = document.querySelector("#mobile-reviews-section");
                              el?.scrollIntoView({ behavior: "smooth" });
                            }}
                            className="adheeqt atm_c8_efgril atm_g3_1yp71yo atm_fr_17w4rtr atm_9s_1txwivl atm_ar_1bp4okc atm_h_1h6ojuz atm_cx_t94yts atm_le_14y27yu dir dir-ltr"
                            data-testid="pdp-reviews-highlight-banner-host-rating"
                          >
                            <span className="a8jt5op atm_3f_idpfg4 atm_7h_hxbz6r atm_7i_ysn8ba atm_e2_t94yts atm_ks_zryt35 atm_l8_idpfg4 atm_mk_stnw88 atm_vv_1q9ccgz atm_vy_t94yts dir dir-ltr">
                              {(dict?.listings?.detail?.ratedOutOf5 ?? "Rated {rating} out of 5 stars.").replace("{rating}", formatNumber(listing?.averageRating ?? 0, locale, { minimumFractionDigits: 1, maximumFractionDigits: 2 }))}
                            </span>
                            <div className="rqlvfu0" aria-hidden="true">
                              {formatNumber(listing?.averageRating ?? 0, locale, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                            </div>
                            <div className="ccutbh9 atm_9s_1txwivl dir dir-ltr" style={{ gap: "0.125rem" }}>
                              {[...Array(5)].map((_, i) => (
                                <svg
                                  key={i}
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 32 32"
                                  aria-hidden="true"
                                  role="presentation"
                                  focusable="false"
                                  style={{ display: "block", height: "0.5rem", width: "0.5rem", fill: "currentColor" }}
                                >
                                  <path fillRule="evenodd" d="m15.1 1.58-4.13 8.88-9.86 1.27a1 1 0 0 0-.54 1.74l7.3 6.57-1.97 9.85a1 1 0 0 0 1.48 1.06l8.62-5 8.63 5a1 1 0 0 0 1.48-1.06l-1.97-9.85 7.3-6.57a1 1 0 0 0-.55-1.73l-9.86-1.28-4.12-8.88a1 1 0 0 0-1.82 0z"></path>
                                </svg>
                              ))}
                            </div>
                          </button>

                          {/* Vertical Divider */}
                          <div className="d1rieilq atm_2d_1guaqub atm_vy_t94yts atm_e2_1vi7ecw atm_e2_1ylpe5n__qky54b dir dir-ltr"></div>

                          {/* Guest Favorite Column */}
                          <div className="g1421erf atm_c8_3w7ag0 atm_fr_helst atm_by_4iukzz atm_g3_exct8b atm_9s_1txwivl atm_h_1h6ojuz atm_fc_1h6ojuz atm_vv_qvpr2i dir dir-ltr" role="img" aria-label={dict?.listings?.detail?.guestFavoriteListing ?? "Guest Favorite Listing."}>
                            <div className="c139f2ip atm_h_1h6ojuz atm_9s_1txwivl atm_cs_1mexzig atm_cx_yh40bf atm_fc_1h6ojuz atm_r3_1h6ojuz dir dir-ltr">
                              <div style={{ width: "auto", height: "32px" }}>
                                <svg viewBox="0 0 20 32" fill="none" xmlns="http://www.w3.org/2000/svg" height="32" style={{ display: "block" }}>
                                  <g clipPath="url(#clip_laurel_left_banner)">
                                    <path fillRule="evenodd" clipRule="evenodd" d="M15.4895 25.417L14.8276 24.4547L16.5303 23.6492L17.1923 24.6116L16.3409 25.0143L17.1923 24.6116C18.6638 26.751 17.9509 29.3868 15.5999 30.4989C14.8548 30.8513 14.0005 31.0196 13.1221 30.987L12.8044 30.9752L12.7297 29.2305L13.0474 29.2423C13.5744 29.2618 14.0871 29.1608 14.5341 28.9494C15.9447 28.2821 16.3725 26.7007 15.4895 25.417Z" fill="currentColor"></path>
                                    <path fillRule="evenodd" clipRule="evenodd" d="M8.32441 10.235C10.0819 8.96204 10.9247 7.4878 10.853 5.81232C10.7813 4.13685 9.80929 2.59524 7.93708 1.18749C6.17964 2.46049 5.33678 3.93473 5.40851 5.6102C5.40851 7.28568 6.45221 8.82729 8.32441 10.235Z" fill="var(--background, #ffffff)"></path>
                                    <path fillRule="evenodd" clipRule="evenodd" d="M7.19425 0.489275C7.55718 0.226387 8.10753 0.246818 8.49416 0.537533C10.5385 2.07473 11.7071 3.84975 11.7923 5.84026C11.8775 7.83076 10.8574 9.52453 8.93841 10.9146C8.57548 11.1775 8.02513 11.157 7.6385 10.8663C5.59415 9.32914 4.4256 7.55411 4.34039 5.56361C4.25517 3.57311 5.27521 1.87933 7.19425 0.489275ZM7.92362 2.3684C6.77985 3.38355 6.29788 4.47199 6.3478 5.63813C6.39772 6.80428 6.97457 7.93203 8.20904 9.03547C9.35281 8.02032 9.83478 6.93187 9.78486 5.76573C9.73493 4.59959 9.15809 3.47184 7.92362 2.3684Z" fill="currentColor"></path>
                                    <path fillRule="evenodd" clipRule="evenodd" d="M15.6806 24.0529C14.1314 22.353 12.4326 21.4688 10.5842 21.4001C8.73575 21.3315 7.10737 22.0923 5.69905 23.6824C7.24822 25.3823 8.94702 26.2666 10.7955 26.3352C12.6439 26.4038 14.2723 25.6431 15.6806 24.0529Z" fill="var(--background, #ffffff)"></path>
                                    <path fillRule="evenodd" clipRule="evenodd" d="M4.90529 24.1787C4.60807 23.8526 4.58911 23.4097 4.8593 23.1046C6.38985 21.3765 8.27538 20.4331 10.521 20.5164C12.7666 20.5998 14.7391 21.6864 16.4227 23.5339C16.7199 23.86 16.7389 24.303 16.4687 24.608C14.9381 26.3361 13.0526 27.2795 10.807 27.1962C8.56134 27.1128 6.5889 26.0262 4.90529 24.1787ZM6.98781 23.7198C8.22307 24.8808 9.46778 25.4045 10.7323 25.4515C11.9968 25.4984 13.2005 25.0656 14.3402 23.9928C13.1049 22.8318 11.8602 22.3081 10.5957 22.2611C9.3312 22.2142 8.12744 22.6471 6.98781 23.7198Z" fill="currentColor"></path>
                                    <path fillRule="evenodd" clipRule="evenodd" d="M10.6766 20.7043C10.2137 18.5957 9.16392 17.0928 7.52727 16.1956C5.89062 15.2984 3.99442 15.1864 1.83867 15.8596C2.30157 17.9683 3.35135 19.4712 4.988 20.3684C6.62465 21.2656 8.52085 21.3775 10.6766 20.7043Z" fill="var(--background, #ffffff)"></path>
                                    <path fillRule="evenodd" clipRule="evenodd" d="M0.791956 15.9443C0.703053 15.5393 0.94431 15.1569 1.37329 15.023C3.7337 14.2859 5.9714 14.3695 7.95247 15.4554C9.92449 16.5364 11.1013 18.3139 11.6022 20.5956C11.6911 21.0006 11.4499 21.3829 11.0209 21.5169C8.66048 22.254 6.42277 22.1704 4.4417 21.0844C2.46969 20.0034 1.29285 18.226 0.791956 15.9443ZM2.95349 16.4656C3.43375 17.9951 4.27991 19.007 5.41321 19.6282C6.5306 20.2407 7.84423 20.4286 9.44069 20.0743C8.96043 18.5448 8.11427 17.5329 6.98097 16.9116C5.86358 16.2991 4.54995 16.1113 2.95349 16.4656Z" fill="currentColor"></path>
                                    <path fillRule="evenodd" clipRule="evenodd" d="M7.90911 15.6267C8.65652 13.6743 8.53705 11.9555 7.55072 10.4702C6.56438 8.98484 4.90844 8.03014 2.58291 7.60605C1.8355 9.55846 1.95497 11.2773 2.9413 12.7626C3.92764 14.2479 5.58357 15.2026 7.90911 15.6267Z" fill="var(--background, #ffffff)"></path>
                                    <path fillRule="evenodd" clipRule="evenodd" d="M1.66037 7.28295C1.80927 6.89397 2.26578 6.67525 2.74598 6.76282C5.29848 7.22831 7.26368 8.31371 8.44396 10.0911C9.61955 11.8614 9.70866 13.854 8.89805 15.9715C8.74915 16.3605 8.29264 16.5792 7.81244 16.4916C5.25994 16.0261 3.29474 14.9407 2.11446 13.1634C0.938866 11.393 0.849755 9.40048 1.66037 7.28295ZM3.3385 8.6613C2.94038 10.1267 3.14588 11.3465 3.83454 12.3835C4.51397 13.4067 5.60091 14.1584 7.21992 14.5931C7.61804 13.1278 7.41254 11.9079 6.72388 10.8709C6.04445 9.84774 4.95751 9.09607 3.3385 8.6613Z" fill="currentColor"></path>
                                  </g>
                                  <defs>
                                    <clipPath id="clip_laurel_left_banner">
                                      <rect width="18.8235" height="32" fill="white" transform="translate(0.453125 0.000488281)"></rect>
                                    </clipPath>
                                  </defs>
                                </svg>
                              </div>
                            </div>
                            <div className="l1xqscq2" aria-hidden="true">
                              {locale === "ar" ? "مفضل\nالضيوف" : "Guest\nfavorite"}
                            </div>
                            <div className="c139f2ip atm_h_1h6ojuz atm_9s_1txwivl atm_cs_1mexzig atm_cx_yh40bf atm_fc_1h6ojuz atm_r3_1h6ojuz dir dir-ltr">
                              <div style={{ width: "auto", height: "32px" }}>
                                <svg viewBox="0 0 20 32" fill="none" xmlns="http://www.w3.org/2000/svg" height="32" style={{ display: "block" }}>
                                  <g clipPath="url(#clip_laurel_right_banner)">
                                    <path fillRule="evenodd" clipRule="evenodd" d="M4.06516 25.417L4.72713 24.4547L3.02437 23.6492L2.3624 24.6116L3.21378 25.0143L2.3624 24.6116C0.890857 26.751 1.60381 29.3868 3.95483 30.4989C4.69986 30.8513 5.55423 31.0196 6.43257 30.987L6.75025 30.9752L6.82494 29.2305L6.50726 29.2423C5.98026 29.2618 5.46764 29.1608 5.02062 28.9494C3.61001 28.2821 3.18223 26.7007 4.06516 25.417Z" fill="currentColor"></path>
                                    <path fillRule="evenodd" clipRule="evenodd" d="M11.2303 10.235C9.47283 8.96204 8.62998 7.4878 8.70171 5.81232C8.77344 4.13685 9.7454 2.59524 11.6176 1.18749C13.375 2.46049 14.2179 3.93473 14.1462 5.6102C14.0744 7.28568 13.1025 8.82729 11.2303 10.235Z" fill="var(--background, #ffffff)"></path>
                                    <path fillRule="evenodd" clipRule="evenodd" d="M12.3604 0.489275C11.9975 0.226387 11.4472 0.246818 11.0605 0.537533C9.01618 2.07473 7.84763 3.84975 7.76242 5.84026C7.6772 7.83076 8.69724 9.52453 10.6163 10.9146C10.9792 11.1775 11.5296 11.157 11.9162 10.8663C13.9605 9.32914 15.1291 7.55411 15.2143 5.56361C15.2995 3.57311 14.2795 1.87933 12.3604 0.489275ZM11.6311 2.3684C12.7748 3.38355 13.2568 4.47199 13.2069 5.63813C13.157 6.80428 12.5801 7.93203 11.3456 9.03547C10.2019 8.02032 9.71991 6.93187 9.76983 5.76573C9.81975 4.59959 10.3966 3.47184 11.6311 2.3684Z" fill="currentColor"></path>
                                    <path fillRule="evenodd" clipRule="evenodd" d="M3.87411 24.0529C5.42328 22.353 7.12208 21.4688 8.97051 21.4001C10.8189 21.3315 12.4473 22.0923 13.8556 23.6824C12.3065 25.3823 10.6077 26.2666 8.75924 26.3352C6.9108 26.4038 5.28243 25.6431 3.87411 24.0529Z" fill="var(--background, #ffffff)"></path>
                                    <path fillRule="evenodd" clipRule="evenodd" d="M14.6494 24.1787C14.9466 23.8526 14.9656 23.4097 14.6954 23.1046C13.1648 21.3765 11.2793 20.4331 9.03368 20.5164C6.78805 20.5998 4.81561 21.6864 3.13199 23.5339C2.83478 23.86 2.81582 24.303 3.08601 24.608C4.61655 26.3361 6.50208 27.2795 8.74771 27.1962C10.9933 27.1128 12.9658 26.0262 14.6494 24.1787ZM12.5669 23.7198C11.3316 24.8808 10.0869 25.4045 8.82241 25.4515C7.55791 25.4984 6.35415 25.0656 5.21452 23.9928C6.44977 22.8318 7.69449 22.3081 8.95899 22.2611C10.2235 22.2142 11.4272 22.6471 12.5669 23.7198Z" fill="currentColor"></path>
                                    <path fillRule="evenodd" clipRule="evenodd" d="M8.87809 20.7043C9.34099 18.5957 10.3908 17.0928 12.0274 16.1956C13.6641 15.2984 15.5603 15.1864 17.716 15.8596C17.2531 17.9683 16.2033 19.4712 14.5667 20.3684C12.93 21.2656 11.0338 21.3775 8.87809 20.7043Z" fill="var(--background, #ffffff)"></path>
                                    <path fillRule="evenodd" clipRule="evenodd" d="M18.7627 15.9443C18.8516 15.5393 18.6104 15.1569 18.1814 15.023C15.821 14.2859 13.5833 14.3695 11.6022 15.4554C9.6302 16.5364 8.45336 18.3139 7.95247 20.5956C7.86356 21.0006 8.10482 21.3829 8.5338 21.5169C10.8942 22.254 13.1319 22.1704 15.113 21.0844C17.085 20.0034 18.2618 18.226 18.7627 15.9443ZM16.6012 16.4656C16.1209 17.9951 15.2748 19.007 14.1415 19.6282C13.0241 20.2407 11.7105 20.4286 10.114 20.0743C10.5943 18.5448 11.4404 17.5329 12.5737 16.9116C13.6911 16.2991 15.0047 16.1113 16.6012 16.4656Z" fill="currentColor"></path>
                                  </g>
                                  <defs>
                                    <clipPath id="clip_laurel_right_banner">
                                      <rect width="18.8235" height="32" fill="white" transform="matrix(-1 0 0 1 19.1016 0.000488281)"></rect>
                                    </clipPath>
                                  </defs>
                                </svg>
                              </div>
                            </div>
                          </div>

                          {/* Vertical Divider */}
                          <div className="d1rieilq atm_2d_1guaqub atm_vy_t94yts atm_e2_1vi7ecw atm_e2_1ylpe5n__qky54b dir dir-ltr"></div>

                          {/* Reviews Button Column */}
                          <button
                            type="button"
                            onClick={() => {
                              const el = document.querySelector("#mobile-reviews-section");
                              el?.scrollIntoView({ behavior: "smooth" });
                            }}
                            className="r1rvafoe atm_9s_1txwivl atm_ar_1bp4okc atm_h_1h6ojuz atm_cx_t94yts atm_le_yh40bf dir dir-ltr"
                            data-testid="pdp-reviews-highlight-banner-host-review"
                          >
                            <span className="a8jt5op atm_3f_idpfg4 atm_7h_hxbz6r atm_7i_ysn8ba atm_e2_t94yts atm_ks_zryt35 atm_l8_idpfg4 atm_mk_stnw88 atm_vv_1q9ccgz atm_vy_t94yts dir dir-ltr">
                              {(dict?.rental?.reviewsList?.reviewsCount ?? "{n} reviews").replace("{n}", formatNumber(listing?.numberOfReviews ?? 0, locale))}
                            </span>
                            <div className="rqlvfu0" aria-hidden="true">
                              {formatNumber(listing?.numberOfReviews ?? 0, locale)}
                            </div>
                            <div className="rr9m0ar" aria-hidden="true">
                              {locale === "ar" ? "تقييمات" : "Reviews"}
                            </div>
                          </button>
                        </div>
                      </div>
                    ) : isGuestFavorite ? (
                      <div className="s1emndxt atm_40_iod1ro atm_le_1vi7ecw dir dir-ltr">
                        <div className="gf-badge">
                          <div
                            className="gf-badge-mark"
                            role="img"
                            aria-label={locale === "ar" ? "المفضّل لدى الضيوف" : "Guest favorite"}
                          >
                            <Laurel side="left" size={36} />
                            <div className="gf-badge-label" aria-hidden="true">
                              {locale === "ar" ? "المفضّل\nلدى الضيوف" : "Guest\nfavorite"}
                            </div>
                            <Laurel side="right" size={36} />
                          </div>
                          <p className="gf-badge-blurb">
                            {locale === "ar"
                              ? "من أكثر المنازل المحبوبة على مكان"
                              : "One of the most loved homes on Mkan"}
                          </p>
                        </div>
                      </div>
                    ) : (listing?.numberOfReviews ?? 0) > 0 ? (
                      /* Non-favorite with reviews — Airbnb's compact rating row */
                      <div className="s1emndxt atm_40_iod1ro atm_le_1vi7ecw dir dir-ltr">
                        <button
                          type="button"
                          onClick={() => {
                            const el = document.querySelector("#mobile-reviews-section");
                            el?.scrollIntoView({ behavior: "smooth" });
                          }}
                          className="flex items-center gap-1.5"
                          style={{ fontSize: 14, lineHeight: "18px", fontWeight: 500, color: "#222222" }}
                        >
                          <span className="a8jt5op atm_3f_idpfg4 atm_7h_hxbz6r atm_7i_ysn8ba atm_e2_t94yts atm_ks_zryt35 atm_l8_idpfg4 atm_mk_stnw88 atm_vv_1q9ccgz atm_vy_t94yts dir dir-ltr">
                            {(dict?.listings?.detail?.ratedFromReviews ?? "Rated {rating} out of 5 stars from {count} reviews.")
                              .replace("{rating}", formatNumber(listing?.averageRating ?? 0, locale, { minimumFractionDigits: 1, maximumFractionDigits: 2 }))
                              .replace("{count}", formatNumber(listing?.numberOfReviews ?? 0, locale))}
                          </span>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 32 32"
                            aria-hidden="true"
                            role="presentation"
                            focusable="false"
                            style={{ display: "block", height: 12, width: 12, fill: "currentColor" }}
                          >
                            <path fillRule="evenodd" d="m15.1 1.58-4.13 8.88-9.86 1.27a1 1 0 0 0-.54 1.74l7.3 6.57-1.97 9.85a1 1 0 0 0 1.48 1.06l8.62-5 8.63 5a1 1 0 0 0 1.48-1.06l-1.97-9.85 7.3-6.57a1 1 0 0 0-.55-1.73l-9.86-1.28-4.12-8.88a1 1 0 0 0-1.82 0z"></path>
                          </svg>
                          <span aria-hidden="true">
                            {formatNumber(listing?.averageRating ?? 0, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span aria-hidden="true"> · </span>
                          <span aria-hidden="true" className="underline underline-offset-2">
                            {(dict?.rental?.reviewsList?.reviewsCount ?? "{n} reviews").replace(
                              "{n}",
                              formatNumber(listing?.numberOfReviews ?? 0, locale)
                            )}
                          </span>
                        </button>
                      </div>
                    ) : null}
                  </section>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Host Section page-slot */}
      <div style={{ "--gp-section-max-width": "1120px" } as React.CSSProperties}>
        <div className="_1a6d9c4">
          <div className="plmw1e5 atm_e2_1osqo2v atm_gz_1wugsn5 atm_h0_1wugsn5 atm_vy_1osqo2v mq5rv0q atm_j3_1v7vjkn dir dir-ltr" style={{ "--maxWidth": "1120px" } as React.CSSProperties}>
            <div data-plugin-in-point-id="HOST_OVERVIEW_DEFAULT" data-section-id="HOST_OVERVIEW_DEFAULT">
              <div data-pageslot="true" className="c1yo0219 atm_9s_1txwivl_vmtskl atm_92_1yyfdc7_vmtskl atm_9s_1txwivl_9in345 atm_92_1yyfdc7_9in345 dir dir-ltr">
                <div style={{ display: "contents" }}>
                  <div className="cuspirs atm_9s_1txwivl atm_cx_exct8b atm_cx_1tcgj5g__oggzyc m1wx0491 atm_l8_1av1627 dir dir-ltr">
                    <div className="c17nk5xs atm_9s_1ulexfb atm_mk_h2mmj6 dir dir-ltr" style={{ height: 40, width: 40 }}>
                      <button
                        aria-label={isSuperhost
                          ? (dict?.listings?.detail?.superhostAria ?? "{name} is a superhost. Learn more about {name}.").split("{name}").join(displayName)
                          : (dict?.listings?.detail?.viewProfileAria ?? "View {name}'s profile.").replace("{name}", displayName)}
                        type="button"
                        className="_1t82b7sc l1ovpqvx atm_npmupv_14b5rvc_10saat9 atm_4s4swg_18xq13z_10saat9 atm_u9em2p_1r3889l_10saat9 atm_1ezpcqw_1u41vd9_10saat9 atm_fyjbsv_c4n71i_10saat9 atm_1rna0z7_1uk391_10saat9 dir dir-ltr"
                      >
                        <div className="i1j4t3kq atm_26_1guaqub atm_ks_15vqwwr atm_mk_h2mmj6 dir dir-ltr" style={{ height: 40, width: 40, borderRadius: "50%" }}>
                          <div
                            className="i1y91qbp atm_mk_h2mmj6 atm_1w_1xbheko atm_e2_jngzkn atm_vy_4hg7yc atm_5j_nw3v2p atm_vh_yfq0k3 dir dir-ltr"
                            role="img"
                            aria-busy="false"
                            aria-label={dict?.listings?.detail?.hostProfilePicture ?? "Host profile picture"}
                            style={{
                              "--AirImage-height": "100%",
                              "--AirImage-width": "100%",
                              "--AirImage-background-image": "none",
                            } as React.CSSProperties}
                          >
                            <img
                              className="i11046vh atm_e2_1osqo2v atm_vy_1osqo2v atm_jp_sm7xtg atm_jr_xm9jbw atm_5j_nw3v2p atm_vh_yfq0k3 dir dir-ltr"
                              aria-hidden="true"
                              alt={dict?.listings?.detail?.hostProfilePicture ?? "Host profile picture"}
                              decoding="async"
                              {...{ elementtiming: "LCP-target" }}
                              loading="lazy"
                              src={avatar}
                              width="100%"
                              height="100%"
                            />
                          </div>
                        </div>
                      </button>
                      {isSuperhost && (
                        <div className="bf5onxa atm_mk_stnw88 atm_6i_12gsa0d atm_n3_myb0kj dir dir-ltr">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 14" aria-hidden="true" role="presentation" focusable="false" style={{ display: "block", height: 20, width: 20 }}>
                            <linearGradient id="a" x1="8.5%" x2="92.18%" y1="17.16%" y2="17.16%">
                              <stop offset="0" stopColor="#e61e4d"></stop>
                              <stop offset=".5" stopColor="#e31c5f"></stop>
                              <stop offset="1" stopColor="#d70466"></stop>
                            </linearGradient>
                            <path fill="#fff" d="M9.93 0c.88 0 1.6.67 1.66 1.52l.01.15v2.15c0 .54-.26 1.05-.7 1.36l-.13.08-3.73 2.17a3.4 3.4 0 1 1-2.48 0L.83 5.26A1.67 1.67 0 0 1 0 3.96L0 3.82V1.67C0 .79.67.07 1.52 0L1.67 0z"></path>
                            <path fill="url(#a)" d="M5.8 8.2a2.4 2.4 0 0 0-.16 4.8h.32a2.4 2.4 0 0 0-.16-4.8zM9.93 1H1.67a.67.67 0 0 0-.66.57l-.01.1v2.15c0 .2.1.39.25.52l.08.05L5.46 6.8c.1.06.2.09.29.1h.1l.1-.02.1-.03.09-.05 4.13-2.4c.17-.1.3-.29.32-.48l.01-.1V1.67a.67.67 0 0 0-.57-.66z"></path>
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="t1nltagi atm_9s_1txwivl atm_ar_1bp4okc atm_fc_1h6ojuz atm_cx_1y44olf dir dir-ltr">
                      <div className="t1avz7ro atm_c8_3w7ag0 atm_g3_1emqlh9 atm_fr_helst atm_cs_1mexzig dir dir-ltr">
                        {locale === "ar" ? `يستضيفك ${displayName}` : `Hosted by ${displayName}`}
                      </div>
                      <div className="sxfuxpq atm_c8_1h3mmnw atm_g3_1vnrj90 atm_fr_b3emyl atm_7l_1kkyeqd dir dir-ltr">
                        <ol className="lgx66tx atm_gi_idpfg4 atm_l8_idpfg4 dir dir-ltr">
                          {isSuperhost && (
                            <li className="l7n4lsf atm_9s_1o8liyq_keqd55 dir dir-ltr">
                              {locale === "ar" ? "مضيف متميز" : "Superhost"}
                              {yearsHosting > 0 && (
                                <span className="axjq0r atm_9s_glywfm dir dir-ltr">
                                  <span className="s1b4clln atm_mj_glywfm atm_vb_glywfm atm_vv_1jtmq4 atm_lk_idpfg4 atm_ll_idpfg4 dir dir-ltr" aria-hidden="true"> · </span>
                                </span>
                              )}
                            </li>
                          )}
                          {yearsHosting > 0 && (
                            <li className="l7n4lsf atm_9s_1o8liyq_keqd55 dir dir-ltr">
                              {locale === "ar"
                                ? `${yearsHosting} ${yearsHosting === 1 ? "عام" : yearsHosting === 2 ? "عامين" : "أعوام"} من الاستضافة`
                                : `${yearsHosting} ${yearsHosting === 1 ? "year" : "years"} hosting`}
                            </li>
                          )}
                        </ol>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Property Info — order mirrors the live PDP (room 40938334): highlights →
          description → where-you-sleep → amenities. Location / calendar / reviews /
          meet-host / things-to-know / similar follow as sibling sections composed
          in the page (see page.tsx). */}
      <div className="px-6 py-6 space-y-6">

        {/* Highlights Section — the live mobile PDP shows the icon rows with NO
            visible section title (the heading is a11y-only), so hide it via
            sr-only. Rows stay title-only: our enum highlights carry no subtitle
            copy and we don't fabricate it. */}
        {/* About this room Section (only for Rooms property type) */}
        {listing.propertyType === "Rooms" && (
          <div className="pb-6">
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
          </div>
        )}

        {PHASE1.showListingHighlights && (listing?.highlights?.length ?? 0) > 0 && (
          <div className="border-t border-[#DDDDDD] pt-6 mt-6">
            <AirbnbInfo
              highlights={listing.highlights}
              heading={locale === "ar" ? "أبرز مميزات المكان" : "Listing highlights"}
              headingClassName="sr-only"
            />
          </div>
        )}

        {/* Description Section (DESCRIPTION_DEFAULT) — no heading on live; clamp + "Show more" */}
        {listing?.description && (
          <div className="border-t border-[#DDDDDD] pt-6 mt-6">
            <p className={`whitespace-pre-line text-base leading-[20px] text-[#222222] font-normal ${listing.description.length > 280 && !descExpanded ? "line-clamp-6" : ""}`}>
              {listing.description}
            </p>
            {listing.description.length > 280 && (
              <button
                type="button"
                onClick={() => setDescExpanded((v) => !v)}
                className="mt-4 flex h-12 w-full items-center justify-center rounded-[12px] bg-[#F2F2F2] text-base font-medium text-[#222222]"
              >
                {descExpanded
                  ? (locale === "ar" ? "عرض أقل" : "Show less")
                  : (locale === "ar" ? "عرض المزيد" : "Show more")}
              </button>
            )}
          </div>
        )}

        {/* Where you'll sleep (SLEEPING_ARRANGEMENT_WITH_IMAGES) — one card per
            bedroom. The live PDP shows per-room photos; our Listing model has no
            per-room images, so (like the desktop sibling) each room renders an
            honest bed-glyph card in a horizontal scroll row. Headings are
            semibold (600) on mobile, matching the live section-title canon. */}
        {(listing?.bedrooms ?? 0) > 0 && (
          <WhereYouSleep
            bedrooms={listing.bedrooms}
            heading={locale === "ar" ? "أين ستنام" : "Where you'll sleep"}
            bedroomLabel={locale === "ar" ? "غرفة النوم" : "Bedroom"}
            bedLabel={locale === "ar" ? "سرير واحد" : "1 bed"}
            studioLabel={locale === "ar" ? "غرفة المعيشة" : "Living room"}
            className="border-t border-[#DDDDDD] pt-6 mt-6"
            headingClassName="mb-6 text-[22px] font-semibold leading-[26px] tracking-[-0.44px] text-[#222222]"
            cardClassName="flex w-[163px] flex-none flex-col gap-2 rounded-[8px] border border-[#DDDDDD] p-4"
          />
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
      </div>
    </div>
  );
};

export default MobileListingDetails;