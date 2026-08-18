"use client";

import { Loader2, MapPin } from "lucide-react";
import { type LocationSuggestion } from "@/lib/schemas/search-schema";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { useLocale } from "@/components/internationalization/use-locale";
import { useNearby, nearbyErrorMessage } from "@/hooks/use-nearby";
import { roundCoord } from "@/lib/distance";
import { cdn } from "@/lib/cdn";
import { formatNumber } from "@/lib/i18n/formatters";

interface LocationProps {
  searchQuery: string;
  suggestions: LocationSuggestion[];
  popularLocations: LocationSuggestion[];
  isLoading: boolean;
  error: string | null;
  onSearchQueryChange: (query: string) => void;
  onLocationSelect: (location: LocationSuggestion | null) => void;
  // fillHeight = stretch the results list to fill the parent's height (and add
  // bottom clearance for a floating action button) instead of the fixed
  // `max-h-[340px]` used by the desktop popover. Used by the mobile hero card.
  fillHeight?: boolean;
}

// The panel opens on the full Port Sudan zone gazetteer, fetched from
// /api/search/locations?zones=1 and ranked by how many homes each zone holds.
// The hardcoded list below is the fallback for when that fetch hasn't landed
// yet or failed (the route sits behind the search rate limiter) — a stale
// eight rows beats an empty panel.
//
// Mkan's live catalog is 100% in Port Sudan on the Red Sea coast, so the
// "Where" suggestions are tuned to that city and its districts — every entry
// returns real listings (the foreign cities they replaced returned zero).
//
// `searchValue` is the English token actually sent to the server: the city
// name returns the whole catalog, while a district token ("Coral Coast")
// narrows to that part of town via the address match. `displayName` is the
// localized label shown in the list, so Arabic users see "بورتسودان" while
// the query stays the English "Port Sudan" the database stores.
const SUGGESTED_DESTINATIONS = {
  en: [
    {
      city: "Nearby",
      state: "",
      country: "",
      searchValue: "",
      displayName: "Nearby",
      description: "Find what's around you",
      backgroundColor: "#e8f4fd",
      imageSrc: cdn.vendor("airbnb", "destinations/nearby.png"),
    },
    {
      city: "Port Sudan",
      state: "Red Sea",
      country: "Sudan",
      searchValue: "Port Sudan",
      displayName: "Port Sudan",
      description: "All stays along the Red Sea coast",
      backgroundColor: "#eaf7ec",
      imageSrc: cdn.vendor("airbnb", "destinations/port-sudan.png"),
    },
    {
      city: "Port Sudan",
      state: "East Locality",
      country: "Sudan",
      searchValue: "digna",
      displayName: "Digna District",
      description: "Seafront corniche & port corridor",
      backgroundColor: "#fdf2e9",
      imageSrc: cdn.vendor("airbnb", "destinations/coral-coast.png"),
    },
    {
      city: "Port Sudan",
      state: "Central Locality",
      country: "Sudan",
      searchValue: "city-centre",
      displayName: "City Centre",
      description: "Downtown commercial & city heart",
      backgroundColor: "#fef5e7",
      imageSrc: cdn.vendor("airbnb", "destinations/marina.png"),
    },
    {
      city: "Port Sudan",
      state: "South Locality",
      country: "Sudan",
      searchValue: "airport-district",
      displayName: "Airport District",
      description: "Handy for airport arrivals & departures",
      backgroundColor: "#fdedec",
      imageSrc: cdn.vendor("airbnb", "destinations/airport.png"),
    },
    {
      city: "Port Sudan",
      state: "Coastal Tourism",
      country: "Sudan",
      searchValue: "arous",
      displayName: "Arous",
      description: "Coastal resort, beach & diving hub",
      backgroundColor: "#f3e8ff",
      imageSrc: cdn.vendor("airbnb", "destinations/suakin.png"),
    },
    {
      city: "Port Sudan",
      state: "North Expansion",
      country: "Sudan",
      searchValue: "hadal",
      displayName: "Hadal",
      description: "North-eastern residential expansion",
      backgroundColor: "#e8f8f5",
      imageSrc: cdn.vendor("airbnb", "destinations/red-sea-university.png"),
    },
    {
      city: "Port Sudan",
      state: "South Locality",
      country: "Sudan",
      searchValue: "malaha",
      displayName: "Al Malaha",
      description: "Southern marketplace & residential hub",
      backgroundColor: "#eef2ff",
      imageSrc: cdn.vendor("airbnb", "destinations/marina.png"),
    },
  ],
  ar: [
    {
      city: "Nearby",
      state: "",
      country: "",
      searchValue: "",
      displayName: "قريب من هنا",
      description: "استكشف الأماكن المحيطة بك",
      backgroundColor: "#e8f4fd",
      imageSrc: cdn.vendor("airbnb", "destinations/nearby.png"),
    },
    {
      city: "Port Sudan",
      state: "Red Sea",
      country: "Sudan",
      searchValue: "Port Sudan",
      displayName: "بورتسودان",
      description: "جميع الإقامات على ساحل البحر الأحمر",
      backgroundColor: "#eaf7ec",
      imageSrc: cdn.vendor("airbnb", "destinations/port-sudan.png"),
    },
    {
      city: "Port Sudan",
      state: "وحدة شرق",
      country: "Sudan",
      searchValue: "digna",
      displayName: "حي دقنة",
      description: "كورنيش الواجهة البحرية ومنطقة الميناء",
      backgroundColor: "#fdf2e9",
      imageSrc: cdn.vendor("airbnb", "destinations/coral-coast.png"),
    },
    {
      city: "Port Sudan",
      state: "وحدة وسط",
      country: "Sudan",
      searchValue: "city-centre",
      displayName: "وسط المدينة",
      description: "قلب المدينة والسوق الكبير",
      backgroundColor: "#fef5e7",
      imageSrc: cdn.vendor("airbnb", "destinations/marina.png"),
    },
    {
      city: "Port Sudan",
      state: "وحدة جنوب",
      country: "Sudan",
      searchValue: "airport-district",
      displayName: "حي المطار",
      description: "قريب من مطار بورتسودان الدولي",
      backgroundColor: "#fdedec",
      imageSrc: cdn.vendor("airbnb", "destinations/airport.png"),
    },
    {
      city: "Port Sudan",
      state: "المحور السياحي",
      country: "Sudan",
      searchValue: "arous",
      displayName: "عروس",
      description: "شاطئ ومنتجع عروس والغوص الساحلي",
      backgroundColor: "#f3e8ff",
      imageSrc: cdn.vendor("airbnb", "destinations/suakin.png"),
    },
    {
      city: "Port Sudan",
      state: "المربعات الحديثة",
      country: "Sudan",
      searchValue: "hadal",
      displayName: "هدل",
      description: "الامتداد الشمالي والشقق المفروشة",
      backgroundColor: "#e8f8f5",
      imageSrc: cdn.vendor("airbnb", "destinations/red-sea-university.png"),
    },
    {
      city: "Port Sudan",
      state: "وحدة جنوب",
      country: "Sudan",
      searchValue: "malaha",
      displayName: "الملاحة",
      description: "السوق التجاري والحي السكني الجنوبي",
      backgroundColor: "#eef2ff",
      imageSrc: cdn.vendor("airbnb", "destinations/marina.png"),
    },
  ],
} as const;

