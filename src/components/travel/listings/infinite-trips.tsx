"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TripCard } from "@/components/travel/trip/trip-card";
import { browseTrips, type BrowseTripRow } from "@/lib/actions/travel-actions";
import { useDictionary } from "@/components/internationalization/dictionary-context";

/** Indicator lingers this long once shown, so a fast fetch still reads as
 * "more is loading" rather than a sub-frame flicker. */
const DOTS_MIN_VISIBLE_MS = 600;

/** Airbnb-style three-dot loading indicator (staggered pulse). */
function LoadingDots() {
  const dict = useDictionary();
  return (
    <div
      className="flex items-center gap-1.5"
      role="status"
      aria-label={dict?.travel?.listings?.loadingMore ?? "Loading more"}
    >
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

interface InfiniteTripsProps {
  /** First page already rendered on the server. */
  initialTrips: BrowseTripRow[];
  /** Total upcoming trips across every page. */
  total: number;
  /** How many trips each fetch appends. */
  pageSize: number;
  lang: string;
  cardDictionary: {
    selectSeats: string;
    seatsAvailable: string;
    duration: string;
    verified: string;
  };
}

/**
 * Auto-loading ("infinite scroll") trip list for /travel/listings — the homes
 * `InfiniteListings` pattern for buses. A sentinel near the bottom is watched by
 * an IntersectionObserver; crossing it fetches + appends the next `browseTrips`
 * page until every upcoming trip is loaded. Renders the shared `TripCard`.
 */
export function InfiniteTrips({
  initialTrips,
  total,
  pageSize,
  lang,
  cardDictionary,
}: InfiniteTripsProps) {
  const [items, setItems] = useState<BrowseTripRow[]>(initialTrips);
  const [showDots, setShowDots] = useState(false);
  const loadingRef = useRef(false);
  const pageRef = useRef(1);
  const dotsShownAtRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    },
    [],
  );

  const hasMore = items.length < total;

  const loadMore = useCallback(async () => {
    if (loadingRef.current || items.length >= total) return;
    loadingRef.current = true;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    dotsShownAtRef.current = Date.now();
    setShowDots(true);
    try {
      const nextPage = pageRef.current + 1;
      const result = await browseTrips({ page: nextPage, limit: pageSize });
      if (result.trips.length > 0) {
        pageRef.current = nextPage;
        setItems((prev) => {
          // De-dupe by id: a concurrent departure/booking could shift a trip
          // between pages and resurface one already loaded.
          const seen = new Set(prev.map((p) => p.id));
          const fresh = result.trips.filter((d) => !seen.has(d.id));
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
          DOTS_MIN_VISIBLE_MS - shownFor,
        );
      }
    }
  }, [items.length, pageSize, total]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, hasMore]);

  return (
    <div>
      <div className="grid gap-4">
        {items.map((trip) => (
          <TripCard key={trip.id} trip={trip} lang={lang} dictionary={cardDictionary} />
        ))}
      </div>

      {hasMore && (
        <div ref={sentinelRef} aria-hidden className="flex items-center justify-center py-10">
          {showDots && <LoadingDots />}
        </div>
      )}
    </div>
  );
}
