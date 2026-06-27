"use client"

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { PropertyType, Amenity } from "@prisma/client"
import { searchListings } from "@/lib/actions/search-actions"
import type { SearchFilters } from "@/lib/schemas/search-schema"
import type { Listing } from "@/types/listing"

export interface MapBounds {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

// The user-tunable subset of filters that the Filters dialog edits. The
// URL-derived params (location/dates/guests) live in `baseFilters` and are
// applied underneath these on every query.
export interface FilterState {
  priceMin?: number
  priceMax?: number
  beds?: number
  baths?: number
  propertyType?: PropertyType
  amenities: Amenity[]
}

export const EMPTY_FILTERS: FilterState = { amenities: [] }

interface SearchContextValue {
  listings: Listing[]
  total: number
  loading: boolean
  filters: FilterState
  filterCount: number
  searchAsMove: boolean
  setSearchAsMove: (v: boolean) => void
  applyFilters: (f: FilterState) => void
  clearFilters: () => void
  onBoundsChange: (b: MapBounds) => void
  /** Current map viewport (read from a ref) — used by the Filters preview count. */
  getBounds: () => MapBounds | null
  /** URL-derived base filters (location/dates/guests) shared with the dialog preview. */
  baseFilters: Pick<SearchFilters, "location" | "checkIn" | "checkOut" | "guests">
  lang: "en" | "ar"
  nights?: number
  datesLabel?: string
}

const SearchContext = createContext<SearchContextValue | null>(null)

export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext)
  if (!ctx) throw new Error("useSearch must be used within <SearchProvider>")
  return ctx
}

// Count of active (non-empty) filter facets — drives the badge on the pill.
function countFilters(f: FilterState): number {
  let n = 0
  if (f.priceMin !== undefined || f.priceMax !== undefined) n++
  if (f.beds !== undefined) n++
  if (f.baths !== undefined) n++
  if (f.propertyType) n++
  n += f.amenities.length
  return n
}

export function SearchProvider({
  initialListings,
  initialTotal,
  baseFilters,
  lang,
  nights,
  datesLabel,
  children,
}: {
  initialListings: Listing[]
  initialTotal: number
  /** URL-derived filters (location/checkIn/checkOut/guests) applied beneath the dialog filters. */
  baseFilters: Pick<SearchFilters, "location" | "checkIn" | "checkOut" | "guests">
  lang: "en" | "ar"
  nights?: number
  datesLabel?: string
  children: React.ReactNode
}) {
  const [listings, setListings] = useState<Listing[]>(initialListings)
  const [total, setTotal] = useState(initialTotal)
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [loading, setLoading] = useState(false)
  const [searchAsMove, setSearchAsMove] = useState(true)

  // The global `body { overflow-x: hidden }` turns the body into a scroll
  // container, which breaks the sticky map (it would scroll away instead of
  // pinning). Inject a later, more-specific stylesheet rule scoped to the
  // search page that switches it to `clip` — same horizontal-overflow
  // clipping, but no scroll container, so `position: sticky` works. A <style>
  // rule (not an inline style) survives the consent banner's scroll lock,
  // which toggles `body.style.overflow` directly.
  useEffect(() => {
    const style = document.createElement("style")
    style.setAttribute("data-search-overflow-fix", "")
    style.textContent = "body{overflow-x:clip}"
    document.head.appendChild(style)
    return () => {
      style.remove()
    }
  }, [])

  // Refs keep `run` referentially stable so the map can capture
  // onBoundsChange once without re-binding its moveend listener.
  const boundsRef = useRef<MapBounds | null>(null)
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const searchAsMoveRef = useRef(searchAsMove)
  searchAsMoveRef.current = searchAsMove
  // Monotonic request id — a slow earlier response can't clobber a newer one.
  const reqIdRef = useRef(0)

  const run = useCallback(
    async (next: FilterState, bounds: MapBounds | null) => {
      const id = ++reqIdRef.current
      setLoading(true)
      // When the map drives the query, drop the named location (the viewport
      // replaces it) but keep dates/guests.
      const { location, ...datesGuests } = baseFilters
      const query: SearchFilters = {
        ...(bounds ? datesGuests : baseFilters),
        priceMin: next.priceMin,
        priceMax: next.priceMax,
        beds: next.beds,
        baths: next.baths,
        propertyType: next.propertyType,
        amenities: next.amenities.length ? next.amenities : undefined,
        ...(bounds ?? {}),
        take: 50,
      }
      const res = await searchListings(query)
      if (id !== reqIdRef.current) return // superseded
      if (res.success) {
        setListings(res.data as Listing[])
        setTotal(res.total ?? res.data.length)
      }
      setLoading(false)
    },
    [baseFilters]
  )

  const applyFilters = useCallback(
    (f: FilterState) => {
      setFilters(f)
      void run(f, boundsRef.current)
    },
    [run]
  )

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS)
    void run(EMPTY_FILTERS, boundsRef.current)
  }, [run])

  const onBoundsChange = useCallback(
    (b: MapBounds) => {
      const first = boundsRef.current === null
      boundsRef.current = b
      // Skip the very first emit (the map's initial fitBounds) — it would
      // just re-fetch what the server already rendered.
      if (!first && searchAsMoveRef.current) void run(filtersRef.current, b)
    },
    [run]
  )

  const getBounds = useCallback(() => boundsRef.current, [])

  const value = useMemo<SearchContextValue>(
    () => ({
      listings,
      total,
      loading,
      filters,
      filterCount: countFilters(filters),
      searchAsMove,
      setSearchAsMove,
      applyFilters,
      clearFilters,
      onBoundsChange,
      getBounds,
      baseFilters,
      lang,
      nights,
      datesLabel,
    }),
    [
      listings,
      total,
      loading,
      filters,
      searchAsMove,
      applyFilters,
      clearFilters,
      onBoundsChange,
      getBounds,
      baseFilters,
      lang,
      nights,
      datesLabel,
    ]
  )

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
}
