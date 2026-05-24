"use client";

import { useGetPropertyQuery } from "@/state/api";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { Compass, MapPin } from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import React, { useEffect, useRef } from "react";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN as string;

interface PropertyDetailsProps {
  propertyId: number;
}

// Extended property type that includes the location relation
interface PropertyWithLocation {
  location?: {
    address?: string;
    latitude?: number;
    longitude?: number;
  } | null;
}

const PropertyLocation = ({ propertyId }: PropertyDetailsProps) => {
  const dict = useDictionary();
  const t = dict?.property?.location;
  const tCommon = dict?.property?.common;
  const {
    data: property,
    isError,
    isLoading,
  } = useGetPropertyQuery(propertyId);
  const mapContainerRef = useRef(null);

  // Type assertion for property with location
  const propertyWithLocation = property as (typeof property & PropertyWithLocation) | undefined;

  useEffect(() => {
    if (isLoading || isError || !propertyWithLocation) return;

    const longitude = propertyWithLocation.location?.longitude ?? -118.2437;
    const latitude = propertyWithLocation.location?.latitude ?? 34.0522;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current!,
      style: "mapbox://styles/majesticglue/cm6u301pq008b01sl7yk1cnvb",
      center: [longitude, latitude],
      zoom: 14,
    });

    const marker = new mapboxgl.Marker()
      .setLngLat([longitude, latitude])
      .addTo(map);

    const markerElement = marker.getElement();
    const path = markerElement.querySelector("path[fill='#3FB1CE']");
    if (path) path.setAttribute("fill", "#000000");

    return () => map.remove();
  }, [propertyWithLocation, isError, isLoading]);

  if (isLoading) return <>{tCommon?.loading ?? "Loading..."}</>;
  if (isError || !propertyWithLocation) {
    return <>{tCommon?.notFound ?? "Property not Found"}</>;
  }

  return (
    <div className="py-16">
      <h3 className="text-xl font-semibold text-primary-800 dark:text-primary-100">
        {t?.mapAndLocation ?? "Map and Location"}
      </h3>
      <div className="flex justify-between items-center text-sm text-primary-500 mt-2">
        <div className="flex items-center text-gray-500">
          <MapPin className="w-4 h-4 me-1 text-gray-700" />
          {t?.propertyAddress ?? "Property Address:"}
          <span className="ms-2 font-semibold text-gray-700">
            {propertyWithLocation.location?.address ?? (t?.addressNotAvailable ?? "Address not available")}
          </span>
        </div>
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(
            propertyWithLocation.location?.address ?? ""
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex justify-between items-center hover:underline gap-2 text-primary-600"
        >
          <Compass className="w-5 h-5" />
          {t?.getDirections ?? "Get Directions"}
        </a>
      </div>
      <div
        className="relative mt-4 h-[300px] rounded-lg overflow-hidden"
        ref={mapContainerRef}
      />
    </div>
  );
};

export default PropertyLocation;
