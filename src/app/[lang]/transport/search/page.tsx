import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, Filter } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { SearchWidget } from '@/components/transport/search/search-widget';
import { TripCard } from '@/components/transport/trip/trip-card';
import {
  searchRoutes,
  getAssemblyPoints,
} from '@/lib/actions/transport-actions';
import type { Locale } from '@/components/internationalization/config';

interface SearchPageProps {
  params: Promise<{ lang: Locale }>;
  searchParams: Promise<{
    origin?: string;
    destination?: string;
    date?: string;
  }>;
}

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

  const searchDate = parseISO(date);
  const routes = await searchRoutes(origin, destination, searchDate);
  const assemblyPoints = await getAssemblyPoints();

  // Flatten trips from routes
  const trips = routes.flatMap((route) =>
    route.trips.map((trip) => ({
      ...trip,
      route: {
        origin: route.origin,
        destination: route.destination,
        duration: route.duration,
        office: route.office,
      },
    }))
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-muted/30">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-6">
            <Link href={`/${lang}/transport`}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">
                {origin} → {destination}
              </h1>
              <p className="text-muted-foreground">
                {format(searchDate, 'EEEE, MMMM d, yyyy')}
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
            {trips.length} trip{trips.length !== 1 ? 's' : ''} found
          </p>
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
        </div>

        {trips.length > 0 ? (
          <div className="grid gap-4">
            {trips.map((trip) => (
              <TripCard key={trip.id} trip={trip} lang={lang} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🚌</div>
            <h2 className="text-xl font-semibold mb-2">No trips found</h2>
            <p className="text-muted-foreground mb-6">
              There are no available trips for this route on the selected date.
              <br />
              Try a different date or route.
            </p>
            <Link href={`/${lang}/transport`}>
              <Button>Search Again</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