// Artwork exists for the six zones the original curated list covered. The
// other thirty-eight render the map-pin tile instead of borrowing a photo of
// somewhere else — a wrong picture reads as a claim about the place.
const ZONE_IMAGERY: Record<string, { imageSrc: string; backgroundColor: string }> = {
  digna: { imageSrc: cdn.vendor("airbnb", "destinations/coral-coast.png"), backgroundColor: "#fdf2e9" },
  "city-centre": { imageSrc: cdn.vendor("airbnb", "destinations/marina.png"), backgroundColor: "#fef5e7" },
  "airport-district": { imageSrc: cdn.vendor("airbnb", "destinations/airport.png"), backgroundColor: "#fdedec" },
  arous: { imageSrc: cdn.vendor("airbnb", "destinations/suakin.png"), backgroundColor: "#f3e8ff" },
  hadal: { imageSrc: cdn.vendor("airbnb", "destinations/red-sea-university.png"), backgroundColor: "#e8f8f5" },
  malaha: { imageSrc: cdn.vendor("airbnb", "destinations/marina.png"), backgroundColor: "#eef2ff" },
};

/**
 * "8 homes" / "٨ منازل" — Arabic counts take four forms, and picking one by
 * `count === 1` alone (the usual shortcut) yields "2 منازل" where the dual
 * "منزلان" belongs. Counts here are small today but the zone list reorders
 * itself as supply grows, so the form is chosen properly.
 */
