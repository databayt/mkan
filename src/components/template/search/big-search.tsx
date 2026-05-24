"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import LocationDropdown from "./location";
import BigSearchDatePicker from "./big-search-date-picker";
import GuestSelectorDropdown from "./guest-selector";
import { useLocationSuggestions } from "./hooks/use-location-suggestions";
import { useSearchValidation } from "@/hooks/useSearchValidation";
import { type LocationSuggestion } from "@/lib/schemas/search-schema";
import { useDictionary } from "@/components/internationalization/dictionary-context";

// Slide-and-fade downward when a dropdown opens — gives the impression
// that the panel is emerging from beneath the search bar, without the bar
// itself shifting.
const DROPDOWN_TRANSITION = { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const };
const dropdownMotion = {
  initial: { opacity: 0, y: -6, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.985 },
};

type ActiveButton = "location" | "dates" | "guests" | null;

interface BigSearchProps {
  onClose?: () => void;
  // When the parent toggles this off (e.g. header collapses on scroll),
  // reset any open dropdown so it doesn't reappear when the header re-expands.
  isActive?: boolean;
}

export default function BigSearch({ onClose, isActive = true }: BigSearchProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const dict = useDictionary();
  const [activeButton, setActiveButton] = useState<ActiveButton>(null);
  const [hoveredButton, setHoveredButton] = useState<ActiveButton>(null);
  const searchBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // When the parent collapses the search bar (isActive=false), reset any
    // open dropdown so it doesn't reappear on re-expand. Sync from prop —
    // intentional setState-in-effect.
    if (!isActive) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset on parent prop change; reverse-state-derivation would need controlled mode.
      setActiveButton(null);
      setHoveredButton(null);
    }
  }, [isActive]);

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
      setActiveButton("dates"); // Move to next field
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

  // Get combined dates display text for the single "When" segment
  const getDatesDisplayText = () => {
    if (dateRange.from && dateRange.to) {
      return `${formatDate(dateRange.from)} – ${formatDate(dateRange.to)}`;
    }
    if (dateRange.from) {
      return formatDate(dateRange.from);
    }
    return dict.search?.addDates ?? "Add dates";
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
    if (total === 0) return dict.search?.addGuests ?? "Add guests";

    const parts = [];
    if (guests.adults > 0) {
      parts.push(`${guests.adults} ${guests.adults > 1 ? (dict.search?.adults ?? "adults") : (dict.search?.adult ?? "adult")}`);
    }
    if (guests.children > 0) {
      parts.push(`${guests.children} ${guests.children > 1 ? (dict.search?.children ?? "children") : (dict.search?.child ?? "child")}`);
    }
    if (guests.infants > 0) {
      parts.push(`${guests.infants} ${guests.infants > 1 ? (dict.search?.infants ?? "infants") : (dict.search?.infant ?? "infant")}`);
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

  const isLineHidden = (position: "location-dates" | "dates-guests") => {
    switch (position) {
      case "location-dates":
        return (
          hoveredButton === "location" ||
          hoveredButton === "dates" ||
          activeButton === "location" ||
          activeButton === "dates"
        );
      case "dates-guests":
        return (
          hoveredButton === "dates" ||
          hoveredButton === "guests" ||
          activeButton === "dates" ||
          activeButton === "guests"
        );
      default:
        return false;
    }
  };

  // Helper function to get button styling.
  //
  // The pill background lives on a `before:` pseudo-element (not the button
  // itself) so a hovered neighbor can extend its fill *under* the active white
  // pill. Two convex rounded caps facing each other would otherwise leave a
  // lighter #EBEBEB lens at the seam; tucking the darker #DDDDDD behind the
  // active pill (which sits at z-20) fills that notch instead.
  const getButtonStyling = (button: ActiveButton) => {
    const isActive = activeButton === button;
    const isHovered = hoveredButton === button;
    const hasActiveButton = activeButton !== null;

    // Stacking: active pill paints above its neighbors so their extended fills
    // tuck underneath it.
    const z = isActive ? "z-20" : "z-10";

    // Pseudo background color by state.
    let bgClass = "";
    if (isActive) {
      bgClass = "before:bg-white before:shadow-md";
    } else if (hasActiveButton) {
      // Another segment is active: blend into the bar's #EBEBEB, darken on hover.
      bgClass = isHovered ? "before:bg-[#DDDDDD]" : "";
    } else if (isHovered) {
      bgClass = "before:bg-[#EBEBEB]";
    }

    // Seam fill: when a neighbor of the active pill is hovered, stretch its
    // pseudo past the cap radius toward the active side AND square off the edge
    // that tucks under the white pill. A rounded edge would recede at the
    // top/bottom corners and leave a light-gray notch; squaring it fills the
    // full height while the square edge stays hidden under the white pill.
    // Exactly one start/end inset and a non-conflicting round class are emitted.
    const order: Exclude<ActiveButton, null>[] = ["location", "dates", "guests"];
    let insetStart = "before:start-0";
    let insetEnd = "before:end-0";
    let roundClass = "before:rounded-full";
    if (activeButton !== null && !isActive && isHovered && button !== null) {
      const activeIdx = order.indexOf(activeButton);
      const buttonIdx = order.indexOf(button);
      if (buttonIdx === activeIdx + 1) {
        // Active is to my left → extend left under it, square the left edge.
        insetStart = "before:-start-10";
        roundClass = "before:rounded-e-full before:rounded-s-none";
      } else if (buttonIdx === activeIdx - 1) {
        // Active is to my right → extend right under it, square the right edge.
        insetEnd = "before:-end-10";
        roundClass = "before:rounded-s-full before:rounded-e-none";
      }
    }

    return `relative ${z} before:absolute before:inset-y-0 ${insetStart} ${insetEnd} before:-z-10 ${roundClass} before:transition-colors before:duration-200 before:content-[''] ${bgClass} transition-all duration-200`;
  };

  const handleSearch = () => {
    // Validate dates before search
    if (dateRange.from && dateRange.to && !isDateValid) {
      setActiveButton("dates");
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
    const locale = pathParts[1] || "ar";

    const searchUrl = `/${locale}/search${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    router.push(searchUrl);

    if (onClose) {
      onClose();
    }
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto" ref={searchBarRef}>
      <div
        className={`flex items-center border border-[#e5e7eb] rounded-full shadow-sm transition-colors ${
          activeButton ? "bg-[#EBEBEB]" : "bg-white"
        }`}
      >
        {/* Where Button */}
        <button
          className={`flex-1 min-w-0 px-6 py-3 ${getButtonStyling("location")}`}
          onMouseEnter={() => setHoveredButton("location")}
          onMouseLeave={() => setHoveredButton(null)}
          onClick={() => handleButtonClick("location")}
        >
          <div className="text-start">
            <div className="text-[13px] font-medium text-[#000000] mb-0.5">
              {dict.search?.where ?? "Where"}
            </div>
            <div className="text-[13px] text-[#6b7280]">
              {selectedLocation || (dict.search?.searchDestinations ?? "Search destinations")}
            </div>
          </div>
        </button>

        {/* Divider 1 */}
        <div
          className={`w-px h-8 bg-[#e5e7eb] transition-opacity duration-200 ${
            isLineHidden("location-dates") ? "opacity-0" : "opacity-100"
          }`}
        ></div>

        {/* When Button (combined dates) */}
        <button
          className={`flex-1 min-w-0 px-6 py-3 ${getButtonStyling("dates")}`}
          onMouseEnter={() => setHoveredButton("dates")}
          onMouseLeave={() => setHoveredButton(null)}
          onClick={() => handleButtonClick("dates")}
        >
          <div className="text-start">
            <div className="text-[13px] font-medium text-[#000000] mb-0.5">
              {dict.search?.when ?? "When"}
            </div>
            <div className="text-[13px] text-[#6b7280]">{getDatesDisplayText()}</div>
          </div>
        </button>

        {/* Divider 2 */}
        <div
          className={`w-px h-8 bg-[#e5e7eb] transition-opacity duration-200 ${
            isLineHidden("dates-guests") ? "opacity-0" : "opacity-100"
          }`}
        ></div>

        {/* Guests Button + Search Button Container */}
        <div
          className={`flex-[1.15] min-w-0 flex items-center ${getButtonStyling("guests")}`}
          onMouseEnter={() => setHoveredButton("guests")}
          onMouseLeave={() => setHoveredButton(null)}
        >
          {/* Guests Button */}
          <div
            className="flex-1 px-6 py-3 text-start"
            onClick={() => handleButtonClick("guests")}
          >
            <div className="text-[13px] font-medium text-[#000000] mb-0.5">
              {dict.search?.who ?? "Who"}
            </div>
            <div className="text-[13px] text-[#6b7280]">{getGuestDisplayText()}</div>
          </div>

          {/* Search Button. Width expands on active; height stays fixed so
              opening a dropdown never nudges the pill's vertical position. */}
          <div className="pe-2">
            <Button
              onClick={handleSearch}
              size="icon"
              className={`rounded-full bg-[#de3151] hover:bg-[#de3151]/90 text-white h-12 transition-[width,padding] duration-300 ${
                activeButton ? "w-28 px-4" : "w-12"
              }`}
            >
              <Search className="w-4 h-4" />
              {activeButton && (
                <span className="ms-2 text-sm font-medium">{dict.search?.searchButton ?? "Search"}</span>
              )}
              <span className="sr-only">{dict.search?.searchButton ?? "Search"}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Dropdown Menus — absolute top-full anchors them below the pill, so
          the pill never shifts. Framer-motion slides each panel down a few
          pixels on enter/exit to reinforce the "emerging from below" feel. */}
      <AnimatePresence>
        {activeButton === "location" && (
          <motion.div
            key="dropdown-location"
            {...dropdownMotion}
            transition={DROPDOWN_TRANSITION}
            style={{ transformOrigin: "top center", willChange: "transform, opacity" }}
            className="absolute top-full left-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-lg border border-[#e5e7eb] p-6 z-10 overflow-hidden"
          >
            <LocationDropdown
              searchQuery={searchQuery}
              suggestions={suggestions}
              popularLocations={popularLocations}
              isLoading={isLoadingLocations}
              error={locationError}
              onSearchQueryChange={searchLocations}
              onLocationSelect={handleLocationSelect}
            />
          </motion.div>
        )}

        {activeButton === "dates" && (
          <motion.div
            key="dropdown-dates"
            {...dropdownMotion}
            transition={DROPDOWN_TRANSITION}
            style={{ transformOrigin: "top center", willChange: "transform, opacity" }}
            className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white rounded-2xl shadow-lg border border-[#e5e7eb] p-2 z-10"
          >
            <BigSearchDatePicker
              dateRange={dateRange}
              onDateChange={handleDateChange}
            />
          </motion.div>
        )}

        {activeButton === "guests" && (
          <motion.div
            key="dropdown-guests"
            {...dropdownMotion}
            transition={DROPDOWN_TRANSITION}
            style={{ transformOrigin: "top center", willChange: "transform, opacity" }}
            className="absolute top-full right-0 mt-2 w-96 bg-white rounded-2xl shadow-lg border border-[#e5e7eb] p-6 z-10"
          >
            <GuestSelectorDropdown
              guests={guests}
              onGuestChange={handleGuestChange}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
