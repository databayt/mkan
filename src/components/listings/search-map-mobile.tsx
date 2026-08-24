"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Heart, Star } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocale } from "@/components/internationalization/use-locale";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { formatCurrency, formatNumber } from "@/lib/i18n/formatters";
import { PropertyImageFallback } from "@/components/atom/property-image-fallback";
import type { MapBounds } from "./search-provider";
import type { Listing } from "@/types/listing";
import { listingSegment } from "@/lib/listing-code";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

// Port Sudan — fallback view when there are no geolocated listings.
const FALLBACK_CENTER: [number, number] = [37.2164, 19.6175];

interface SearchMapMobileProps {
  listings: Listing[];
  nights?: number;
  datesLabel?: string;
  searchAsIMoveLabel?: string;
  /** Fired with the viewport box after a USER pan/zoom (not programmatic moves). */
  onBoundsChange?: (b: MapBounds) => void;
  searchAsMove?: boolean;
  onSearchAsMoveChange?: (v: boolean) => void;
  /** Distance from the top of the viewport where the overlay starts (below the header). */
  top?: number;
  /**
   * `full` — the bottom-button full-screen map: interactive, with the synced
   *   card carousel + "search as I move" toggle.
   * `preview` — the strip pinned at the top of the results that the homes list
   *   scrolls over: non-interactive (vertical swipes scroll the page), no
   *   carousel; tapping anywhere calls `onExpand` to open the full map.
   */
  variant?: "full" | "preview";
  /** Preview only — open the full-screen map. */
  onExpand?: () => void;
  /** Preview only — a11y label for the tap-to-expand layer. */
  expandLabel?: string;
}

// Style a price pin for its selected / unselected state. Airbnb enlarges the
// active pin to a black bubble; the rest stay white.
function paintPin(el: HTMLButtonElement, selected: boolean) {
  el.style.backgroundColor = selected ? "#222222" : "#ffffff";
  el.style.color = selected ? "#ffffff" : "#222222";
  el.style.borderColor = selected ? "#222222" : "rgba(0,0,0,0.1)";
  el.style.transform = selected ? "scale(1.08)" : "scale(1)";
  el.style.zIndex = selected ? "10" : "1";
}

