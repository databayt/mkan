"use client";

import React, { useState, useEffect, useCallback, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu } from "lucide-react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useLocale } from "@/components/internationalization/use-locale";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import TransportBigSearch from "@/components/travel/search/travel-big-search";
import TravelSmallSearch, {
  type TravelSearchField,
} from "@/components/travel/search/travel-small-search";

const BAR_H = 64;
const CTA_ID = "travel-search-cta";
const SPRING = { type: "spring" as const, stiffness: 280, damping: 34, mass: 1 } as const;
const FADE_IN = { duration: 0.22, ease: [0.32, 0.72, 0, 1] as const };
const FADE_OUT = { duration: 0.14, ease: [0.32, 0.72, 0, 1] as const };
const SHEET_OPEN = { type: "spring" as const, stiffness: 240, damping: 28, mass: 1 } as const;
const SHEET_CLOSE = { duration: 0.38, ease: [0.32, 0.72, 0, 1] as const };

interface AssemblyPoint {
  id: number;
  name: string;
  nameAr: string | null;
  city: string;
}

interface TravelSearchHeaderProps {
  assemblyPoints?: AssemblyPoint[];
  initialOrigin?: string;
  initialDestination?: string;
  initialDate?: Date;
  lang?: string;
  /** Summary text for the collapsed pill segments (route / date / seats). */
  searchSummary?: { origin?: string; destination?: string; date?: string; passengers?: string };
  /** Rendered beside the pill on desktop (the travel FiltersPanel). */
  filters?: ReactNode;
}

