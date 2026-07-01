"use client";

import { Search, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import TransportCityDropdown from "./transport-city-dropdown";
import TransportDatePicker from "./transport-date-picker";
import { isRTL as checkRTL, type Locale } from "@/components/internationalization/config";
import { useDictionary } from "@/components/internationalization/dictionary-context";

// Motion mirrors the listings BigSearch so the two search bars feel identical to
// operate; only the surface (glass over the dark video, vs. solid white) differs.

// Slide-and-fade downward when the dropdown first opens / fully closes — the panel
// appears to emerge from beneath the bar without the bar itself shifting.
const DROPDOWN_TRANSITION = { duration: 0.2, ease: [0.32, 0.72, 0, 1] as const };
const dropdownMotion = {
  initial: { opacity: 0, y: -8, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.985 },
};

// Segment-switch motion (From ⇄ To ⇄ Date). The frosted active pill is a shared
// `layoutId` element and the dropdown is a single `layout` container, so a spring
// here makes BOTH glide: the pill slides/stretches to the new segment while the
// panel re-anchors and resizes. Tuned for a smooth, no-bounce settle.
const SWITCH_TRANSITION = {
  type: "spring" as const,
  stiffness: 480,
  damping: 42,
  mass: 1,
} as const;

// Content crossfade for the panel body as it swaps From → To → Date. A spring on
// opacity wobbles, so the body uses this short tween instead.
const SWITCH_FADE = { duration: 0.2, ease: [0.32, 0.72, 0, 1] as const };

// The frosted active-segment fill, as ONE shared element. Every active segment
// renders it with the same `layoutId`, so Framer interpolates its position AND
// width as the active segment changes — the pill GLIDES From→To→Date instead of
// three glass fills cross-fading (the listings big-search trick).
//
// MUST live at module scope: defined as a closure inside the component it would
// remount on every render and Framer's layout projection would reset, so the pill
// would snap between segments instead of gliding.
//
// Glass flavor preserved: a translucent white fill + backdrop-blur over the dark
// video, rather than the listings pill's solid-white #DDDDDD-bordered fill.
// zIndex:-1 keeps it above the grey hover pseudo (-z-10) but below the segment
// text; pointer-events-none so it never eats clicks.
function ActivePill() {
  return (
    <motion.div
      layoutId="transportSearchPill"
      transition={SWITCH_TRANSITION}
      aria-hidden
      className="absolute inset-0 rounded-full bg-white/30 backdrop-blur-md pointer-events-none"
      style={{
        zIndex: -1,
        boxShadow:
          "0 4px 24px -1px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.4)",
        border: "1px solid rgba(255,255,255,0.3)",
      }}
    />
  );
}

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
  lang = "ar",
}: TransportBigSearchProps) {
  const router = useRouter();
  const dict = useDictionary();
  const isRTL = checkRTL(lang as Locale);
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
    const locale = lang === 'ar' ? 'ar-SA' : 'en-US';
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

  // Helper function to get button styling.
  //
  // The HOVER fill lives on a `before:` pseudo-element (not the button itself) so
  // a hovered neighbor can extend its fill *under* the active frosted pill. This
  // prevents a lighter gap at the seam between two rounded pills. The ACTIVE fill
  // is no longer a pseudo — it's the shared sliding `ActivePill` (above), which is
  // why the isActive branch emits no background here.
  //
  // Glass colors (white-transparent + backdrop-blur) are kept for the dark video
  // background behind the search bar.
  const getButtonStyling = (button: ActiveButton) => {
    const isActive = activeButton === button;
    const isHovered = hoveredButton === button;
    const hasActiveButton = activeButton !== null;

    // Stacking: active segment sits above its neighbors so the sliding pill (and
    // its content) paint over their extended hover fills.
    const z = isActive ? "z-20" : "z-10";

    // Pseudo background color by state — glass effect colors.
    let bgClass = "";
    if (isActive) {
      // Frosted fill is painted by the shared sliding ActivePill; pseudo stays clear.
      bgClass = "";
    } else if (hasActiveButton) {
      bgClass = isHovered ? "before:bg-white/30" : "";
    } else if (isHovered) {
      bgClass = "before:bg-white/20 before:backdrop-blur-md";
    }

    // Seam fill: when a neighbor of the active pill is hovered, stretch its pseudo
    // past the cap radius toward the active side AND square off the edge that tucks
    // under the active pill. A rounded edge would recede at the top/bottom corners
    // and leave a lighter notch; squaring it fills the full height while the square
    // edge stays hidden under the active pill.
    const order: Exclude<ActiveButton, null>[] = ["origin", "destination", "date"];
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

  const canSearch = origin && destination && date;

  return (
    <div className="relative w-full max-w-4xl mx-auto" ref={searchBarRef}>
      {/* Desktop Layout */}
      <div className="hidden md:flex items-center rounded-full shadow-sm transition-colors liquid-glass">
        {/* Origin Button */}
        <button
          className={`flex-[1.5] px-6 py-3 ${getButtonStyling("origin")}`}
          onMouseEnter={() => setHoveredButton("origin")}
          onMouseLeave={() => setHoveredButton(null)}
          onClick={() => handleButtonClick("origin")}
        >
          {activeButton === "origin" && <ActivePill />}
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
          className={`flex-[1.5] px-6 py-3 ${getButtonStyling("destination")}`}
          onMouseEnter={() => setHoveredButton("destination")}
          onMouseLeave={() => setHoveredButton(null)}
          onClick={() => handleButtonClick("destination")}
        >
          {activeButton === "destination" && <ActivePill />}
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
          {activeButton === "date" && <ActivePill />}
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
              className={`rounded-full bg-[#de3151] hover:bg-[#de3151]/90 text-white transition-[width,padding] duration-300 disabled:opacity-50 disabled:cursor-not-allowed h-12 ${
                activeButton ? "w-28 px-4" : "w-12"
              }`}
            >
              <Search className="w-4 h-4" />
              {activeButton && (
                <span className="ms-2 text-sm font-medium">
                  {dict?.common?.search ?? "Search"}
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

      {/* Desktop Dropdown — ONE container that re-anchors between segments
          (From↔To↔Date). It only enters/exits (fade + rise) on the first open and
          the full close; on a segment switch the `layout` spring glides it to the
          new position/width and the body crossfades. This replaces the previous
          three absolutely-positioned dropdowns (and the brittle ref-offset inline
          positioning for the middle one). Anchors: From→leading edge, Date→trailing
          edge, To→centred under the bar (left:50% + marginLeft is RTL-safe because
          the bar midpoint is direction-agnostic). Glass surface preserved. */}
      <AnimatePresence>
        {activeButton && (
          <motion.div
            key="transport-search-dropdown"
            layout
            initial={dropdownMotion.initial}
            animate={dropdownMotion.animate}
            exit={dropdownMotion.exit}
            transition={{ ...DROPDOWN_TRANSITION, layout: SWITCH_TRANSITION }}
            style={{
              transformOrigin: "top center",
              willChange: "transform, opacity",
              width: activeButton === "date" ? 368 : 384,
              ...(activeButton === "destination"
                ? { left: "50%", marginLeft: -192 }
                : {}),
            }}
            className={cn(
              "hidden md:block absolute top-full mt-2 bg-white/20 backdrop-blur-xl rounded-2xl shadow-xl border border-white/30 z-50 overflow-hidden",
              activeButton === "origin" && "start-0 p-6",
              activeButton === "destination" && "p-6",
              activeButton === "date" && "end-0 p-4"
            )}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={activeButton}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={SWITCH_FADE}
              >
                {activeButton === "origin" && (
                  <TransportCityDropdown
                    value={origin}
                    onChange={handleOriginSelect}
                    assemblyPoints={assemblyPoints}
                    placeholder={dictionary.selectCity}
                  />
                )}
                {activeButton === "destination" && (
                  <TransportCityDropdown
                    value={destination}
                    onChange={handleDestinationSelect}
                    assemblyPoints={assemblyPoints}
                    placeholder={dictionary.selectCity}
                  />
                )}
                {activeButton === "date" && (
                  <TransportDatePicker date={date} onDateChange={handleDateChange} />
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

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
