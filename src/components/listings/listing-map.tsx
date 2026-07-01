"use client";

// Single-marker Mapbox map for the listing detail page, styled to mirror the
// Airbnb "Where you'll be" map: a dark-circle house marker and the original
// Airbnb control glyphs (search, settings, fullscreen, zoom) overlaid on the
// map. mapbox-gl touches `window` at import time, so this component must only be
// loaded through next/dynamic({ ssr: false }) — see map.tsx / mobile-map.tsx.

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

interface ListingMapProps {
  latitude: number;
  longitude: number;
  /** Tooltip text over the pin (e.g. "Exact location provided after booking"). */
  pinLabel?: string;
  className?: string;
}

// Airbnb's dark-circle "your stay" marker (48×48 #222222) with the white house
// glyph (viewBox 0 0 16 16), lifted verbatim from the live map DOM.
const MARKER_HTML =
  '<div style="width:48px;height:48px;border-radius:9999px;background:#222222;box-shadow:0 2px 8px rgba(0,0,0,0.28);display:flex;align-items:center;justify-content:center;">' +
  '<svg viewBox="0 0 16 16" width="22" height="22" aria-hidden="true" style="display:block;fill:#ffffff;">' +
  '<path d="m8.94959955 1.13115419 5.71719515 4.68049298c.2120231.18970472.3332053.46073893.3332053.74524138v7.94311145c0 .2761424-.2238576.5-.5.5h-4.5v-5.5c0-.24545989-.17687516-.44960837-.41012437-.49194433l-.08987563-.00805567h-3c-.27614237 0-.5.22385763-.5.5v5.5h-4.5c-.27614237 0-.5-.2238576-.5-.5v-7.95162536c0-.28450241.12118221-.55553661.3502077-.75978249l5.70008742-4.65820288c.55265671-.45163993 1.34701168-.45132001 1.89930443.00076492z"></path>' +
  "</svg></div>";

// Original Airbnb control glyphs (verbatim from the live map DOM).
const SearchGlyph = () => (
  <svg viewBox="0 0 32 32" aria-hidden="true" style={{ display: "block", height: 16, width: 16, fill: "none", stroke: "#222222", strokeWidth: 4, overflow: "visible" }}>
    <path d="m20.666 20.666 10 10" />
    <path d="m24.0002 12.6668c0 6.2593-5.0741 11.3334-11.3334 11.3334-6.2592 0-11.3333-5.0741-11.3333-11.3334 0-6.2592 5.0741-11.3333 11.3333-11.3333 6.2593 0 11.3334 5.0741 11.3334 11.3333z" fill="none" />
  </svg>
);
const SettingsGlyph = () => (
  <svg viewBox="0 0 32 32" aria-hidden="true" style={{ display: "block", height: 20, width: 20, fill: "none", stroke: "#222222", strokeWidth: 3.2, overflow: "visible" }}>
    <path fill="none" d="M19.38 27a4.14 4.14 0 0 1 3.05-2.54 4.06 4.06 0 0 1 3.17.71 1 1 0 0 0 1.47-.33l2.11-3.64a1 1 0 0 0-.46-1.44 4.1 4.1 0 0 1 0-7.48 1 1 0 0 0 .46-1.44l-2.11-3.66a1 1 0 0 0-1.47-.33 4.07 4.07 0 0 1-3.17.71A4.14 4.14 0 0 1 19.38 5a4 4 0 0 1-.27-1.87 1 1 0 0 0-1-1.15h-4.2a1 1 0 0 0-1 1.15 4.11 4.11 0 0 1-3.34 4.43 4.06 4.06 0 0 1-3.17-.71 1 1 0 0 0-1.47.33l-2.11 3.64a1 1 0 0 0 .46 1.44 4.1 4.1 0 0 1 0 7.48 1 1 0 0 0 .46 1.44l2.11 3.64a1 1 0 0 0 1.47.33 4.06 4.06 0 0 1 3.17-.71 4.1 4.1 0 0 1 3 2.53 4 4 0 0 1 .28 1.88 1 1 0 0 0 1 1.15h4.18a1 1 0 0 0 1-1.15 4 4 0 0 1 .35-1.85zM12 16a4 4 0 1 1 4 4 4 4 0 0 1-4-4z" />
  </svg>
);
const FullscreenGlyph = () => (
  <svg viewBox="0 0 32 32" aria-hidden="true" style={{ display: "block", height: 16, width: 16, fill: "none", stroke: "#222222", strokeWidth: 3, overflow: "visible" }}>
    <g fill="none">
      <path d="m14 29h-10.2c-.4418278 0-.8-.3581722-.8-.8v-10.2" />
      <path d="m4 28 10-10" />
      <g strokeLinejoin="round">
        <path d="m18 3h10c.5522847 0 1 .44771525 1 1v10" />
        <path d="m18 14 11-11" />
      </g>
    </g>
  </svg>
);
const PlusGlyph = () => (
  <svg viewBox="0 0 16 16" height="16" width="16" aria-hidden="true" style={{ display: "block", fill: "#222222" }}>
    <path fillRule="evenodd" clipRule="evenodd" d="M7 1a1 1 0 0 1 2 0v14a1 1 0 1 1-2 0V1z" />
    <path fillRule="evenodd" clipRule="evenodd" d="M0 8a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H1a1 1 0 0 1-1-1z" />
  </svg>
);
const MinusGlyph = () => (
  <svg viewBox="0 0 16 16" height="16" width="16" aria-hidden="true" style={{ display: "block", fill: "#222222" }}>
    <path fillRule="evenodd" clipRule="evenodd" d="M0 8a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H1a1 1 0 0 1-1-1z" />
  </svg>
);

