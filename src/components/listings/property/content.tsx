"use client";
import React, { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Listing } from "@/types/listing";
import { PropertyListings } from "./listings";
import { useDebounce } from "@/hooks/useDebounce";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface PropertyContentProps {
  properties: Listing[];
}

export const PropertyContent = ({ properties: initialProperties }: PropertyContentProps) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [properties, setProperties] = useState(initialProperties);
  const [searchFilters, setSearchFilters] = useState({
    location: searchParams.get("location") || "",
    checkIn: searchParams.get("checkIn") || "",
    checkOut: searchParams.get("checkOut") || "",
    guests: parseInt(searchParams.get("guests") || "0"),
    adults: parseInt(searchParams.get("adults") || "0"),
    children: parseInt(searchParams.get("children") || "0"),
    infants: parseInt(searchParams.get("infants") || "0")
  });

  const debouncedFilters = useDebounce(searchFilters, 300);

  // Check if any filters are active
  const hasActiveFilters = Boolean(
    searchFilters.location || 
    searchFilters.checkIn || 
    searchFilters.checkOut || 
    searchFilters.guests > 0 || 
    searchFilters.adults > 0 || 
    searchFilters.children > 0 || 
    searchFilters.infants > 0
  );


  // Clear all filters function
  const clearAllFilters = () => {
    router.push('/listings');
  };

  useEffect(() => {
    // Update filters when URL params change
    setSearchFilters({
      location: searchParams.get("location") || "",
      checkIn: searchParams.get("checkIn") || "",
      checkOut: searchParams.get("checkOut") || "",
      guests: parseInt(searchParams.get("guests") || "0"),
      adults: parseInt(searchParams.get("adults") || "0"),
      children: parseInt(searchParams.get("children") || "0"),
      infants: parseInt(searchParams.get("infants") || "0")
    });
  }, [searchParams]);

  useEffect(() => {
    // Filter properties based on search criteria
    let filteredProperties = initialProperties.filter(property => property.isPublished === true);

    // Location filter
    if (debouncedFilters.location) {
      const locationLower = debouncedFilters.location.toLowerCase();
      filteredProperties = filteredProperties.filter(property => {
        const locationMatch =
          property.location?.city?.toLowerCase().includes(locationLower) ||
          property.location?.state?.toLowerCase().includes(locationLower) ||
          property.location?.country?.toLowerCase().includes(locationLower) ||
          property.title?.toLowerCase().includes(locationLower);
        return locationMatch;
      });
    }

    // Guest capacity filter
    if (debouncedFilters.guests > 0 || debouncedFilters.adults > 0) {
      const totalGuests = Math.max(debouncedFilters.guests, debouncedFilters.adults + debouncedFilters.children);
      filteredProperties = filteredProperties.filter(property => {
        const capacity = property.guestCount ?? 1;
        return capacity >= totalGuests;
      });
    }

    // Date availability filter (basic implementation - you may want to enhance this)
    if (debouncedFilters.checkIn && debouncedFilters.checkOut) {
      // For now, just ensure the property allows bookings
      // In a real app, you'd check availability calendar
      filteredProperties = filteredProperties.filter(property => {
        return property.isPublished === true;
      });
    }

    setProperties(filteredProperties);
  }, [initialProperties, debouncedFilters]);

  return (
    <div className="w-full">
      {/* Clear All Filters Button */}
      {hasActiveFilters && (
        <div className="mb-4 px-4">
          <Button
            onClick={clearAllFilters}
            variant="outline"
            size="sm"
            className="flex items-center gap-2 hover:bg-gray-50"
          >
            <X size={16} />
            Clear all filters
          </Button>
        </div>
      )}
      
      <div className="flex relative">
        <div className="flex-1">
          <PropertyListings properties={properties} />
        </div>
      </div>
    </div>
  );
};
