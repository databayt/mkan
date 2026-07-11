"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Checkbox } from "@/components/ui/checkbox";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import type { MapBounds } from "./search-provider";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

// Port Sudan — fallback view when there are no geolocated listings.
const FALLBACK_CENTER: [number, number] = [37.2164, 19.6175];

// Airbnb control shadows (measured from the live map controls).
const FS_SHADOW = "0 0 0 1px rgba(0,0,0,0.02), 0 8px 24px rgba(0,0,0,0.1)";
const ZOOM_SHADOW =
  "0 0 0 1px rgba(0,0,0,0.02), 0 2px 6px rgba(0,0,0,0.04), 0 4px 8px rgba(0,0,0,0.1)";
const CONTROL_BG = "rgba(255,255,255,0.925)";

export interface SearchMapMarker {
  id: number | string;
  price: number | null;
  /** Pre-formatted price in the listing currency (e.g. "SDG 185") — matches the
      cards. Falls back to the raw price if absent. */
  priceLabel?: string | null;
  lat: number;
  lng: number;
  title?: string;
}

interface SearchMapProps {
  markers: SearchMapMarker[];
  searchAsIMoveLabel?: string;
  /** Fired with the viewport box after a USER pan/zoom (not programmatic moves). */
  onBoundsChange?: (b: MapBounds) => void;
  /** Controlled "search as I move the map" toggle. */
  searchAsMove?: boolean;
  onSearchAsMoveChange?: (v: boolean) => void;
  /** Pixel offset from the top of the viewport where the sticky map pins. */
  stickyTop?: number;
}