export default function SearchMapMobile({
  listings,
  nights,
  datesLabel,
  searchAsIMoveLabel = "Search as I move the map",
  onBoundsChange,
  searchAsMove = true,
  onSearchAsMoveChange,
  top = 64,
  variant = "full",
  onExpand,
  expandLabel,
}: SearchMapMobileProps) {
  const isFull = variant === "full";
  const router = useRouter();
  const { locale } = useLocale();
  const dict = useDictionary();
  const sp = dict.rental?.searchPage as Record<string, string> | undefined;
  const card = dict.rental?.property?.card as Record<string, string> | undefined;

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<{ id: string; marker: mapboxgl.Marker; el: HTMLButtonElement }[]>([]);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);

  // The listing whose pin is highlighted and whose card the carousel is on.
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  // Guards mirroring the desktop map: fit once, never yank the user's viewport;
  // swallow the moveend from our own programmatic fit so it can't echo a search.
  const didInitialFit = useRef(false);
  const suppressNextMoveEnd = useRef(false);
  const onBoundsChangeRef = useRef(onBoundsChange);
  onBoundsChangeRef.current = onBoundsChange;

  // Only listings we can place on the map appear as pins + carousel cards.
  const placed = listings.filter(
    (l) => l.location?.latitude != null && l.location?.longitude != null
  );
  // Latest `placed` reachable from the stable (deps-free) callbacks below.
  const placedRef = useRef(placed);
  placedRef.current = placed;

  // Center the map on a listing and scroll the carousel card into view. Used by
  // both directions (pin tap → carousel, carousel swipe → pin highlight).
  const focusListing = useCallback((id: string, opts?: { pan?: boolean; scroll?: boolean }) => {
    setActiveId(id);
    const map = mapRef.current;
    const l = placedRef.current.find((p) => String(p.id) === id);
    if (opts?.pan && map && l?.location) {
      suppressNextMoveEnd.current = true;
      map.easeTo({ center: [l.location.longitude, l.location.latitude], duration: 350 });
    }
    if (opts?.scroll) {
      const el = carouselRef.current?.querySelector<HTMLElement>(`[data-card-id="${id}"]`);
      el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize the map once.
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current || !mapboxgl.accessToken) return;

    const first = placed[0];
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: first?.location
        ? [first.location.longitude, first.location.latitude]
        : FALLBACK_CENTER,
      zoom: first ? 12 : 11,
      attributionControl: false,
      // Preview is a passive strip — let vertical swipes scroll the page (so the
      // homes list rises over it) and route taps to onExpand instead of panning.
      interactive: isFull,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }));

    map.on("load", () => {
      map.resize();
      setMapReady(true);
    });

    map.on("moveend", () => {
      if (suppressNextMoveEnd.current) {
        suppressNextMoveEnd.current = false;
        return;
      }
      const b = map.getBounds();
      if (!b) return;
      onBoundsChangeRef.current?.({
        minLat: b.getSouth(),
        maxLat: b.getNorth(),
        minLng: b.getWest(),
        maxLng: b.getEast(),
      });
    });

    mapRef.current = map;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(mapContainerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (Re)build price-bubble markers whenever the placed set changes. Auto-fit
  // only on the first non-empty set so the user's viewport is preserved after.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Tear down the previous render's markers, then rebuild.
    markersRef.current.forEach(({ marker }) => marker.remove());
    markersRef.current = [];

    if (placed.length === 0) {
      if (!didInitialFit.current) {
        suppressNextMoveEnd.current = true;
        map.flyTo({ center: FALLBACK_CENTER, zoom: 11, duration: 0 });
      }
      return;
    }

    const bounds = new mapboxgl.LngLatBounds();
    placed.forEach((l) => {
      const id = String(l.id);
      const el = document.createElement("button");
      el.type = "button";
      el.className =
        "flex items-center h-8 rounded-full px-3 text-sm font-semibold border shadow-md cursor-pointer transition";
      el.textContent =
        l.pricePerNight != null ? formatCurrency(l.pricePerNight, locale) : "—";
      if (l.title) el.title = l.title;
      paintPin(el, id === activeIdRef.current);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        focusListing(id, { pan: true, scroll: true });
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([l.location!.longitude, l.location!.latitude])
        .addTo(map);
      markersRef.current.push({ id, marker, el });
      bounds.extend([l.location!.longitude, l.location!.latitude]);
    });

    if (!didInitialFit.current) {
      didInitialFit.current = true;
      suppressNextMoveEnd.current = true;
      if (placed.length === 1) {
        const only = placed[0]!;
        map.flyTo({ center: [only.location!.longitude, only.location!.latitude], zoom: 13, duration: 0 });
      } else {
        map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 0 });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed.map((l) => l.id).join(","), mapReady, locale]);

  // Repaint pins whenever the active listing changes.
  useEffect(() => {
    markersRef.current.forEach(({ id, el }) => paintPin(el, id === activeId));
  }, [activeId]);

  // Carousel swipe → highlight the centered card's pin + ease the map to it.
  const onCarouselScroll = useCallback(() => {
    const container = carouselRef.current;
    if (!container) return;
    const mid = container.getBoundingClientRect().left + container.clientWidth / 2;
    let bestId: string | null = null;
    let bestDist = Infinity;
    container.querySelectorAll<HTMLElement>("[data-card-id]").forEach((childEl) => {
      const r = childEl.getBoundingClientRect();
      const dist = Math.abs(r.left + r.width / 2 - mid);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = childEl.dataset.cardId ?? null;
      }
    });
    if (bestId && bestId !== activeIdRef.current) {
      focusListing(bestId, { pan: true, scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasToken = Boolean(mapboxgl.accessToken);

  return (
    <div
      className={
        isFull
          ? "fixed inset-x-0 bottom-0 z-40 bg-background lg:hidden"
          : "h-full w-full"
      }
      style={isFull ? { top } : undefined}
    >
      <div className="relative h-full w-full">
        {/* Map canvas */}
        <div ref={mapContainerRef} className="h-full w-full" />

        {!hasToken && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-xs text-gray-500">
            {dict?.search?.map?.unavailable ?? "Map unavailable — set NEXT_PUBLIC_MAPBOX_TOKEN"}
          </div>
        )}

        {/* Preview: a transparent tap layer over the whole strip. A tap opens the
            full map; vertical swipes fall through to the page (it doesn't
            preventDefault), so the homes list still scrolls up over the map. */}
        {!isFull && (
          <button
            type="button"
            onClick={onExpand}
            aria-label={expandLabel ?? "Open map"}
            className="absolute inset-0 z-10 cursor-pointer"
          />
        )}

        {/* "Search as I move the map" toggle (functional) — full map only */}
        {isFull && (
        <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2 w-max max-w-[calc(100vw-16px)]">
          <label
            htmlFor="search-as-move-mobile"
            className="flex cursor-pointer items-center gap-2 rounded-full bg-white px-3.5 py-2.5 shadow-md"
          >
            <Checkbox
              id="search-as-move-mobile"
              checked={searchAsMove}
              onCheckedChange={(v) => onSearchAsMoveChange?.(v === true)}
              className="h-4 w-4 shrink-0 border-gray-500 data-[state=checked]:border-black data-[state=checked]:bg-black"
            />
            {/* One line always — the label wrapping under the checkbox read as
                broken; 13px keeps the longest (Arabic) copy inside a 360px
                viewport with room to spare. */}
            <span className="whitespace-nowrap text-[13px] font-medium text-gray-800">{searchAsIMoveLabel}</span>
          </label>
        </div>
        )}

        {/* Bottom card carousel — one card peeks; swipe syncs the active pin.
            Sits above the floating Map/List toggle (which is rendered by the
            results area at a higher layer). Full map only. */}
        {isFull && placed.length > 0 && (
          <div
            ref={carouselRef}
            onScroll={onCarouselScroll}
            className="no-scrollbar absolute inset-x-0 z-10 flex gap-3 overflow-x-auto px-4"
            style={{
              bottom: 84,
              scrollSnapType: "x mandatory",
              scrollPaddingInline: 16,
              WebkitOverflowScrolling: "touch",
            }}
          >
            {placed.map((l) => {
              const id = String(l.id);
              const price = l.pricePerNight ?? 0;
              const discountPct =
                nights && nights >= 28
                  ? l.monthlyDiscount ?? 0
                  : nights && nights >= 7
                  ? l.weeklyDiscount ?? 0
                  : 0;
              const baseTotal = nights ? price * nights : price;
              const total =
                discountPct > 0 ? Math.round(baseTotal * (1 - discountPct / 100)) : baseTotal;
              const priceNumber =
                nights && total != null
                  ? formatCurrency(total, locale)
                  : formatCurrency(price, locale);
              const priceSuffix =
                nights != null
                  ? (sp?.forNights ?? "for {count} nights").replace("{count}", String(nights))
                  : (card?.night ?? "night");
              const hasRating = l.averageRating != null && (l.numberOfReviews ?? 0) > 0;
              const photos = l.photoUrls ?? [];

              return (
                <button
                  key={id}
                  type="button"
                  data-card-id={id}
                  // `id` here is the row id — it keys the map markers. The
                  // route wants the code.
                  onClick={() => router.push(`/${locale}/listings/${listingSegment(l)}`)}
                  className="shrink-0 overflow-hidden rounded-2xl bg-white text-start shadow-lg"
                  style={{
                    flex: "0 0 calc(100% - 48px)",
                    scrollSnapAlign: "center",
                    boxShadow: "0 6px 20px rgba(0,0,0,0.16)",
                  }}
                >
                  <div className="flex items-stretch">
                    {/* Thumbnail */}
                    <div className="relative h-[110px] w-[110px] shrink-0 bg-muted">
                      {photos.length > 0 ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photos[0]}
                          alt={l.title ?? ""}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <PropertyImageFallback seed={id} alt={l.title ?? ""} />
                      )}
                      <span className="absolute top-2 end-2 grid h-7 w-7 place-items-center">
                        <Heart
                          className="h-5 w-5"
                          style={{ fill: "rgba(0,0,0,0.5)", color: "#ffffff" }}
                          strokeWidth={2}
                        />
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="truncate font-medium"
                          style={{ fontSize: 14, color: "#222222" }}
                        >
                          {l.title}
                        </span>
                        {hasRating && (
                          <span
                            className="flex shrink-0 items-center gap-1"
                            style={{ fontSize: 13, color: "#222222" }}
                          >
                            <Star className="h-3 w-3" style={{ fill: "#222222", color: "#222222" }} />
                            {formatNumber(l.averageRating as number, locale, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        )}
                      </div>
                      {l.location?.city && (
                        <span className="truncate" style={{ fontSize: 13, color: "#6a6a6a" }}>
                          {sp?.entireHome ?? "Entire home in"} {l.location.city}
                        </span>
                      )}
                      {datesLabel && (
                        <span className="truncate" style={{ fontSize: 13, color: "#6a6a6a" }}>
                          {datesLabel}
                        </span>
                      )}
                      <span style={{ fontSize: 14, color: "#222222" }}>
                        <span className="font-semibold underline underline-offset-2">
                          {priceNumber}
                        </span>{" "}
                        <span style={{ color: "#6a6a6a" }}>{priceSuffix}</span>
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
