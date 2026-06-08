"use client";

import React, { useEffect, useCallback, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import BigSearch from "@/components/template/search/big-search";
import SmallSearch from "@/components/template/search/small-search";
import useSearchHeaderStore from "@/hooks/useSearchHeaderStore";

// Soft spring for layout motion (height, transform). Damping sits just shy of
// critical so the row settles without bounce — feels poised, not springy.
// Used everywhere except opacity; springs on opacity produce a subtle
// luminance wobble the eye reads as flicker.
const SPRING = {
  type: "spring" as const,
  stiffness: 320,
  damping: 40,
  mass: 1,
  restDelta: 0.001,
} as const;

// Opacity rides a plain tween. The curve is the iOS standard ease —
// gentle accel/decel that matches the spring's perceived rhythm without
// fighting it. Duration is asymmetric: faster on collapse so the page
// feels responsive when you scroll down, slower on expand so the search
// feels deliberate when you scroll back up.
const FADE_IN = { duration: 0.26, ease: [0.32, 0.72, 0, 1] as const };
const FADE_OUT = { duration: 0.18, ease: [0.32, 0.72, 0, 1] as const };

// Hysteresis band prevents flicker when the user hovers near the threshold.
// Collapse once we pass COLLAPSE_AT, re-expand only after we come back under EXPAND_AT.
const COLLAPSE_AT = 80;
const EXPAND_AT = 20;

const ListingsHeader = () => {
  const pathname = usePathname();
  const {
    isExpanded,
    isOverlayActive,
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

  const navigationItems = [
    { name: "Homes", href: "#" },
    { name: "Experiences", href: "#" },
    { name: "Services", href: "#" },
  ];

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

  const handleSmallSearchClick = useCallback(() => {
    expandFromSmallSearch();
  }, [expandFromSmallSearch]);

  const handleOverlayClick = useCallback(() => {
    collapse();
  }, [collapse]);

  const isActiveRoute = (href: string) => pathname === href;

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
        className={`bg-muted sticky top-0 z-50 transition-shadow duration-300 ${
          isOverlayActive ? "shadow-xl" : "border-b"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Top row — Logo, Nav/SmallSearch, User. Height was h-14 (56px)
              with only top-padding, which crammed the small-search against
              the row border in the collapsed state. Bumping to min-h-[80px]
              with symmetric py-4 gives the small-search the breathing room
              it needs once the BigSearch row collapses away. */}
          <div className="relative flex items-center min-h-[80px] py-4">
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
              <motion.nav
                className="flex space-x-8 absolute"
                initial={false}
                animate={{
                  opacity: isExpanded ? 1 : 0,
                  y: isExpanded ? 0 : -10,
                }}
                transition={{
                  y: SPRING,
                  opacity: isExpanded
                    ? { ...FADE_IN, delay: 0.08 }
                    : FADE_OUT,
                }}
                style={{
                  pointerEvents: isExpanded ? "auto" : "none",
                  willChange: "transform, opacity",
                }}
                aria-hidden={!isExpanded}
              >
                {navigationItems.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    tabIndex={isExpanded ? 0 : -1}
                    className={`relative text-sm font-medium transition-colors ${
                      isActiveRoute(item.href)
                        ? "text-gray-900 border-b-2 border-gray-900 pb-0.5"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {item.name}
                  </Link>
                ))}
              </motion.nav>

              <motion.div
                className="absolute"
                initial={false}
                animate={{
                  opacity: isExpanded ? 0 : 1,
                  scale: isExpanded ? 0.94 : 1,
                  y: isExpanded ? 10 : 0,
                }}
                transition={{
                  y: SPRING,
                  scale: SPRING,
                  opacity: isExpanded
                    ? FADE_OUT
                    : { ...FADE_IN, delay: 0.08 },
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
            <div className="flex items-center justify-end space-x-2 w-1/3">
              <div className="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center">
                <span className="text-white font-medium text-sm">A</span>
              </div>

              <button className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center hover:bg-gray-300 transition-colors">
                <Menu size={16} className="text-gray-600" />
              </button>
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
          animate={{
            height: isExpanded ? "auto" : 0,
            opacity: isExpanded ? 1 : 0,
          }}
          transition={{
            height: SPRING,
            opacity: isExpanded
              ? { ...FADE_IN, delay: 0.04 }
              : FADE_OUT,
          }}
          style={{
            overflow: rowOverflowVisible ? "visible" : "hidden",
            transformOrigin: "top center",
            willChange: "height, opacity",
          }}
          onAnimationStart={() => setRowOverflowVisible(false)}
          onAnimationComplete={() => setRowOverflowVisible(isExpanded)}
          aria-hidden={!isExpanded}
        >
          <div className="w-full px-4 sm:px-6 lg:px-32 pt-3 pb-4">
            <BigSearch onClose={handleOverlayClick} isActive={isExpanded} />
          </div>
        </motion.div>
      </header>
    </>
  );
};

export default ListingsHeader;
