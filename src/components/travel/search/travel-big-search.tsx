"use client";

import { Search, ArrowUpDown, ArrowLeft, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Counter } from "@/components/atom/counter";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import TransportCityDropdown from "./travel-city-dropdown";
import TransportDatePicker from "./travel-date-picker";
import { MOBILE_BREAKPOINT } from "@/components/template/search/constant";
import { isRTL as checkRTL, type Locale } from "@/components/internationalization/config";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { cityLabel } from "@/components/travel/city-names";

type ActiveButton = "origin" | "destination" | "date" | "passengers" | null;

const STEP_ORDER = ["origin", "destination", "date", "passengers"] as const;

interface AssemblyPoint {
  id: number;
  name: string;
  nameAr: string | null;
  city: string;
}

interface Passengers {
  adults: number;
  children: number;
}

interface TransportSearchDictionary {
  title: string;
  where: string;
  from: string;
  to: string;
  when: string;
  date: string;
  search: string;
  selectCity: string;
  selectDate: string;
  swap: string;
  passengers: string;
  addPassengers: string;
  adults: string;
  adultsAge: string;
  children: string;
  childrenAge: string;
  passenger: string;
  passengersPlural: string;
}

interface TransportBigSearchProps {
  assemblyPoints?: AssemblyPoint[];
  dictionary?: TransportSearchDictionary;
  initialOrigin?: string;
  initialDestination?: string;
  initialDate?: Date;
  lang?: string;
  variant?: "hero" | "header";
  initialField?: ActiveButton;
  onSearch?: () => void;
  ctaLayoutId?: string;
}

const DEFAULT_DICTIONARY: TransportSearchDictionary = {
  title: "Book unique\nadventures and\ntickets.",
  where: "Where",
  from: "From",
  to: "To",
  when: "When",
  date: "Travel Date",
  search: "Search",
  selectCity: "Add city",
  selectDate: "Add date",
  swap: "Swap cities",
  passengers: "Passengers",
  addPassengers: "Add passengers",
  adults: "Adults",
  adultsAge: "Ages 13+",
  children: "Children",
  childrenAge: "Ages 2–12",
  passenger: "passenger",
  passengersPlural: "passengers",
};

// Motion transitions mirroring homes BigSearch
const DROPDOWN_TRANSITION = { duration: 0.2, ease: [0.32, 0.72, 0, 1] as const };
const dropdownMotion = {
  initial: { opacity: 0, y: -8, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.985 },
};

const SWITCH_TRANSITION = {
  type: "spring" as const,
  stiffness: 480,
  damping: 42,
  mass: 1,
} as const;

const SWITCH_FADE = { duration: 0.2, ease: [0.32, 0.72, 0, 1] as const };

const PILL_SHADOW = "rgba(0,0,0,0.1) 0px 3px 12px 0px, rgba(0,0,0,0.08) 0px 1px 2px 0px";

function ActivePill() {
  return (
    <motion.div
      layoutId="searchActivePill"
      transition={SWITCH_TRANSITION}
      aria-hidden
      className="absolute inset-0 rounded-full bg-white pointer-events-none"
      style={{ zIndex: -1, boxShadow: PILL_SHADOW, border: "1px solid #DDDDDD" }}
    />
  );
}

function PassengerSelector({
  passengers,
  onChange,
  dict,
}: {
  passengers: Passengers;
  onChange: (type: keyof Passengers, op: "increment" | "decrement") => void;
  dict: TransportSearchDictionary;
}) {
  const minAdults = passengers.children > 0 ? 1 : 0;
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between py-4 border-b border-[#f0f0f0] first:pt-0">
        <div>
          <div className="font-semibold text-[15px] text-[#222222] leading-5">{dict.adults}</div>
          <div className="text-sm text-muted-foreground font-normal mt-0.5">{dict.adultsAge}</div>
        </div>
        <Counter
          value={passengers.adults}
          onIncrement={() => onChange("adults", "increment")}
          onDecrement={() => onChange("adults", "decrement")}
          min={minAdults}
          max={9}
          sm
        />
      </div>
      <div className="flex items-center justify-between py-4 last:pb-0">
        <div>
          <div className="font-semibold text-[15px] text-[#222222] leading-5">{dict.children}</div>
          <div className="text-sm text-muted-foreground font-normal mt-0.5">{dict.childrenAge}</div>
        </div>
        <Counter
          value={passengers.children}
          onIncrement={() => onChange("children", "increment")}
          onDecrement={() => onChange("children", "decrement")}
          min={0}
          max={9}
          sm
        />
      </div>
    </div>
  );
}

