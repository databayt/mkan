"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Airbnb photo-carousel dots — cloned pixel-for-pixel from the live /s/homes
 * cards (measured 2026-07-04).
 *
 * Anatomy the effect depends on:
 *   • Each dot is a 6px circle with 2.5px side margins → 11px centre-to-centre.
 *   • A fixed-width **viewport** (`min(5, n) × 11px`, `overflow: clip`) shows at
 *     most 5 dots; the inner **track** holds all `n` dots and slides via
 *     `translateX(-ws · 11px)` so the active dot stays as the 3rd slot.
 *   • Dots adjacent to a *scrollable* edge shrink — `scale 0.833` (→5px) one in
 *     from the edge, `scale 0.667` (→4px) at/over it. The end that can't scroll
 *     stays full size, which is what makes only the "more photos this way" side
 *     taper off.
 *
 * `ws = clamp(active − 2, 0, max(0, n − 5))`. When `n ≤ 5` nothing scrolls and
 * every dot renders at full size, so the same code handles short galleries.
 */

const DOT = 6; // px, dot diameter
const SPACE = 11; // px, centre-to-centre (6 + 2.5 + 2.5)
const WINDOW = 5; // max dots visible before the track starts sliding

export function CarouselDots({
  count,
  active,
  className,
}: {
  count: number;
  active: number;
  className?: string;
}) {
  if (count <= 1) return null;

  const visible = Math.min(count, WINDOW);
  // Window start: keep the active dot in the 3rd slot until the track hits an end.
  const ws = Math.max(0, Math.min(active - 2, count - WINDOW));
  const canScrollLeft = ws > 0;
  const canScrollRight = ws < count - WINDOW;

  const scaleFor = (i: number): number => {
    const d = i - ws; // slot position within the visible window
    if (canScrollRight && d >= visible - 1) return 0.6667;
    if (canScrollRight && d === visible - 2) return 0.8333;
    if (canScrollLeft && d <= 0) return 0.6667;
    if (canScrollLeft && d === 1) return 0.8333;
    return 1;
  };

  return (
    <div
      className={cn("overflow-clip", className)}
      style={{ width: visible * SPACE }}
      aria-hidden
    >
      <div
        className="flex items-center will-change-transform"
        style={{
          transform: `translateX(-${ws * SPACE}px)`,
          transition: "transform 250ms ease",
        }}
      >
        {Array.from({ length: count }).map((_, i) => (
          <span
            key={i}
            className="flex-none rounded-full"
            style={{
              width: DOT,
              height: DOT,
              margin: "0 2.5px",
              backgroundColor:
                i === active ? "#ffffff" : "rgba(255,255,255,0.6)",
              transform: `scale(${scaleFor(i)})`,
              transition: "transform 250ms ease, background-color 250ms ease",
            }}
          />
        ))}
      </div>
    </div>
  );
}
