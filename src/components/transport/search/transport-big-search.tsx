"use client";

import { Search, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import TransportCityDropdown from "./transport-city-dropdown";
import TransportDatePicker from "./transport-date-picker";

type ActiveButton = "origin" | "destination" | "date" | null;

interface AssemblyPoint {
  id: number;
  name: string;
  nameAr: string | null;
  city: string;
}

interface TransportBigSearchProps {
  assemblyPoints?: AssemblyPoint[];
  dictionary?: {
    from: string;
    to: string;
    date: string;
    search: string;
    swap: string;
    selectCity: string;
    selectDate: string;
  };
  initialOrigin?: string;
  initialDestination?: string;
  initialDate?: Date;
  lang?: string;
}

export default function TransportBigSearch({
  assemblyPoints = [],
  dictionary = {
    from: "From",
    to: "To",
    date: "Travel Date",
    search: "Search",
    swap: "Swap cities",
    selectCity: "Select city",
    selectDate: "Select date",
  },
  initialOrigin = "",
  initialDestination = "",
  initialDate,
  lang = "en",
}: TransportBigSearchProps) {
  const router = useRouter();
  const [activeButton, setActiveButton] = useState<ActiveButton>(null);
  const [hoveredButton, setHoveredButton] = useState<ActiveButton>(null);
  const searchBarRef = useRef<HTMLDivElement>(null);

  // Form state
  const [origin, setOrigin] = useState(initialOrigin);
  const [destination, setDestination] = useState(initialDestination);
  const [date, setDate] = useState<Date | undefined>(initialDate);

  const handleButtonClick = (button: ActiveButton) => {
    setActiveButton(activeButton === button ? null : button);
  };

  // Swap origin and destination
  const handleSwap = () => {
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
  };

  // Handle origin selection
  const handleOriginSelect = (city: string) => {
    setOrigin(city);
    setActiveButton("destination"); // Move to destination
  };

  // Handle destination selection
  const handleDestinationSelect = (city: string) => {
    setDestination(city);
    setActiveButton("date"); // Move to date
  };

  // Handle date selection
  const handleDateChange = (selectedDate: Date | undefined) => {
    setDate(selectedDate);
    if (selectedDate) {
      setActiveButton(null); // Close dropdown
    }
  };

  // Format date for display
  const formatDate = (date: Date | undefined) => {
    if (!date) return dictionary.selectDate;
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Handle search
  const handleSearch = () => {
    if (!origin || !destination || !date) return;

    const searchParams = new URLSearchParams();
    searchParams.set("origin", origin);
    searchParams.set("destination", destination);
    searchParams.set("date", date.toISOString().split("T")[0]);

    router.push(`/${lang}/transport/search?${searchParams.toString()}`);
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

  // Check if divider should be hidden
  const isLineHidden = (position: "origin-destination" | "destination-date") => {
    switch (position) {
      case "origin-destination":
        return (
          hoveredButton === "origin" ||
          hoveredButton === "destination" ||
          activeButton === "origin" ||
          activeButton === "destination"
        );
      case "destination-date":
        return (
          hoveredButton === "destination" ||
          hoveredButton === "date" ||
          activeButton === "destination" ||
          activeButton === "date"
        );
      default:
        return false;
    }
  };

  // Get button styling
  const getButtonStyling = (button: ActiveButton) => {
    const isActive = activeButton === button;
    const isHovered = hoveredButton === button;
    const hasActiveButton = activeButton !== null;

    // Base background color
    let bgClass = "bg-transparent";
    if (isActive) {
      bgClass = "bg-white shadow-md";
    } else if (hasActiveButton) {
      bgClass = "bg-[#e5e7eb]";
      if (isHovered) {
        bgClass = "bg-[#d1d5db]";
      }
    } else if (isHovered) {
      bgClass = "bg-[#f3f4f6]";
    } else {
      bgClass = "bg-transparent hover:bg-[#f3f4f6]";
    }

    // Rounded corners logic
    let roundedClass = "rounded-full";

    if (hasActiveButton) {
      if (isActive) {
        // Active button sharp edges towards hovered neighbors
        if (hoveredButton === "destination" && button === "origin") {
          roundedClass = "rounded-l-full rounded-r-none";
        } else if (hoveredButton === "origin" && button === "destination") {
          roundedClass = "rounded-r-full rounded-l-none";
        } else if (hoveredButton === "date" && button === "destination") {
          roundedClass = "rounded-l-full rounded-r-none";
        } else if (hoveredButton === "destination" && button === "date") {
          roundedClass = "rounded-r-full rounded-l-none";
        }
      } else if (isHovered) {
        // Hovered button sharp edges towards active neighbor
        if (activeButton === "origin" && button === "destination") {
          roundedClass = "rounded-r-full rounded-l-none";
        } else if (activeButton === "destination" && button === "origin") {
          roundedClass = "rounded-l-full rounded-r-none";
        } else if (activeButton === "destination" && button === "date") {
          roundedClass = "rounded-r-full rounded-l-none";
        } else if (activeButton === "date" && button === "destination") {
          roundedClass = "rounded-l-full rounded-r-none";
        }
      }
    }

    return `${bgClass} ${roundedClass} transition-all duration-200`;
  };

  const canSearch = origin && destination && date;

  return (
    <div className="relative w-full max-w-4xl mx-auto" ref={searchBarRef}>
      <div
        className={`flex items-center border border-[#e5e7eb] rounded-full shadow-sm transition-colors ${
          activeButton ? "bg-[#e5e7eb]" : "bg-white"
        }`}
      >
        {/* Origin Button */}
        <button
          className={`flex-[1.5] px-6 py-3 ${getButtonStyling("origin")}`}
          onMouseEnter={() => setHoveredButton("origin")}
          onMouseLeave={() => setHoveredButton(null)}
          onClick={() => handleButtonClick("origin")}
        >
          <div className="text-left">
            <div className="text-sm font-semibold text-[#000000] mb-1">
              {dictionary.from}
            </div>
            <div className="text-sm text-[#6b7280] truncate">
              {origin || dictionary.selectCity}
            </div>
          </div>
        </button>

        {/* Divider 1 */}
        <div
          className={`w-px h-8 bg-[#e5e7eb] transition-opacity duration-200 ${
            isLineHidden("origin-destination") ? "opacity-0" : "opacity-100"
          }`}
        />

        {/* Swap Button (positioned in the middle) */}
        <button
          onClick={handleSwap}
          className="absolute left-1/2 -translate-x-[calc(50%+2rem)] z-10 w-8 h-8 rounded-full border border-[#e5e7eb] bg-white flex items-center justify-center hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm"
          title={dictionary.swap}
        >
          <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
        </button>

        {/* Destination Button */}
        <button
          className={`flex-[1.5] px-6 py-3 ${getButtonStyling("destination")}`}
          onMouseEnter={() => setHoveredButton("destination")}
          onMouseLeave={() => setHoveredButton(null)}
          onClick={() => handleButtonClick("destination")}
        >
          <div className="text-left">
            <div className="text-sm font-semibold text-[#000000] mb-1">
              {dictionary.to}
            </div>
            <div className="text-sm text-[#6b7280] truncate">
              {destination || dictionary.selectCity}
            </div>
          </div>
        </button>

        {/* Divider 2 */}
        <div
          className={`w-px h-8 bg-[#e5e7eb] transition-opacity duration-200 ${
            isLineHidden("destination-date") ? "opacity-0" : "opacity-100"
          }`}
        />

        {/* Date + Search Button Container */}
        <div
          className={`flex-[2] flex items-center ${getButtonStyling("date")}`}
          onMouseEnter={() => setHoveredButton("date")}
          onMouseLeave={() => setHoveredButton(null)}
        >
          {/* Date Button */}
          <div
            className="flex-1 px-6 py-3 text-left cursor-pointer"
            onClick={() => handleButtonClick("date")}
          >
            <div className="text-sm font-semibold text-[#000000] mb-1">
              {dictionary.date}
            </div>
            <div className="text-sm text-[#6b7280]">{formatDate(date)}</div>
          </div>

          {/* Search Button */}
          <div className="pr-2">
            <Button
              onClick={handleSearch}
              disabled={!canSearch}
              size="icon"
              className={`rounded-full bg-[#de3151] hover:bg-[#de3151]/90 text-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
                activeButton ? "w-28 h-14 px-4" : "w-12 h-12"
              }`}
            >
              <Search className="w-4 h-4" />
              {activeButton && (
                <span className="ml-2 text-sm font-medium">
                  {dictionary.search}
                </span>
              )}
              <span className="sr-only">{dictionary.search}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Dropdown Menus */}
      {activeButton === "origin" && (
        <div className="absolute top-full left-0 mt-2 w-96 bg-white rounded-2xl shadow-lg border border-[#e5e7eb] p-6 z-10">
          <TransportCityDropdown
            value={origin}
            onChange={handleOriginSelect}
            assemblyPoints={assemblyPoints}
            placeholder="Search origin city..."
          />
        </div>
      )}

      {activeButton === "destination" && (
        <div className="absolute top-full left-1/4 mt-2 w-96 bg-white rounded-2xl shadow-lg border border-[#e5e7eb] p-6 z-10">
          <TransportCityDropdown
            value={destination}
            onChange={handleDestinationSelect}
            assemblyPoints={assemblyPoints}
            placeholder="Search destination city..."
          />
        </div>
      )}

      {activeButton === "date" && (
        <div className="absolute top-full right-0 mt-2 bg-white rounded-2xl shadow-lg border border-[#e5e7eb] p-4 z-10">
          <TransportDatePicker date={date} onDateChange={handleDateChange} />
        </div>
      )}
    </div>
  );
}