export default function TransportBigSearch({
  assemblyPoints = [],
  dictionary = DEFAULT_DICTIONARY,
  initialOrigin = "",
  initialDestination = "",
  initialDate,
  lang = "ar",
  variant = "hero",
  initialField = null,
  onSearch,
  ctaLayoutId,
}: TransportBigSearchProps) {
  const router = useRouter();
  const dict = useDictionary();
  const isRTL = checkRTL(lang as Locale);
  const inHeader = variant === "header";
  const [activeButton, setActiveButton] = useState<ActiveButton>(initialField);
  const [hoveredButton, setHoveredButton] = useState<ActiveButton>(null);
  const [isMobile, setIsMobile] = useState(false);
  const searchBarRef = useRef<HTMLDivElement>(null);

  // Form state
  const [origin, setOrigin] = useState(initialOrigin);
  const [destination, setDestination] = useState(initialDestination);
  const [date, setDate] = useState<Date | undefined>(initialDate);
  const [passengers, setPassengers] = useState<Passengers>({ adults: 0, children: 0 });

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const handleButtonClick = (button: ActiveButton) => {
    setActiveButton(activeButton === button ? null : button);
  };

  const handleOriginSelect = (city: string) => {
    setOrigin(city);
    setActiveButton("destination");
  };

  const handleDestinationSelect = (city: string) => {
    setDestination(city);
    setActiveButton("date");
  };

  const handleDateChange = (selectedDate: Date | undefined) => {
    setDate(selectedDate);
    if (selectedDate) setActiveButton("passengers");
  };

  const handleSwap = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  const handlePassengerChange = useCallback(
    (type: keyof Passengers, op: "increment" | "decrement") => {
      setPassengers((prev) => {
        const current = prev[type];
        const next =
          op === "increment" ? Math.min(current + 1, 9) : Math.max(0, current - 1);
        const updated = { ...prev, [type]: next };
        if (op === "increment" && type === "children" && updated.adults === 0) {
          updated.adults = 1;
        }
        return updated;
      });
    },
    []
  );

  const totalPassengers = passengers.adults + passengers.children;

  const passengerText = () => {
    if (totalPassengers === 0) return dictionary.addPassengers;
    return `${totalPassengers} ${totalPassengers > 1 ? dictionary.passengersPlural : dictionary.passenger}`;
  };

  const formatDate = (d: Date | undefined) => {
    if (!d) return dictionary.selectDate;
    const locale = lang === "ar" ? "ar-SA" : "en-US";
    return d.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
  };

  const handleSearch = () => {
    const searchParams = new URLSearchParams();

    const resolveCity = (label: string) => {
      if (!label) return undefined;
      return assemblyPoints.find(
        (p) =>
          p.city.toLowerCase() === label.toLowerCase() ||
          p.name.toLowerCase() === label.toLowerCase()
      );
    };

    const originMatch = resolveCity(origin);
    const destinationMatch = resolveCity(destination);

    if (originMatch) searchParams.set("originId", String(originMatch.id));
    if (destinationMatch) searchParams.set("destinationId", String(destinationMatch.id));
    if (origin) searchParams.set("origin", origin);
    if (destination) searchParams.set("destination", destination);
    if (date) searchParams.set("date", date.toISOString().split("T")[0] ?? "");
    if (totalPassengers > 0) searchParams.set("seats", String(totalPassengers));

    router.push(`/${lang}/travel/search?${searchParams.toString()}`);
    onSearch?.();
  };

  const isLineHidden = (position: "origin-destination" | "destination-date" | "date-passengers") => {
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
      case "date-passengers":
        return (
          hoveredButton === "date" ||
          hoveredButton === "passengers" ||
          activeButton === "date" ||
          activeButton === "passengers"
        );
      default:
        return false;
    }
  };

  const getButtonStyling = (button: ActiveButton) => {
    const isActive = activeButton === button;
    const isHovered = hoveredButton === button;
    const hasActiveButton = activeButton !== null;

    const z = isActive ? "z-20" : "z-10";

    let bgClass = "";
    if (isActive) {
      bgClass = "";
    } else if (hasActiveButton) {
      bgClass = isHovered ? "before:bg-[#DDDDDD]" : "";
    } else if (isHovered) {
      bgClass = "before:bg-[#EBEBEB]";
    }

    const order: Exclude<ActiveButton, null>[] = ["origin", "destination", "date", "passengers"];
    let insetStart = "before:start-0";
    let insetEnd = "before:end-0";
    let roundClass = "before:rounded-full";
    if (activeButton !== null && !isActive && isHovered && button !== null) {
      const activeIdx = order.indexOf(activeButton);
      const buttonIdx = order.indexOf(button);
      if (buttonIdx === activeIdx + 1) {
        insetStart = "before:-start-10";
        roundClass = "before:rounded-e-full before:rounded-s-none";
      } else if (buttonIdx === activeIdx - 1) {
        insetEnd = "before:-end-10";
        roundClass = "before:rounded-s-full before:rounded-e-none";
      }
    }

    return `relative ${z} before:absolute before:inset-y-0 ${insetStart} ${insetEnd} before:-z-10 ${roundClass} before:transition-colors before:duration-200 before:content-[''] ${bgClass} transition-all duration-200`;
  };

  const step = activeButton ? STEP_ORDER.indexOf(activeButton) : -1;
  const goPrev = () => {
    const prev = step > 0 ? STEP_ORDER[step - 1] : undefined;
    if (prev) setActiveButton(prev);
  };
  const goNext = () => {
    const next = step >= 0 && step < STEP_ORDER.length - 1 ? STEP_ORDER[step + 1] : undefined;
    if (next) setActiveButton(next);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchBarRef.current && !searchBarRef.current.contains(event.target as Node)) {
        setActiveButton(null);
        setHoveredButton(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const renderFieldStack = () => (
    <div className="space-y-4 md:space-y-3">
      <div>
        <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1 block">
          {dictionary.where}
        </Label>
        <div className="relative">
          <button
            type="button"
            onClick={() => handleButtonClick("origin")}
            className={`w-full h-14 text-start px-3 border border-gray-300 rounded-t-xs bg-transparent`}
          >
            <span className="block text-[11px] font-medium text-[#6b6b6b] leading-none">
              {dictionary.from}
            </span>
            <span className={`block text-sm mt-1 truncate ${origin ? "text-black" : "text-[#c0c0c0]"}`}>
              {origin ? cityLabel(origin, lang) : ""}
            </span>
          </button>
          <button
            type="button"
            onClick={() => handleButtonClick("destination")}
            className={`w-full h-14 text-start px-3 border border-gray-300 border-t-0 rounded-b-xs bg-transparent`}
          >
            <span className="block text-[11px] font-medium text-[#6b6b6b] leading-none">
              {dictionary.to}
            </span>
            <span className={`block text-sm mt-1 truncate ${destination ? "text-black" : "text-[#c0c0c0]"}`}>
              {destination ? cityLabel(destination, lang) : ""}
            </span>
          </button>
          <button
            type="button"
            onClick={handleSwap}
            aria-label={dictionary.swap}
            title={dictionary.swap}
            className="absolute end-3 top-1/2 -translate-y-1/2 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 bg-white text-[#484848] shadow-sm transition-colors hover:border-gray-500 hover:text-black active:scale-95"
          >
            <ArrowUpDown className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>

      <div>
        <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1 block">
          {dictionary.when}
        </Label>
        <button
          type="button"
          onClick={() => handleButtonClick("date")}
          className={`w-full h-14 md:h-12 text-start px-3 border border-gray-300 rounded-xs bg-transparent`}
        >
          <span
            className={`text-sm ${date ? "text-black" : "text-[#c0c0c0]"}`}
            dir={isRTL ? "rtl" : "ltr"}
          >
            {formatDate(date)}
          </span>
        </button>
      </div>

      <div>
        <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1 block">
          {dictionary.passengers}
        </Label>
        <button
          type="button"
          onClick={() => handleButtonClick("passengers")}
          className={`w-full h-14 md:h-12 text-start px-3 border border-gray-300 rounded-xs bg-transparent`}
        >
          <span className={`text-sm ${totalPassengers > 0 ? "text-black" : "text-[#c0c0c0]"}`}>
            {passengerText()}
          </span>
        </button>
      </div>
    </div>
  );

  // ── Mobile Step Flow ─────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className={`relative w-full ${inHeader ? "h-full" : ""}`} ref={searchBarRef}>
        <div
          className={`relative bg-white w-full overflow-hidden ${inHeader ? "" : "shadow-sm"}`}
          style={{ height: inHeader ? "100%" : "min(78vh, 560px)" }}
        >
          {!activeButton ? (
            <div className="h-full overflow-y-auto no-scrollbar px-5 pt-8 pb-24">
              <h1 className="text-2xl font-semibold text-[#484848] mb-6 leading-tight whitespace-pre-line">
                {dictionary.title}
              </h1>
              {renderFieldStack()}
            </div>
          ) : activeButton === "origin" || activeButton === "destination" ? (
            <div className="flex h-full flex-col px-5 pt-16">
              <TransportCityDropdown
                key={activeButton}
                fillHeight
                value={activeButton === "origin" ? origin : destination}
                onChange={activeButton === "origin" ? handleOriginSelect : handleDestinationSelect}
                assemblyPoints={assemblyPoints}
              />
            </div>
          ) : activeButton === "date" ? (
            <div className="h-full overflow-y-auto no-scrollbar px-5 pt-16 pb-24 flex justify-center">
              <TransportDatePicker date={date} onDateChange={handleDateChange} />
            </div>
          ) : (
            <div className="h-full overflow-y-auto no-scrollbar px-5 pt-16 pb-24">
              <PassengerSelector passengers={passengers} onChange={handlePassengerChange} dict={dictionary} />
            </div>
          )}

          {activeButton && (
            <div className="absolute top-5 start-4 z-30 flex items-center gap-3">
              <button
                type="button"
                onClick={goPrev}
                disabled={step <= 0}
                aria-label={dict?.common?.back ?? "Back"}
                className="flex h-7 w-7 items-center justify-center text-[#222222] transition-opacity hover:opacity-60 disabled:opacity-25 disabled:cursor-not-allowed"
              >
                <ArrowLeft className={`h-5 w-5 ${isRTL ? "rotate-180" : ""}`} strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={step >= STEP_ORDER.length - 1}
                aria-label={dict?.common?.next ?? "Next"}
                className="flex h-7 w-7 items-center justify-center text-[#222222] transition-opacity hover:opacity-60 disabled:opacity-25 disabled:cursor-not-allowed"
              >
                <ArrowRight className={`h-5 w-5 ${isRTL ? "rotate-180" : ""}`} strokeWidth={2} />
              </button>
            </div>
          )}

          {ctaLayoutId ? (
            <motion.button
              layoutId={ctaLayoutId}
              onClick={handleSearch}
              style={{ paddingInline: lang === "ar" ? 24 : 16 }}
              className="absolute bottom-5 end-6 z-30 flex h-12 items-center gap-2 rounded-sm text-sm font-semibold bg-[#de3151] hover:bg-[#de3151]/90 text-white shadow-[0_2px_8px_rgba(222,49,81,0.25)]"
            >
              <Search className="h-4 w-4" strokeWidth={2.5} />
              {dictionary.search}
            </motion.button>
          ) : (
            <Button
              onClick={handleSearch}
              style={{ paddingInline: lang === "ar" ? 24 : 16 }}
              className="absolute bottom-5 end-6 z-30 h-12 gap-2 rounded-sm text-sm font-semibold bg-[#de3151] hover:bg-[#de3151]/90 text-white shadow-[0_2px_8px_rgba(222,49,81,0.25)]"
            >
              <Search className="h-4 w-4" strokeWidth={2.5} />
              {dictionary.search}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ── Desktop Horizontal Search Bar ────────────────────────────────────────
  return (
    <div className="relative w-full mx-auto" style={{ maxWidth: 850 }} ref={searchBarRef}>
      <div
        style={{ height: 66 }}
        className={`flex items-center rounded-full border transition-all duration-200 ${
          activeButton
            ? "bg-[#EBEBEB] border-[#DDDDDD] shadow-[rgba(0,0,0,0.02)_0px_0px_0px_1px,rgba(0,0,0,0.1)_0px_8px_24px_0px]"
            : "bg-white border-[#DDDDDD] shadow-[rgba(0,0,0,0.02)_0px_0px_0px_1px,rgba(0,0,0,0.1)_0px_8px_24px_0px] hover:shadow-[rgba(0,0,0,0.02)_0px_0px_0px_1px,rgba(0,0,0,0.18)_0px_8px_24px_0px]"
        }`}
      >
        {/* From Segment */}
        <button
          type="button"
          className={`flex-1 min-w-0 ps-8 pe-6 text-start transition-all duration-200 py-4 ${getButtonStyling("origin")}`}
          onMouseEnter={() => setHoveredButton("origin")}
          onMouseLeave={() => setHoveredButton(null)}
          onClick={() => handleButtonClick("origin")}
        >
          {activeButton === "origin" && <ActivePill />}
          <div style={{ fontSize: 12, fontWeight: 500, lineHeight: '16px', color: '#222222', marginBottom: 2 }} className="whitespace-nowrap">
            {dictionary.from}
          </div>
          <div className={`text-sm leading-[18px] truncate ${origin ? "text-[#222222]" : "text-[#6a6a6a]"}`}>
            {origin ? cityLabel(origin, lang) : dictionary.selectCity}
          </div>
        </button>

        {/* Divider 1 */}
        <div
          className={`w-px h-8 bg-[#DDDDDD] transition-opacity duration-200 ${
            isLineHidden("origin-destination") ? "opacity-0" : "opacity-100"
          }`}
        />

        {/* To Segment */}
        <button
          type="button"
          className={`flex-1 min-w-0 ps-8 pe-6 text-start transition-all duration-200 py-4 ${getButtonStyling("destination")}`}
          onMouseEnter={() => setHoveredButton("destination")}
          onMouseLeave={() => setHoveredButton(null)}
          onClick={() => handleButtonClick("destination")}
        >
          {activeButton === "destination" && <ActivePill />}
          <div style={{ fontSize: 12, fontWeight: 500, lineHeight: '16px', color: '#222222', marginBottom: 2 }} className="whitespace-nowrap">
            {dictionary.to}
          </div>
          <div className={`text-sm leading-[18px] truncate ${destination ? "text-[#222222]" : "text-[#6a6a6a]"}`}>
            {destination ? cityLabel(destination, lang) : dictionary.selectCity}
          </div>
        </button>

        {/* Swap Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleSwap();
          }}
          className="absolute left-[25%] -translate-x-1/2 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 bg-white text-[#484848] shadow-sm transition-colors hover:border-gray-500 hover:text-black active:scale-95"
          style={{ top: "50%", transform: "translate(-50%, -50%)" }}
          aria-label={dictionary.swap}
          title={dictionary.swap}
        >
          <ArrowUpDown className="h-4 w-4 rotate-90" strokeWidth={2} />
        </button>

        {/* Divider 2 */}
        <div
          className={`w-px h-8 bg-[#DDDDDD] transition-opacity duration-200 ${
            isLineHidden("destination-date") ? "opacity-0" : "opacity-100"
          }`}
        />

        {/* When Segment */}
        <button
          type="button"
          className={`flex-1 min-w-0 px-6 text-start transition-all duration-200 py-4 ${getButtonStyling("date")}`}
          onMouseEnter={() => setHoveredButton("date")}
          onMouseLeave={() => setHoveredButton(null)}
          onClick={() => handleButtonClick("date")}
        >
          {activeButton === "date" && <ActivePill />}
          <div style={{ fontSize: 12, fontWeight: 500, lineHeight: '16px', color: '#222222', marginBottom: 2 }} className="whitespace-nowrap">
            {dictionary.when}
          </div>
          <div className={`text-sm leading-[18px] truncate ${date ? "text-[#222222]" : "text-[#6a6a6a]"}`}>
            {date ? formatDate(date) : dictionary.selectDate}
          </div>
        </button>

        {/* Divider 3 */}
        <div
          className={`w-px h-8 bg-[#DDDDDD] transition-opacity duration-200 ${
            isLineHidden("date-passengers") ? "opacity-0" : "opacity-100"
          }`}
        />

        {/* Guests Segment */}
        <div
          className={`flex-[1.15] min-w-0 flex items-center ${getButtonStyling("passengers")}`}
          onMouseEnter={() => setHoveredButton("passengers")}
          onMouseLeave={() => setHoveredButton(null)}
        >
          {activeButton === "passengers" && <ActivePill />}
          <div
            className="flex-1 px-6 text-start cursor-pointer transition-all duration-200 py-4"
            onClick={() => handleButtonClick("passengers")}
          >
            <div style={{ fontSize: 12, fontWeight: 500, lineHeight: '16px', color: '#222222', marginBottom: 2 }} className="whitespace-nowrap">
              {dictionary.passengers}
            </div>
            <div className={`text-sm leading-[18px] truncate ${totalPassengers > 0 ? "text-[#222222]" : "text-[#6a6a6a]"}`}>
              {passengerText()}
            </div>
          </div>

          {/* Search Button */}
          <div className="pe-2.5">
            <Button
              onClick={handleSearch}
              size="icon"
              style={{ height: 48 }}
              className={`rounded-full bg-[#FF385C] hover:bg-[#E31C5F] text-white transition-[width,padding] duration-300 ${
                activeButton ? "w-28 px-4" : "w-12"
              }`}
            >
              <Search className="w-4 h-4" />
              {activeButton && (
                <span className="ms-2 text-sm font-medium">{dictionary.search}</span>
              )}
              <span className="sr-only">{dictionary.search}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Dropdown Container */}
      <AnimatePresence>
        {activeButton && (
          <motion.div
            key="search-dropdown"
            layout
            initial={dropdownMotion.initial}
            animate={dropdownMotion.animate}
            exit={dropdownMotion.exit}
            transition={{ ...DROPDOWN_TRANSITION, layout: SWITCH_TRANSITION }}
            style={{
              transformOrigin: "top center",
              willChange: "transform, opacity",
            }}
            className={`absolute top-full mt-3 bg-white rounded-[32px] shadow-[rgba(0,0,0,0.15)_0px_10px_37px] border border-gray-200/50 z-10 overflow-hidden ${
              activeButton === "origin"
                ? "start-0 w-[420px] max-w-[calc(100vw-2rem)] p-6"
                : activeButton === "destination"
                  ? "start-[20%] w-[420px] max-w-[calc(100vw-2rem)] p-6"
                  : activeButton === "date"
                    ? "left-1/2 -translate-x-1/2 w-[394px] max-w-[calc(100vw-2rem)] p-6"
                    : "end-0 w-[394px] p-6"
            }`}
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
                  />
                )}
                {activeButton === "destination" && (
                  <TransportCityDropdown
                    value={destination}
                    onChange={handleDestinationSelect}
                    assemblyPoints={assemblyPoints}
                  />
                )}
                {activeButton === "date" && (
                  <div className="flex justify-center">
                    <TransportDatePicker date={date} onDateChange={handleDateChange} />
                  </div>
                )}
                {activeButton === "passengers" && (
                  <PassengerSelector passengers={passengers} onChange={handlePassengerChange} dict={dictionary} />
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
