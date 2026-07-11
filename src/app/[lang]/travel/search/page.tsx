import { Metadata } from "next";
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { ar } from 'date-fns/locale';

import TravelSearchHeader from '@/components/travel/search/travel-search-header';
import { FiltersPanel } from '@/components/travel/search/filters-panel';
import { TravelSearchResultsArea } from '@/components/travel/search/travel-search-results-area';
import { parseSearchParams } from '@/components/travel/search/url-state';
import Footer from '@/components/site/footer';
import {
  getAssemblyPoints,
  searchTrips,
} from '@/lib/actions/travel-actions';
import { getDictionary } from '@/components/internationalization/dictionaries';
import { createMetadata } from "@/lib/metadata";
import type { Locale } from '@/components/internationalization/config';
import { cityLabel } from '@/components/travel/city-names';
import { formatNumber } from '@/lib/i18n/formatters';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  const t = dict?.travel;
  return createMetadata({
    title: t?.meta?.searchTitle ?? "Transport Search",
    description: t?.meta?.searchDescription ?? "Search for available transport trips",
    locale: lang,
    path: "/travel/search",
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

  const searchDate = spObject.date ? parseISO(spObject.date) : undefined;

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

  const t = dictionary?.travel;
  const { trips, total, page, pageCount, facets } = result;
  const minDuration = trips.length > 0 ? Math.min(...trips.map((t) => t.route.duration)) : 0;

  const dateLocale = lang === 'ar' ? ar : undefined;

  const anywhereLabel = t?.search?.anywhere ?? (lang === 'ar' ? 'أي مكان' : 'Anywhere');
  const anydateLabel = t?.search?.anyDate ?? (lang === 'ar' ? 'أي تاريخ' : 'Any date');

  const originLabel = parsed.originId
    ? assemblyPoints.find((p) => p.id === parsed.originId)?.[lang === 'ar' ? 'nameAr' : 'name']
      ?? cityLabel(parsed.origin ?? '', lang)
    : parsed.origin
      ? cityLabel(parsed.origin, lang)
      : anywhereLabel;

  const destinationLabel = parsed.destinationId
    ? assemblyPoints.find((p) => p.id === parsed.destinationId)?.[lang === 'ar' ? 'nameAr' : 'name']
      ?? cityLabel(parsed.destination ?? '', lang)
    : parsed.destination
      ? cityLabel(parsed.destination, lang)
      : anywhereLabel;

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

  const seatsCount = spObject.seats ? Number.parseInt(spObject.seats, 10) || 0 : 0;
  const searchSummary = {
    origin: originLabel,
    destination: destinationLabel,
    date: searchDate ? format(searchDate, 'MMM d', { locale: dateLocale }) : anydateLabel,
    passengers:
      seatsCount > 0
        ? `${formatNumber(seatsCount, lang)} ${seatsCount > 1 ? (t?.search?.seats ?? 'seats') : (t?.search?.seat ?? 'seat')}`
        : undefined,
  };

  return (
    <div className="min-h-screen bg-[#F7F7F7] dark:bg-background">
      {/* Search header — homes-style expanding pill (route · date · seats) that
          blooms into the full TransportBigSearch fields with the same motion. */}
      <TravelSearchHeader
        lang={lang}
        assemblyPoints={assemblyPoints}
        initialOrigin={parsed.origin ?? originLabel}
        initialDestination={parsed.destination ?? destinationLabel}
        initialDate={searchDate}
        searchSummary={searchSummary}
        filters={
          <Suspense fallback={null}>
            <FiltersPanel
              facets={facets}
              totalTrips={total}
              dict={filterDict}
            />
          </Suspense>
        }
      />

      {/* Results layout */}
      <TravelSearchResultsArea
        trips={trips}
        total={total}
        lang={lang}
        page={page}
        pageCount={pageCount}
        searchParams={spObject}
        assemblyPoints={assemblyPoints}
        originId={parsed.originId}
        destinationId={parsed.destinationId}
        t={t}
        minDuration={minDuration}
      />
      <Footer />
    </div>
  );
}
