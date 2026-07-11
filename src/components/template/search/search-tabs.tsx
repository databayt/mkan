"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import useSearchHeaderStore, { type SearchTab } from "@/hooks/useSearchHeaderStore";
import { cdn } from "@/lib/cdn";

interface SearchTabsProps {
  className?: string;
}

interface TabDef {
  id: string;
  label: string;
  /** Resting 3D poster (original Airbnb art, transparent PNG, 240×216). */
  poster: string;
  /** Twirl clip (original Airbnb webm) — plays on hover and on select. */
  webm: string;
  /** Shows the navy "NEW" pill at the icon's top-trailing corner. */
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

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * One tab. Owns its <video> ref so it can replay the twirl on hover and when
 * the tab becomes active — exactly like airbnb.com, where the 3D icon spins
 * once on select/hover and rests on its poster frame otherwise. The poster
 * paints instantly (SSR-safe); the webm is fetched lazily on first play.
 */
function TabButton({
  tab,
  isActive,
  onSelect,
  newLabel,
}: {
  tab: TabDef;
  isActive: boolean;
  onSelect: () => void;
  newLabel: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const playTwirl = () => {
    const v = videoRef.current;
    if (!v || prefersReducedMotion()) return;
    try {
      v.currentTime = 0;
      v.play()?.catch(() => {});
    } catch {
      /* autoplay can reject before a gesture — poster stays, no-op */
    }
  };

  // Twirl the icon when its tab becomes the active one (mirrors the entrance
  // spin Airbnb plays on the selected tab; the component stays mounted across
  // scroll collapse/expand so this fires only on real selection changes).
  useEffect(() => {
    if (isActive) playTwirl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onSelect}
      onMouseEnter={playTwirl}
      // Extra bottom padding clears the active underline below the icon, which
      // renders ~2× its 36px layout box (scale(2), see below) and overflows it.
      style={{ paddingBottom: 22 }}
      className="group relative flex items-center gap-2 rounded-full px-1 pt-1 outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
    >
      {/* 3D twirl icon + optional NEW badge. Replicates airbnb.com's exact
          treatment: a 36×36 object-fit:contain box scaled 2× — the small
          layout box keeps the label tight to the icon while the art renders
          large (the live computed style is width/height:36px + transform
          scale(2)). The element overflows its box on purpose. Inline styles
          because Tailwind v4's dev scan doesn't reliably emit brand-new
          arbitrary utilities. The badge is a non-scaled sibling, so
          `insetInlineEnd` keeps it mirrored at the icon's top-trailing corner
          under RTL without colliding with the label. */}
      <span className="relative block" style={{ width: 36, height: 36 }}>
        <video
          ref={videoRef}
          poster={tab.poster}
          muted
          playsInline
          preload="none"
          width={36}
          height={36}
          draggable={false}
          aria-hidden
          style={{
            width: 36,
            height: 36,
            objectFit: "contain",
            transform: "scale(2)",
            transformOrigin: "center",
          }}
          className="select-none"
        >
          <source src={tab.webm} type="video/webm" />
        </video>

        {tab.isNew && (
          <span
            style={{
              position: "absolute",
              top: -2,
              insetInlineEnd: -16,
              zIndex: 20,
              backgroundColor: "#3b4d6d",
              color: "#ffffff",
              fontSize: 8,
              fontWeight: 700,
              lineHeight: "10px",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              padding: "2px 6px",
              borderRadius: 9999,
              boxShadow: "0 1px 3px rgba(0,0,0,0.22)",
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
          isActive ? "text-[#222222]" : "text-[#6a6a6a] group-hover:text-[#222222]"
        }`}
      >
        {tab.label}
      </span>

      {/* Sliding active indicator — spans the full tab (icon + label), pinned
          to the bottom edge. Captured: ~3px tall, #222222, rounded. */}
      {isActive && (
        <motion.span
          layoutId="search-tab-underline"
          aria-hidden
          style={{ height: 3 }}
          className="absolute inset-x-1 bottom-0 z-10 rounded-full bg-[#222222]"
          transition={UNDERLINE_SPRING}
        />
      )}
    </button>
  );
}

export default function SearchTabs({ className = "" }: SearchTabsProps) {
  const dict = useDictionary();

  // Labels are dictionary-driven (Airbnb ships product names here); the 3D
  // icons are the original search-bar arts (poster PNG + twirl webm) fetched
  // from Airbnb's CDN and served locally.
  const tabs: TabDef[] = [
    {
      id: "homes",
      label: dict.search?.homes ?? "Homes",
      poster: cdn.vendor("airbnb", "homes.png"),
      webm: cdn.vendor("airbnb", "homes.webm"),
    },
    {
      id: "experiences",
      label: dict.search?.experiences ?? "Experiences",
      poster: cdn.vendor("airbnb", "experiences.png"),
      webm: cdn.vendor("airbnb", "experiences.webm"),
      isNew: true,
    },
    {
      id: "services",
      label: dict.search?.services ?? "Services",
      poster: cdn.vendor("airbnb", "services.png"),
      webm: cdn.vendor("airbnb", "services.webm"),
      isNew: true,
    },
  ];

  // Active tab lives in the shared store so BigSearch can react to it
  // (per-tab placeholders + the Services "Type of service" segment).
  const active = useSearchHeaderStore((s) => s.activeTab);
  const setActive = useSearchHeaderStore((s) => s.setActiveTab);
  const newLabel = dict.search?.newBadge ?? "NEW";

  return (
    <div
      // 32px inter-tab gap matches the live header (measured ~33–35px between
      // tab boxes); set inline because gap-8 is a brand-new utility here and
      // Tailwind v4's dev scan can silently drop it.
      style={{ gap: 32 }}
      className={`flex items-center ${className}`}
      role="tablist"
      aria-label={dict?.search?.searchCategories ?? "Search categories"}
    >
      {tabs.map((tab) => (
        <TabButton
          key={tab.id}
          tab={tab}
          isActive={tab.id === active}
          onSelect={() => setActive(tab.id as SearchTab)}
          newLabel={newLabel}
        />
      ))}
    </div>
  );
}
