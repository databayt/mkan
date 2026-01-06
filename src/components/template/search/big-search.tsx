"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import LocationDropdown from "./location";
import BigSearchDatePicker from "./big-search-date-picker";
import GuestSelectorDropdown from "./guest-selector";
import { useLocationSuggestions } from "./hooks/use-location-suggestions";
import { useSearchValidation } from "@/hooks/useSearchValidation";
import { type LocationSuggestion } from "@/lib/schemas/search-schema";

type ActiveButton = "location" | "checkin" | "checkout" | "guests" | null;

interface BigSearchProps {
  onClose?: () => void;
}

export default function BigSearch({ onClose }: BigSearchProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeButton, setActiveButton] = useState<ActiveButton>(null);
  const [hoveredButton, setHoveredButton] = useState<ActiveButton>(null);
  const searchBarRef = useRef<HTMLDivElement>(null);

  // Selected location state
  const [selectedLocation, setSelectedLocation] = useState("");

  // Use the location suggestions hook
  const {
    suggestions,
    popularLocations,
    isLoading: isLoadingLocations,
    error: locationError,
    search: searchLocations,
    query: searchQuery,
  } = useLocationSuggestions();

  // Date range state
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({
    from: undefined,
    to: undefined,
  });

  // Use the search validation hook
  const { isValid: isDateValid } = useSearchValidation(dateRange);

  // Guest state
  const [guests, setGuests] = useState({
    adults: 0,
    children: 0,
    infants: 0,
  });

  const handleButtonClick = (button: ActiveButton) => {
    setActiveButton(activeButton === button ? null : button);
  };

  // Handle location selection
  const handleLocationSelect = (location: LocationSuggestion | null) => {
    if (location) {
      setSelectedLocation(location.displayName);
      setActiveButton("checkin"); // Move to next field
    } else {
      setActiveButton(null);
    }
  };

  // Handle date range change
  const handleDateChange = (from: Date | undefined, to: Date | undefined) => {
    setDateRange({ from, to });
    // Close the dropdown when both dates are selected
    if (from && to) {
      setActiveButton(null);
    }
  };

  // Format date for display
  const formatDate = (date: Date | undefined) => {
    if (!date) return "";
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  // Get check-in display text
  const getCheckInDisplayText = () => {
    if (dateRange.from) {
      return formatDate(dateRange.from);
    }
    return "Add date";
  };

  // Get check-out display text
  const getCheckOutDisplayText = () => {
    if (dateRange.to) {
      return formatDate(dateRange.to);
    }
    return "Add date";
  };

  // Handle guest change
  const handleGuestChange = (
    type: "adults" | "children" | "infants",
    operation: "increment" | "decrement"
  ) => {
    setGuests((prev) => ({
      ...prev,
      [type]:
        operation === "increment"
          ? prev[type] + 1
          : Math.max(0, prev[type] - 1),
    }));
  };

  // Get guest display text
  const getGuestDisplayText = () => {
    const total = guests.adults + guests.children + guests.infants;
    if (total === 0) return "Add guests";

    const parts = [];
    if (guests.adults > 0) {
      parts.push(`${guests.adults} adult${guests.adults > 1 ? "s" : ""}`);
    }
    if (guests.children > 0) {
      parts.push(
        `${guests.children} child${guests.children > 1 ? "ren" : ""}`
      );
    }
    if (guests.infants > 0) {
      parts.push(`${guests.infants} infant${guests.infants > 1 ? "s" : ""}`);
    }

    return parts.join(", ");
  };

  // Click outside to reset
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchBarRef.current &&
        !searchBarRef.current.contains(event.target as Node)
      ) {
        setActiveButton(null);
        setHoveredButton(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const isLineHidden = (
    position: "location-checkin" | "checkin-checkout" | "checkout-guests"
  ) => {
    switch (position) {
      case "location-checkin":
        return (
          hoveredButton === "location" ||
          hoveredButton === "checkin" ||
          activeButton === "location" ||
          activeButton === "checkin"
        );
      case "checkin-checkout":
        return (
          hoveredButton === "checkin" ||
          hoveredButton === "checkout" ||
          activeButton === "checkin" ||
          activeButton === "checkout"
        );
      case "checkout-guests":
        return (
          hoveredButton === "checkout" ||
          hoveredButton === "guests" ||
          activeButton === "checkout" ||
          activeButton === "guests"
        );
      default:
        return false;
    }
  };

  // Helper function to get button styling
  const getButtonStyling = (button: ActiveButton) => {
    const isActive = activeButton === button;
    const isHovered = hoveredButton === button;
    const hasActiveButton = activeButton !== null;

    // Base background color
    let bgClass = "bg-transparent";
    if (isActive) {
      bgClass = "bg-white shadow-md";
    } else if (hasActiveButton) {
      // When there's an active button, all other buttons get dark gray background
      bgClass = "bg-[#e5e7eb]";
      if (isHovered) {
        bgClass = "bg-[#d1d5db]"; // Slightly darker on hover
      }
    } else if (isHovered) {
      bgClass = "bg-[#f3f4f6]"; // Regular gray when no button is active
    } else {
      bgClass = "bg-transparent hover:bg-[#f3f4f6]";
    }

    // Rounded corners logic - sharp edges when adjacent to active/hovered buttons
    let roundedClass = "rounded-full";

    if (hasActiveButton) {
      // Check if this button is adjacent to active button
      const isAdjacentToActive =
        (activeButton === "location" && button === "checkin") ||
        (activeButton === "checkin" &&
          (button === "location" || button === "checkout")) ||
        (activeButton === "checkout" &&
          (button === "checkin" || button === "guests")) ||
        (activeButton === "guests" && button === "checkout");

      // Check if this button is adjacent to hovered button
      const isAdjacentToHovered =
        (hoveredButton === "location" && button === "checkin") ||
        (hoveredButton === "checkin" &&
          (button === "location" || button === "checkout")) ||
        (hoveredButton === "checkout" &&
          (button === "checkin" || button === "guests")) ||
        (hoveredButton === "guests" && button === "checkout");

      if (isActive) {
        // Active button gets sharp edges on sides touching hovered buttons
        if (hoveredButton === "checkin" && button === "location") {
          roundedClass = "rounded-l-full rounded-r-none"; // Sharp right edge
        } else if (hoveredButton === "location" && button === "checkin") {
          roundedClass = "rounded-r-full rounded-l-none"; // Sharp left edge
        } else if (hoveredButton === "checkout" && button === "checkin") {
          roundedClass = "rounded-l-full rounded-r-none"; // Sharp right edge
        } else if (hoveredButton === "checkin" && button === "checkout") {
          roundedClass = "rounded-r-full rounded-l-none"; // Sharp left edge
        } else if (hoveredButton === "guests" && button === "checkout") {
          roundedClass = "rounded-l-full rounded-r-none"; // Sharp right edge
        } else if (hoveredButton === "checkout" && button === "guests") {
          roundedClass = "rounded-r-full rounded-l-none"; // Sharp left edge
        }
      } else if (isHovered && isAdjacentToActive) {
        // Hovered button gets sharp edge on side touching active button
        if (activeButton === "location" && button === "checkin") {
          roundedClass = "rounded-r-full rounded-l-none"; // Sharp left edge
        } else if (activeButton === "checkin" && button === "location") {
          roundedClass = "rounded-l-full rounded-r-none"; // Sharp right edge
        } else if (activeButton === "checkin" && button === "checkout") {
          roundedClass = "rounded-r-full rounded-l-none"; // Sharp left edge
        } else if (activeButton === "checkout" && button === "checkin") {
          roundedClass = "rounded-l-full rounded-r-none"; // Sharp right edge
        } else if (activeButton === "checkout" && button === "guests") {
          roundedClass = "rounded-r-full rounded-l-none"; // Sharp left edge
        } else if (activeButton === "guests" && button === "checkout") {
          roundedClass = "rounded-l-full rounded-r-none"; // Sharp right edge
        }
      }
    }

    return `${bgClass} ${roundedClass} transition-all duration-200`;
  };

  const handleSearch = () => {
    // Validate dates before search
    if (dateRange.from && dateRange.to && !isDateValid) {
      setActiveButton("checkin");
      return;
    }

    const searchParams = new URLSearchParams();

    if (selectedLocation) {
      searchParams.set("location", selectedLocation);
    }
    if (dateRange.from) {
      searchParams.set(
        "checkIn",
        dateRange.from.toISOString().split("T")[0] ?? ""
      );
    }
    if (dateRange.to) {
      searchParams.set(
        "checkOut",
        dateRange.to.toISOString().split("T")[0] ?? ""
      );
    }

    const totalGuests = guests.adults + guests.children + guests.infants;
    if (totalGuests > 0) {
      searchParams.set("guests", totalGuests.toString());
      searchParams.set("adults", guests.adults.toString());
      searchParams.set("children", guests.children.toString());
      searchParams.set("infants", guests.infants.toString());
    }

    // Get current locale from pathname
    const pathParts = pathname.split("/");
    const locale = pathParts[1] || "en";

    const searchUrl = `/${locale}/listings${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    router.push(searchUrl);

    if (onClose) {
      onClose();
    }
  };

  return (
    <div className="relative w-full" ref={searchBarRef}>
      <div
        className={`flex items-center border border-[#e5e7eb] rounded-full shadow-sm transition-colors ${
          activeButton ? "bg-[#e5e7eb]" : "bg-white"
        }`}
      >
        {/* Location Button */}
        <button
          className={`flex-[1.8] px-6 py-3 ${getButtonStyling("location")}`}
          onMouseEnter={() => setHoveredButton("location")}
          onMouseLeave={() => setHoveredButton(null)}
          onClick={() => handleButtonClick("location")}
        >
          <div className="text-left">
            <div className="text-sm font-semibold text-[#000000] mb-1">
              Location
            </div>
            <div className="text-sm text-[#6b7280]">
              {selectedLocation || "Where are you going?"}
            </div>
          </div>
        </button>

        {/* Divider 1 */}
        <div
          className={`w-px h-8 bg-[#e5e7eb] transition-opacity duration-200 ${
            isLineHidden("location-checkin") ? "opacity-0" : "opacity-100"
          }`}
        ></div>

        {/* Unified Date Section (Check in + Check out) */}
        <div
          className={`flex-[2] flex items-center ${
            activeButton === "checkin" || activeButton === "checkout"
              ? "bg-white shadow-md rounded-full"
              : hoveredButton === "checkin" || hoveredButton === "checkout"
                ? "bg-[#f3f4f6] rounded-full"
                : activeButton
                  ? "bg-[#e5e7eb] rounded-full"
                  : ""
          } transition-all duration-200`}
          onMouseEnter={() => {
            if (!activeButton || (activeButton !== "checkin" && activeButton !== "checkout")) {
              setHoveredButton("checkin");
            }
          }}
          onMouseLeave={() => setHoveredButton(null)}
        >
          {/* Check in Button */}
          <button
            className={`flex-1 px-5 py-3 rounded-l-full transition-all duration-200 ${
              activeButton === "checkin"
                ? "bg-white"
                : activeButton === "checkout"
                  ? "bg-transparent"
                  : ""
            }`}
            onClick={() => handleButtonClick("checkin")}
          >
            <div className="text-left">
              <div className="text-sm font-semibold text-[#000000] mb-1">
                Check in
              </div>
              <div className="text-sm text-[#6b7280]">{getCheckInDisplayText()}</div>
            </div>
          </button>

          {/* Subtle Inner Divider */}
          <div className="w-px h-10 bg-[#e5e7eb]/50"></div>

          {/* Check out Button */}
          <button
            className={`flex-1 px-5 py-3 rounded-r-full transition-all duration-200 ${
              activeButton === "checkout"
                ? "bg-white"
                : activeButton === "checkin"
                  ? "bg-transparent"
                  : ""
            }`}
            onClick={() => handleButtonClick("checkout")}
          >
            <div className="text-left">
              <div className="text-sm font-semibold text-[#000000] mb-1">
                Check out
              </div>
              <div className="text-sm text-[#6b7280]">{getCheckOutDisplayText()}</div>
            </div>
          </button>
        </div>

        {/* Divider 3 */}
        <div
          className={`w-px h-8 bg-[#e5e7eb] transition-opacity duration-200 ${
            isLineHidden("checkout-guests") ? "opacity-0" : "opacity-100"
          }`}
        ></div>

        {/* Guests Button + Search Button Container */}
        <div
          className={`flex-[2.2] flex items-center ${getButtonStyling("guests")}`}
          onMouseEnter={() => setHoveredButton("guests")}
          onMouseLeave={() => setHoveredButton(null)}
        >
          {/* Guests Button */}
          <div
            className="flex-1 px-6 py-3 text-left"
            onClick={() => handleButtonClick("guests")}
          >
            <div className="text-sm font-semibold text-[#000000] mb-1">
              Guests
            </div>
            <div className="text-sm text-[#6b7280]">{getGuestDisplayText()}</div>
          </div>

          {/* Search Button */}
          <div className="pr-2">
            <Button
              onClick={handleSearch}
              size="icon"
              className={`rounded-full bg-[#de3151] hover:bg-[#de3151]/90 text-white transition-all duration-300 ${
                activeButton ? "w-28 h-14 px-4" : "w-12 h-12"
              }`}
            >
              <Search className="w-4 h-4" />
              {activeButton && (
                <span className="ml-2 text-sm font-medium">Search</span>
              )}
              <span className="sr-only">Search</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Dropdown Menus */}
      {activeButton === "location" && (
        <div className="absolute top-full left-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-lg border border-[#e5e7eb] p-6 z-10 overflow-hidden">
          <LocationDropdown
            searchQuery={searchQuery}
            suggestions={suggestions}
            popularLocations={popularLocations}
            isLoading={isLoadingLocations}
            error={locationError}
            onSearchQueryChange={searchLocations}
            onLocationSelect={handleLocationSelect}
          />
        </div>
      )}

      {activeButton === "checkin" && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-lg border border-[#e5e7eb] p-3 z-10 overflow-hidden">
          <BigSearchDatePicker
            dateRange={dateRange}
            onDateChange={handleDateChange}
          />
        </div>
      )}

      {activeButton === "checkout" && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-lg border border-[#e5e7eb] p-3 z-10 overflow-hidden">
          <BigSearchDatePicker
            dateRange={dateRange}
            onDateChange={handleDateChange}
          />
        </div>
      )}

      {activeButton === "guests" && (
        <div className="absolute top-full right-0 mt-2 w-96 bg-white rounded-2xl shadow-lg border border-[#e5e7eb] p-6 z-10">
          <GuestSelectorDropdown
            guests={guests}
            onGuestChange={handleGuestChange}
          />
        </div>
      )}
    </div>
  );
}
