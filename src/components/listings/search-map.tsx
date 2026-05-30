"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

// Port Sudan — fallback view when there are no geolocated listings.
const FALLBACK_CENTER: [number, number] = [37.2164, 19.6175];

export interface SearchMapMarker {
  id: number | string;
  price: number | null;
  lat: number;
  lng: number;
  title?: string;
}

interface SearchMapProps {
  markers: SearchMapMarker[];
  searchAsIMoveLabel?: string;
}

export default function SearchMap({
  markers,
  searchAsIMoveLabel = "Search as I move the map",
}: SearchMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRefs = useRef<mapboxgl.Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);

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

  // Sync price-bubble markers whenever the listing set changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    markerRefs.current.forEach((m) => m.remove());
    markerRefs.current = [];

    if (markers.length === 0) {
      map.flyTo({ center: FALLBACK_CENTER, zoom: 11 });
      return;
    }

    const bounds = new mapboxgl.LngLatBounds();

    markers.forEach((marker) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className =
        "rounded-full px-1.5 py-0.5 text-xs font-medium bg-white border border-gray-200 shadow-sm h-6 cursor-pointer hover:z-10 hover:border-gray-400 transition";
      el.textContent = marker.price != null ? `$${marker.price}` : "—";
      if (marker.title) el.title = marker.title;

      const mb = new mapboxgl.Marker({ element: el })
        .setLngLat([marker.lng, marker.lat])
        .addTo(map);
      markerRefs.current.push(mb);
      bounds.extend([marker.lng, marker.lat]);
    });

    if (markers.length === 1) {
      const only = markers[0]!;
      map.flyTo({ center: [only.lng, only.lat], zoom: 13 });
    } else {
      map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 0 });
    }
  }, [markers, mapReady]);

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();
  const handleFullscreen = () => {
    void mapContainerRef.current?.requestFullscreen?.();
  };

  return (
    <div className="w-[430px] border-s border-gray-200">
      <div className="sticky top-16 w-[430px] h-[calc(100vh-64px)] bg-gray-100">
        {/* Real Mapbox map. Use explicit h/w — Mapbox forces position:relative on
            its container, which would void `absolute inset-0` sizing. */}
        <div ref={mapContainerRef} className="h-full w-full" />

        {/* Token-missing fallback keeps the panel from looking broken */}
        {!mapboxgl.accessToken && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-xs text-gray-500">
            Map unavailable — set NEXT_PUBLIC_MAPBOX_TOKEN
          </div>
        )}

        {/* "Search as I move the map" checkbox (decorative, matches design) */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-10">
          <div className="bg-white rounded-lg p-2 shadow-lg flex items-center gap-2">
            <Checkbox
              id="search-as-move"
              defaultChecked
              className="border-black bg-black w-3 h-3"
            />
            <label
              htmlFor="search-as-move"
              className="text-xs font-medium text-gray-700"
            >
              {searchAsIMoveLabel}
            </label>
          </div>
        </div>

        {/* Bottom right zoom controls */}
        <div className="absolute bottom-4 right-4 z-10 flex gap-1">
          <Button
            size="icon"
            variant="outline"
            onClick={handleZoomIn}
            className="w-7 h-7 rounded-full bg-white border-gray-200 hover:bg-gray-100"
            aria-label="Zoom in"
          >
            <Plus className="w-3 h-3 text-gray-700" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={handleZoomOut}
            className="w-7 h-7 rounded-full bg-white border-gray-200 hover:bg-gray-100"
            aria-label="Zoom out"
          >
            <Minus className="w-3 h-3 text-gray-700" />
          </Button>
        </div>

        {/* Top right fullscreen button */}
        <Button
          size="icon"
          variant="outline"
          onClick={handleFullscreen}
          className="absolute top-4 right-4 z-10 w-7 h-7 rounded-full bg-white border-gray-200 hover:bg-gray-100"
          aria-label="Fullscreen map"
        >
          <svg
            className="w-2.5 h-2.5 text-gray-700"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"
              strokeWidth="2"
            />
          </svg>
        </Button>
      </div>
    </div>
  );
}
