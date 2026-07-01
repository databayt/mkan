"use client";

import { useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { type LocationSuggestion } from "@/lib/schemas/search-schema";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { useLocale } from "@/components/internationalization/use-locale";

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
      imageSrc: "https://a0.muscache.com/im/pictures/airbnb-platform-assets/AirbnbPlatformAssets-hawaii-autosuggest-destination-icons-2/original/ea5e5ee3-e9d8-48a1-b7e9-1003bf6fe850.png",
    },
    {
      city: "Port Sudan",
      state: "Red Sea",
      country: "Sudan",
      searchValue: "Port Sudan",
      displayName: "Port Sudan",
      description: "Stays along the Red Sea coast",
      backgroundColor: "#eaf7ec",
      imageSrc: "https://a0.muscache.com/im/pictures/airbnb-platform-assets/AirbnbPlatformAssets-hawaii-autosuggest-destination-icons-1/original/c98f58bf-8512-43e3-af54-6c1f0b2c8a23.png",
    },
    {
      city: "Port Sudan",
      state: "Red Sea",
      country: "Sudan",
      searchValue: "Coral Coast",
      displayName: "Coral Coast",
      description: "Beachfront stays on the Red Sea",
      backgroundColor: "#fdf2e9",
      imageSrc: "https://a0.muscache.com/im/pictures/airbnb-platform-assets/AirbnbPlatformAssets-hawaii-autosuggest-destination-icons-2/original/e6abaebf-f910-42e2-b891-d8f262b6ee1d.png",
    },
    {
      city: "Port Sudan",
      state: "Red Sea",
      country: "Sudan",
      searchValue: "Marina District",
      displayName: "Marina District",
      description: "By the harbour and seafront",
      backgroundColor: "#fef5e7",
      imageSrc: "https://a0.muscache.com/im/pictures/airbnb-platform-assets/AirbnbPlatformAssets-hawaii-autosuggest-destination-icons-1/original/5d2ff9e9-9e15-45b9-bfb2-d3f192198eca.png",
    },
    {
      city: "Port Sudan",
      state: "Red Sea",
      country: "Sudan",
      searchValue: "Suakin Island",
      displayName: "Suakin Island",
      description: "Historic coral-stone old town",
      backgroundColor: "#f3e8ff",
      imageSrc: "https://a0.muscache.com/im/pictures/airbnb-platform-assets/AirbnbPlatformAssets-hawaii-autosuggest-destination-icons-1/original/ed75c050-042b-44ba-a991-54044d93a91b.png",
    },
    {
      city: "Port Sudan",
      state: "Red Sea",
      country: "Sudan",
      searchValue: "Airport District",
      displayName: "Airport District",
      description: "Handy for arrivals and departures",
      backgroundColor: "#fdedec",
      imageSrc: "https://a0.muscache.com/im/pictures/airbnb-platform-assets/AirbnbPlatformAssets-hawaii-autosuggest-destination-icons-1/original/2cab2315-eab8-4e3b-8ffa-1411745515f3.png",
    },
    {
      city: "Port Sudan",
      state: "Red Sea",
      country: "Sudan",
      searchValue: "Red Sea University Area",
      displayName: "Red Sea University",
      description: "Central and walkable",
      backgroundColor: "#e8f8f5",
      imageSrc: "https://a0.muscache.com/im/pictures/airbnb-platform-assets/AirbnbPlatformAssets-hawaii-autosuggest-destination-icons-2/original/5c0fde14-6f8e-43c4-b78f-6baae5df0c7c.png",
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
      imageSrc: "https://a0.muscache.com/im/pictures/airbnb-platform-assets/AirbnbPlatformAssets-hawaii-autosuggest-destination-icons-2/original/ea5e5ee3-e9d8-48a1-b7e9-1003bf6fe850.png",
    },
    {
      city: "Port Sudan",
      state: "Red Sea",
      country: "Sudan",
      searchValue: "Port Sudan",
      displayName: "بورتسودان",
      description: "إقامات على ساحل البحر الأحمر",
      backgroundColor: "#eaf7ec",
      imageSrc: "https://a0.muscache.com/im/pictures/airbnb-platform-assets/AirbnbPlatformAssets-hawaii-autosuggest-destination-icons-1/original/c98f58bf-8512-43e3-af54-6c1f0b2c8a23.png",
    },
    {
      city: "Port Sudan",
      state: "Red Sea",
      country: "Sudan",
      searchValue: "Coral Coast",
      displayName: "ساحل المرجان",
      description: "إقامات على شاطئ البحر الأحمر",
      backgroundColor: "#fdf2e9",
      imageSrc: "https://a0.muscache.com/im/pictures/airbnb-platform-assets/AirbnbPlatformAssets-hawaii-autosuggest-destination-icons-2/original/e6abaebf-f910-42e2-b891-d8f262b6ee1d.png",
    },
    {
      city: "Port Sudan",
      state: "Red Sea",
      country: "Sudan",
      searchValue: "Marina District",
      displayName: "حي المارينا",
      description: "بجوار الميناء والواجهة البحرية",
      backgroundColor: "#fef5e7",
      imageSrc: "https://a0.muscache.com/im/pictures/airbnb-platform-assets/AirbnbPlatformAssets-hawaii-autosuggest-destination-icons-1/original/5d2ff9e9-9e15-45b9-bfb2-d3f192198eca.png",
    },
    {
      city: "Port Sudan",
      state: "Red Sea",
      country: "Sudan",
      searchValue: "Suakin Island",
      displayName: "جزيرة سواكن",
      description: "المدينة القديمة المرجانية التاريخية",
      backgroundColor: "#f3e8ff",
      imageSrc: "https://a0.muscache.com/im/pictures/airbnb-platform-assets/AirbnbPlatformAssets-hawaii-autosuggest-destination-icons-1/original/ed75c050-042b-44ba-a991-54044d93a91b.png",
    },
    {
      city: "Port Sudan",
      state: "Red Sea",
      country: "Sudan",
      searchValue: "Airport District",
      displayName: "حي المطار",
      description: "قريب من الوصول والمغادرة",
      backgroundColor: "#fdedec",
      imageSrc: "https://a0.muscache.com/im/pictures/airbnb-platform-assets/AirbnbPlatformAssets-hawaii-autosuggest-destination-icons-1/original/2cab2315-eab8-4e3b-8ffa-1411745515f3.png",
    },
    {
      city: "Port Sudan",
      state: "Red Sea",
      country: "Sudan",
      searchValue: "Red Sea University Area",
      displayName: "حي جامعة البحر الأحمر",
      description: "في المركز وقريب من كل شيء",
      backgroundColor: "#e8f8f5",
      imageSrc: "https://a0.muscache.com/im/pictures/airbnb-platform-assets/AirbnbPlatformAssets-hawaii-autosuggest-destination-icons-2/original/5c0fde14-6f8e-43c4-b78f-6baae5df0c7c.png",
    },
  ],
} as const;

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
  const { locale, isRTL } = useLocale();
  const [isGeolocating, setIsGeolocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const activeLocale = (locale === "ar" ? "ar" : "en") as "en" | "ar";
  const suggestedDestinations = SUGGESTED_DESTINATIONS[activeLocale];

  const handleKeyDown = (
    e: React.KeyboardEvent,
    location: LocationSuggestion
  ) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onLocationSelect(location);
    }
  };

  const handleSelectSuggested = async (dest: typeof suggestedDestinations[number]) => {
    if (dest.city === "Nearby") {
      if (!navigator.geolocation) {
        onLocationSelect({
          city: "",
          state: "",
          country: "",
          displayName: dest.displayName,
          listingCount: 0,
        });
        return;
      }

      setIsGeolocating(true);
      setGeoError(null);

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords;
            // Use Nominatim reverse geocoding API
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10`,
              {
                headers: {
                  "Accept-Language": activeLocale,
                },
              }
            );
            if (!response.ok) throw new Error();
            const data = await response.json();
            
            const city =
              data.address?.city ||
              data.address?.town ||
              data.address?.village ||
              data.address?.suburb ||
              data.address?.county ||
              data.address?.state ||
              "";
              
            const state = data.address?.state || "";
            const country = data.address?.country || "";
            
            const displayName =
              city && country
                ? `${city}, ${country}`
                : city || country || dest.displayName;

            onLocationSelect({
              city: city || displayName,
              state,
              country,
              displayName,
              listingCount: 0,
            });
          } catch (err) {
            // Fallback to "Nearby" search
            onLocationSelect({
              city: "",
              state: "",
              country: "",
              displayName: dest.displayName,
              listingCount: 0,
            });
          } finally {
            setIsGeolocating(false);
          }
        },
        () => {
          // Geolocation permission denied or failed
          onLocationSelect({
            city: "",
            state: "",
            country: "",
            displayName: dest.displayName,
            listingCount: 0,
          });
          setIsGeolocating(false);
        },
        { timeout: 6000 }
      );
    } else {
      onLocationSelect({
        city: dest.city,
        state: dest.state,
        country: dest.country,
        searchValue: dest.searchValue,
        displayName: dest.displayName,
        listingCount: 0,
      });
    }
  };

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
      {isGeolocating && (
        <div className="flex items-center gap-3 py-3 px-4 mb-3 bg-[#f0f7ff] rounded-2xl border border-[#d2e7ff] text-sm text-[#0066cc] animate-pulse">
          <Loader2 className="h-4.5 w-4.5 animate-spin flex-shrink-0" />
          <span>
            {locale === "ar"
              ? "جاري تحديد موقعك الحالي..."
              : "Finding your current location..."}
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
                <p className="text-[13px] font-normal text-[#222222]">
                  {resultsTitle}
                </p>
                {isLoading && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                )}
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
                        {[location.state, location.country]
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </>
          ) : !isLoading ? (
            <div className="text-center text-gray-400 py-8 text-sm">
              {(
                dict.search?.noDestinationsFound ??
                'No destinations found for "{query}"'
              ).replace("{query}", searchQuery)}
            </div>
          ) : null
        ) : (
          // Predefined Suggested destinations from Airbnb
          <>
            <p className="text-[13px] font-normal text-[#222222] px-2 mb-2">
              {suggestedTitle}
            </p>
            <div className="space-y-0.5">
              {suggestedDestinations.map((dest) => (
                <div
                  key={dest.displayName}
                  className="py-2 px-2 rounded-2xl hover:bg-[#F7F7F7] active:scale-[0.99] transition-all cursor-pointer flex items-center gap-3.5"
                  onClick={() => handleSelectSuggested(dest)}
                  role="option"
                  aria-selected="false"
                  tabIndex={0}
                  onKeyDown={(e) =>
                    handleKeyDown(e, {
                      city: dest.city,
                      state: dest.state,
                      country: dest.country,
                      searchValue: dest.searchValue,
                      displayName: dest.displayName,
                      listingCount: 0,
                    })
                  }
                >
                  {/* The colored rounded square is baked into the original
                      Airbnb PNG — render it bare (no wrapper tint). The inline
                      backgroundColor only shows through while the image loads,
                      preventing an empty-box flash. */}
                  <img
                    src={dest.imageSrc}
                    alt=""
                    loading="lazy"
                    style={{ backgroundColor: dest.backgroundColor }}
                    className="h-14 w-14 flex-shrink-0 rounded-xl object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium text-[#222222] truncate">
                      {dest.displayName}
                    </div>
                    <div className="text-sm text-[#6a6a6a] mt-0.5 font-normal truncate">
                      {dest.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
