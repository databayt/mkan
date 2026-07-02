"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Listing } from "@/types/listing";
import { PropertyContent } from "./property/content";
import { searchListings } from "@/lib/actions/search-actions";
import { type SearchFilters } from "@/lib/schemas/search-schema";

/** How long the dots stay visible once shown, so a fast fetch still reads as
 * "more is loading" instead of a sub-frame flicker. Content is never delayed —
 * rows append the moment they arrive; only the indicator lingers. */
const DOTS_MIN_VISIBLE_MS = 600;

/** Airbnb-style three-dot loading indicator (staggered pulse). Uses the core
 * `animate-bounce` keyframes — brand-new arbitrary animations can be dropped
 * by the dev scanner, core utilities can't. */
function LoadingDots() {
  return (
    <div className="flex items-center gap-1.5" role="status" aria-label="Loading more">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-foreground/50 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.9s" }}
        />
      ))}
    </div>
  );
}

interface InfiniteListingsProps {
  /** First page already rendered on the server. */
  initialListings: Listing[];
  /** Total rows matching the active filter, across every page. */
  total: number;
  /** How many rows each fetch appends. */
  pageSize: number;
  /**
   * The normalized filters that produced `initialListings`. Re-sent to the
   * `searchListings` server action (with a fresh `skip`) to fetch the next
   * page — keeping the infinite scroll honoring whatever filters are in the URL.
   */
  filters: SearchFilters;
}

/**
 * Auto-loading ("infinite scroll") results list for /listings. Replaces the
 * prev/next pager: a sentinel near the bottom of the grid is watched by an
 * IntersectionObserver, and crossing it fetches + appends the next page until
 * every matching listing is loaded. No buttons, no page param — the user just
 * keeps scrolling, Airbnb-style.
 */
export function InfiniteListings({
  initialListings,
  total,
  pageSize,
  filters,
}: InfiniteListingsProps) {
  const [items, setItems] = useState<Listing[]>(initialListings);
  // `showDots` drives the indicator, decoupled from the fetch itself: it turns
  // on with the fetch but never turns off before DOTS_MIN_VISIBLE_MS, so the
  // user always catches at least one pulse.
  const [showDots, setShowDots] = useState(false);
  // Mirror the in-flight flag in a ref so the observer callback can bail on an
  // in-flight fetch without re-subscribing on every state change.
  const loadingRef = useRef(false);
  const dotsShownAtRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  const hasMore = items.length < total;

  const loadMore = useCallback(async () => {
    if (loadingRef.current || items.length >= total) return;
    loadingRef.current = true;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    dotsShownAtRef.current = Date.now();
    setShowDots(true);
    try {
      const result = await searchListings({
        ...filters,
        take: pageSize,
        skip: items.length,
      });
      if (result.success && result.data.length > 0) {
        setItems((prev) => {
          // De-dupe by id: a concurrent revalidation (60s TTL) could shift
          // rows between pages and resurface one we already have.
          const seen = new Set(prev.map((p) => p.id));
          const fresh = (result.data as Listing[]).filter((d) => !seen.has(d.id));
          return fresh.length > 0 ? [...prev, ...fresh] : prev;
        });
      }
    } finally {
      loadingRef.current = false;
      const shownFor = Date.now() - dotsShownAtRef.current;
      if (shownFor >= DOTS_MIN_VISIBLE_MS) {
        setShowDots(false);
      } else {
        hideTimerRef.current = setTimeout(
          () => setShowDots(false),
          DOTS_MIN_VISIBLE_MS - shownFor
        );
      }
    }
  }, [filters, items.length, pageSize, total]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      // Pre-fetch before the user actually reaches the bottom so the next
      // page is usually already in place by the time they get there.
      { rootMargin: "600px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, hasMore]);

  return (
    <div>
      <PropertyContent properties={items} />

      {hasMore && (
        <div
          ref={sentinelRef}
          aria-hidden
          className="flex items-center justify-center py-10"
        >
          {showDots && <LoadingDots />}
        </div>
      )}
    </div>
  );
}
