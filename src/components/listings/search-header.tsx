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

const BAR_H = 64;
const CTA_ID = "search-page-cta";
const SPRING = {
  type: "spring" as const,
  stiffness: 280,
  damping: 34,
  mass: 1,
} as const;

const SearchHeader = () => {
  const pathname = usePathname();
  const { locale } = useLocale();
  const isAr = locale === 'ar';

  const [isOpen, setIsOpen] = useState(false);
  const [sheetH, setSheetH] = useState(0);

  const openSheet = useCallback(() => {
    if (window.innerWidth >= 768) return;
    setSheetH(Math.round(window.innerHeight * 0.92));
    setIsOpen(true);
  }, []);

  const closeSheet = useCallback(() => setIsOpen(false), []);

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
      <header className="bg-white sticky top-0 z-50 border-b">
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

            {/* Center - Small Search & Filters */}
            <div className="flex items-center justify-center flex-1 sm:mx-8 gap-2 min-w-0">
              <SmallSearch onExpand={openSheet} ctaLayoutId={CTA_ID} />
              <SearchFilters />
            </div>

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
