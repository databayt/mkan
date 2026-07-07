import { getTripDetails } from '@/lib/actions/transport-actions';
import type { Locale } from '@/components/internationalization/config';
import { TripDetailsContent } from './content';

interface TripPageProps {
  params: Promise<{ lang: Locale; id: string }>;
}

export default async function TripDetailsPage({ params }: TripPageProps) {
  const { lang, id } = await params;
  const tripId = Number(id);
  const trip = Number.isFinite(tripId) ? await getTripDetails(tripId) : null;

  return <TripDetailsContent trip={trip} lang={lang} />;
}
