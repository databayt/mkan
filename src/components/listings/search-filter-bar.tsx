"use client"

import React from "react"
import type { Amenity } from "@prisma/client"
import { SearchFilters } from "./search-filters"
import { useSearch } from "./search-provider"
import { useDictionary } from "@/components/internationalization/dictionary-context"

// Airbnb's search results page carries a sticky filter/category bar between the
// nav and the results: a "Filters" button, a divider, then a horizontally
// scrollable row of amenity quick-pills. Each pill toggles a real amenity
// filter through the SearchProvider (so the results + map update live).
const QUICK_AMENITIES: Amenity[] = [
  "WiFi",
  "AirConditioning",
  "Parking",
  "Pool",
  "Gym",
  "PetsAllowed",
  "WasherDryer",
]

export function SearchFilterBar() {
  const { filters, applyFilters } = useSearch()
  const dict = useDictionary()
  const amenityLabels = (dict.rental?.property?.amenities ?? {}) as Record<string, string>

  const toggle = (a: Amenity) => {
    const active = filters.amenities.includes(a)
    applyFilters({
      ...filters,
      amenities: active
        ? filters.amenities.filter((x) => x !== a)
        : [...filters.amenities, a],
    })
  }

  return (
    // Sticky directly under the 64px header; the map below pins under this bar.
    <div
      className="sticky top-16 z-40 bg-background"
      style={{ borderBottom: "1px solid #ebebeb" }}
    >
      <div
        className="mx-auto flex items-center justify-center gap-3 px-6"
        style={{ height: 64 }}
      >
        {/* Filters dialog trigger (the existing Filters modal lives here now). */}
        <SearchFilters />

        {/* Divider between Filters and the quick-pills. */}
        <div className="h-6 w-px shrink-0" style={{ backgroundColor: "#dddddd" }} />

        {/* Amenity quick-pills — horizontally scrollable, scrollbar hidden. */}
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto">
          {QUICK_AMENITIES.map((a) => {
            const active = filters.amenities.includes(a)
            return (
              <button
                key={a}
                type="button"
                onClick={() => toggle(a)}
                className="shrink-0 whitespace-nowrap rounded-full border px-4 text-sm transition-colors"
                style={{
                  height: 40,
                  borderColor: active ? "#222222" : "#dddddd",
                  backgroundColor: active ? "rgba(34,34,34,0.04)" : "#ffffff",
                  color: "#222222",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {amenityLabels[a] ?? a}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
