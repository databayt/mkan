import type { Metadata } from 'next';
import { cache } from 'react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

import { getTripDetails } from '@/lib/actions/travel-actions';
import { getDictionary } from '@/components/internationalization/dictionaries';
import { createMetadata } from '@/lib/metadata';
import { cityLabel } from '@/components/travel/city-names';
import type { Locale } from '@/components/internationalization/config';
import { TripDetailsContent } from './content';

interface TripPageProps {
  params: Promise<{ lang: Locale; id: string }>;
}

// React cache() dedupes the row across generateMetadata and the page body —
// without it every trip view runs getTripDetails twice, and that call also
// heals expired seat holds, so the duplicate is a write path, not just a read.
const fetchTrip = cache(async (tripId: number) => getTripDetails(tripId));

export async function generateMetadata({ params }: TripPageProps): Promise<Metadata> {
  const { lang, id } = await params;
  const d = await getDictionary(lang);
  const t = d?.travel;
  const fallbackTitle = t?.trip?.title ?? 'Bus Trip';
  const fallbackDescription =
    t?.meta?.description ?? 'Book intercity bus trips across Sudan';

  const tripId = Number(id);
  if (!Number.isFinite(tripId)) {
    return createMetadata({
      title: fallbackTitle,
      description: fallbackDescription,
      locale: lang,
      path: `/travel/trips/${id}`,
      noIndex: true,
    });
  }

  const trip = await fetchTrip(tripId).catch(() => null);
  if (!trip) {
    return createMetadata({
      title: fallbackTitle,
      description: fallbackDescription,
      locale: lang,
      path: `/travel/trips/${id}`,
      noIndex: true,
    });
  }

  const origin = cityLabel(trip.route.origin.city, lang);
  const destination = cityLabel(trip.route.destination.city, lang);
  const office = (lang === 'ar' ? trip.route.office.nameAr : trip.route.office.name)
    || trip.route.office.name;
  const date = format(new Date(trip.departureDate), 'PPP', {
    locale: lang === 'ar' ? ar : undefined,
  });

  // A trip that has departed, sold out, or been cancelled is still a valid URL
  // for whoever holds the link, but it is not worth an index entry — the page
  // it lands on is a dead end.
  const isBookable =
    trip.isActive && !trip.isCancelled && trip.availableSeats > 0
    && new Date(trip.departureDate).getTime() >= Date.now() - 24 * 60 * 60 * 1000;

  const title = `${origin} → ${destination} · ${date}`;
  const description = (
    t?.meta?.tripDescription
    ?? '{office} departs {origin} for {destination} at {time} on {date}. Pick your seat and book online.'
  )
    .replace('{office}', office)
    .replace('{origin}', origin)
    .replace('{destination}', destination)
    .replace('{time}', trip.departureTime)
    .replace('{date}', date);

  return createMetadata({
    title,
    description,
    locale: lang,
    path: `/travel/trips/${id}`,
    noIndex: !isBookable,
  });
}

export default async function TripDetailsPage({ params }: TripPageProps) {
  const { lang, id } = await params;
  const tripId = Number(id);
  const trip = Number.isFinite(tripId) ? await fetchTrip(tripId) : null;

  return <TripDetailsContent trip={trip} lang={lang} />;
}
