"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { type SearchSegment } from "@/hooks/useSearchHeaderStore";

interface SmallSearchProps {
  // Receives the big-search dropdown the clicked facet maps to, so the parent
  // can open the big search with that panel already active. Undefined when the
  // pill is clicked on its body (parent defaults to "location").
  onExpand?: (segment?: SearchSegment) => void;
  searchValues?: {
    location?: string;
    dates?: string;
    guests?: string;
  };
  // When set, the red search circle becomes a Framer shared-layout element with
  // this id so it can morph into a matching element elsewhere (the /listings
  // mobile sheet's Search button). Undefined everywhere else → plain button, so
  // /search + the desktop header are unaffected.
  ctaLayoutId?: string;
}

type Seg = "where" | "when" | "who";

export default function SmallSearch({
  onExpand,
  searchValues,
  ctaLayoutId,
}: SmallSearchProps) {
  const dict = useDictionary();
  const [hovered, setHovered] = useState<Seg | null>(null);

  const expand = (segment?: SearchSegment) => onExpand?.(segment);

  // A divider is hidden whenever one of its two neighbouring segments is
  // hovered, so the grey hover pill reads as a single continuous shape
  // instead of being bisected by a hairline — Airbnb's seam behaviour.
  const dividerHidden = (left: Seg, right: Seg) =>
    hovered === left || hovered === right;

  const segClass =
    "rounded-[100px] px-4 py-2 text-start transition-colors duration-200 hover:bg-[#EBEBEB]";

  return (
    <div
      className="inline-flex items-center rounded-[100px] border border-[#DDDDDD] bg-white py-1.5 pe-1.5 ps-2 shadow-[rgba(0,0,0,0.02)_0px_0px_0px_1px,rgba(0,0,0,0.1)_0px_8px_24px_0px] transition-shadow duration-200 hover:shadow-[rgba(0,0,0,0.02)_0px_0px_0px_1px,rgba(0,0,0,0.18)_0px_8px_24px_0px] cursor-pointer"
      onClick={() => expand("location")}
      role="button"
      tabIndex={0}
      aria-label="Open search"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          expand("location");
        }
      }}
    >
      {/* Anywhere — no icon, per spec */}
      <button
        type="button"
        className={segClass}
        aria-label="Search location"
        onMouseEnter={() => setHovered("where")}
        onMouseLeave={() => setHovered(null)}
        onClick={(e) => {
          e.stopPropagation();
          expand("location");
        }}
      >
        <span className="block whitespace-nowrap text-[14px] leading-[18px] font-[500] text-[#222222]">
          {searchValues?.location || (dict.search?.anywhere ?? "Anywhere")}
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
        aria-label="Select dates"
        onMouseEnter={() => setHovered("when")}
        onMouseLeave={() => setHovered(null)}
        onClick={(e) => {
          e.stopPropagation();
          expand("dates");
        }}
      >
        <span className="block whitespace-nowrap text-[14px] leading-[18px] font-[500] text-[#222222]">
          {searchValues?.dates || (dict.search?.anyWeek ?? "Any week")}
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
          aria-label="Add guests"
          onMouseEnter={() => setHovered("who")}
          onMouseLeave={() => setHovered(null)}
          onClick={(e) => {
            e.stopPropagation();
            expand("guests");
          }}
        >
          <span className="block whitespace-nowrap text-[14px] leading-[18px] font-[500] text-[#6a6a6a]">
            {searchValues?.guests || (dict.search?.guestsLabel ?? "Guests")}
          </span>
        </button>

        {ctaLayoutId ? (
          // Shared-layout twin of the /listings sheet's Search button — Framer
          // morphs this circle into that pill (and back) via the matching id.
          <motion.button
            layoutId={ctaLayoutId}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              expand("location");
            }}
            aria-label="Search"
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
              expand("location");
            }}
            aria-label="Search"
          >
            <Search className="h-[16px] w-[16px]" />
          </Button>
        )}
      </div>
    </div>
  );
}
