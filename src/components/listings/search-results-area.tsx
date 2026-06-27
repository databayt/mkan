"use client"

import { Tag } from "lucide-react"
import { useSearch } from "./search-provider"
import { SearchResults } from "./search-results"
import SearchMapLoader from "./search-map-loader"
import { useDictionary } from "@/components/internationalization/dictionary-context"

export function SearchResultsArea() {
  const {
    listings,
    total,
    loading,
    nights,
    datesLabel,
    onBoundsChange,
    searchAsMove,
    setSearchAsMove,
  } = useSearch()
  const dict = useDictionary()
  const sp = dict.rental?.searchPage as Record<string, string> | undefined

  const markers = listings
    .filter((l) => l.location?.latitude != null && l.location?.longitude != null)
    .map((l) => ({
      id: l.id,
      price: l.pricePerNight ?? null,
      lat: l.location!.latitude,
      lng: l.location!.longitude,
      title: l.title ?? undefined,
    }))

  const homesLabel = total === 1 ? (sp?.home ?? "home") : (sp?.homes ?? "homes")

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2">
      {/* Left — results column (this is what scrolls; the map stays pinned) */}
      <div>
        {/* Results sub-header: "N homes" + centered "Prices include all fees" */}
        <div className="relative flex items-center px-6 pt-6 pb-5">
          <h1
            className="font-semibold"
            style={{ fontSize: 20, lineHeight: "24px", letterSpacing: "-0.18px", color: "#222222" }}
          >
            {total} {homesLabel}
          </h1>
          <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-2 sm:flex">
            <Tag className="h-4 w-4" style={{ fill: "#FF385C", color: "#FF385C" }} />
            <span style={{ fontSize: 14, color: "#222222" }}>
              {sp?.pricesIncludeFees ?? "Prices include all fees"}
            </span>
          </div>
        </div>

        <div className="px-6 pb-12">
          {listings.length === 0 ? (
            <div className="py-12 text-center">
              <h2 className="mb-2 text-xl font-medium">
                {sp?.noExactMatches ?? "No exact matches"}
              </h2>
              <p className="text-muted-foreground">
                {sp?.tryAdjusting ??
                  "Try adjusting your search — move the map, change filters, or zoom out."}
              </p>
            </div>
          ) : (
            <div
              style={{ opacity: loading ? 0.55 : 1, transition: "opacity 150ms ease" }}
            >
              <SearchResults properties={listings} nights={nights} datesLabel={datesLabel} />
            </div>
          )}
        </div>
      </div>

      {/* Right — sticky map (desktop only) */}
      <div className="hidden lg:block">
        <SearchMapLoader
          markers={markers}
          onBoundsChange={onBoundsChange}
          searchAsMove={searchAsMove}
          onSearchAsMoveChange={setSearchAsMove}
          searchAsIMoveLabel={sp?.searchAsIMove}
          stickyTop={64}
        />
      </div>
    </div>
  )
}
