"use client";
import { cdn } from "@/lib/cdn";

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { MoreHorizontal, Menu } from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useLocale } from '@/components/internationalization/use-locale';
import SmallSearch from '@/components/template/search/small-search';
import { SearchFilters } from '@/components/listings/search-filters';
import VerticalSearch from '@/components/template/search/vertical-search';
import BigSearch from '@/components/template/search/big-search';
import { type SearchSegment } from '@/hooks/useSearchHeaderStore';

const BAR_H = 64;
const CTA_ID = "search-page-cta";
const SPRING = {
  type: "spring" as const,
  stiffness: 280,
  damping: 34,
  mass: 1,
} as const;
// Crossfade tweens for the pill ⇄ big-bar swap — same values as the /listings
// header so the two expansions feel identical.
const FADE_IN = { duration: 0.22, ease: [0.32, 0.72, 0, 1] as const };
const FADE_OUT = { duration: 0.14, ease: [0.32, 0.72, 0, 1] as const };

const SearchHeader = () => {
  const pathname = usePathname();
  const { locale } = useLocale();
  const isAr = locale === 'ar';

  const [isOpen, setIsOpen] = useState(false);
  const [sheetH, setSheetH] = useState(0);
  // Desktop (md+) expansion — the /listings-style BigSearch bar in a second
  // header row, deep-linked to the facet the user clicked. Mobile keeps the
  // sheet; the md guard in handleExpand means the two never coexist.
  const [deskOpen, setDeskOpen] = useState(false);
  const [deskSegment, setDeskSegment] = useState<SearchSegment | null>(null);

  const openSheet = useCallback(() => {
    setSheetH(Math.round(window.innerHeight * 0.92));
    setIsOpen(true);
  }, []);

  const closeSheet = useCallback(() => setIsOpen(false), []);
  const collapseDesk = useCallback(() => setDeskOpen(false), []);

  const handleExpand = useCallback(
    (segment?: SearchSegment) => {
      if (window.innerWidth < 768) {
        openSheet();
        return;
      }
      setDeskSegment(segment ?? "location");
      setDeskOpen(true);
    },
    [openSheet]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  // Desktop expansion: lock body scroll while the scrim is up, reserving the
  // scrollbar gutter so the centered container doesn't shift, and close on
  // Escape — same behavior as the /listings header overlay.
  useEffect(() => {
    if (!deskOpen) return;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingInlineEnd = `${scrollbarWidth}px`;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDeskOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingInlineEnd = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [deskOpen]);

  const navigationItems = [
    { name: 'Homes', href: '#' },
    { name: 'Experiences', href: '#' },
    { name: 'Services', href: '#' },
  ];

  const isActiveRoute = (href: string) => {
    return pathname === href;
  };

  return (
    <LayoutGroup>
      {/* Desktop scrim — sits under the header (z-40 < z-50); click collapses
          the BigSearch row. md+ only: the mobile sheet brings its own scrim. */}
      <AnimatePresence>
        {deskOpen && (
          <motion.div
            className="fixed inset-0 bg-black/40 z-40 hidden md:block"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            onClick={collapseDesk}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <header
        className={`bg-white sticky top-0 z-50 transition-shadow duration-300 ${
          deskOpen ? "shadow-xl" : "border-b"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-22">
          <div className="relative flex items-center justify-between h-16">
            {/* Left side - Logo (hidden on mobile so the search pill gets the full
                width, matching airbnb.com's mobile search bar) */}
            <div className="hidden sm:flex items-center">
              <Link href="/" className="cursor-pointer hover:text-gray-700" scroll={false}>
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

            {/* Center - Small Search & Filters. While the desktop BigSearch
                row is open the pill BLOOMS out (scales past 1 and lifts as it
                fades — opening *into* the bar below, mirroring /listings);
                kept mounted so quick open/close never remounts it. */}
            <motion.div
              className="flex items-center justify-center flex-1 sm:mx-8 gap-2 min-w-0"
              initial={false}
              animate={{
                opacity: deskOpen ? 0 : 1,
                scale: deskOpen ? 1.06 : 1,
                y: deskOpen ? -4 : 0,
              }}
              transition={{
                y: SPRING,
                scale: SPRING,
                opacity: deskOpen ? FADE_OUT : { ...FADE_IN, delay: 0.05 },
              }}
              style={{
                pointerEvents: deskOpen ? "none" : "auto",
                willChange: "transform, opacity",
              }}
              aria-hidden={deskOpen}
            >
              <SmallSearch onExpand={handleExpand} ctaLayoutId={CTA_ID} compact />
              <SearchFilters />
            </motion.div>

            {/* Right side - User Controls (hidden on mobile — see logo note) */}
            <div className="hidden sm:flex items-center space-x-3">
              <div className="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center">
                <span className="text-white font-medium text-sm">A</span>
              </div>
              
              <button className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center hover:bg-gray-300 transition-colors">
                <Menu size={16} className="text-gray-600" />
              </button>
            </div>
          </div>
        </div>

        {/* Second row — the /listings-style BigSearch bar (md+ only; mobile
            uses the sheet below). Height springs auto↔0 so the page content
            doesn't jump; overflow stays visible while open so the deep-linked
            dropdown (anchored top-full inside BigSearch) renders in lockstep
            with the expansion — the scrim already covers the page. */}
        <motion.div
          className="hidden md:block"
          initial={false}
          animate={{ height: deskOpen ? "auto" : 0 }}
          transition={{ height: SPRING }}
          style={{
            overflow: deskOpen ? "visible" : "hidden",
            willChange: "height",
          }}
          aria-hidden={!deskOpen}
        >
          {/* Inner layer carries the visual morph: on collapse the bar scales
              down and lifts (transform-origin top center) while fading, so it
              reads as being drawn up into the pill above. */}
          <motion.div
            initial={false}
            animate={{
              opacity: deskOpen ? 1 : 0,
              scale: deskOpen ? 1 : 0.96,
              y: deskOpen ? 0 : -12,
            }}
            transition={{
              scale: SPRING,
              y: SPRING,
              opacity: deskOpen ? { ...FADE_IN, delay: 0.04 } : FADE_OUT,
            }}
            style={{
              transformOrigin: "top center",
              willChange: "transform, opacity",
            }}
            className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-22 pt-2 pb-6"
          >
            <BigSearch
              onClose={collapseDesk}
              isActive={deskOpen}
              openTo={deskSegment}
            />
          </motion.div>
        </motion.div>
      </header>

      {/* ── Sheet — the command expands top-down into one continuous panel ── */}
      <AnimatePresence>
        {isOpen && (
          <React.Fragment>
            {/* Scrim */}
            <motion.div
              key="scrim"
              className="fixed inset-0 z-[60] bg-black/40 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              onClick={closeSheet}
              aria-hidden="true"
            />

            {/* Panel — anchored to the top, springs from BAR_H down to 92vh. */}
            <motion.div
              key="panel"
              className="fixed inset-x-0 top-0 z-[61] md:hidden overflow-hidden rounded-b-[28px] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
              initial={{ height: BAR_H }}
              animate={{ height: sheetH }}
              exit={{ height: BAR_H }}
              transition={SPRING}
              role="dialog"
              aria-modal="true"
            >
              {/* Mobile home-page search flow, opened straight on the Where step.
                  Its floating Search button is the shared-layout twin of the
                  collapsed pill's red circle (CTA_ID). */}
              <VerticalSearch
                variant="sheet"
                initialField="location"
                onSearch={closeSheet}
                ctaLayoutId={CTA_ID}
              />

              {/* Bottom grabber — replaces the close icon. Centered so it never
                  overlaps the bottom-end Search button; tap (or pull intent) to
                  dismiss. */}
              <button
                type="button"
                onClick={closeSheet}
                aria-label={isAr ? "إغلاق" : "Close"}
                className="absolute bottom-0 left-1/2 z-40 flex h-12 w-20 -translate-x-1/2 items-end justify-center pb-3"
              >
                <span className="h-1 w-9 rounded-full bg-gray-300" />
              </button>
            </motion.div>
          </React.Fragment>
        )}
      </AnimatePresence>
    </LayoutGroup>
  );
};

export default SearchHeader;