export default function SearchMap({
  markers,
  searchAsIMoveLabel = "Search as I move the map",
  onBoundsChange,
  searchAsMove = true,
  onSearchAsMoveChange,
  stickyTop = 64,
}: SearchMapProps) {
  const dict = useDictionary();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRefs = useRef<mapboxgl.Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);

  // Loop guards: `didInitialFit` makes auto-fit happen exactly once (so a
  // user's panned viewport is never yanked back when new results arrive);
  // `suppressNextMoveEnd` swallows the moveend from our own programmatic
  // fit so it can't echo back as a search.
  const didInitialFit = useRef(false);
  const suppressNextMoveEnd = useRef(false);
  // Keep the latest onBoundsChange reachable from the once-bound listener.
  const onBoundsChangeRef = useRef(onBoundsChange);
  onBoundsChangeRef.current = onBoundsChange;

  // Initialize the map once.
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current || !mapboxgl.accessToken) {
      return;
    }

    const first = markers[0];
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: first ? [first.lng, first.lat] : FALLBACK_CENTER,
      zoom: first ? 12 : 11,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }));

    map.on("load", () => {
      map.resize();
      setMapReady(true);
    });

    // Emit bounds only after a real user gesture. `e.originalEvent` is set for
    // drag / scroll-zoom but undefined for our flyTo/fitBounds; the suppress
    // flag covers button-driven and programmatic moves too.
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

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync price-bubble markers whenever the listing set changes. Auto-fit only
  // on the first non-empty set — afterwards the pins update in place and the
  // map holds the user's chosen viewport.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    markerRefs.current.forEach((m) => m.remove());
    markerRefs.current = [];

    if (markers.length === 0) {
      if (!didInitialFit.current) {
        suppressNextMoveEnd.current = true;
        map.flyTo({ center: FALLBACK_CENTER, zoom: 11, duration: 0 });
      }
      return;
    }

    const bounds = new mapboxgl.LngLatBounds();
    markers.forEach((marker) => {
      const el = document.createElement("button");
      el.type = "button";
      // Airbnb price pill: white, near-black semibold text, soft shadow.
      el.className =
        "flex items-center h-8 rounded-full px-3 text-sm font-semibold bg-white border border-black/10 shadow-md cursor-pointer hover:scale-105 hover:border-black/40 hover:z-10 transition";
      el.style.color = "#222222";
      el.textContent =
        marker.priceLabel ?? (marker.price != null ? `${marker.price}` : "—");
      if (marker.title) el.title = marker.title;

      const mb = new mapboxgl.Marker({ element: el })
        .setLngLat([marker.lng, marker.lat])
        .addTo(map);
      markerRefs.current.push(mb);
      bounds.extend([marker.lng, marker.lat]);
    });

    if (!didInitialFit.current) {
      didInitialFit.current = true;
      suppressNextMoveEnd.current = true;
      if (markers.length === 1) {
        const only = markers[0]!;
        map.flyTo({ center: [only.lng, only.lat], zoom: 13, duration: 0 });
      } else {
        map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 0 });
      }
    }
  }, [markers, mapReady]);

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();
  const handleFullscreen = () => {
    void mapContainerRef.current?.requestFullscreen?.();
  };

  // h-full on the outer wrapper: fill the (tall) grid cell so the sticky child
  // can travel the whole scroll; without it the wrapper shrink-wraps to the map
  // height and the map unpins immediately.
  return (
    <div className="h-full w-full">
      <div
        className="sticky w-full bg-background"
        style={{ top: stickyTop, height: `calc(100vh - ${stickyTop}px)` }}
      >
        <div className="relative h-full w-full rounded-2xl overflow-hidden">
          {/* Real Mapbox map. Explicit h/w — Mapbox forces position:relative. */}
          <div ref={mapContainerRef} className="h-full w-full" />

          {!mapboxgl.accessToken && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-xs text-gray-500">
              {dict?.search?.map?.unavailable ?? "Map unavailable — set NEXT_PUBLIC_MAPBOX_TOKEN"}
            </div>
          )}

          {/* "Search as I move the map" toggle (functional). */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
            <label
              htmlFor="search-as-move"
              className="flex cursor-pointer items-center gap-2.5 rounded-full bg-white px-3.5 py-2.5 shadow-md"
            >
              <Checkbox
                id="search-as-move"
                checked={searchAsMove}
                onCheckedChange={(v) => onSearchAsMoveChange?.(v === true)}
                className="h-4 w-4 border-gray-500 data-[state=checked]:border-black data-[state=checked]:bg-black"
              />
              <span className="text-sm font-medium text-gray-800">
                {searchAsIMoveLabel}
              </span>
            </label>
          </div>

          {/* Top-end control stack (Airbnb): fullscreen circle, then zoom pill. */}
          <div className="absolute top-4 end-4 z-10 flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleFullscreen}
              aria-label={dict?.search?.map?.showFullscreen ?? "Show fullscreen map"}
              className="flex h-10 w-10 items-center justify-center rounded-full text-gray-800 transition hover:bg-white"
              style={{ backgroundColor: CONTROL_BG, boxShadow: FS_SHADOW }}
            >
              <svg
                viewBox="0 0 32 32"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                aria-hidden="true"
                className="h-4 w-4"
                style={{ overflow: "visible" }}
              >
                <g fill="none">
                  <path d="m14 29h-10.2c-.4418278 0-.8-.3581722-.8-.8v-10.2" />
                  <path d="m4 28 10-10" />
                  <g strokeLinejoin="round">
                    <path d="m18 3h10c.5522847 0 1 .44771525 1 1v10" />
                    <path d="m18 14 11-11" />
                  </g>
                </g>
              </svg>
            </button>

            <div
              className="flex flex-col overflow-hidden"
              style={{ backgroundColor: CONTROL_BG, boxShadow: ZOOM_SHADOW, borderRadius: 20 }}
            >
              <button
                type="button"
                onClick={handleZoomIn}
                aria-label={dict?.search?.map?.zoomIn ?? "Zoom in"}
                className="flex h-10 w-10 items-center justify-center text-gray-800 transition-colors hover:bg-gray-100/70"
              >
                <svg viewBox="0 0 16 16" height="16" width="16" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" clipRule="evenodd" d="M7 1a1 1 0 0 1 2 0v14a1 1 0 1 1-2 0V1z" />
                  <path fillRule="evenodd" clipRule="evenodd" d="M0 8a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H1a1 1 0 0 1-1-1z" />
                </svg>
              </button>
              <div className="mx-auto h-px w-7 bg-gray-200" />
              <button
                type="button"
                onClick={handleZoomOut}
                aria-label={dict?.search?.map?.zoomOut ?? "Zoom out"}
                className="flex h-10 w-10 items-center justify-center text-gray-800 transition-colors hover:bg-gray-100/70"
              >
                <svg viewBox="0 0 16 16" height="16" width="16" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" clipRule="evenodd" d="M0 8a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H1a1 1 0 0 1-1-1z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
