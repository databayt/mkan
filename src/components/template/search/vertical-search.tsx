"use client";

import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Counter } from "@/components/atom";
import { format } from "date-fns";
import { useClickOutside } from "./use-click";
import { GUEST_LIMITS, MOBILE_BREAKPOINT } from "./constant";
import LocationDropdown from "./location";
import DatePickerDropdown from "./date-picker";
import GuestSelectorDropdown from "./guest-selector";
import { useLocationSuggestions } from "./hooks/use-location-suggestions";
import { useSearchValidation } from "@/hooks/useSearchValidation";
import { type LocationSuggestion } from "@/lib/schemas/search-schema";

type ActiveField = "location" | "checkin" | "checkout" | "guests" | null;

interface VerticalSearchProps {
  onSearch?: () => void;
}

export default function VerticalSearch({ onSearch }: VerticalSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeField, setActiveField] = useState<ActiveField>(null);
  const [isMobile, setIsMobile] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    location: "",
    checkIn: "",
    checkOut: "",
    guests: {
      adults: 0,
      children: 0,
      infants: 0,
    },
  });

  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({
    from: undefined,
    to: undefined,
  });

  // Use the location suggestions hook
  const {
    suggestions,
    popularLocations,
    isLoading: isLoadingLocations,
    error: locationError,
    search: searchLocations,
    query: searchQuery,
  } = useLocationSuggestions();

  // Use the search validation hook
  const { isValid: isDateValid, errors: dateErrors } =
    useSearchValidation(dateRange);

  // Check if mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleFieldClick = (field: ActiveField) => {
    setActiveField(activeField === field ? null : field);
  };

  const handleDateRangeChange = (
    from: Date | undefined,
    to: Date | undefined
  ) => {
    setDateRange({ from, to });
    setFormData((prev) => ({
      ...prev,
      checkIn: from ? format(from, "yyyy-MM-dd") : "",
      checkOut: to ? format(to, "yyyy-MM-dd") : "",
    }));
  };

  // Handle location selection
  const selectLocation = (location: LocationSuggestion) => {
    setFormData((prev) => ({ ...prev, location: location.displayName }));
    setActiveField("checkin");
  };

  // Add guest counter handlers
  const handleGuestChange = (
    type: "adults" | "children" | "infants",
    operation: "increment" | "decrement"
  ) => {
    setFormData((prev) => ({
      ...prev,
      guests: {
        ...prev.guests,
        [type]:
          operation === "increment"
            ? Math.min(prev.guests[type] + 1, GUEST_LIMITS[type].max)
            : Math.max(GUEST_LIMITS[type].min, prev.guests[type] - 1),
      },
    }));
  };

  // Helper function to get total guests
  const getTotalGuests = () => {
    return (
      formData.guests.adults +
      formData.guests.children +
      formData.guests.infants
    );
  };

  // Helper function to get guest display text
  const getGuestDisplayText = () => {
    const total = getTotalGuests();
    if (total === 0) return "Add guests";

    const parts = [];
    if (formData.guests.adults > 0) {
      parts.push(
        `${formData.guests.adults} adult${formData.guests.adults > 1 ? "s" : ""}`
      );
    }
    if (formData.guests.children > 0) {
      parts.push(
        `${formData.guests.children} child${formData.guests.children > 1 ? "ren" : ""}`
      );
    }
    if (formData.guests.infants > 0) {
      parts.push(
        `${formData.guests.infants} infant${formData.guests.infants > 1 ? "s" : ""}`
      );
    }

    return parts.join(", ");
  };

  // Use click outside hook
  useClickOutside(formRef, () => setActiveField(null));

  const handleSearch = () => {
    // Validate dates before search
    if (dateRange.from && dateRange.to && !isDateValid) {
      // Show validation errors by opening the date picker
      setActiveField("checkin");
      return;
    }

    const searchParams = new URLSearchParams();

    if (formData.location) {
      searchParams.set("location", formData.location);
    }
    if (formData.checkIn) {
      searchParams.set("checkIn", formData.checkIn);
    }
    if (formData.checkOut) {
      searchParams.set("checkOut", formData.checkOut);
    }
    if (getTotalGuests() > 0) {
      searchParams.set("guests", getTotalGuests().toString());
      searchParams.set("adults", formData.guests.adults.toString());
      searchParams.set("children", formData.guests.children.toString());
      searchParams.set("infants", formData.guests.infants.toString());
    }

    // Get current locale from pathname
    const pathParts = pathname.split("/");
    const locale = pathParts[1] || "en";

    // Always navigate to listings page
    const searchUrl = `/${locale}/listings${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    router.push(searchUrl);

    // Call onSearch callback if provided (for analytics or other side effects)
    if (onSearch) {
      onSearch();
    }
  };

  // Helper function to get field styling
  const getFieldStyling = (field: ActiveField) => {
    const isActive = activeField === field;
    const hasActiveField = activeField !== null;

    let bgClass = "bg-transparent";
    if (isActive) {
      bgClass = "bg-white shadow-md";
    } else if (hasActiveField) {
      bgClass = "bg-[#e5e7eb]";
    }

    return `${bgClass} transition-all duration-200`;
  };

  if (isMobile) {
    return (
      <div
        className="absolute top-[53%] left-4 md:left-8 transform -translate-y-1/2 z-20 w-[calc(100%-2rem)] md:w-auto max-h-[80vh] overflow-auto"
        ref={formRef}
      >
        <div className="bg-white rounded-xs px-4 md:px-6 py-6 md:py-4 shadow-md w-full md:w-80">
          {/* Header - Show heading or back arrow */}
          {!activeField ? (
            /* Show main heading when no field is active */
            <h1 className="text-lg md:text-xl font-medium text-[#6b6b6b] mb-4 md:mb-3 leading-tight">
              Book unique
              <br />
              accommodations and
              <br />
              activities.
            </h1>
          ) : (
            /* Show back arrow when dropdown is active */
            <div className="flex items-center mb-4 md:mb-3">
              <button
                onClick={() => setActiveField(null)}
                className="flex items-center text-[#6b6b6b] hover:text-black transition-colors"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
                <span className="ml-2 text-sm font-medium">Back</span>
              </button>
            </div>
          )}

          {/* Mobile: Show form or dropdown content */}
          {!activeField ? (
            /* Show complete form when no field is active */
            <div className="space-y-4 md:space-y-3">
              {/* Location field */}
              <div>
                <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1 block">
                  WHERE
                </Label>
                <button
                  className={`w-full h-12 text-left px-3 border border-gray-300 rounded-xs ${getFieldStyling("location")}`}
                  onClick={() => handleFieldClick("location")}
                >
                  <span
                    className={`text-sm ${formData.location ? "text-black" : "text-[#c0c0c0]"}`}
                  >
                    {formData.location || "Anywhere"}
                  </span>
                </button>
              </div>

              {/* Date fields */}
              <div>
                <div className="grid grid-cols-2">
                  <div>
                    <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1 block">
                      CHECK-IN
                    </Label>
                  </div>
                  <div>
                    <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1 block">
                      CHECK-OUT
                    </Label>
                  </div>
                </div>
                <div className="flex">
                  <button
                    className={`flex-1 h-12 text-left px-3 border border-gray-300 rounded-l-xs rounded-r-none ${getFieldStyling("checkin")}`}
                    onClick={() => handleFieldClick("checkin")}
                  >
                    <span
                      className={`text-sm ${dateRange.from ? "text-black" : "text-[#c0c0c0]"}`}
                    >
                      {dateRange.from
                        ? format(dateRange.from, "MMM dd")
                        : "Add date"}
                    </span>
                  </button>
                  <div className="w-px h-8 bg-[#e5e7eb] self-center"></div>
                  <button
                    className={`flex-1 h-12 text-left px-3 border border-gray-300 border-l-0 rounded-r-xs rounded-l-none ${getFieldStyling("checkout")}`}
                    onClick={() => handleFieldClick("checkout")}
                  >
                    <span
                      className={`text-sm ${dateRange.to ? "text-black" : "text-[#c0c0c0]"}`}
                    >
                      {dateRange.to
                        ? format(dateRange.to, "MMM dd")
                        : "Add date"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Guests field */}
              <div>
                <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1 block">
                  GUESTS
                </Label>
                <button
                  className={`w-full h-12 text-left px-3 border border-gray-300 rounded-xs ${getFieldStyling("guests")}`}
                  onClick={() => handleFieldClick("guests")}
                >
                  <span
                    className={`text-sm ${getTotalGuests() > 0 ? "text-black" : "text-[#c0c0c0]"}`}
                  >
                    {getGuestDisplayText()}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            /* Show dropdown content when a field is active */
            <div className="min-h-[200px] max-h-[60vh] overflow-y-auto">
              {activeField === "location" && (
                <LocationDropdown
                  searchQuery={searchQuery}
                  suggestions={suggestions}
                  popularLocations={popularLocations}
                  isLoading={isLoadingLocations}
                  error={locationError}
                  onSearchQueryChange={searchLocations}
                  onLocationSelect={(location) => {
                    if (location) {
                      selectLocation(location);
                    } else {
                      setActiveField(null);
                    }
                  }}
                />
              )}

              {(activeField === "checkin" || activeField === "checkout") && (
                <DatePickerDropdown
                  dateRange={dateRange}
                  onDateChange={handleDateRangeChange}
                />
              )}

              {activeField === "guests" && (
                <GuestSelectorDropdown
                  guests={formData.guests}
                  onGuestChange={handleGuestChange}
                />
              )}
            </div>
          )}

          {/* Fixed Search button - always visible */}
          <div className="pt-3 md:pt-2 flex justify-end">
            <Button
              onClick={handleSearch}
              className="px-8 py-2 md:py-1 h-12 md:h-10 text-sm font-medium bg-[#de3151] hover:bg-[#de3151]/90 text-white rounded-xs"
            >
              Search
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Desktop version
  return (
    <div
      className="absolute top-[53%] left-4 md:left-8 transform -translate-y-1/2 z-20 w-[calc(100%-2rem)] md:w-auto"
      ref={formRef}
    >
      <div className="relative">
        <div className="bg-white rounded-xs px-4 md:px-6 py-6 md:py-4 shadow-md w-full md:w-80">
          {/* Main heading */}
          <h1 className="text-lg md:text-xl font-medium text-[#6b6b6b] mb-4 md:mb-3 leading-tight">
            Book unique
            <br />
            accommodations and
            <br />
            activities.
          </h1>

          {/* Desktop: All fields visible */}
          <div className="space-y-4 md:space-y-3">
            {/* Location field */}
            <div>
              <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1 block">
                WHERE
              </Label>
              <button
                className={`w-full h-12 text-left px-3 border border-gray-300 rounded-xs ${getFieldStyling("location")}`}
                onClick={() => handleFieldClick("location")}
              >
                <span
                  className={`text-sm ${formData.location ? "text-black" : "text-[#c0c0c0]"}`}
                >
                  {formData.location || "Anywhere"}
                </span>
              </button>
            </div>

            {/* Date fields */}
            <div>
              <div className="grid grid-cols-2">
                <div>
                  <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1 block">
                    CHECK-IN
                  </Label>
                </div>
                <div>
                  <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1 block">
                    CHECK-OUT
                  </Label>
                </div>
              </div>
              <div className="flex">
                <button
                  className={`flex-1 h-12 text-left px-3 border border-gray-300 rounded-l-xs rounded-r-none ${getFieldStyling("checkin")}`}
                  onClick={() => handleFieldClick("checkin")}
                >
                  <span
                    className={`text-sm ${dateRange.from ? "text-black" : "text-[#c0c0c0]"}`}
                  >
                    {dateRange.from
                      ? format(dateRange.from, "MMM dd")
                      : "Add date"}
                  </span>
                </button>
                <div className="w-px h-8 bg-[#e5e7eb] self-center"></div>
                <button
                  className={`flex-1 h-12 text-left px-3 border border-gray-300 border-l-0 rounded-r-xs rounded-l-none ${getFieldStyling("checkout")}`}
                  onClick={() => handleFieldClick("checkout")}
                >
                  <span
                    className={`text-sm ${dateRange.to ? "text-black" : "text-[#c0c0c0]"}`}
                  >
                    {dateRange.to ? format(dateRange.to, "MMM dd") : "Add date"}
                  </span>
                </button>
              </div>
            </div>

            {/* Travelers field */}
            <div>
              <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1 block">
                GUESTS
              </Label>
              <button
                className={`w-full h-12 text-left px-3 border border-gray-300 rounded-xs ${getFieldStyling("guests")}`}
                onClick={() => handleFieldClick("guests")}
              >
                <span
                  className={`text-sm ${getTotalGuests() > 0 ? "text-black" : "text-[#c0c0c0]"}`}
                >
                  {getGuestDisplayText()}
                </span>
              </button>
            </div>

            {/* Search button */}
            <div className="pt-3 md:pt-2 flex justify-end">
              <Button
                onClick={handleSearch}
                className="px-8 py-2 md:py-1 h-12 md:h-10 text-sm font-medium bg-[#de3151] hover:bg-[#de3151]/90 text-white rounded-xs"
              >
                Search
              </Button>
            </div>
          </div>
        </div>

        {/* Desktop Dropdowns - Positioned to the right */}
        {activeField === "location" && (
          <div
            className="absolute top-0 left-full ml-4 w-80 h-full bg-white rounded-2xl shadow-lg border border-[#e5e7eb] p-6 z-10"
            onMouseLeave={() => setActiveField(null)}
          >
            <LocationDropdown
              searchQuery={searchQuery}
              suggestions={suggestions}
              popularLocations={popularLocations}
              isLoading={isLoadingLocations}
              error={locationError}
              onSearchQueryChange={searchLocations}
              onLocationSelect={(location) => {
                if (location) {
                  selectLocation(location);
                } else {
                  setActiveField(null);
                }
              }}
            />
          </div>
        )}

        {(activeField === "checkin" || activeField === "checkout") && (
          <div className="absolute top-0 left-full ml-4 w-[600px] h-full bg-white rounded-2xl shadow-lg border border-[#e5e7eb] p-6 z-10">
            <DatePickerDropdown
              dateRange={dateRange}
              onDateChange={handleDateRangeChange}
            />
          </div>
        )}

        {activeField === "guests" && (
          <div className="absolute top-0 left-full ml-4 w-80 h-full bg-white rounded-2xl shadow-lg border border-[#e5e7eb] p-6 z-10">
            <GuestSelectorDropdown
              guests={formData.guests}
              onGuestChange={handleGuestChange}
            />
          </div>
        )}
      </div>
    </div>
  );
}
