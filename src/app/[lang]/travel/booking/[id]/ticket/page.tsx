import QRCode from 'qrcode';

import { getBooking } from '@/lib/actions/transport-actions';
import type { Locale } from '@/components/internationalization/config';
import { TicketContent } from './content';

interface TicketPageProps {
  params: Promise<{ lang: Locale; id: string }>;
}

export default async function TicketViewPage({ params }: TicketPageProps) {
  const { lang, id } = await params;
  const bookingId = Number(id);

  // getBooking enforces auth + ownership server-side.
  let booking = null;
  try {
    booking = Number.isFinite(bookingId) ? await getBooking(bookingId) : null;
  } catch {
    booking = null;
  }

  // The QR payload mirrors what validateTicket scans for.
  let qrCodeUrl = '';
  if (booking) {
    qrCodeUrl = await QRCode.toDataURL(
      JSON.stringify({
        ref: booking.bookingReference,
        passenger: booking.passengerName,
        seats: booking.seats.map((s) => s.seatNumber).join(','),
      }),
      {
        width: 200,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      },
    );
  }

  return <TicketContent booking={booking} qrCodeUrl={qrCodeUrl} lang={lang} />;
}
