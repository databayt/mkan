"use client";

import React, { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useLocale } from "@/components/internationalization/use-locale";
import SmallSearch from "@/components/template/search/small-search";
import VerticalSearch from "@/components/template/search/vertical-search";

// ───────────────────────────────────────────────────────────────────────────
// Mobile listings header (/listings, mobile only — the desktop header is a
// separate component and is intentionally untouched).
//
// COLLAPSED: the exact same compact "Anywhere · Any week · Guests" SmallSearch
// pill used on /search — no category tabs (Homes / Experiences / Services are
// hidden here). Tapping it expands the SHEET.
//
// SHEET: the search command expands top-down into one continuous panel that
// springs from the collapsed bar height down to 85% of the screen. It hosts the
// SAME mobile search flow as the homepage hero (VerticalSearch) opened straight
// on the Where step. There is no close icon — a grabber line sits at the bottom
// (tap to dismiss). Two Framer shared-layout morphs tie it together: the pill's
// red search circle morphs into the sheet's Search button (CTA_ID), and the
// height spring carries the command open into the sheet.
// ───────────────────────────────────────────────────────────────────────────

// Collapsed bar height — the panel springs from here, so the bar appears to
// morph into the sheet as one piece.
const BAR_H = 64;

// Shared-layout id linking the collapsed pill's red circle ↔ the sheet's
// Search button. Both carry it; Framer morphs one into the other.
const CTA_ID = "listings-search-cta";

// Single morph spring drives the top-down expand + collapse (matches the
// desktop header's morph feel: smooth, no bounce).
const SPRING = {
  type: "spring" as const,
  stiffness: 280,
  damping: 34,
  mass: 1,
} as const;

const MobileListingsHeader = () => {
  const { locale } = useLocale();
  const isAr = locale === "ar";

  const [isOpen, setIsOpen] = useState(false);
  // Target sheet height in px, captured at open time (85% of the viewport).
  // Pixels (not "85vh") so Framer can interpolate the height spring.
  const [sheetH, setSheetH] = useState(0);

  const openSheet = useCallback(() => {
    setSheetH(Math.round(window.innerHeight * 0.92));
    setIsOpen(true);
  }, []);

  const closeSheet = useCallback(() => setIsOpen(false), []);

  // Lock body scroll + allow Escape-to-close while the sheet is open.
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

  return (
    <LayoutGroup>
      {/* ── Collapsed bar — same SmallSearch pill as /search, centered ──── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 md:hidden">
        <div className="px-4">
          <div
            className="flex items-center justify-center"
            style={{ height: BAR_H }}
          >
            <SmallSearch onExpand={() => openSheet()} ctaLayoutId={CTA_ID} />
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

export default MobileListingsHeader;
