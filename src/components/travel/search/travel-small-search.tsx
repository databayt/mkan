"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { useLocale } from "@/components/internationalization/use-locale";

/** The field the collapsed pill deep-links into when a segment is tapped. */
export type TravelSearchField = "origin" | "destination" | "date" | "passengers";

interface TravelSmallSearchProps {
  /** Opens the big search onto the field the tapped segment maps to. */
  onExpand?: (field?: TravelSearchField) => void;
  /** Summary text for each collapsed segment (origin / destination / date / seats). */
  searchValues?: {
    origin?: string;
    destination?: string;
    route?: string;
    date?: string;
    passengers?: string;
  };
  /**
   * When set, the red search circle becomes a Framer shared-layout element with
   * this id so it can morph into the mobile sheet's Search button (and back).
   */
  ctaLayoutId?: string;
  /** Tighter segment padding so the pill leaves room for the filter button. */
  compact?: boolean;
}

type Seg = "where" | "when" | "who";

/**
 * The collapsed search pill for the travel header — mirroring homes SmallSearch.
 * Uses Anywhere · Any week · Guests as its three core groups.
 */
export default function TravelSmallSearch({
  onExpand,
  searchValues,
  ctaLayoutId,
  compact = false,
}: TravelSmallSearchProps) {
  const dict = useDictionary();
  const { isRTL } = useLocale();
  const [hovered, setHovered] = useState<Seg | null>(null);

  const expand = (field?: TravelSearchField) => onExpand?.(field);

  // A divider is hidden whenever one of its two neighbouring segments is
  // hovered, so the grey hover pill reads as one continuous shape — Airbnb's
  // seam behaviour.
  const dividerHidden = (left: Seg, right: Seg) =>
    hovered === left || hovered === right;

  const segClass = `rounded-[100px] ${compact ? "px-3" : "px-4"} py-2 text-start transition-colors duration-200 hover:bg-[#EBEBEB]`;

  const anywhereLabel = dict?.search?.anywhere ?? "Anywhere";

  const isAnywhere = (val?: string) => {
    if (!val) return true;
    const lower = val.toLowerCase();
    return lower === "anywhere" || lower === "أي مكان" || val === anywhereLabel;
  };

  // Determine displayed text
  const displayedWhere =
    searchValues?.origin && searchValues?.destination && !isAnywhere(searchValues.origin) && !isAnywhere(searchValues.destination)
      ? `${searchValues.origin} ${isRTL ? '←' : '→'} ${searchValues.destination}`
      : searchValues?.origin && !isAnywhere(searchValues.origin)
        ? searchValues.origin
        : searchValues?.destination && !isAnywhere(searchValues.destination)
          ? searchValues.destination
          : anywhereLabel;

  const displayedWhen = searchValues?.date || (dict?.search?.anyWeek ?? "Any week");

  const displayedGuest = searchValues?.passengers || (dict?.search?.guestsLabel ?? "Guests");

  return (
    <div
      className="inline-flex items-center rounded-[100px] border border-[#DDDDDD] bg-white py-1.5 pe-1.5 ps-2 shadow-[rgba(0,0,0,0.02)_0px_0px_0px_1px,rgba(0,0,0,0.1)_0px_8px_24px_0px] transition-shadow duration-200 hover:shadow-[rgba(0,0,0,0.02)_0px_0px_0px_1px,rgba(0,0,0,0.18)_0px_8px_24px_0px] cursor-pointer"
      onClick={() => expand("origin")}
      role="button"
      tabIndex={0}
      aria-label={dict?.search?.openSearch ?? "Open search"}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          expand("origin");
        }
      }}
    >
      {/* Anywhere */}
      <button
        type="button"
        className={segClass}
        aria-label={dict?.search?.searchLocation ?? "Search location"}
        onMouseEnter={() => setHovered("where")}
        onMouseLeave={() => setHovered(null)}
        onClick={(e) => {
          e.stopPropagation();
          expand("origin");
        }}
      >
        <span className="block whitespace-nowrap text-[14px] leading-[18px] font-[500] text-[#222222]">
          {displayedWhere}
        </span>
      </button>

      <span
        className={`h-6 w-px bg-[#DDDDDD] transition-opacity duration-200 ${
          dividerHidden("where", "when") ? "opacity-0" : "opacity-100"
        }`}
      />

      {/* Any week */}
      <button
        type="button"
        className={segClass}
        aria-label={dict?.search?.selectDates ?? "Select dates"}
        onMouseEnter={() => setHovered("when")}
        onMouseLeave={() => setHovered(null)}
        onClick={(e) => {
          e.stopPropagation();
          expand("date");
        }}
      >
        <span className="block whitespace-nowrap text-[14px] leading-[18px] font-[500] text-[#222222]">
          {displayedWhen}
        </span>
      </button>

      <span
        className={`h-6 w-px bg-[#DDDDDD] transition-opacity duration-200 ${
          dividerHidden("when", "who") ? "opacity-0" : "opacity-100"
        }`}
      />

      {/* Guests + search button */}
      <div className="flex items-center ps-1">
        <button
          type="button"
          className={segClass}
          aria-label={dict?.search?.addGuests ?? "Add guests"}
          onMouseEnter={() => setHovered("who")}
          onMouseLeave={() => setHovered(null)}
          onClick={(e) => {
            e.stopPropagation();
            expand("passengers");
          }}
        >
          <span className="block whitespace-nowrap text-[14px] leading-[18px] font-[500] text-[#6a6a6a]">
            {displayedGuest}
          </span>
        </button>

        {ctaLayoutId ? (
          <motion.button
            layoutId={ctaLayoutId}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              expand("origin");
            }}
            aria-label={dict?.search?.searchButton ?? "Search"}
            className="ms-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#FF385C] text-white transition-colors hover:bg-[#E31C5F]"
          >
            <Search className="h-[16px] w-[16px]" />
          </motion.button>
        ) : (
          <Button
            size="icon"
            className="ms-1 h-8 w-8 rounded-[100px] bg-[#FF385C] text-white hover:bg-[#E31C5F]"
            onClick={(e) => {
              e.stopPropagation();
              expand("origin");
            }}
            aria-label={dict?.search?.searchButton ?? "Search"}
          >
            <Search className="h-[16px] w-[16px]" />
          </Button>
        )}
      </div>
    </div>
  );
}
