import { getBooking } from '@/lib/actions/transport-actions';
import type { Locale } from '@/components/internationalization/config';
import { BookingConfirmationContent } from './content';

interface BookingPageProps {
  params: Promise<{ lang: Locale; id: string }>;
}

export default async function BookingConfirmationPage({ params }: BookingPageProps) {
  const { lang, id } = await params;
  const bookingId = Number(id);

  // getBooking enforces auth + ownership server-side.
  let booking = null;
  try {
    booking = Number.isFinite(bookingId) ? await getBooking(bookingId) : null;
  } catch {
    booking = null;
  }

  return <BookingConfirmationContent booking={booking} lang={lang} />;
}
