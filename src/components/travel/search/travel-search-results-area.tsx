"use client";

import { useState } from "react";
import { Map as MapIcon, List as ListIcon, BusFront } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { TripCard } from "@/components/travel/trip/trip-card";
import { formatNumber } from "@/lib/i18n/formatters";
import TravelSearchMapLoader from "./travel-search-map-loader";
import type { AssemblyPoint } from "./travel-search-map";

interface TravelSearchResultsAreaProps {
  trips: any[];
  total: number;
  lang: "en" | "ar";
  page: number;
  pageCount: number;
  searchParams: Record<string, string | undefined>;
  assemblyPoints: AssemblyPoint[];
  originId?: number;
  destinationId?: number;
  t: any;
  minDuration: number;
}

export function TravelSearchResultsArea({
  trips,
  total,
  lang,
  page,
  pageCount,
  searchParams,
  assemblyPoints,
  originId,
  destinationId,
  t,
  minDuration,
}: TravelSearchResultsAreaProps) {
  const router = useRouter();
  const isDesktop = useIsDesktop(1024);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const showMobileMap = !isDesktop && mobileView === "map";

  const mapLabel = lang === "ar" ? "الخريطة" : "Map";
  const listLabel = lang === "ar" ? "القائمة" : "List";

  const updateRouteInUrl = (oId?: number, dId?: number) => {
    const qs = new URLSearchParams(window.location.search);
    if (oId) {
      qs.set("originId", String(oId));
      const ap = assemblyPoints.find((a) => a.id === oId);
      if (ap) qs.set("origin", ap.city);
    } else {
      qs.delete("originId");
      qs.delete("origin");
    }

    if (dId) {
      qs.set("destinationId", String(dId));
      const ap = assemblyPoints.find((a) => a.id === dId);
      if (ap) qs.set("destination", ap.city);
    } else {
      qs.delete("destinationId");
      qs.delete("destination");
    }

    // Reset pagination page on search change
    qs.delete("page");
    router.push(`?${qs.toString()}`);
  };

  const handleSetOrigin = (id: number) => {
    updateRouteInUrl(id, destinationId);
  };

  const handleSetDestination = (id: number) => {
    updateRouteInUrl(originId, id);
  };

  const buildPaginationHref = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v !== undefined && k !== "page") qs.set(k, v);
    }
    if (p > 1) qs.set("page", String(p));
    return `/${lang}/travel/search?${qs.toString()}`;
  };

  return (
    <>
      {/* MOBILE MAP PREVIEW (top of the page when in list view) */}
      <div className="lg:hidden sticky" style={{ top: 64, height: "42vh", zIndex: 0 }}>
        {!isDesktop && (
          <div className="h-full w-full" onClick={() => setMobileView("map")}>
            <TravelSearchMapLoader
              assemblyPoints={assemblyPoints}
              originId={originId}
              destinationId={destinationId}
              lang={lang}
              onSetOrigin={handleSetOrigin}
              onSetDestination={handleSetDestination}
              stickyTop={64}
            />
            {/* Absolute transparent overlay to catch click and open full map */}
            <div className="absolute inset-0 z-20 cursor-pointer" />
          </div>
        )}
      </div>

      {/* Results sheet */}
      {/* Dynamic styling for responsive side-by-side or sliding mobile views */}
      <style>{`
        @media(max-width:1023px) {
          [data-results-sheet] {
            position: relative;
            z-index: 10;
            border-top-left-radius: 18px;
            border-top-right-radius: 18px;
            margin-top: -18px;
          }
        }
        @media(min-width:1024px) {
          [data-search-split] {
            grid-template-columns: 638px minmax(0, 1fr);
            column-gap: 48px;
          }
        }
      `}</style>

      <div data-results-sheet className="bg-background">
        <div className="px-6 lg:px-12 py-8">
          <div data-search-split className="grid grid-cols-1">
            {/* Left Column: Trips list and pagination */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1
                  className="font-semibold text-slate-900 dark:text-white"
                  style={{ fontSize: 20, lineHeight: "24px", letterSpacing: "-0.18px" }}
                >
                  {(t?.search?.tripsFound ?? t?.searchPage?.tripsCountFallback ?? "{count} trip(s) found").replace(
                    "{count}",
                    formatNumber(total, lang)
                  )}
                </h1>
              </div>

              {trips.length > 0 ? (
                <>
                  <div className="grid gap-4 pb-12">
                    {trips.map((trip) => (
                      <TripCard
                        key={trip.id}
                        trip={trip}
                        lang={lang}
                        isFastest={trip.route.duration === minDuration}
                        dictionary={{
                          selectSeats: t?.trip?.selectSeats ?? "Select Seats",
                          seatsAvailable: t?.trip?.seatsAvailable ?? "seats available",
                          duration: t?.trip?.duration ?? "Duration",
                          viewStops: t?.trip?.viewStops ?? "View stops",
                          verified: t?.office?.verified ?? "Verified",
                        }}
                      />
                    ))}
                  </div>

                  {pageCount > 1 && (
                    <div className="mt-8 mb-12 flex items-center justify-center gap-2">
                      <Link
                        href={page > 1 ? buildPaginationHref(page - 1) : "#"}
                        aria-disabled={page <= 1}
                        tabIndex={page <= 1 ? -1 : 0}
                      >
                        <Button variant="outline" size="sm" disabled={page <= 1}>
                          {t?.searchPage?.previous ?? "Previous"}
                        </Button>
                      </Link>
                      <span className="text-sm text-muted-foreground mx-3">
                        {(t?.searchPage?.pageOf ?? "Page {page} of {pageCount}")
                          .replace("{page}", String(page))
                          .replace("{pageCount}", String(pageCount))}
                      </span>
                      <Link
                        href={page < pageCount ? buildPaginationHref(page + 1) : "#"}
                        aria-disabled={page >= pageCount}
                        tabIndex={page >= pageCount ? -1 : 0}
                      >
                        <Button variant="outline" size="sm" disabled={page >= pageCount}>
                          {t?.searchPage?.next ?? "Next"}
                        </Button>
                      </Link>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-16 px-4">
                  <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                    <BusFront className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h2 className="text-xl font-semibold mb-2">{t?.search?.noResults ?? "No trips found"}</h2>
                  <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                    {t?.search?.noResultsDescription ?? "There are no available trips for this route on the selected date. Try a different date or route."}
                  </p>
                  <Link href={`/${lang}/travel`}>
                    <Button>{t?.search?.searchAgain ?? "Search Again"}</Button>
                  </Link>
                </div>
              )}
            </div>

            {/* Right Column: Sticky desktop map */}
            {isDesktop && (
              <div className="hidden lg:block">
                <TravelSearchMapLoader
                  assemblyPoints={assemblyPoints}
                  originId={originId}
                  destinationId={destinationId}
                  lang={lang}
                  onSetOrigin={handleSetOrigin}
                  onSetDestination={handleSetDestination}
                  stickyTop={64}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile full-screen map overlay */}
      {showMobileMap && (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-background lg:hidden animate-in fade-in slide-in-from-bottom-5 duration-200" style={{ top: 64 }}>
          <TravelSearchMapLoader
            assemblyPoints={assemblyPoints}
            originId={originId}
            destinationId={destinationId}
            lang={lang}
            onSetOrigin={handleSetOrigin}
            onSetDestination={handleSetDestination}
            stickyTop={64}
          />
        </div>
      )}

      {/* Floating Map / List toggle — mobile only */}
      {!isDesktop && (
        <button
          type="button"
          onClick={() => setMobileView((v) => (v === "map" ? "list" : "map"))}
          aria-label={mobileView === "map" ? listLabel : mapLabel}
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
              {listLabel}
              <ListIcon className="h-4 w-4" />
            </>
          ) : (
            <>
              {mapLabel}
              <MapIcon className="h-4 w-4" />
            </>
          )}
        </button>
      )}
    </>
  );
}
