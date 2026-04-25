"use client";
import React, { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import mapboxgl from "mapbox-gl";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import "mapbox-gl/dist/mapbox-gl.css";
import { useGlobalStore } from "@/state/filters";
import { useGetPropertiesQuery } from "@/state/api";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN as string;

// Minimal marker shape that the popup renderer needs. Derived from whatever
// `searchListings` returns so the file stays independent of Prisma shape drift.
interface MapListing {
  id: number | string;
  title?: string | null;
  pricePerNight?: number | null;
  location?: {
    latitude?: number | null;
    longitude?: number | null;
  } | null;
}

const Map = () => {
  const mapContainerRef = useRef(null);
  const pathname = usePathname();
  const dict = useDictionary();
  const filters = useGlobalStore((s) => s.filters);
  const {
    data: properties,
    isLoading,
    isError,
  } = useGetPropertiesQuery(filters);

  useEffect(() => {
    if (isLoading || isError || !properties) return;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current!,
      style: "mapbox://styles/majesticglue/cm6u301pq008b01sl7yk1cnvb",
      center: filters.coordinates || [-74.5, 40],
      zoom: 9,
    });

    (properties as unknown as MapListing[]).forEach((property) => {
      const marker = createPropertyMarker(property, map, dict);
      if (!marker) return;
      const markerElement = marker.getElement();
      const path = markerElement.querySelector("path[fill='#3FB1CE']");
      if (path) path.setAttribute("fill", "#000000");
    });

    const resizeMap = () => {
      if (map) setTimeout(() => map.resize(), 700);
    };
    resizeMap();

    return () => map.remove();
  }, [isLoading, isError, properties, filters.coordinates]);

  if (isLoading) return <>{dict.listings?.loading ?? "Loading..."}</>;
  if (isError || !properties) return <div>{dict.listings?.failedToLoad ?? "Failed to fetch properties"}</div>;

  return (
    <div className="basis-5/12 grow relative rounded-xl">
      <div
        className="map-container rounded-xl"
        ref={mapContainerRef}
        style={{
          height: "100%",
          width: "100%",
        }}
      />
    </div>
  );
};

const createPropertyMarker = (property: MapListing, map: mapboxgl.Map, dict?: Record<string, any>) => {
  // Skip properties without location data
  if (!property.location) return null;

  const longitude = property.location.longitude ?? -74.5;
  const latitude = property.location.latitude ?? 40;

  const marker = new mapboxgl.Marker()
    .setLngLat([longitude, latitude])
    .setPopup(
      new mapboxgl.Popup().setHTML(
        `
        <div class="marker-popup">
          <div class="marker-popup-image"></div>
          <div>
            <a href="/listings/${property.id}" target="_blank" class="marker-popup-title">${property.title ?? ""}</a>
            <p class="marker-popup-price">
              $${property.pricePerNight ?? 0}
              <span class="marker-popup-price-unit"> / ${dict?.listings?.night ?? "night"}</span>
            </p>
          </div>
        </div>
        `
      )
    )
    .addTo(map);
  return marker;
};

export default Map;
