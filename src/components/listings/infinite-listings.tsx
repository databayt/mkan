"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Listing } from "@/types/listing";
import { PropertyContent } from "./property/content";
import { searchListings } from "@/lib/actions/search-actions";
import { type SearchFilters } from "@/lib/schemas/search-schema";

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
  const [loading, setLoading] = useState(false);
  // Mirror `loading` in a ref so the observer callback can bail on an
  // in-flight fetch without re-subscribing on every state change.
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const hasMore = items.length < total;

  const loadMore = useCallback(async () => {
    if (loadingRef.current || items.length >= total) return;
    loadingRef.current = true;
    setLoading(true);
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
      setLoading(false);
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
          {loading && (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          )}
        </div>
      )}
    </div>
  );
}
