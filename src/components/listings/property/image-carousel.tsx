"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { PropertyImage } from "@/components/atom/property-image";
import { CarouselDots } from "./carousel-dots";

/**
 * Optimised home-card image carousel — the same physical control Airbnb uses on
 * its search cards.
 *
 * Optimisations vs. a naive "swap the <img> src on arrow click":
 *   • **Native scroll-snap strip** — real momentum swipe on touch, no custom
 *     drag math, GPU-smooth. Matches the house pattern in mobile-listing-details.
 *   • **Neighbour-windowed loading** — only the active slide and its two
 *     neighbours get a real `src`; the rest stay on the blur/fallback until you
 *     approach them. Caps a card at ~3 image requests instead of N, while still
 *     preloading the next slide so a swipe never lands on an empty frame.
 *   • **Per-surface `sizes`/`quality` + blur LQIP** come free via PropertyImage.
 *
 * The strip is deliberately `dir="ltr"` so `scrollLeft` math is sign-stable in
 * both locales; photos are order-neutral, so swiping the same physical way in
 * Arabic is correct. Arrows therefore use physical left/right (a media control,
 * not reading-order chrome).
 */
export interface ImageCarouselProps {
  images: string[];
  alt: string;
  seed?: string;
  priority?: boolean;
  /** Corner radius (px) of the rounded media box. */
  radius?: number;
  className?: string;
  /** Overlays rendered on top of the images (e.g. the favourite heart). */
  children?: React.ReactNode;
  prevLabel?: string;
  nextLabel?: string;
}

export function ImageCarousel({
  images,
  alt,
  seed,
  priority = false,
  radius = 12,
  className,
  children,
  prevLabel = "Previous photo",
  nextLabel = "Next photo",
}: ImageCarouselProps) {
  const hasPhotos = images.length > 0;
  // One fallback slide when there are no photos, so the box still renders.
  const slides: (string | undefined)[] = hasPhotos ? images : [undefined];
  const count = slides.length;
  const multi = count > 1;

  const [index, setIndex] = React.useState(0);
  // Slides whose real image has been mounted. Starts at just the first frame
  // (one request per card on initial paint); grows to cover the active slide
  // and its neighbours as the user hovers/swipes, and never shrinks — so
  // returning to an earlier photo is instant instead of re-fetching.
  const [seen, setSeen] = React.useState<Set<number>>(() => new Set([0]));
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const rafRef = React.useRef<number | null>(null);

  const reveal = React.useCallback(
    (center: number) => {
      setSeen((prev) => {
        let next: Set<number> | null = null;
        for (const i of [center - 1, center, center + 1]) {
          if (i >= 0 && i < count && !prev.has(i)) {
            (next ??= new Set(prev)).add(i);
          }
        }
        return next ?? prev;
      });
    },
    [count],
  );

  const onScroll = React.useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const el = scrollerRef.current;
      if (!el || el.clientWidth === 0) return;
      const idx = Math.round(el.scrollLeft / el.clientWidth);
      setIndex((prev) =>
        prev === idx ? prev : Math.max(0, Math.min(idx, count - 1)),
      );
    });
  }, [count]);

  // Mount neighbours as soon as the active slide changes, so the next frame is
  // ready before a swipe/arrow lands on it. Skips the initial mount so a fresh
  // card paints exactly one image — neighbours wait for hover/touch/swipe.
  const mountedRef = React.useRef(false);
  React.useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    reveal(index);
  }, [index, reveal]);

  React.useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const goTo = (e: React.MouseEvent, i: number) => {
    e.preventDefault();
    e.stopPropagation();
    const el = scrollerRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(i, count - 1));
    reveal(clamped);
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
  };

  const shouldLoad = (i: number) => seen.has(i);

  return (
    <div
      className={cn(
        "group relative w-full overflow-hidden bg-muted",
        className,
      )}
      style={{ aspectRatio: "4 / 3", borderRadius: radius }}
      onPointerEnter={multi ? () => reveal(index) : undefined}
      onTouchStart={multi ? () => reveal(index) : undefined}
    >
      <div
        ref={scrollerRef}
        onScroll={multi ? onScroll : undefined}
        dir="ltr"
        className={cn(
          "no-scrollbar flex h-full w-full overscroll-x-contain",
          multi ? "snap-x snap-mandatory overflow-x-auto" : "overflow-hidden",
        )}
      >
        {slides.map((src, i) => (
          <div
            key={i}
            className="relative h-full w-full flex-none snap-center"
          >
            {shouldLoad(i) ? (
              <PropertyImage
                src={src}
                alt={alt}
                variant="card"
                priority={priority && i === 0}
                seed={seed}
              />
            ) : (
              // Not yet in the load window — neutral fill that the real photo
              // replaces on demand (no placeholder-illustration flash on swipe).
              <div className="h-full w-full bg-muted" />
            )}
          </div>
        ))}
      </div>

      {/* Arrows — desktop hover only, hidden at the ends (physical L/R: the
          strip is forced LTR, so left = previous in every locale). */}
      {multi && (
        <>
          {index > 0 && (
            <button
              type="button"
              aria-label={prevLabel}
              onClick={(e) => goTo(e, index - 1)}
              className="absolute left-2 top-1/2 hidden h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow-md transition hover:scale-105 hover:bg-white group-hover:grid"
            >
              <ChevronLeft className="h-4 w-4 text-gray-800" />
            </button>
          )}
          {index < count - 1 && (
            <button
              type="button"
              aria-label={nextLabel}
              onClick={(e) => goTo(e, index + 1)}
              className="absolute right-2 top-1/2 hidden h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow-md transition hover:scale-105 hover:bg-white group-hover:grid"
            >
              <ChevronRight className="h-4 w-4 text-gray-800" />
            </button>
          )}

          {/* Dots — centred, with a hairline shadow so white dots read on light photos. */}
          <div
            className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2"
            style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.25))" }}
          >
            <CarouselDots count={count} active={index} />
          </div>
        </>
      )}

      {children}
    </div>
  );
}