function homesLabel(
  count: number,
  dict: ReturnType<typeof useDictionary>,
  locale: string
): string {
  const d = dict.search?.zoneHomes;
  const ar = locale === "ar";
  if (count === 0) return d?.none ?? (ar ? "لا توجد منازل بعد" : "No homes yet");
  if (count === 1) return d?.one ?? (ar ? "منزل واحد" : "1 home");
  if (count === 2) return d?.two ?? (ar ? "منزلان" : "2 homes");
  const template =
    count <= 10
      ? (d?.few ?? (ar ? "{count} منازل" : "{count} homes"))
      : (d?.many ?? (ar ? "{count} منزلاً" : "{count} homes"));
  // Arabic-Indic digits, so the count reads in the same numerals as the
  // prices sitting beside it on the same screen.
  return template.replace("{count}", formatNumber(count, ar ? "ar" : "en"));
}

// One row of the opening list, whatever produced it — the two client-side
// rows (Nearby, the city as a whole) and the server-ranked zones share this
// shape so the markup below can't drift between them.
interface DestinationRow {
  key: string;
  title: string;
  subtitle: string;
  imageSrc?: string;
  backgroundColor?: string;
  isNearby: boolean;
  select: () => void | Promise<void>;
}

export default function LocationDropdown({
  searchQuery,
  suggestions,
  popularLocations,
  isLoading,
  error,
  onSearchQueryChange,
  onLocationSelect,
  fillHeight = false,
}: LocationProps) {
  const dict = useDictionary();
  const { locale } = useLocale();
  const { isLocating, errorCode, locate } = useNearby();

  const activeLocale = (locale === "ar" ? "ar" : "en") as "en" | "ar";
  const suggestedDestinations = SUGGESTED_DESTINATIONS[activeLocale];
  const nearbyDict = dict.search?.nearby;
  const geoError = errorCode ? nearbyErrorMessage(errorCode, nearbyDict, activeLocale) : null;

  const handleKeyDown = (e: React.KeyboardEvent, location: LocationSuggestion) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onLocationSelect(location);
    }
  };

  const handleSelectSuggested = async (dest: (typeof suggestedDestinations)[number]) => {
    if (dest.city !== "Nearby") {
      onLocationSelect({
        city: dest.city,
        state: dest.state,
        country: dest.country,
        searchValue: dest.searchValue,
        displayName: dest.displayName,
        listingCount: 0,
      });
      return;
    }

    // "Nearby" resolves to a position, not a place name. It used to reverse-
    // geocode the fix through Nominatim and search for the resulting city
    // string — which meant a third-party round trip that production CSP blocks
    // outright, and a text match that returned nothing whenever the user wasn't
    // standing in a city we have listings for. Passing the coordinates straight
    // through makes the search an actual radius query and drops the dependency.
    const coords = await locate();

    // On failure keep the panel open showing `geoError`. Selecting nothing is
    // deliberate: the previous "graceful degradation" handed the caller a
    // suggestion whose only usable field was the label, so the search ran for
    // the literal word "Nearby" and came back empty — a silent wrong answer is
    // worse than a visible reason.
    if (!coords) return;

    onLocationSelect({
      city: "",
      state: "",
      country: "",
      displayName: dest.displayName,
      listingCount: 0,
      // Trimmed to ~11 m — full GPS precision in a shareable URL is needlessly
      // identifying and fragments the search cache for no behavioural gain.
      coords: { lat: roundCoord(coords.lat), lng: roundCoord(coords.lng) },
    });
  };

  // The opening list. "Nearby" and the city-as-a-whole stay client-side —
  // the first resolves to a device position rather than a place name, the
  // second searches the whole catalogue — and everything after them is the
  // server's zone ranking. When the zone fetch hasn't landed (or failed) the
  // curated eight render instead, so the panel is never blank.
  const zoneSuggestions = popularLocations.filter((l) => l.zoneSlug);
  const hasZones = zoneSuggestions.length > 0;

  const destinationRows: DestinationRow[] = [
    ...(hasZones ? suggestedDestinations.slice(0, 2) : suggestedDestinations).map((dest) => ({
      key: dest.displayName,
      title: dest.displayName,
      subtitle: dest.description,
      imageSrc: dest.imageSrc,
      backgroundColor: dest.backgroundColor,
      isNearby: dest.city === "Nearby",
      select: () => handleSelectSuggested(dest),
    })),
    ...zoneSuggestions.map((zone) => {
      const slug = zone.zoneSlug as string;
      const art = ZONE_IMAGERY[slug];
      const title = (activeLocale === "ar" ? zone.nameAr : zone.nameEn) || zone.displayName;
      const sector = (activeLocale === "ar" ? zone.sectorAr : zone.sectorEn) ?? "";
      const homes = homesLabel(zone.listingCount, dict, activeLocale);
      return {
        key: slug,
        title,
        subtitle: sector ? `${homes} · ${sector}` : homes,
        imageSrc: art?.imageSrc,
        backgroundColor: art?.backgroundColor,
        isNearby: false,
        select: () =>
          onLocationSelect({
            city: zone.city,
            state: zone.state,
            country: zone.country,
            displayName: title,
            searchValue: zone.searchValue ?? slug,
            listingCount: zone.listingCount,
          }),
      };
    }),
  ];

  const resultsTitle = dict.search?.searchResults ?? "Search results";
  const suggestedTitle =
    dict.search?.suggestedDestinations ??
    (locale === "ar" ? "الوجهات المقترحة" : "Suggested destinations");

  return (
    <div
      role="combobox"
      aria-expanded="true"
      aria-haspopup="listbox"
      aria-controls="location-listbox"
      className={`flex flex-col ${fillHeight ? "" : "h-full"}`}
    >
      {/* Geolocating Loader overlay/feedback */}
      {isLocating && (
        <div className="flex items-center gap-3 py-3 px-4 mb-3 bg-[#f0f7ff] rounded-2xl border border-[#d2e7ff] text-sm text-[#0066cc] animate-pulse">
          <Loader2 className="h-4.5 w-4.5 animate-spin flex-shrink-0" />
          <span>
            {nearbyDict?.locating ??
              (locale === "ar" ? "جاري تحديد موقعك الحالي..." : "Finding your current location...")}
          </span>
        </div>
      )}

      {/* Error message */}
      {(error || geoError) && (
        <div
          className="text-red-500 text-sm mb-4 p-3 bg-red-50 rounded-xl border border-red-100"
          role="alert"
        >
          {error || geoError}
        </div>
      )}

      {/* Results / Suggestions Container — fixed-height own scroll for the
          desktop popover; in fillHeight mode it renders naturally and lets the
          mobile card's full-height scroll area do the scrolling (no nested
          scroll, so the list fills all the space). */}
      <div
        className={`space-y-1 ${
          fillHeight ? "" : "max-h-[340px] overflow-y-auto no-scrollbar scroll-smooth"
        }`}
        role="listbox"
        id="location-listbox"
        aria-label={searchQuery.trim() ? resultsTitle : suggestedTitle}
      >
        {searchQuery.trim() ? (
          // Dynamic database search autocomplete results
          suggestions.length > 0 ? (
            <>
              <div className="flex items-center justify-between px-2 mb-2">
                <p className="text-[13px] font-normal text-[#222222]">{resultsTitle}</p>
                {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
              </div>
              {suggestions.map((location, index) => (
                <div
                  key={`${location.city}-${location.state}-${index}`}
                  className="py-2 px-2 rounded-2xl hover:bg-[#F7F7F7] active:scale-[0.99] transition-all cursor-pointer flex items-center gap-3.5"
                  onClick={() => onLocationSelect(location)}
                  role="option"
                  aria-selected="false"
                  tabIndex={0}
                  onKeyDown={(e) => handleKeyDown(e, location)}
                >
                  <div className="w-12 h-12 bg-[#f7f7f7] border border-[#ebebeb] rounded-xl flex items-center justify-center flex-shrink-0 text-[#222222]">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium text-[#222222] truncate">
                      {location.city}
                    </div>
                    {(location.state || location.country) && (
                      <div className="text-sm text-[#6a6a6a] truncate mt-0.5">
                        {[location.state, location.country].filter(Boolean).join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </>
          ) : !isLoading ? (
            <div className="text-center text-gray-400 py-8 text-sm">
              {(dict.search?.noDestinationsFound ?? 'No destinations found for "{query}"').replace(
                "{query}",
                searchQuery,
              )}
            </div>
          ) : null
        ) : (
          // Opening list: Nearby, the city as a whole, then every Port Sudan
          // zone ordered by how many homes it holds.
          <>
            <p className="text-[13px] font-normal text-[#222222] px-2 mb-2">{suggestedTitle}</p>
            <div className="space-y-0.5">
              {destinationRows.map((dest) => {
                const rowBusy = dest.isNearby && isLocating;
                return (
                  <div
                    key={dest.key}
                    className={`py-2 px-2 rounded-2xl transition-all flex items-center gap-3.5 ${
                      rowBusy
                        ? "cursor-wait opacity-60"
                        : "hover:bg-[#F7F7F7] active:scale-[0.99] cursor-pointer"
                    }`}
                    onClick={() => {
                      if (rowBusy) return;
                      void dest.select();
                    }}
                    role="option"
                    aria-selected="false"
                    aria-busy={rowBusy}
                    tabIndex={0}
                    // Routed through handleSelectSuggested, NOT the generic
                    // handleKeyDown: that shortcut called onLocationSelect with
                    // the row's label directly, so a keyboard user picking
                    // "Nearby" searched for the literal word and got nothing.
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      if (rowBusy) return;
                      void dest.select();
                    }}
                  >
                    {/* The colored rounded square is baked into the original
                        Airbnb PNG — render it bare (no wrapper tint). The inline
                        backgroundColor only shows through while the image loads,
                        preventing an empty-box flash. */}
                    {dest.imageSrc ? (
                      <img
                        src={dest.imageSrc}
                        alt=""
                        loading="lazy"
                        style={{ backgroundColor: dest.backgroundColor }}
                        className="h-14 w-14 flex-shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="h-14 w-14 flex-shrink-0 rounded-xl bg-[#f7f7f7] border border-[#ebebeb] flex items-center justify-center text-[#222222]">
                        <MapPin className="w-5 h-5" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-medium text-[#222222] truncate">
                        {dest.title}
                      </div>
                      <div className="text-sm text-[#6a6a6a] mt-0.5 font-normal truncate">
                        {dest.subtitle}
                      </div>
                    </div>
                    {rowBusy && (
                      <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-[#6a6a6a]" />
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
