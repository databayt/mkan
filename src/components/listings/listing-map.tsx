"use client";

// Single-marker Mapbox map for the listing detail page. mapbox-gl touches
// `window` at import time, so this component must only be loaded through
// next/dynamic({ ssr: false }) — see map.tsx / mobile-map.tsx wrappers.

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

export default function ListingMap({
  latitude,
  longitude,
  pinLabel,
  className,
}: ListingMapProps) {
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
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }));

    // Airbnb-style circle instead of an exact pin — listings only reveal the
    // precise address after booking.
    const el = document.createElement("div");
    el.style.cssText =
      "width:48px;height:48px;border-radius:9999px;background:rgba(222,49,81,0.25);border:2px solid #de3151;display:flex;align-items:center;justify-content:center;";
    const dot = document.createElement("div");
    dot.style.cssText = "width:14px;height:14px;border-radius:9999px;background:#de3151;";
    el.appendChild(dot);
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

  if (!mapboxgl.accessToken) {
    return (
      <div
        className={
          className ?? "w-full h-full bg-muted flex items-center justify-center"
        }
      >
        <p className="text-sm text-muted-foreground">
          {pinLabel ?? "Map unavailable"}
        </p>
      </div>
    );
  }

  return <div ref={containerRef} className={className ?? "w-full h-full"} />;
}
