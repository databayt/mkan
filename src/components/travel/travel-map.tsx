'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import type { Map as MapboxMapType } from 'mapbox-gl';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import { cityLabel } from '@/components/travel/city-names';

interface AssemblyPoint {
  id: number;
  name: string;
  nameAr: string | null;
  latitude: number;
  longitude: number;
  city: string;
  address: string;
}

interface TransportMapProps {
  assemblyPoints: AssemblyPoint[];
  lang?: string;
}

export function TransportMap({ assemblyPoints, lang = 'ar' }: TransportMapProps) {
  const dict = useDictionary();
  const m = dict?.travel?.map;
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMapType | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  // The map sits ~5 sections below the fold on /travel, but mapbox-gl is
  // ~800 kB of JS + CSS plus a burst of tile requests. Hold the import until
  // the container is about to enter the viewport so visitors who never scroll
  // that far never pay for it.
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView) return;
    if (!mapContainerRef.current || assemblyPoints.length === 0) return;

    // Same token the homes search map uses; the old ACCESS_TOKEN name is kept
    // as a fallback for envs that still define it.
    const token =
      process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
      process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token) {
      setLoadError(true);
      return;
    }

    let cancelled = false;

    const initMap = async () => {
      try {
        const mapboxgl = await import('mapbox-gl');
        await import('mapbox-gl/dist/mapbox-gl.css');

        mapboxgl.default.accessToken = token;

        const validPoints = assemblyPoints.filter(
          (p) => p.latitude != null && p.longitude != null && !isNaN(p.latitude) && !isNaN(p.longitude)
        );

        if (validPoints.length === 0) {
          setLoadError(true);
          return;
        }

        // Center on mean coordinates
        const centerLng = validPoints.reduce((s, p) => s + p.longitude, 0) / validPoints.length;
        const centerLat = validPoints.reduce((s, p) => s + p.latitude, 0) / validPoints.length;

        if (cancelled) return;

        const map = new mapboxgl.default.Map({
          container: mapContainerRef.current!,
          style: 'mapbox://styles/mapbox/light-v11',
          center: [centerLng, centerLat],
          zoom: 5,
          attributionControl: false,
        });

        map.on('load', () => {
          if (cancelled) { map.remove(); return; }
          setMapLoaded(true);

          validPoints.forEach((point) => {
            const el = document.createElement('div');
            el.className = 'flex items-center justify-center w-8 h-8 rounded-full bg-primary shadow-md cursor-pointer hover:scale-110 transition-transform';
            el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="white" stroke="none"/></svg>';

            const pointName =
              lang === 'ar' ? (point.nameAr ?? point.name) : point.name;
            const popup = new mapboxgl.default.Popup({ offset: 25, closeButton: false })
              .setHTML(`
                <div style="font-family: system-ui, sans-serif; padding: 4px 0;">
                  <div style="font-weight: 600; font-size: 14px;">${pointName}</div>
                  <div style="color: #6b7280; font-size: 12px;">${cityLabel(point.city, lang)}</div>
                  <div style="color: #9ca3af; font-size: 11px; margin-top: 2px;">${point.address}</div>
                </div>
              `);

            new mapboxgl.default.Marker({ element: el })
              .setLngLat([point.longitude, point.latitude])
              .setPopup(popup)
              .addTo(map);
          });

          map.addControl(new mapboxgl.default.NavigationControl(), 'bottom-right');
        });

        mapRef.current = map;
      } catch {
        if (!cancelled) setLoadError(true);
      }
    };

    initMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [inView, assemblyPoints, lang]);

  if (assemblyPoints.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        {m?.noPoints ?? "No assembly points available"}
      </div>
    );
  }

  return (
    <div className="relative h-[400px] md:h-[450px]">
      {/* Fallback overlays the fixed-height box — the height lives on the
          wrapper so the pill list never bleeds over the section heading. */}
      {loadError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-muted/80 rounded-xl px-4">
          <MapPin className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            {m?.unavailable ?? "Assembly points map unavailable"}
          </p>
          <div className="mt-4 flex flex-wrap gap-2 justify-center max-w-lg overflow-y-auto">
            {assemblyPoints.map((p) => (
              <span key={p.id} className="text-xs bg-background px-2 py-1 rounded-full border">
                {lang === 'ar' && p.nameAr ? p.nameAr : p.name}
              </span>
            ))}
          </div>
        </div>
      )}
      <div
        ref={mapContainerRef}
        className="w-full h-full rounded-xl overflow-hidden border"
        style={loadError ? { visibility: 'hidden' } : undefined}
      />
    </div>
  );
}