const CIRCLE_BTN =
  "flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.16),0_3px_8px_rgba(0,0,0,0.12)] transition-transform hover:scale-[1.04] active:scale-95";

export default function ListingMap({
  latitude,
  longitude,
  pinLabel,
  className,
}: ListingMapProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (mapRef.current || !containerRef.current || !mapboxgl.accessToken) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [longitude, latitude],
      zoom: 13,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }));

    // Airbnb dark-circle house marker — listings only reveal the precise
    // address after booking, so it marks the general area, not an exact pin.
    const el = document.createElement("div");
    el.innerHTML = MARKER_HTML;
    if (pinLabel) el.title = pinLabel;

    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat([longitude, latitude])
      .addTo(map);

    mapRef.current = map;
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      marker.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFullscreen = () => {
    const node = wrapperRef.current;
    if (!node) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else node.requestFullscreen?.();
  };

  if (!mapboxgl.accessToken) {
    return (
      <div className={className ?? "w-full h-full bg-muted flex items-center justify-center"}>
        <p className="text-sm text-muted-foreground">{pinLabel ?? "Map unavailable"}</p>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className={`relative bg-muted ${className ?? "w-full h-full"}`}>
      <div ref={containerRef} className="h-full w-full" />

      {/* Search (top-start) */}
      <button type="button" aria-label="Find a place on the map" className={`absolute top-4 start-4 z-[1] ${CIRCLE_BTN}`}>
        <SearchGlyph />
      </button>

      {/* Settings (top-end, left of the fullscreen/zoom column) */}
      <button type="button" aria-label="Map settings" className={`absolute top-4 end-[72px] z-[1] ${CIRCLE_BTN}`}>
        <SettingsGlyph />
      </button>

      {/* Fullscreen + Zoom (top-end column) */}
      <div className="absolute top-4 end-4 z-[1] flex flex-col gap-4">
        <button type="button" aria-label="Show fullscreen map" onClick={toggleFullscreen} className={CIRCLE_BTN}>
          <FullscreenGlyph />
        </button>
        <div className="flex w-10 flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.16),0_3px_8px_rgba(0,0,0,0.12)]">
          <button type="button" aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()} className="flex h-10 w-10 items-center justify-center border-b border-[#DDDDDD] transition-colors hover:bg-[#F7F7F7]">
            <PlusGlyph />
          </button>
          <button type="button" aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()} className="flex h-10 w-10 items-center justify-center transition-colors hover:bg-[#F7F7F7]">
            <MinusGlyph />
          </button>
        </div>
      </div>
    </div>
  );
}
