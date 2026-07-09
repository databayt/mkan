"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Checkbox } from "@/components/ui/checkbox";
import { useDictionary } from "@/components/internationalization/dictionary-context";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

// Khartoum & Port Sudan midpoint view shifted up/north.
const FALLBACK_CENTER: [number, number] = [34.89, 18.2];

// Shadows and background matching the listing map styling
const FS_SHADOW = "0 0 0 1px rgba(0,0,0,0.02), 0 8px 24px rgba(0,0,0,0.1)";
const ZOOM_SHADOW =
  "0 0 0 1px rgba(0,0,0,0.02), 0 2px 6px rgba(0,0,0,0.04), 0 4px 8px rgba(0,0,0,0.1)";
const CONTROL_BG = "rgba(255,255,255,0.925)";

export interface AssemblyPoint {
  id: number;
  name: string;
  nameAr: string | null;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  isActive: boolean;
}

interface TravelSearchMapProps {
  assemblyPoints: AssemblyPoint[];
  originId?: number;
  destinationId?: number;
  lang: "en" | "ar";
  onSetOrigin: (id: number) => void;
  onSetDestination: (id: number) => void;
  stickyTop?: number;
}

export default function TravelSearchMap({
  assemblyPoints,
  originId,
  destinationId,
  lang,
  onSetOrigin,
  onSetDestination,
  stickyTop = 64,
}: TravelSearchMapProps) {
  const dict = useDictionary();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRefs = useRef<mapboxgl.Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);

  const originAp = originId ? assemblyPoints.find((ap) => ap.id === originId) : null;
  const destAp = destinationId ? assemblyPoints.find((ap) => ap.id === destinationId) : null;

  // Initialize the map once.
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current || !mapboxgl.accessToken) {
      return;
    }

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: originAp ? [originAp.longitude, originAp.latitude] : destAp ? [destAp.longitude, destAp.latitude] : FALLBACK_CENTER,
      zoom: (originAp || destAp) ? 12 : 4.6,
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

  // Sync pins and popups
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Clear previous markers
    markerRefs.current.forEach((m) => m.remove());
    markerRefs.current = [];

    assemblyPoints.forEach((ap) => {
      const isOrigin = originAp?.id === ap.id;
      const isDest = destAp?.id === ap.id;

      const el = document.createElement("button");
      el.type = "button";

      if (isOrigin) {
        el.className = "flex items-center gap-1.5 h-8 rounded-full px-3 text-xs font-semibold bg-emerald-600 text-white border border-emerald-700 shadow-md cursor-pointer transition select-none hover:scale-105 hover:z-10";
        el.innerHTML = `<span>📍</span> <span>${lang === "ar" && ap.nameAr ? ap.nameAr : ap.name}</span>`;
      } else if (isDest) {
        el.className = "flex items-center gap-1.5 h-8 rounded-full px-3 text-xs font-semibold bg-red-600 text-white border border-red-700 shadow-md cursor-pointer transition select-none hover:scale-105 hover:z-10";
        el.innerHTML = `<span>🏁</span> <span>${lang === "ar" && ap.nameAr ? ap.nameAr : ap.name}</span>`;
      } else {
        el.className = "flex items-center justify-center h-7 w-7 rounded-full bg-slate-500 text-white border-2 border-white shadow-md cursor-pointer hover:scale-110 hover:bg-slate-700 transition";
        el.innerHTML = `<span class="text-[11px]">🚌</span>`;
        el.title = lang === "ar" && ap.nameAr ? ap.nameAr : ap.name;
      }

      // Tooltip/popup setup
      const popupHtml = document.createElement("div");
      popupHtml.className = "p-2 flex flex-col gap-1.5 min-w-[160px] text-xs font-sans text-slate-900";
      
      const apName = lang === "ar" && ap.nameAr ? ap.nameAr : ap.name;
      popupHtml.innerHTML = `
        <div class="font-bold border-b pb-1 text-slate-800">${apName}</div>
        <div class="text-[10px] text-slate-500 mb-1.5">${ap.address}, ${ap.city}</div>
        <button id="pop-set-origin-${ap.id}" class="w-full text-start py-1 px-1.5 hover:bg-slate-100 rounded text-emerald-600 font-semibold flex items-center gap-1">
          <span>📍</span> ${lang === "ar" ? "تعيين كنقطة انطلاق" : "Set as Origin"}
        </button>
        <button id="pop-set-dest-${ap.id}" class="w-full text-start py-1 px-1.5 hover:bg-slate-100 rounded text-red-600 font-semibold flex items-center gap-1">
          <span>🏁</span> ${lang === "ar" ? "تعيين كوجهة وصول" : "Set as Destination"}
        </button>
      `;

      const popup = new mapboxgl.Popup({ offset: 12, closeButton: false })
        .setDOMContent(popupHtml);

      popup.on("open", () => {
        const setOrigBtn = document.getElementById(`pop-set-origin-${ap.id}`);
        const setDestBtn = document.getElementById(`pop-set-dest-${ap.id}`);

        setOrigBtn?.addEventListener("click", () => {
          onSetOrigin(ap.id);
          popup.remove();
        });

        setDestBtn?.addEventListener("click", () => {
          onSetDestination(ap.id);
          popup.remove();
        });
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([ap.longitude, ap.latitude])
        .setPopup(popup)
        .addTo(map);

      markerRefs.current.push(marker);
    });

    // Center on Khartoum if no origin/destination is set
    if (!originAp && !destAp) {
      map.flyTo({ center: FALLBACK_CENTER, zoom: 4.6, duration: 0 });
    } else if ((originAp && !destAp) || (!originAp && destAp)) {
      const single = originAp || destAp;
      if (single) {
        map.flyTo({ center: [single.longitude, single.latitude], zoom: 12, duration: 800 });
      }
    }
  }, [assemblyPoints, originAp, destAp, mapReady, lang]);

  // Handle drawing the route line (Directions API)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const drawRoute = async () => {
      const routeId = "route-line";

      // Clean up previous route layer/source
      if (map.getLayer(routeId)) map.removeLayer(routeId);
      if (map.getSource(routeId)) map.removeSource(routeId);

      if (!originAp || !destAp) return;

      const start: [number, number] = [originAp.longitude, originAp.latitude];
      const end: [number, number] = [destAp.longitude, destAp.latitude];

      let coords: [number, number][] = [start, end];

      try {
        const res = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/driving/${start[0]},${start[1]};${end[0]},${end[1]}?geometries=geojson&access_token=${mapboxgl.accessToken}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.routes && data.routes.length > 0) {
            coords = data.routes[0].geometry.coordinates;
          }
        }
      } catch (e) {
        console.error("Failed to fetch directions", e);
      }

      if (!mapRef.current) return;

      map.addSource(routeId, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: coords,
          },
        },
      });

      map.addLayer({
        id: routeId,
        type: "line",
        source: routeId,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#de3151",
          "line-width": 5,
          "line-opacity": 0.8,
        },
      });

      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend(start);
      bounds.extend(end);
      map.fitBounds(bounds, { padding: 80, maxZoom: 12, duration: 1000 });
    };

    void drawRoute();
  }, [originAp, destAp, mapReady]);

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();
  const handleFullscreen = () => {
    void mapContainerRef.current?.requestFullscreen?.();
  };

  return (
    <div className="h-full w-full">
      <div
        className="sticky w-full bg-background"
        style={{ top: stickyTop, height: `calc(100vh - ${stickyTop}px)` }}
      >
        <div className="relative h-full w-full overflow-hidden">
          <div ref={mapContainerRef} className="h-full w-full" />

          {!mapboxgl.accessToken && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-xs text-gray-500">
              {dict?.search?.map?.unavailable ?? "Map unavailable — set NEXT_PUBLIC_MAPBOX_TOKEN"}
            </div>
          )}

          {/* Fullscreen + Zoom controls */}
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
