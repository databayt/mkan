"use client"

import { FiltersState, useGlobalStore } from "@/state/filters";
import { usePathname, useRouter } from "next/navigation";
import React, { useState } from "react";
import { debounce } from "lodash";
import { cleanParams, cn, formatPriceValue } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Filter, Grid, List, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PropertyTypeIcons } from "@/lib/constants";

const FiltersBar = () => {
  const router = useRouter();
  const pathname = usePathname();
  const isAr = pathname?.startsWith("/ar");
  const filters = useGlobalStore((s) => s.filters);
  const isFiltersFullOpen = useGlobalStore((s) => s.isFiltersFullOpen);
  const viewMode = useGlobalStore((s) => s.viewMode);
  const setFilters = useGlobalStore((s) => s.setFilters);
  const toggleFiltersFullOpen = useGlobalStore((s) => s.toggleFiltersFullOpen);
  const setViewMode = useGlobalStore((s) => s.setViewMode);
  const [searchInput, setSearchInput] = useState(filters.location);

  const updateURL = debounce((newFilters: FiltersState) => {
    const cleanFilters = cleanParams(newFilters);
    const updatedSearchParams = new URLSearchParams();

    Object.entries(cleanFilters).forEach(([key, value]) => {
      updatedSearchParams.set(
        key,
        Array.isArray(value) ? value.join(",") : value.toString()
      );
    });

    router.push(`${pathname}?${updatedSearchParams.toString()}`);
  });

  const handleFilterChange = (
    key: string,
    value: any,
    isMin: boolean | null
  ) => {
    let newValue = value;

    if (key === "priceRange" || key === "squareFeet") {
      const currentArrayRange = [...filters[key]];
      if (isMin !== null) {
        const index = isMin ? 0 : 1;
        currentArrayRange[index] = value === "any" ? null : Number(value);
      }
      newValue = currentArrayRange;
    } else if (key === "coordinates") {
      newValue = value === "any" ? [0, 0] : value.map(Number);
    } else {
      newValue = value === "any" ? "any" : value;
    }

    const newFilters = { ...filters, [key]: newValue };
    setFilters(newFilters);
    updateURL(newFilters);
  };

  const handleLocationSearch = async () => {
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          searchInput
        )}.json?access_token=${
          process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
        }&fuzzyMatch=true`
      );
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        setFilters({
          location: searchInput,
          coordinates: [lng, lat],
        });
      }
    } catch (err) {
      console.error("Error search location:", err);
    }
  };

  return (
    <div className="flex justify-between items-center w-full py-5">
      {/* Filters */}
      <div className="flex justify-between items-center gap-4 p-2">
        {/* All Filters */}
        <Button
          variant="outline"
          className={cn(
            "gap-2 rounded-xl border-primary-400 hover:bg-primary-500 hover:text-primary-100",
            isFiltersFullOpen && "bg-primary-700 text-primary-100"
          )}
          onClick={() => toggleFiltersFullOpen()}
        >
          <Filter className="w-4 h-4" />
          <span>{isAr ? "جميع الفلاتر" : "All Filters"}</span>
        </Button>

        {/* Search Location */}
        <div className="flex items-center relative">
          <Input
            placeholder={isAr ? "جرب: الخرطوم، بورتسودان..." : "Try: New York, Austin, Portland..."}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleLocationSearch();
              }
            }}
            className="w-48 rounded-s-xl rounded-e-none border-primary-400 border-e-0"
          />
          <Button
            onClick={handleLocationSearch}
            className={`rounded-e-xl rounded-s-none border-s-none border-primary-400 shadow-none
              border hover:bg-primary-700 hover:text-primary-50`}
          >
            <Search className="w-4 h-4" />
          </Button>

          {/* Quick location suggestions */}
          {searchInput === '' && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 w-48">
              <div className="p-2 text-xs text-gray-500 border-b">{isAr ? "المدن المتاحة:" : "Available cities:"}</div>
              <button
                className="w-full text-start px-3 py-2 text-sm hover:bg-blue-50 text-blue-600 font-medium"
                onClick={() => {
                  setSearchInput('');
                  handleFilterChange('location', '', null);
                }}
              >
                {isAr ? "عرض جميع العقارات" : "Show All Properties"}
              </button>
              {['New York', 'Austin', 'Portland', 'Seattle', 'Chicago', 'Boston'].map((city) => (
                <button
                  key={city}
                  className="w-full text-start px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={() => {
                    setSearchInput(city);
                    handleFilterChange('location', city, null);
                  }}
                >
                  {city}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Price Range */}
        <div className="flex gap-1">
          {/* Minimum Price Selector */}
          <Select
            value={filters.priceRange[0]?.toString() || "any"}
            onValueChange={(value) =>
              handleFilterChange("priceRange", value, true)
            }
          >
            <SelectTrigger className="w-22 rounded-xl border-primary-400">
              <SelectValue>
                {formatPriceValue(filters.priceRange[0], true)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="any">{isAr ? "أي حد أدنى" : "Any Min Price"}</SelectItem>
              {[500, 1000, 1500, 2000, 3000, 5000, 10000].map((price) => (
                <SelectItem key={price} value={price.toString()}>
                  ${price / 1000}k+
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Maximum Price Selector */}
          <Select
            value={filters.priceRange[1]?.toString() || "any"}
            onValueChange={(value) =>
              handleFilterChange("priceRange", value, false)
            }
          >
            <SelectTrigger className="w-22 rounded-xl border-primary-400">
              <SelectValue>
                {formatPriceValue(filters.priceRange[1], false)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="any">{isAr ? "أي حد أقصى" : "Any Max Price"}</SelectItem>
              {[1000, 2000, 3000, 5000, 10000].map((price) => (
                <SelectItem key={price} value={price.toString()}>
                  &lt;${price / 1000}k
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Beds and Baths */}
        <div className="flex gap-1">
          {/* Beds */}
          <Select
            value={filters.beds}
            onValueChange={(value) => handleFilterChange("beds", value, null)}
          >
            <SelectTrigger className="w-26 rounded-xl border-primary-400">
              <SelectValue placeholder={isAr ? "أسرّة" : "Beds"} />
            </SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="any">{isAr ? "أي عدد أسرّة" : "Any Beds"}</SelectItem>
              <SelectItem value="1">{isAr ? "+1 سرير" : "1+ bed"}</SelectItem>
              <SelectItem value="2">{isAr ? "+2 أسرّة" : "2+ beds"}</SelectItem>
              <SelectItem value="3">{isAr ? "+3 أسرّة" : "3+ beds"}</SelectItem>
              <SelectItem value="4">{isAr ? "+4 أسرّة" : "4+ beds"}</SelectItem>
            </SelectContent>
          </Select>

          {/* Baths */}
          <Select
            value={filters.baths}
            onValueChange={(value) => handleFilterChange("baths", value, null)}
          >
            <SelectTrigger className="w-26 rounded-xl border-primary-400">
              <SelectValue placeholder={isAr ? "حمامات" : "Baths"} />
            </SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="any">{isAr ? "أي عدد حمامات" : "Any Baths"}</SelectItem>
              <SelectItem value="1">{isAr ? "+1 حمام" : "1+ bath"}</SelectItem>
              <SelectItem value="2">{isAr ? "+2 حمامات" : "2+ baths"}</SelectItem>
              <SelectItem value="3">{isAr ? "+3 حمامات" : "3+ baths"}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Property Type */}
        <Select
          value={filters.propertyType || "any"}
          onValueChange={(value) =>
            handleFilterChange("propertyType", value, null)
          }
        >
          <SelectTrigger className="w-32 rounded-xl border-primary-400">
            <SelectValue placeholder={isAr ? "نوع العقار" : "Home Type"} />
          </SelectTrigger>
          <SelectContent className="bg-white">
            <SelectItem value="any">{isAr ? "أي نوع عقار" : "Any Property Type"}</SelectItem>
            {Object.entries(PropertyTypeIcons).map(([type, Icon]) => (
              <SelectItem key={type} value={type}>
                <div className="flex items-center">
                  <Icon className="w-4 h-4 me-2" />
                  <span>{type}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* View Mode */}
      <div className="flex justify-between items-center gap-4 p-2">
        <div className="flex border rounded-xl">
          <Button
            variant="ghost"
            className={cn(
              "px-3 py-1 rounded-none rounded-s-xl hover:bg-primary-600 hover:text-primary-50",
              viewMode === "list" ? "bg-primary-700 text-primary-50" : ""
            )}
            onClick={() => setViewMode("list")}
          >
            <List className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            className={cn(
              "px-3 py-1 rounded-none rounded-e-xl hover:bg-primary-600 hover:text-primary-50",
              viewMode === "grid" ? "bg-primary-700 text-primary-50" : ""
            )}
            onClick={() => setViewMode("grid")}
          >
            <Grid className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FiltersBar;
