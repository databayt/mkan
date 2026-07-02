"use client";
import { cdn } from "@/lib/cdn";

import React, { useEffect, useCallback, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu } from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { useLocale } from "@/components/internationalization/use-locale";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { motion, AnimatePresence } from "framer-motion";
import BigSearch from "@/components/template/search/big-search";
import SmallSearch from "@/components/template/search/small-search";
import SearchTabs from "@/components/template/search/search-tabs";
import LocaleCurrencyDialog from "@/components/template/search/locale-currency-dialog";
import useSearchHeaderStore, { type SearchSegment } from "@/hooks/useSearchHeaderStore";

const dropdownTranslations = {
  en: {
    becomeHost: "Become a host",
    switchToHosting: "Switch to hosting",
    helpCenter: "Help Center",
    becomeHostDesc: "It's easy to start hosting and earn extra income.",
    referHost: "Refer a Host",
    findCoHost: "Find a co-host",
    giftCards: "Gift cards",
    loginOrSignup: "Log in or sign up",
    logout: "Log out",
    messages: "Messages",
    trips: "Trips",
    wishlists: "Wishlists",
    favorites: "Favorites",
    profile: "Profile",
    manageListings: "Manage listings",
    account: "Account",
  },
  ar: {
    becomeHost: "كن مضيفاً",
    switchToHosting: "التبديل إلى الاستضافة",
    helpCenter: "مركز المساعدة",
    becomeHostDesc: "من السهل البدء في الاستضافة وكسب دخل إضافي.",
    referHost: "إحالة مضيف",
    findCoHost: "البحث عن مضيف مشارك",
    giftCards: "بطاقات الهدايا",
    loginOrSignup: "تسجيل الدخول أو إنشاء حساب",
    logout: "تسجيل الخروج",
    messages: "الرسائل",
    trips: "الرحلات",
    wishlists: "قوائم الرغبات",
    favorites: "المفضلة",
    profile: "الملف الشخصي",
    manageListings: "إدارة العقارات",
    account: "الحساب",
  }
} as const;

// ONE unified morph spring drives every transform in the small↔big transition —
// the small pill's bloom, the tab row's rise, the big bar's unfold, and the
// second-row height — so scrolling reads as a SINGLE cohesive gesture instead of
// two elements crossfading past each other. Softened from the old 320/36 to
// 280/34 (damping ratio ≈ 1.0, ~0.42s settle): smooth and beautiful, no bounce.
// Opacity is excluded — springs on opacity produce a luminance wobble the eye
// reads as flicker.
const SPRING = {
  type: "spring" as const,
  stiffness: 280,
  damping: 34,
  mass: 1,
  restDelta: 0.001,
} as const;

// Opacity rides a plain tween (iOS standard ease). Asymmetric on purpose: the
// OUTGOING layer fades fast while the INCOMING layer fades a touch later (small
// delay at the call sites) so the two never sit together at half-alpha — that
// overlap is exactly what reads as a muddy crossfade rather than a clean morph.
const FADE_IN = { duration: 0.22, ease: [0.32, 0.72, 0, 1] as const };
const FADE_OUT = { duration: 0.14, ease: [0.32, 0.72, 0, 1] as const };

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

// Account-menu icons live in the shared menu-glyphs module (Airbnb DLS 32-grid
// stroke set + the authentic Help "?") — also used by the mobile menu sheet.
import {
  WishlistGlyph,
  TripsGlyph,
  ProfileGlyph,
  AccountGlyph,
  LogoutGlyph,
  HelpGlyph,
} from "@/components/template/header/menu-glyphs";

interface ListingsHeaderProps {
  /**
   * When true (listing-detail / secondary pages) the header renders the compact
   * search pill at ALL times and only unfolds into the big search when the user
   * actively clicks it — there is no scroll-driven expand/collapse. On /listings
   * this stays false so the big search shows at the top of the page and morphs
   * down to the pill as the user scrolls.
   */
  disableScrollExpand?: boolean;
}

