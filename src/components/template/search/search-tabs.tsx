"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { useDictionary } from "@/components/internationalization/dictionary-context";

interface SearchTabsProps {
  className?: string;
}

interface TabDef {
  id: string;
  label: string;
  /** Static 3D poster (original Airbnb art, transparent PNG). */
  icon: string;
  /** Shows the dark "NEW" pill at the icon's top-trailing corner. */
  isNew?: boolean;
}

// The underline rides a near-critical spring so it slides under the newly
// selected tab and settles without bounce. Because it carries a `layoutId`,
// Framer interpolates both its x position AND its width between tabs — that
// width interpolation is the signature Airbnb "stretch and snap" of the
// indicator as it travels across labels of different lengths.
const UNDERLINE_SPRING = {
  type: "spring" as const,
  stiffness: 360,
  damping: 32,
  mass: 1,
} as const;

export default function SearchTabs({ className = "" }: SearchTabsProps) {
  const dict = useDictionary();

  // Labels are dictionary-driven (Airbnb ships product names here); the 3D
  // icons are the original search-bar arts fetched from Airbnb's CDN and
  // served locally as transparent PNGs.
  const tabs: TabDef[] = [
    { id: "homes", label: dict.search?.homes ?? "Homes", icon: "/images/search/homes.png" },
    {
      id: "experiences",
      label: dict.search?.experiences ?? "Experiences",
      icon: "/images/search/experiences.png",
      isNew: true,
    },
    {
      id: "services",
      label: dict.search?.services ?? "Services",
      icon: "/images/search/services.png",
      isNew: true,
    },
  ];

  const [active, setActive] = useState(tabs[0]!.id);
  const newLabel = dict.search?.newBadge ?? "NEW";

  return (
    <div
      className={`flex items-center gap-6 ${className}`}
      role="tablist"
      aria-label="Search categories"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => setActive(tab.id)}
            className="group relative flex items-center gap-1 rounded-full px-1 pb-2.5 pt-1 outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
          >
            {/* 3D icon + optional NEW badge. Inline styles are used for the
                icon size and the badge because Tailwind v4's on-demand scan
                doesn't reliably emit brand-new arbitrary utilities in dev
                (same workaround the rest of the search bar uses). `insetInlineEnd`
                keeps the badge mirrored under RTL so it never hits the label. */}
            <span className="relative block">
              <Image
                src={tab.icon}
                alt=""
                width={64}
                height={58}
                priority
                draggable={false}
                style={{ height: 48, width: "auto" }}
                className="select-none transition-transform duration-300 ease-out group-hover:-translate-y-0.5 group-hover:scale-105"
              />
              {tab.isNew && (
                <span
                  style={{
                    position: "absolute",
                    top: -2,
                    insetInlineEnd: -11,
                    backgroundColor: "#3b4d6d",
                    color: "#ffffff",
                    fontSize: 9,
                    fontWeight: 700,
                    lineHeight: "12px",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    padding: "1px 5px",
                    borderRadius: 9999,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
                    pointerEvents: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {newLabel}
                </span>
              )}
            </span>

            <span
              style={{ fontSize: 14, lineHeight: "18px" }}
              className={`relative z-10 whitespace-nowrap font-medium transition-colors duration-200 ${
                isActive
                  ? "text-[#222222]"
                  : "text-[#6a6a6a] group-hover:text-[#222222]"
              }`}
            >
              {tab.label}
            </span>

            {/* Sliding active indicator — spans the full tab (icon + label),
                pinned to the bottom edge. Captured: ~2px tall, #222222. */}
            {isActive && (
              <motion.span
                layoutId="search-tab-underline"
                aria-hidden
                className="absolute inset-x-1 bottom-0 z-10 h-0.5 rounded-full bg-[#222222]"
                transition={UNDERLINE_SPRING}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
