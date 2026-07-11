"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { Map as MapIcon, List as ListIcon } from "lucide-react"
import { useSearch } from "./search-provider"
import { SearchResults } from "./search-results"
import SearchMapLoader from "./search-map-loader"
import { PHASE1 } from "@/config/phase-flags"
import { useIsDesktop } from "@/hooks/use-is-desktop"
import { useDictionary } from "@/components/internationalization/dictionary-context"
import { useLocale } from "@/components/internationalization/use-locale"
import { formatCurrency } from "@/lib/i18n/formatters"

// mapbox-gl touches `window` at import time — load the mobile map client-side
// only, and only when the user opens it.
const SearchMapMobile = dynamic(() => import("./search-map-mobile"), { ssr: false })

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
  const { locale } = useLocale()
  const sp = dict.rental?.searchPage as Record<string, string> | undefined

  // Mobile-only map: Airbnb shows the results as a list with a floating "Map"
  // toggle; tapping it swaps to a full-screen map (with a synced card carousel)
  // and the toggle becomes "List". Desktop keeps the side-by-side sticky map.
  const isDesktop = useIsDesktop(1024)
  const [mobileView, setMobileView] = useState<"list" | "map">("list")
  const showMobileMap = !isDesktop && mobileView === "map"

  const markers = listings
    .filter((l) => l.location?.latitude != null && l.location?.longitude != null)
    .map((l) => ({
      id: l.id,
      price: l.pricePerNight ?? null,
      // Pre-formatted in the listing currency (SDG) so the map price pills match
      // the cards — "SDG 185" / "185 ج.س", not a hardcoded "$".
      priceLabel: l.pricePerNight != null ? formatCurrency(l.pricePerNight, locale) : null,
      lat: l.location!.latitude,
      lng: l.location!.longitude,
      title: l.title ?? undefined,
    }))

  const homesLabel = total === 1 ? (sp?.home ?? "home") : (sp?.homes ?? "homes")

  return (
    <>
      {/* Airbnb's results/map area is a 48px-gutter grid at ≥1024 (measured live):
          48 page-gutter │ results 638px │ 48 column-gap │ map (flexes) │ 48 page-gutter.
          The results column is FIXED at 638px so the cards stay 307px and the map
          takes the rest (its right edge lands 48px from the viewport, NOT bled to
          the edge). The page gutters are the wrapper's px; the column gap + that
          right gutter frame the map. Rendered as a real <style> (SSR, no hydration
          flash) since arbitrary Tailwind grid values silently fail under Turbopack. */}
      {/* MOBILE — a full-bleed map preview pinned below the header + filter bar.
          The homes list (the opaque "sheet" below) rises up and covers it as you
          scroll, then the bottom button opens the full map — Airbnb's mobile
          pattern. The wrapper is CSS-gated (`lg:hidden`) so it reserves its
          height from SSR on mobile (no layout shift) and never paints on desktop;
          the mapbox instance inside is JS-gated (`!isDesktop`) so it only mounts
          on mobile. Tapping it opens the full map. */}
      <div className="lg:hidden sticky" style={{ top: 64, height: "42vh", zIndex: 0 }}>
        {!isDesktop &&
          (PHASE1.deferSearchMapMobile ? (
            // Low-bandwidth: don't ship mapbox-gl (~200 KB+) to every mobile
            // visitor. Show a static tappable placeholder; the real map mounts
            // only when the user taps it (or the floating "Map" toggle).
            <button
              type="button"
              onClick={() => setMobileView("map")}
              aria-label={sp?.map ?? "Show map"}
              className="flex h-full w-full items-center justify-center bg-muted"
            >
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-[#222222] shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
                <MapIcon className="h-4 w-4" />
                {sp?.map ?? "Show map"}
              </span>
            </button>
          ) : (
            <SearchMapMobile
              variant="preview"
              listings={listings}
              nights={nights}
              datesLabel={datesLabel}
              onExpand={() => setMobileView("map")}
              expandLabel={sp?.map}
            />
          ))}
      </div>

      {/* Results "sheet" — opaque + rounded-top on mobile so it slides up over the
          preview map on scroll. No desktop media rule → desktop is unchanged. */}
      {/* i18n-exempt — layout CSS, not user-facing copy */}
      <style>{`@media(max-width:1023px){[data-results-sheet]{position:relative;z-index:10;border-top-left-radius:18px;border-top-right-radius:18px;margin-top:-18px}}`}</style>
      <div data-results-sheet className="bg-background">

      {/* i18n-exempt — layout CSS, not user-facing copy */}
      <style>{`@media(min-width:1024px){[data-search-split]{grid-template-columns:638px minmax(0,1fr);column-gap:48px}}`}</style>
      <div className="px-6 lg:px-12">
      <div data-search-split className="grid grid-cols-1">
      {/* Left — results column (this is what scrolls; the map stays pinned) */}
      <div>
        {/* Results sub-header: "N homes" (left) + "Prices include all fees" (right),
            a flex space-between row — matches airbnb.com/s/homes, where the fees
            note is right-aligned to the card-grid edge, not centered. */}
        <div className="flex items-center justify-between pt-6 pb-5">
          <h1
            className="font-semibold"
            style={{ fontSize: 20, lineHeight: "24px", letterSpacing: "-0.18px", color: "#222222" }}
          >
            {total} {homesLabel}
          </h1>
          <div className="hidden items-center gap-2 sm:flex">
            {/* Airbnb's "Prices include all fees" price-tag — the live original is
                a glossy 3D Lottie tag (pink vertical gradient + soft drop-shadow +
                white eyelet). The Lottie SVG can't be cleanly inlined, so this is a
                faithful static recreation using its exact gradient stops
                (#F65C86 → #EF366C, measured from the capture). Un-mirrored in RTL —
                a tag reads fine either way. */}
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              role="presentation"
              focusable="false"
              className="h-4 w-4 shrink-0"
              style={{ display: "block", overflow: "visible" }}
            >
              <defs>
                <linearGradient id="mkanFeesTag" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F65C86" />
                  <stop offset="55%" stopColor="#EF366C" />
                  <stop offset="100%" stopColor="#E0124E" />
                </linearGradient>
              </defs>
              <path
                fill="url(#mkanFeesTag)"
                d="M3.5 12.6 11.4 20.5a2 2 0 0 0 2.83 0l6.27-6.27a2 2 0 0 0 .58-1.5l-.26-6.92a1.85 1.85 0 0 0-1.78-1.78l-6.92-.26a2 2 0 0 0-1.5.58L3.5 9.77a2 2 0 0 0 0 2.83Z"
                style={{ filter: "drop-shadow(0 1px 0.5px rgba(0,0,0,0.2))" }}
              />
              <circle cx="16.2" cy="7.8" r="1.7" fill="#fff" />
            </svg>
            <span style={{ fontSize: 14, color: "#222222" }}>
              {sp?.pricesIncludeFees ?? "Prices include all fees"}
            </span>
          </div>
        </div>

        <div className="pb-12">
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

      {/* Right — sticky map (desktop only). `hidden lg:block` keeps it from
          flashing on mobile; the `isDesktop` gate keeps a second mapbox instance
          from ever mounting on mobile (the mobile map handles that viewport). */}
      {isDesktop && (
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
      )}
      </div>
      </div>
      </div>

      {/* Mobile full-screen map overlay (below the sticky 64px header). */}
      {showMobileMap && (
        <SearchMapMobile
          listings={listings}
          nights={nights}
          datesLabel={datesLabel}
          onBoundsChange={onBoundsChange}
          searchAsMove={searchAsMove}
          onSearchAsMoveChange={setSearchAsMove}
          searchAsIMoveLabel={sp?.searchAsIMove}
          top={64}
        />
      )}

      {/* Floating Map / List toggle — mobile only, like airbnb.com. Rendered
          above the map overlay so it stays tappable in both views. */}
      {!isDesktop && listings.length > 0 && (
        <button
          type="button"
          onClick={() => setMobileView((v) => (v === "map" ? "list" : "map"))}
          aria-label={mobileView === "map" ? (sp?.list ?? "List") : (sp?.map ?? "Map")}
          className="flex items-center gap-2 font-semibold text-white transition active:scale-95"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 50,
            backgroundColor: "#222222",
            borderRadius: 24,
            padding: "13px 18px",
            fontSize: 14,
            boxShadow: "0 3px 12px rgba(0,0,0,0.28), 0 1px 2px rgba(0,0,0,0.18)",
          }}
        >
          {mobileView === "map" ? (
            <>
              {sp?.list ?? "List"}
              <ListIcon className="h-4 w-4" />
            </>
          ) : (
            <>
              {sp?.map ?? "Map"}
              <MapIcon className="h-4 w-4" />
            </>
          )}
        </button>
      )}
    </>
  )
}
