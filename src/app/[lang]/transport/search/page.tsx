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
  params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const dictionary = await getDictionary(lang);
  return createMetadata({
    title: dictionary.transport.search.metadataTitle,
    description: dictionary.transport.search.metadataDescription,
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

  const t = dictionary.transport;
  const { trips, total, page, pageCount, facets } = result;

  const isArabic = lang === 'ar';
  const dateLocale = isArabic ? ar : undefined;
  const localizedNameKey = isArabic ? 'nameAr' : 'name';

  const originLabel = parsed.originId
    ? assemblyPoints.find((p) => p.id === parsed.originId)?.[localizedNameKey]
      ?? parsed.origin
      ?? ''
    : parsed.origin ?? '';
  const destinationLabel = parsed.destinationId
    ? assemblyPoints.find((p) => p.id === parsed.destinationId)?.[localizedNameKey]
      ?? parsed.destination
      ?? ''
    : parsed.destination ?? '';

  const filterDict = {
    filters: {
      title: t.search.filters.title,
      clearAll: t.search.filters.clearAll,
      showResults: t.search.filters.showResults,
    },
    sort: {
      label: t.search.sort.label,
      priceAsc: t.search.sort.priceAsc,
      priceDesc: t.search.sort.priceDesc,
      departureAsc: t.search.sort.departureAsc,
      durationAsc: t.search.sort.durationAsc,
    },
    timeOfDay: {
      label: t.search.timeOfDay.label,
      morning: t.search.timeOfDay.morning,
      afternoon: t.search.timeOfDay.afternoon,
      evening: t.search.timeOfDay.evening,
      night: t.search.timeOfDay.night,
    },
    price: {
      label: t.search.price.label,
      currency: t.search.price.currency,
    },
    amenitiesLabel: t.search.amenitiesLabel,
    officesLabel: t.search.officesLabel,
    amenities: t.host?.amenityLabels,
    mobileTriggerLabel: t.search.filters.title,
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
                from: t.search.from,
                to: t.search.to,
                date: t.search.date,
                search: t.search.search,
                swap: t.search.swap,
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
                {typeof t.search.tripsFound === 'string'
                  ? t.search.tripsFound.replace('{count}', String(total))
                  : `${total} trips`}
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
                        selectSeats: t.trip.selectSeats,
                        seatsAvailable: t.trip.seatsAvailable,
                        duration: t.trip.duration,
                        verified: t.office.verified,
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
                    dict={t.search.pagination}
                  />
                )}
              </>
            ) : (
              <div className="text-center py-16">
                <div className="text-6xl mb-4">🚌</div>
                <h2 className="text-xl font-semibold mb-2">{t.search.noResults}</h2>
                <p className="text-muted-foreground mb-6">
                  {t.search.noResultsDescription}
                </p>
                <Link href={`/${lang}/transport`}>
                  <Button>{t.search.searchAgain}</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface PaginationDict {
  previous: string;
  next: string;
  pageOf: string;
}

function Pagination({
  page,
  pageCount,
  lang,
  searchParams,
  dict,
}: {
  page: number;
  pageCount: number;
  lang: string;
  searchParams: Record<string, string | undefined>;
  dict: PaginationDict;
}) {
  const buildHref = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v !== undefined && k !== 'page') qs.set(k, v);
    }
    if (p > 1) qs.set('page', String(p));
    return `/${lang}/transport/search?${qs.toString()}`;
  };

  const pageLabel = dict.pageOf
    .replace('{current}', String(page))
    .replace('{total}', String(pageCount));

  return (
    <div className="mt-8 flex items-center justify-center gap-2">
      <Link
        href={page > 1 ? buildHref(page - 1) : '#'}
        aria-disabled={page <= 1}
        tabIndex={page <= 1 ? -1 : 0}
        className="pointer-events-auto"
      >
        <Button variant="outline" size="sm" disabled={page <= 1}>
          {dict.previous}
        </Button>
      </Link>
      <span className="text-sm text-muted-foreground mx-3">{pageLabel}</span>
      <Link
        href={page < pageCount ? buildHref(page + 1) : '#'}
        aria-disabled={page >= pageCount}
        tabIndex={page >= pageCount ? -1 : 0}
      >
        <Button variant="outline" size="sm" disabled={page >= pageCount}>
          {dict.next}
        </Button>
      </Link>
    </div>
  );
}