const ListingsHeader = ({ disableScrollExpand = false }: ListingsHeaderProps) => {
  const { data: session, status } = useSession();
  const { locale } = useLocale();
  const labels = dropdownTranslations[locale] || dropdownTranslations.en;

  // Signed-in identity drives the right-side cluster: the "Become a host" link
  // flips to "Switch to hosting", and the globe (language/currency) is replaced
  // by the account avatar. `initial` is the avatar fallback when there's no
  // profile photo (mirrors the host header's avatar).
  const isAuthed = !!session?.user;
  const initial = (
    session?.user?.name?.[0] ??
    session?.user?.email?.[0] ??
    "A"
  ).toUpperCase();

  const handleSignOut = async () => {
    await signOut({
      callbackUrl: "/",
      redirect: true
    });
  };

  const {
    isExpanded: isExpandedRaw,
    isOverlayActive,
    initialSegment,
    setScrollExpanded,
    expandFromSmallSearch,
    collapse,
  } = useSearchHeaderStore();

  // On detail/secondary pages (disableScrollExpand) the big search must never
  // appear from scroll or the shared store's default — only when the user opens
  // it (overlay active). Deriving "expanded" from the overlay alone keeps the
  // compact pill on first paint (no flash) and feeds every animation below. On
  // /listings it tracks the store exactly as before.
  const isExpanded = disableScrollExpand ? isOverlayActive : isExpandedRaw;

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
    // Detail header: no scroll-driven expand/collapse — the pill stays put and
    // only the user's click opens the big search.
    if (disableScrollExpand) return;

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
  }, [setScrollExpanded, disableScrollExpand]);

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
        document.body.style.paddingInlineEnd = `${scrollbarWidth}px`;
      }
    } else {
      document.body.style.overflow = "";
      document.body.style.paddingInlineEnd = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingInlineEnd = "";
    };
  }, [isOverlayActive]);

  // The search store is a module-level singleton shared by every header
  // instance, so an overlay left open while the user navigates (e.g. clicks the
  // logo or a result with the big search expanded) would otherwise carry its
  // active scrim onto the next page. Collapse on unmount to hand the next route
  // a clean, pill-only state.
  useEffect(() => {
    return () => collapse();
  }, [collapse]);

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
                    src={cdn.product("tent.png")}
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
                  y: isExpanded ? 0 : -6,
                }}
                transition={{
                  y: SPRING,
                  opacity: isExpanded
                    ? { ...FADE_IN, delay: 0.05 }
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

              {/* Small pill — on EXPAND it blooms: scales just past 1 and lifts a
                  few px as it fades, so it reads as opening *into* the big bar
                  rather than shrinking away. On COLLAPSE it settles 1.06→1 while
                  fading in, condensing out of the bar that's retracting upward.
                  The pill leads, the bar follows — they meet in the middle. */}
              <motion.div
                className="absolute"
                initial={false}
                animate={{
                  opacity: isExpanded ? 0 : 1,
                  scale: isExpanded ? 1.06 : 1,
                  y: isExpanded ? -4 : 0,
                }}
                transition={{
                  y: SPRING,
                  scale: SPRING,
                  opacity: isExpanded
                    ? FADE_OUT
                    : { ...FADE_IN, delay: 0.05 },
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
              {/* Right-side text link — "Become a host" for guests, flips to
                  "Switch to hosting" once signed in (→ the host dashboard). */}
              <Link
                href={isAuthed ? `/${locale}/hosting` : `/${locale}/host`}
                className="text-sm font-semibold text-gray-800 hover:bg-gray-100/50 px-4 py-2.5 rounded-full transition-colors hidden sm:inline-block whitespace-nowrap"
              >
                {isAuthed ? labels.switchToHosting : labels.becomeHost}
              </Link>

              {/* Guest → globe (language & currency dialog).
                  Signed in → account avatar linking to the profile/account page
                  (40px circle to match the globe + hamburger footprint). */}
              {isAuthed ? (
                <Link
                  href={`/${locale}/profile/about`}
                  aria-label={labels.account}
                  className="rounded-full outline-none transition-opacity hover:opacity-90"
                >
                  <Avatar className="size-10">
                    <AvatarImage src={session?.user?.image || ""} alt={labels.account} />
                    <AvatarFallback className="bg-gray-900 text-white text-sm font-medium">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                </Link>
              ) : (
                <LocaleCurrencyDialog />
              )}

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
                  {/* Top section mirrors the live menu: when SIGNED IN, Airbnb
                      surfaces the traveler's personal links here (Wishlists,
                      Trips, Profile, Account); when SIGNED OUT it leads with the
                      Help Center promo. The shared host/discovery rows below are
                      identical in both states — only this top block swaps. */}
                  {isAuthed ? (
                    <>
                      <DropdownMenuItem asChild>
                        <Link href={`/${locale}/tenants/favorites`} className={MENU_ROW}>
                          <WishlistGlyph />
                          <span>{labels.wishlists}</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/${locale}/tenants/trips`} className={MENU_ROW}>
                          <TripsGlyph />
                          <span>{labels.trips}</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/${locale}/profile/about`} className={MENU_ROW}>
                          <ProfileGlyph />
                          <span>{labels.profile}</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/${locale}/tenants/settings`} className={MENU_ROW}>
                          <AccountGlyph />
                          <span>{labels.account}</span>
                        </Link>
                      </DropdownMenuItem>
                    </>
                  ) : (
                    /* Help Center — authentic Airbnb "?" glyph leading, then
                       label (icon-left, regular weight, #222) as on the live menu. */
                    <DropdownMenuItem asChild>
                      <Link href={`/${locale}/help`} className={MENU_ROW}>
                        <HelpGlyph />
                        <span>{labels.helpCenter}</span>
                      </Link>
                    </DropdownMenuItem>
                  )}

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
                          src={cdn.product("images/host_waving.png")}
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

                  {/* Help Center — for signed-in users it lives down here (the
                      personal links took the top slot); guests already saw it at
                      the top, so it's only rendered in the authed branch. */}
                  {isAuthed && (
                    <>
                      <DropdownMenuItem asChild>
                        <Link href={`/${locale}/help`} className={MENU_ROW}>
                          <HelpGlyph />
                          <span>{labels.helpCenter}</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="h-px" style={MENU_SEP_STYLE} />
                    </>
                  )}

                  {/* Auth section — sign-out (logged in) or log in / sign up
                      (logged out). The signed-in personal links now live at the
                      top of the menu, mirroring Airbnb. */}
                  {status === "loading" ? null : session?.user ? (
                    <DropdownMenuItem
                      onClick={handleSignOut}
                      className={MENU_ROW}
                    >
                      <LogoutGlyph />
                      <span>{labels.logout}</span>
                    </DropdownMenuItem>
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
              scale: isExpanded ? 1 : 0.96,
              y: isExpanded ? 0 : -12,
            }}
            transition={{
              scale: SPRING,
              y: SPRING,
              opacity: isExpanded ? { ...FADE_IN, delay: 0.04 } : FADE_OUT,
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
