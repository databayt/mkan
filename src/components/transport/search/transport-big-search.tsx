"use client";

import { Search, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import TransportCityDropdown from "./transport-city-dropdown";
import TransportDatePicker from "./transport-date-picker";
import { isRTL as checkRTL, type Locale } from "@/components/internationalization/config";
import { intlLocaleFor } from "@/lib/i18n/date-locale";

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
    selectCity: "Select city",
    selectDate: "Select date",
  },
  initialOrigin = "",
  initialDestination = "",
  initialDate,
  lang = "en",
}: TransportBigSearchProps) {
  const router = useRouter();
  const isRTL = checkRTL(lang as Locale);
  const [activeButton, setActiveButton] = useState<ActiveButton>(null);
  const [hoveredButton, setHoveredButton] = useState<ActiveButton>(null);
  const searchBarRef = useRef<HTMLDivElement>(null);
  const destinationBtnRef = useRef<HTMLButtonElement>(null);
  const originBtnRef = useRef<HTMLButtonElement>(null);

  // Form state
  const [origin, setOrigin] = useState(initialOrigin);
  const [destination, setDestination] = useState(initialDestination);
  const [date, setDate] = useState<Date | undefined>(initialDate);

  const handleButtonClick = (button: ActiveButton) => {
    setActiveButton(activeButton === button ? null : button);
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
    const locale = intlLocaleFor(lang as Locale);
    return date.toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Handle search
  const handleSearch = () => {
    if (!origin || !destination || !date) return;

    const searchParams = new URLSearchParams();

    const resolveCity = (label: string) =>
      assemblyPoints.find(
        (p) =>
          p.city.toLowerCase() === label.toLowerCase() ||
          p.name.toLowerCase() === label.toLowerCase(),
      );

    const originMatch = resolveCity(origin);
    const destinationMatch = resolveCity(destination);

    if (originMatch) searchParams.set("originId", String(originMatch.id));
    if (destinationMatch) searchParams.set("destinationId", String(destinationMatch.id));
    searchParams.set("origin", origin);
    searchParams.set("destination", destination);
    searchParams.set("date", date.toISOString().split("T")[0] ?? '');

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

  // Get button styling with glass morphism
  const getButtonStyling = (button: ActiveButton) => {
    const isActive = activeButton === button;
    const isHovered = hoveredButton === button;
    const hasActiveButton = activeButton !== null;

    // Glass morphism background colors
    let bgClass = "bg-transparent";
    if (isActive) {
      bgClass = "bg-white/30 backdrop-blur-md shadow-lg";
    } else if (hasActiveButton) {
      bgClass = "bg-transparent";
      if (isHovered) {
        bgClass = "bg-white/20 backdrop-blur-md";
      }
    } else if (isHovered) {
      bgClass = "bg-white/20 backdrop-blur-md";
    } else {
      bgClass = "bg-transparent hover:bg-white/20 hover:backdrop-blur-md";
    }

    return `${bgClass} rounded-full transition-all duration-200`;
  };

  const canSearch = origin && destination && date;

  return (
    <div className="relative w-full max-w-4xl mx-auto" ref={searchBarRef}>
      {/* Desktop Layout */}
      <div
        className={cn(
          "hidden md:flex items-center rounded-full shadow-sm transition-colors liquid-glass",
          activeButton ? "bg-[#e5e7eb]/80" : "bg-white/20"
        )}
      >
        {/* Origin Button */}
        <button
          ref={originBtnRef}
          className={`flex-[1.5] px-6 py-3 ${getButtonStyling("origin")}`}
          onMouseEnter={() => setHoveredButton("origin")}
          onMouseLeave={() => setHoveredButton(null)}
          onClick={() => handleButtonClick("origin")}
        >
          <div className="text-start">
            <div className="text-sm font-semibold text-white mb-1">
              {dictionary.from}
            </div>
            <div className="text-sm text-white/70 truncate">
              {origin || dictionary.selectCity}
            </div>
          </div>
        </button>

        {/* Divider 1 */}
        <div
          className={cn(
            "w-px h-8 bg-white/30 transition-opacity duration-200",
            isLineHidden("origin-destination") ? "opacity-0" : "opacity-100"
          )}
        />

        {/* Destination Button */}
        <button
          ref={destinationBtnRef}
          className={`flex-[1.5] px-6 py-3 ${getButtonStyling("destination")}`}
          onMouseEnter={() => setHoveredButton("destination")}
          onMouseLeave={() => setHoveredButton(null)}
          onClick={() => handleButtonClick("destination")}
        >
          <div className="text-start">
            <div className="text-sm font-semibold text-white mb-1">
              {dictionary.to}
            </div>
            <div className="text-sm text-white/70 truncate">
              {destination || dictionary.selectCity}
            </div>
          </div>
        </button>

        {/* Divider 2 */}
        <div
          className={cn(
            "w-px h-8 bg-white/30 transition-opacity duration-200",
            isLineHidden("destination-date") ? "opacity-0" : "opacity-100"
          )}
        />

        {/* Date + Search Button Container */}
        <div
          className={`flex-[2] flex items-center ${getButtonStyling("date")}`}
          onMouseEnter={() => setHoveredButton("date")}
          onMouseLeave={() => setHoveredButton(null)}
        >
          {/* Date Button */}
          <div
            className="flex-1 px-6 py-3 text-start cursor-pointer"
            onClick={() => handleButtonClick("date")}
          >
            <div className="text-sm font-semibold text-white mb-1">
              {dictionary.date}
            </div>
            <div className="text-sm text-white/70" dir="ltr">{formatDate(date)}</div>
          </div>

          {/* Search Button */}
          <div className="pe-2">
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
                <span className="ms-2 text-sm font-medium">
                  {dictionary.search}
                </span>
              )}
              <span className="sr-only">{dictionary.search}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden bg-white rounded-2xl shadow-lg border border-[#e5e7eb] p-4 space-y-3">
        {/* Origin */}
        <button
          onClick={() => handleButtonClick(activeButton === "origin" ? null : "origin")}
          className="w-full p-3 rounded-xl border border-[#e5e7eb] hover:border-[#de3151] transition-colors"
        >
          <div className={cn("flex justify-between items-center", isRTL && "flex-row-reverse")}>
            <div className={cn(isRTL ? "text-end" : "text-start")}>
              <div className="text-xs text-[#6b7280]">{dictionary.from}</div>
              <div className="text-sm font-medium text-black">
                {origin || dictionary.selectCity}
              </div>
            </div>
            <ChevronDown className="h-4 w-4 text-[#6b7280]" />
          </div>
        </button>

        {/* Destination */}
        <button
          onClick={() => handleButtonClick(activeButton === "destination" ? null : "destination")}
          className="w-full p-3 rounded-xl border border-[#e5e7eb] hover:border-[#de3151] transition-colors"
        >
          <div className={cn("flex justify-between items-center", isRTL && "flex-row-reverse")}>
            <div className={cn(isRTL ? "text-end" : "text-start")}>
              <div className="text-xs text-[#6b7280]">{dictionary.to}</div>
              <div className="text-sm font-medium text-black">
                {destination || dictionary.selectCity}
              </div>
            </div>
            <ChevronDown className="h-4 w-4 text-[#6b7280]" />
          </div>
        </button>

        {/* Date */}
        <button
          onClick={() => handleButtonClick(activeButton === "date" ? null : "date")}
          className="w-full p-3 rounded-xl border border-[#e5e7eb] hover:border-[#de3151] transition-colors"
        >
          <div className={cn("flex justify-between items-center", isRTL && "flex-row-reverse")}>
            <div className={cn(isRTL ? "text-end" : "text-start")}>
              <div className="text-xs text-[#6b7280]">{dictionary.date}</div>
              <div className="text-sm font-medium text-black" dir="ltr">
                {formatDate(date)}
              </div>
            </div>
            <ChevronDown className="h-4 w-4 text-[#6b7280]" />
          </div>
        </button>

        {/* Search Button */}
        <Button
          onClick={handleSearch}
          disabled={!canSearch}
          className="w-full bg-[#de3151] hover:bg-[#de3151]/90 text-white rounded-xl h-12 disabled:opacity-50"
        >
          <Search className="w-4 h-4" />
          <span className="ms-2">{dictionary.search}</span>
        </Button>
      </div>

      {/* Desktop Dropdown Menus */}
      {activeButton === "origin" && (
        <div
          className={cn(
            "hidden md:block absolute top-full mt-2 w-96 bg-white/20 backdrop-blur-xl rounded-2xl shadow-xl border border-white/30 p-6 z-50",
            isRTL ? "right-0" : "left-0"
          )}
        >
          <TransportCityDropdown
            value={origin}
            onChange={handleOriginSelect}
            assemblyPoints={assemblyPoints}
            placeholder={dictionary.selectCity}
          />
        </div>
      )}

      {activeButton === "destination" && (
        <div
          className="hidden md:block absolute top-full mt-2 w-96 bg-white/20 backdrop-blur-xl rounded-2xl shadow-xl border border-white/30 p-6 z-50"
          /* eslint-disable react-hooks/refs -- Reading destinationBtnRef.current.offsetLeft for one-time positioning fallback when the dropdown opens; the parent re-renders on activeButton change so this stays in sync. */
          style={isRTL
            ? { right: destinationBtnRef.current ? `calc(100% - ${destinationBtnRef.current.offsetLeft + destinationBtnRef.current.offsetWidth}px)` : '25%' }
            : { left: destinationBtnRef.current?.offsetLeft ?? '25%' }
          }
          /* eslint-enable react-hooks/refs */
        >
          <TransportCityDropdown
            value={destination}
            onChange={handleDestinationSelect}
            assemblyPoints={assemblyPoints}
            placeholder={dictionary.selectCity}
          />
        </div>
      )}

      {activeButton === "date" && (
        <div className={cn(
          "hidden md:block absolute top-full mt-2 bg-white/20 backdrop-blur-xl rounded-2xl shadow-xl border border-white/30 p-4 z-50",
          isRTL ? "left-0" : "right-0"
        )}>
          <TransportDatePicker date={date} onDateChange={handleDateChange} />
        </div>
      )}

      {/* Mobile Dropdown Menus */}
      {activeButton === "origin" && (
        <div className="md:hidden absolute top-full left-1/2 -translate-x-1/2 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-200 p-2 z-50">
          <TransportCityDropdown
            value={origin}
            onChange={handleOriginSelect}
            assemblyPoints={assemblyPoints}
            placeholder={dictionary.selectCity}
          />
        </div>
      )}

      {activeButton === "destination" && (
        <div className="md:hidden absolute top-full left-1/2 -translate-x-1/2 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-200 p-2 z-50">
          <TransportCityDropdown
            value={destination}
            onChange={handleDestinationSelect}
            assemblyPoints={assemblyPoints}
            placeholder={dictionary.selectCity}
          />
        </div>
      )}

      {activeButton === "date" && (
        <div className="md:hidden absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white rounded-2xl shadow-xl border border-gray-200 p-4 z-50">
          <TransportDatePicker date={date} onDateChange={handleDateChange} />
        </div>
      )}
    </div>
  );
}
