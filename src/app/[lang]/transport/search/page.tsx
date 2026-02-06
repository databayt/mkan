import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { ar } from 'date-fns/locale';
import { ArrowLeft, Filter } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { SearchWidget } from '@/components/transport/search/search-widget';
import { TripCard } from '@/components/transport/trip/trip-card';
import {
  searchRoutes,
  getAssemblyPoints,
} from '@/lib/actions/transport-actions';
import { getDictionary } from '@/components/internationalization/dictionaries';
import type { Locale } from '@/components/internationalization/config';

interface SearchPageProps {
  params: Promise<{ lang: Locale }>;
  searchParams: Promise<{
    origin?: string;
    destination?: string;
    date?: string;
  }>;
}

export const dynamic = 'force-dynamic';

export default async function SearchPage({
  params,
  searchParams,
}: SearchPageProps) {
  const { lang } = await params;
  const { origin, destination, date } = await searchParams;

  // Redirect if missing search params
  if (!origin || !destination || !date) {
    redirect(`/${lang}/transport`);
  }

  const dictionary = await getDictionary(lang);
  const t = dictionary.transport;

  const searchDate = parseISO(date);
  const routes = await searchRoutes(origin, destination, searchDate) as any[];
  const assemblyPoints = await getAssemblyPoints();

  // Flatten trips from routes
  const trips = routes.flatMap((route: any) =>
    route.trips.map((trip: any) => ({
      ...trip,
      route: {
        origin: route.origin,
        destination: route.destination,
        duration: route.duration,
        office: route.office,
      },
    }))
  );

  const dateLocale = lang === 'ar' ? ar : undefined;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-muted/30">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-6">
            <Link href={`/${lang}/transport`}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">
                {origin} → {destination}
              </h1>
              <p className="text-muted-foreground">
                {format(searchDate, 'EEEE, MMMM d, yyyy', { locale: dateLocale })}
              </p>
            </div>
          </div>

          {/* Search Widget */}
          <Suspense fallback={null}>
            <SearchWidget
              initialOrigin={origin}
              initialDestination={destination}
              initialDate={searchDate}
              assemblyPoints={assemblyPoints}
            />
          </Suspense>
        </div>
      </div>

      {/* Results */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <p className="text-muted-foreground">
            {t.search.tripsFound.replace('{count}', String(trips.length))}
          </p>
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
            {t.search.filters}
          </Button>
        </div>

        {trips.length > 0 ? (
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
  );
}
