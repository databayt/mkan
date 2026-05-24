import { Metadata } from "next";
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { ar } from 'date-fns/locale';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { SearchWidget } from '@/components/transport/search/search-widget';
import { FiltersPanel } from '@/components/transport/search/filters-panel';
import { TripCard } from '@/components/transport/trip/trip-card';
import { parseSearchParams } from '@/components/transport/search/url-state';
import {
  getAssemblyPoints,
  searchTrips,
} from '@/lib/actions/transport-actions';
import { getDictionary } from '@/components/internationalization/dictionaries';
import { createMetadata } from "@/lib/metadata";
import type { Locale } from '@/components/internationalization/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  const t = dict?.transport;
  return createMetadata({
    title: t?.meta?.searchTitle ?? "Transport Search",
    description: t?.meta?.searchDescription ?? "Search for available transport trips",
    locale: lang,
    path: "/transport/search",
  });
}

interface SearchPageProps {
  params: Promise<{ lang: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = 'force-dynamic';

function flatten(sp: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) {
    out[k] = Array.isArray(v) ? v[0] : v;
  }
  return out;
}

export default async function SearchPage({
  params,
  searchParams,
}: SearchPageProps) {
  const { lang } = await params;
  const spObject = flatten(await searchParams);

  // Must have origin (id or string) + destination + date
  const hasOrigin = spObject.originId || spObject.origin;
  const hasDestination = spObject.destinationId || spObject.destination;
  if (!hasOrigin || !hasDestination || !spObject.date) {
    redirect(`/${lang}/transport`);
  }

  const searchDate = parseISO(spObject.date);

  const parsed = parseSearchParams(spObject);

  const [dictionary, result, assemblyPoints] = await Promise.all([
    getDictionary(lang),
    searchTrips({
      originId: parsed.originId,
      destinationId: parsed.destinationId,
      origin: parsed.origin,
      destination: parsed.destination,
      date: searchDate,
      when: parsed.when,
      priceMin: parsed.priceMin,
      priceMax: parsed.priceMax,
      amenities: parsed.amenities,
      officeIds: parsed.officeIds,
      minSeats: parsed.minSeats,
      sort: parsed.sort,
      page: parsed.page,
      limit: 20,
    }),
    getAssemblyPoints(),
  ]);

  const t = dictionary?.transport;
  const { trips, total, page, pageCount, facets } = result;

  const dateLocale = lang === 'ar' ? ar : undefined;

  const originLabel = parsed.originId
    ? assemblyPoints.find((p) => p.id === parsed.originId)?.[lang === 'ar' ? 'nameAr' : 'name']
      ?? parsed.origin
      ?? ''
    : parsed.origin ?? '';
  const destinationLabel = parsed.destinationId
    ? assemblyPoints.find((p) => p.id === parsed.destinationId)?.[lang === 'ar' ? 'nameAr' : 'name']
      ?? parsed.destination
      ?? ''
    : parsed.destination ?? '';

  // Filter dictionary sourced from the central transport namespace.
  const filterDict = {
    filters: {
      title: t?.search?.filters?.title ?? "Filters",
      clearAll: t?.search?.filters?.clearAll ?? "Clear all",
      showResults: t?.search?.filters?.showResults ?? "Show {count} trips",
    },
    sort: {
      label: t?.search?.sort?.label ?? "Sort",
      priceAsc: t?.search?.sort?.priceAsc ?? "Price: low to high",
      priceDesc: t?.search?.sort?.priceDesc ?? "Price: high to low",
      departureAsc: t?.search?.sort?.departureAsc ?? "Earliest departure",
      durationAsc: t?.search?.sort?.durationAsc ?? "Shortest duration",
    },
    timeOfDay: {
      label: t?.search?.timeOfDay?.label ?? "Departure time",
      morning: t?.search?.timeOfDay?.morning ?? "Morning",
      afternoon: t?.search?.timeOfDay?.afternoon ?? "Afternoon",
      evening: t?.search?.timeOfDay?.evening ?? "Evening",
      night: t?.search?.timeOfDay?.night ?? "Night",
    },
    price: {
      label: t?.search?.price?.label ?? "Price range",
      currency: t?.search?.price?.currency ?? "SDG",
    },
    amenitiesLabel: t?.search?.amenitiesLabel ?? "Amenities",
    officesLabel: t?.search?.officesLabel ?? "Operators",
    amenities: t?.host?.amenityLabels,
    mobileTriggerLabel: t?.search?.filters?.title ?? "Filters",
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-6">
            <Link href={`/${lang}/transport`}>
              <Button variant="ghost" size="icon" aria-label="Go back">
                <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">
                {originLabel} → {destinationLabel}
              </h1>
              <p className="text-muted-foreground">
                {format(searchDate, 'EEEE, MMMM d, yyyy', { locale: dateLocale })}
              </p>
            </div>
          </div>

          {/* Search Widget */}
          <Suspense fallback={null}>
            <SearchWidget
              initialOrigin={parsed.origin ?? originLabel}
              initialDestination={parsed.destination ?? destinationLabel}
              initialOriginId={parsed.originId}
              initialDestinationId={parsed.destinationId}
              initialDate={searchDate}
              assemblyPoints={assemblyPoints}
              dictionary={{
                from: t?.search?.from ?? "From",
                to: t?.search?.to ?? "To",
                date: t?.search?.date ?? "Travel Date",
                search: t?.search?.search ?? "Search Trips",
                swap: t?.search?.swap ?? "Swap cities",
              }}
            />
          </Suspense>
        </div>
      </div>

      {/* Results layout */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-6">
          <Suspense fallback={null}>
            <FiltersPanel
              facets={facets}
              totalTrips={total}
              dict={filterDict}
            />
          </Suspense>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-6">
              <p className="text-muted-foreground">
                {(t?.search?.tripsFound ?? t?.searchPage?.tripsCountFallback ?? "{count} trip(s) found").replace('{count}', String(total))}
              </p>
            </div>

            {trips.length > 0 ? (
              <>
                <div className="grid gap-4">
                  {trips.map((trip) => (
                    <TripCard
                      key={trip.id}
                      trip={trip}
                      lang={lang}
                      dictionary={{
                        selectSeats: t?.trip?.selectSeats ?? "Select Seats",
                        seatsAvailable: t?.trip?.seatsAvailable ?? "seats available",
                        duration: t?.trip?.duration ?? "Duration",
                        verified: t?.office?.verified ?? "Verified",
                      }}
                    />
                  ))}
                </div>

                {pageCount > 1 && (
                  <Pagination
                    page={page}
                    pageCount={pageCount}
                    lang={lang}
                    searchParams={spObject}
                    labels={{
                      previous: t?.searchPage?.previous ?? "Previous",
                      next: t?.searchPage?.next ?? "Next",
                      pageOf: t?.searchPage?.pageOf ?? "Page {page} of {pageCount}",
                    }}
                  />
                )}
              </>
            ) : (
              <div className="text-center py-16">
                <div className="text-6xl mb-4">🚌</div>
                <h2 className="text-xl font-semibold mb-2">{t?.search?.noResults ?? "No trips found"}</h2>
                <p className="text-muted-foreground mb-6">
                  {t?.search?.noResultsDescription ?? "There are no available trips for this route on the selected date. Try a different date or route."}
                </p>
                <Link href={`/${lang}/transport`}>
                  <Button>{t?.search?.searchAgain ?? "Search Again"}</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Pagination({
  page,
  pageCount,
  lang,
  searchParams,
  labels,
}: {
  page: number;
  pageCount: number;
  lang: string;
  searchParams: Record<string, string | undefined>;
  labels: { previous: string; next: string; pageOf: string };
}) {
  const buildHref = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v !== undefined && k !== 'page') qs.set(k, v);
    }
    if (p > 1) qs.set('page', String(p));
    return `/${lang}/transport/search?${qs.toString()}`;
  };

  return (
    <div className="mt-8 flex items-center justify-center gap-2">
      <Link
        href={page > 1 ? buildHref(page - 1) : '#'}
        aria-disabled={page <= 1}
        tabIndex={page <= 1 ? -1 : 0}
        className="pointer-events-auto"
      >
        <Button variant="outline" size="sm" disabled={page <= 1}>
          {labels.previous}
        </Button>
      </Link>
      <span className="text-sm text-muted-foreground mx-3">
        {labels.pageOf.replace('{page}', String(page)).replace('{pageCount}', String(pageCount))}
      </span>
      <Link
        href={page < pageCount ? buildHref(page + 1) : '#'}
        aria-disabled={page >= pageCount}
        tabIndex={page >= pageCount ? -1 : 0}
      >
        <Button variant="outline" size="sm" disabled={page >= pageCount}>
          {labels.next}
        </Button>
      </Link>
    </div>
  );
}