export default function TravelSearchHeader({
  assemblyPoints = [],
  initialOrigin = "",
  initialDestination = "",
  initialDate,
  lang = "ar",
  searchSummary,
  filters,
}: TravelSearchHeaderProps) {
  const { locale } = useLocale();
  const isAr = locale === "ar";
  const dict = useDictionary();

  const ts = dict?.travel?.search;
  const bigSearchDict = {
    title: `${dict?.travel?.hero?.titleLine1 ?? "Travel Between"}\n${dict?.travel?.hero?.titleLine2 ?? "Cities in Sudan"}`,
    where: ts?.where ?? "Where",
    from: ts?.from ?? "From",
    to: ts?.to ?? "To",
    when: ts?.when ?? "When",
    date: ts?.date ?? "Travel Date",
    search: dict?.common?.search ?? ts?.search ?? "Search",
    selectCity: ts?.selectCity ?? "Add city",
    selectDate: ts?.pickDate ?? "Add date",
    swap: ts?.swap ?? "Swap cities",
    passengers: ts?.passengers ?? "Passengers",
    addPassengers: ts?.addPassengers ?? "Add passengers",
    adults: ts?.adults ?? "Adults",
    adultsAge: ts?.adultsAge ?? "Ages 13+",
    children: ts?.children ?? "Children",
    childrenAge: ts?.childrenAge ?? "Ages 2–12",
    passenger: ts?.passenger ?? "passenger",
    passengersPlural: ts?.passengersPlural ?? "passengers",
  };

  const [isOpen, setIsOpen] = useState(false);
  const [sheetH, setSheetH] = useState(0);
  const [deskOpen, setDeskOpen] = useState(false);
  const [deskField, setDeskField] = useState<TravelSearchField | null>(null);

  const openSheet = useCallback(() => {
    setSheetH(Math.round(window.innerHeight * 0.92));
    setIsOpen(true);
  }, []);

  const closeSheet = useCallback(() => setIsOpen(false), []);
  const collapseDesk = useCallback(() => setDeskOpen(false), []);

  const handleExpand = useCallback(
    (field?: TravelSearchField) => {
      setDeskField(field ?? "origin");
      if (window.innerWidth < 768) {
        openSheet();
        return;
      }
      setDeskOpen(true);
    },
    [openSheet],
  );

  // Mobile sheet: lock body scroll + Escape to close.
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

  // Desktop expansion: lock scroll + reserve the scrollbar gutter so the
  // centered container doesn't shift, and close on Escape.
  useEffect(() => {
    if (!deskOpen) return;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
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

  return (
    <LayoutGroup>
      {/* Desktop scrim — under the header (z-40 < z-50); click collapses. */}
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
          deskOpen ? "shadow-xl" : "md:border-b"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-22">
          <div className="relative flex items-center justify-between h-16">
            {/* Logo (hidden on mobile so the pill gets the full width) */}
            <div className="hidden sm:flex items-center">
              <Link href={`/${lang}/travel`} className="cursor-pointer hover:text-gray-700" scroll={false}>
                <div className="flex items-center gap-2">
                  <Image src="/logo.svg" alt="Mkan" width={20} height={20} className="w-5 h-5" />
                  <div className="text-xl font-bold text-gray-900">
                    {/* i18n-exempt */}
                    Mk<span className="font-light text-gray-600">an</span>
                  </div>
                </div>
              </Link>
            </div>

            {/* Center — collapsed pill + filters. */}
            <motion.div
              className="flex items-center justify-center flex-1 sm:mx-8 gap-0.5 sm:gap-2 min-w-0"
              initial={false}
              animate={{ opacity: deskOpen ? 0 : 1, scale: deskOpen ? 1.06 : 1, y: deskOpen ? -4 : 0 }}
              transition={{
                y: SPRING,
                scale: SPRING,
                opacity: deskOpen ? FADE_OUT : { ...FADE_IN, delay: 0.05 },
              }}
              style={{ pointerEvents: deskOpen ? "none" : "auto", willChange: "transform, opacity" }}
              aria-hidden={deskOpen}
            >
              <TravelSmallSearch
                onExpand={handleExpand}
                ctaLayoutId={CTA_ID}
                compact
                searchValues={searchSummary}
              />
              {filters}
            </motion.div>

            {/* Right — user controls (hidden on mobile) */}
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

        {/* Second row — the desktop BigSearch (md+). Height springs auto↔0. */}
        <motion.div
          className="hidden md:block"
          initial={false}
          animate={{ height: deskOpen ? "auto" : 0 }}
          transition={{ height: SPRING }}
          style={{ overflow: deskOpen ? "visible" : "hidden", willChange: "height" }}
          aria-hidden={!deskOpen}
        >
          <motion.div
            initial={false}
            animate={{ opacity: deskOpen ? 1 : 0, scale: deskOpen ? 1 : 0.96, y: deskOpen ? 0 : -12 }}
            transition={{ scale: SPRING, y: SPRING, opacity: deskOpen ? { ...FADE_IN, delay: 0.04 } : FADE_OUT }}
            style={{ transformOrigin: "top center", willChange: "transform, opacity" }}
            className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-22 pt-2 pb-6 flex justify-center"
          >
            {deskOpen && (
              <TransportBigSearch
                variant="header"
                assemblyPoints={assemblyPoints}
                initialOrigin={initialOrigin}
                initialDestination={initialDestination}
                initialDate={initialDate}
                initialField={deskField}
                key={deskField || "default"}
                onSearch={collapseDesk}
                dictionary={bigSearchDict}
                lang={lang}
              />
            )}
          </motion.div>
        </motion.div>
      </header>

      {/* Mobile sheet — expands top-down into one continuous panel. */}
      <AnimatePresence>
        {isOpen && (
          <React.Fragment>
            <motion.div
              key="scrim"
              className="fixed inset-0 z-[60] bg-black/40 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.4, ease: "easeOut" } }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              onClick={closeSheet}
              aria-hidden="true"
            />
            <motion.div
              key="panel"
              className="fixed inset-x-0 top-0 z-[61] md:hidden overflow-hidden rounded-b-[28px] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
              initial={{ height: BAR_H, opacity: 0 }}
              animate={{
                height: sheetH,
                opacity: 1,
                transition: { height: SHEET_OPEN, opacity: { duration: 0.16, ease: "easeOut" } },
              }}
              exit={{
                height: BAR_H,
                opacity: 0,
                transition: { height: SHEET_CLOSE, opacity: { duration: 0.14, delay: 0.26, ease: "easeIn" } },
              }}
              role="dialog"
              aria-modal="true"
            >
              <motion.div
                className="h-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.06, duration: 0.3, ease: "easeOut" }}
              >
                <TransportBigSearch
                  variant="header"
                  assemblyPoints={assemblyPoints}
                  initialOrigin={initialOrigin}
                  initialDestination={initialDestination}
                  initialDate={initialDate}
                  initialField={deskField}
                  key={deskField || "default"}
                  onSearch={closeSheet}
                  ctaLayoutId={CTA_ID}
                  dictionary={bigSearchDict}
                  lang={lang}
                />
              </motion.div>

              {/* Bottom grabber — tap to dismiss. */}
              <button
                type="button"
                onClick={closeSheet}
                aria-label={dict?.navigation?.close ?? (isAr ? "إغلاق" : "Close")}
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
}
