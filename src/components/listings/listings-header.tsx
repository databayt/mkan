"use client";

import React, { useEffect, useCallback, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, HelpCircle, LogOut } from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { useLocale } from "@/components/internationalization/use-locale";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";
import BigSearch from "@/components/template/search/big-search";
import SmallSearch from "@/components/template/search/small-search";
import SearchTabs from "@/components/template/search/search-tabs";
import LocaleCurrencyDialog from "@/components/template/search/locale-currency-dialog";
import useSearchHeaderStore, { type SearchSegment } from "@/hooks/useSearchHeaderStore";

const dropdownTranslations = {
  en: {
    becomeHost: "Become a host",
    helpCenter: "Help Center",
    becomeHostDesc: "It's easy to start hosting and earn extra income.",
    referHost: "Refer a Host",
    findCoHost: "Find a co-host",
    giftCards: "Gift cards",
    loginOrSignup: "Log in or sign up",
    logout: "Log out",
    messages: "Messages",
    trips: "Trips",
    favorites: "Favorites",
    manageListings: "Manage listings",
    account: "Account",
  },
  ar: {
    becomeHost: "كن مضيفاً",
    helpCenter: "مركز المساعدة",
    becomeHostDesc: "من السهل البدء في الاستضافة وكسب دخل إضافي.",
    referHost: "إحالة مضيف",
    findCoHost: "البحث عن مضيف مشارك",
    giftCards: "بطاقات الهدايا",
    loginOrSignup: "تسجيل الدخول أو إنشاء حساب",
    logout: "تسجيل الخروج",
    messages: "الرسائل",
    trips: "الرحلات",
    favorites: "المفضلة",
    manageListings: "إدارة العقارات",
    account: "الحساب",
  }
} as const;

// Layout/transform spring tuned to Airbnb's own "fast" motion token
// (stiffness 320 / damping 36 / mass 1 → damping ratio ≈ 1.0, ~0.33s settle):
// critically damped, so the row morphs crisply between big and small with no
// bounce, a touch snappier than before to match Airbnb's brisk feel. Used
// everywhere except opacity; springs on opacity produce a subtle luminance
// wobble the eye reads as flicker.
const SPRING = {
  type: "spring" as const,
  stiffness: 320,
  damping: 36,
  mass: 1,
  restDelta: 0.001,
} as const;

// Opacity rides a plain tween. The curve is the iOS standard ease —
// gentle accel/decel that matches the spring's perceived rhythm without
// fighting it. Duration is asymmetric: faster on collapse so the page
// feels responsive when you scroll down, slower on expand so the search
// feels deliberate when you scroll back up.
const FADE_IN = { duration: 0.24, ease: [0.32, 0.72, 0, 1] as const };
const FADE_OUT = { duration: 0.16, ease: [0.32, 0.72, 0, 1] as const };

// Hysteresis band prevents flicker when the user hovers near the threshold.
// Collapse once we pass COLLAPSE_AT, re-expand only after we come back under EXPAND_AT.
const COLLAPSE_AT = 80;
const EXPAND_AT = 20;

// Airbnb account-menu row, measured from the live site (2026-06-27): full-width
// hover, 24px text inset (px-6), 14px / weight-400 / #222 text, #f7f7f7 hover.
// Separators are full-bleed #dddddd (not a Tailwind token → set via inline style).
const MENU_ROW =
  "flex items-center gap-3 px-6 py-2 text-sm font-normal text-[#222222] hover:bg-[#f7f7f7] focus:bg-[#f7f7f7] transition-colors cursor-pointer outline-none";
const MENU_SEP_STYLE = { backgroundColor: "#dddddd", margin: 0 } as const;
// width/radius are set inline because brand-new arbitrary utilities
// (w-[265px], rounded-xl-override) silently fail to generate under Turbopack.
const MENU_CARD_STYLE = {
  width: "265px",
  borderRadius: "12px",
  boxShadow: "0 2px 16px rgba(0,0,0,0.12)",
} as const;

