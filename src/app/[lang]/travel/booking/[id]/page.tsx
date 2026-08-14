import type { Metadata } from 'next';

import { getBooking } from '@/lib/actions/travel-actions';
import { getDictionary } from '@/components/internationalization/dictionaries';
import { createMetadata } from '@/lib/metadata';
import type { Locale } from '@/components/internationalization/config';
import { BookingConfirmationContent } from './content';

interface BookingPageProps {
  params: Promise<{ lang: Locale; id: string }>;
}

// Someone's booking. noIndex because a robots.txt disallow does not stop an
// externally-linked URL from being indexed — only the meta robots tag does.
// The title itself stays generic: it shows up in browser history and shared
// tab lists, so it must not leak a passenger name or route.
export async function generateMetadata({ params }: BookingPageProps): Promise<Metadata> {
  const { lang, id } = await params;
  const d = await getDictionary(lang);
  const t = d?.travel;
  return createMetadata({
    title: t?.bookingPage?.title ?? 'Your booking',
    description: t?.meta?.description ?? 'Book intercity bus trips across Sudan',
    locale: lang,
    path: `/travel/booking/${id}`,
    noIndex: true,
  });
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