const ListingsHeader = () => {
  const { data: session, status } = useSession();
  const { locale } = useLocale();
  const labels = dropdownTranslations[locale] || dropdownTranslations.en;

  const handleSignOut = async () => {
    await signOut({
      callbackUrl: "/",
      redirect: true
    });
  };

  const {
    isExpanded,
    isOverlayActive,
    initialSegment,
    setScrollExpanded,
    expandFromSmallSearch,
    collapse,
  } = useSearchHeaderStore();

  // Guard against dropdowns being clipped by the height-animating wrapper.
  // During the collapse/expand animation we keep overflow:hidden so the
  // inner pill doesn't spill out mid-transition; once the row is fully
  // expanded and settled, we switch to overflow:visible so dropdowns
  // (location, dates, guests) can extend below the row.
  const [rowOverflowVisible, setRowOverflowVisible] = useState(isExpanded);

  // When the big search opens from a compact-pill click, the scrim already
  // covers the page, so we can let the row overflow *immediately* rather than
  // waiting for the height spring to settle. That lets the segment the user
  // tapped (its dropdown is anchored top-full) render in lockstep with the
  // expansion — instead of being clipped for the spring's duration and then
  // popping in late. Scroll-driven expands (no overlay) keep the
  // animation-gated clipping below so the bar never spills over bare content.
  useEffect(() => {
    if (isOverlayActive) {
      setRowOverflowVisible(true);
    }
  }, [isOverlayActive]);

  useEffect(() => {
    let ticking = false;
    let wasExpanded = window.scrollY < COLLAPSE_AT;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const y = window.scrollY;
        if (wasExpanded && y > COLLAPSE_AT) {
          wasExpanded = false;
          setScrollExpanded(false);
        } else if (!wasExpanded && y < EXPAND_AT) {
          wasExpanded = true;
          setScrollExpanded(true);
        }
      });
    };

    // Sync initial state with current scroll position in case the user
    // landed deep-linked with scroll already past the threshold.
    if (window.scrollY > COLLAPSE_AT) {
      wasExpanded = false;
      setScrollExpanded(false);
    } else {
      setScrollExpanded(true);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [setScrollExpanded]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOverlayActive) {
        collapse();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOverlayActive, collapse]);

  // Reserve the scrollbar gutter while locking scroll. Without this, the
  // vertical scrollbar disappears and the max-w-7xl container re-centers,
  // shifting the header ~15px horizontally.
  useEffect(() => {
    if (isOverlayActive) {
      const scrollbarWidth =
        window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
    } else {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    };
  }, [isOverlayActive]);

  const handleSmallSearchClick = useCallback(
    (segment?: SearchSegment) => {
      expandFromSmallSearch(segment);
    },
    [expandFromSmallSearch]
  );

  const handleOverlayClick = useCallback(() => {
    collapse();
  }, [collapse]);

  return (
    <>
      <AnimatePresence>
        {isOverlayActive && (
          <motion.div
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            onClick={handleOverlayClick}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <header
        className={`bg-white sticky top-0 z-50 transition-shadow duration-300 ${
          isOverlayActive ? "shadow-xl" : "border-b"
        }`}
      >
        <div className="max-w-screen-xl mx-auto px-6 md:px-12">
          {/* Top row — Logo, Nav/SmallSearch, User.
              1440px: h-24 (96px) matches Airbnb's 96px top-row height exactly.
              768px (md): h-[72px] — text-only tabs don't need the icon height
              that Airbnb's animated-video tabs occupy; 72px centres the tab
              bar and small-search comfortably within the compact tablet header. */}
          <div className="relative flex items-center h-[72px] xl:h-24">
            {/* Left side - Logo - Fixed Position */}
            <div className="flex items-center w-1/3">
              <Link
                href="/"
                className="cursor-pointer hover:text-gray-700"
                scroll={false}
              >
                <div className="flex items-center gap-2">
                  <Image
                    src="/tent.png"
                    alt="Mkan Logo"
                    width={20}
                    height={20}
                    className="w-5 h-5"
                  />
                  <div className="text-xl font-bold text-gray-900">
                    Mk
                    <span className="font-light hover:text-gray-700 text-gray-600">
                      an
                    </span>
                  </div>
                </div>
              </Link>
            </div>

            {/* Center slot — both nav and small-search stay mounted and crossfade.
                Keeping them mounted avoids AnimatePresence remount lag during
                quick scroll reversals (user scrolls down then back up).
                Transforms ride SPRING, opacity rides a tween, and the
                *incoming* element gets a small delay so the two never
                overlap at half-alpha (which reads as a muddy frame). */}
            <div className="flex-1 flex justify-center items-center relative h-12">
              <motion.div
                className="absolute"
                initial={false}
                animate={{
                  opacity: isExpanded ? 1 : 0,
                  y: isExpanded ? 0 : -8,
                }}
                transition={{
                  y: SPRING,
                  opacity: isExpanded
                    ? { ...FADE_IN, delay: 0.06 }
                    : FADE_OUT,
                }}
                style={{
                  pointerEvents: isExpanded ? "auto" : "none",
                  willChange: "transform, opacity",
                }}
                aria-hidden={!isExpanded}
              >
                <SearchTabs />
              </motion.div>

              <motion.div
                className="absolute"
                initial={false}
                animate={{
                  opacity: isExpanded ? 0 : 1,
                  scale: isExpanded ? 0.97 : 1,
                  y: isExpanded ? 6 : 0,
                }}
                transition={{
                  y: SPRING,
                  scale: SPRING,
                  opacity: isExpanded
                    ? FADE_OUT
                    : { ...FADE_IN, delay: 0.06 },
                }}
                style={{
                  pointerEvents: isExpanded ? "none" : "auto",
                  willChange: "transform, opacity",
                }}
                aria-hidden={isExpanded}
              >
                <SmallSearch onExpand={handleSmallSearchClick} />
              </motion.div>
            </div>

            {/* Right side - User Controls - Fixed Position */}
            <div className="flex items-center justify-end gap-3 w-1/3">
              {/* Become a host link */}
              <Link
                href={`/${locale}/host`}
                className="text-sm font-semibold text-gray-800 hover:bg-gray-100/50 px-4 py-2.5 rounded-full transition-colors hidden sm:inline-block whitespace-nowrap"
              >
                {labels.becomeHost}
              </Link>

              {/* Globe — opens the language & currency dialog */}
              <LocaleCurrencyDialog />

              {/* User Dropdown Trigger — 40px circle, #f2f2f2≈gray-100, 16px
                  hamburger (Airbnb's logged-out account button). */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="Main navigation menu"
                    className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors cursor-pointer outline-none"
                  >
                    <Menu size={16} className="text-[#222222]" />
                  </button>
                </DropdownMenuTrigger>
                {/* Card mirrors the live popover: 265px wide, 12px radius,
                    12px vertical padding, no border, soft single-layer shadow. */}
                <DropdownMenuContent
                  align="end"
                  sideOffset={8}
                  className="bg-white p-0 py-3 border-0 overflow-hidden z-[100]"
                  style={MENU_CARD_STYLE}
                >
                  {/* Help Center — ? icon leading, then label (icon-left, regular
                      weight, #222) exactly as on the live menu. */}
                  <DropdownMenuItem asChild>
                    <Link href={`/${locale}/help`} className={MENU_ROW}>
                      <HelpCircle size={16} className="text-[#222222] flex-shrink-0" />
                      <span>{labels.helpCenter}</span>
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator className="h-px" style={MENU_SEP_STYLE} />

                  {/* Become a host — plain row (no tint): 14/500 title, 12/400
                      #6a6a6a subtitle, 48px waving-host image trailing. */}
                  <DropdownMenuItem asChild>
                    <Link
                      href={`/${locale}/host`}
                      className="flex items-center gap-2 px-6 py-1 hover:bg-[#f7f7f7] focus:bg-[#f7f7f7] transition-colors cursor-pointer outline-none"
                    >
                      <div className="flex-1">
                        <div
                          className="text-sm"
                          style={{ fontWeight: 500, color: "#222222", lineHeight: "18px" }}
                        >
                          {labels.becomeHost}
                        </div>
                        <div
                          className="text-xs mt-0.5"
                          style={{ fontWeight: 400, color: "#6a6a6a", lineHeight: "16px" }}
                        >
                          {labels.becomeHostDesc}
                        </div>
                      </div>
                      <div className="relative w-12 h-12 flex-shrink-0">
                        <Image
                          src="/images/host_waving.png"
                          alt="Waving host"
                          fill
                          sizes="48px"
                          className="object-contain"
                        />
                      </div>
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator className="h-px" style={MENU_SEP_STYLE} />

                  {/* Refer a Host */}
                  <DropdownMenuItem asChild>
                    <Link href={`/${locale}/refer`} className={MENU_ROW}>
                      <span>{labels.referHost}</span>
                    </Link>
                  </DropdownMenuItem>

                  {/* Find a co-host */}
                  <DropdownMenuItem asChild>
                    <Link href={`/${locale}/co-hosts`} className={MENU_ROW}>
                      <span>{labels.findCoHost}</span>
                    </Link>
                  </DropdownMenuItem>

                  {/* Gift cards */}
                  <DropdownMenuItem asChild>
                    <Link href={`/${locale}/giftcards`} className={MENU_ROW}>
                      <span>{labels.giftCards}</span>
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator className="h-px" style={MENU_SEP_STYLE} />

                  {/* Auth section */}
                  {status === "loading" ? null : session?.user ? (
                    <>
                      <DropdownMenuItem asChild>
                        <Link href={`/${locale}/hosting/listings`} className={MENU_ROW}>
                          <span>{labels.manageListings}</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/${locale}/tenants/trips`} className={MENU_ROW}>
                          <span>{labels.trips}</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/${locale}/tenants/favorites`} className={MENU_ROW}>
                          <span>{labels.favorites}</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="h-px" style={MENU_SEP_STYLE} />
                      <DropdownMenuItem
                        onClick={handleSignOut}
                        className={MENU_ROW}
                      >
                        <LogOut size={16} className="text-[#222222] flex-shrink-0" />
                        <span>{labels.logout}</span>
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <DropdownMenuItem asChild>
                      <Link href={`/${locale}/login`} className={MENU_ROW}>
                        <span>{labels.loginOrSignup}</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Second Row — Big Search. Height animates from auto↔0 so content
            below doesn't jump when the header collapses on scroll. Overflow
            is only hidden during the animation so dropdowns (positioned
            top-full inside BigSearch) aren't clipped while open. The
            transform-origin pins the collapse to the top edge so the row
            visually retracts *upward* into the top row above it, rather
            than fading out in place. */}
        <motion.div
          initial={false}
          animate={{ height: isExpanded ? "auto" : 0 }}
          transition={{ height: SPRING }}
          style={{
            overflow: rowOverflowVisible ? "visible" : "hidden",
            willChange: "height",
          }}
          onAnimationStart={() => {
            // Clip only while scroll-driven (no scrim) so the bar never spills
            // over bare page content. During a click-expand the scrim covers
            // the page and overflow stays visible (set in the effect above) so
            // the requested dropdown can render in lockstep with the expansion.
            if (!isOverlayActive) setRowOverflowVisible(false);
          }}
          onAnimationComplete={() => setRowOverflowVisible(isExpanded)}
          aria-hidden={!isExpanded}
        >
          {/* Inner layer carries the visual morph: on collapse the bar scales
              down and lifts (transform-origin top center) while fading, so it
              reads as being drawn up into the small pill above rather than
              merely clipped. On expand it grows back down out of the pill. */}
          <motion.div
            initial={false}
            animate={{
              opacity: isExpanded ? 1 : 0,
              scale: isExpanded ? 1 : 0.97,
              y: isExpanded ? 0 : -8,
            }}
            transition={{
              scale: SPRING,
              y: SPRING,
              opacity: isExpanded ? { ...FADE_IN, delay: 0.03 } : FADE_OUT,
            }}
            style={{
              transformOrigin: "top center",
              willChange: "transform, opacity",
            }}
            className="w-full px-6 md:px-12 pt-2 pb-6"
          >
            <BigSearch onClose={handleOverlayClick} isActive={isExpanded} openTo={initialSegment} />
          </motion.div>
        </motion.div>
      </header>
    </>
  );
};

export default ListingsHeader;
