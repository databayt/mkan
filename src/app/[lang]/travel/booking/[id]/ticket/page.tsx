import type { Metadata } from 'next';
import QRCode from 'qrcode';

import { generateTicketData } from '@/lib/actions/travel-actions';
import { getDictionary } from '@/components/internationalization/dictionaries';
import { createMetadata } from '@/lib/metadata';
import type { Locale } from '@/components/internationalization/config';
import { TicketContent, type PassengerTicket } from './content';

interface TicketPageProps {
  params: Promise<{ lang: Locale; id: string }>;
}

// A boarding pass with a signed QR on it. Same reasoning as the booking page,
// with more at stake: never indexed, and the title carries no passenger detail.
export async function generateMetadata({ params }: TicketPageProps): Promise<Metadata> {
  const { lang, id } = await params;
  const d = await getDictionary(lang);
  const t = d?.travel;
  return createMetadata({
    title: t?.ticketView?.title ?? 'Your ticket',
    description: t?.meta?.description ?? 'Book intercity bus trips across Sudan',
    locale: lang,
    path: `/travel/booking/${id}/ticket`,
    noIndex: true,
  });
}

const QR_RENDER_OPTIONS = {
  width: 200,
  margin: 2,
  color: { dark: '#000000', light: '#ffffff' },
};

export default async function TicketViewPage({ params }: TicketPageProps) {
  const { lang, id } = await params;
  const bookingId = Number(id);

  // generateTicketData enforces auth + ownership via getBooking, signs the
  // QR payloads (HMAC), and persists the booking-level QR for validation.
  let booking = null;
  let qrCodeUrl = '';
  let passengerTickets: PassengerTicket[] = [];
  try {
    if (Number.isFinite(bookingId)) {
      const ticket = await generateTicketData(bookingId);
      booking = ticket.booking;
      qrCodeUrl = await QRCode.toDataURL(ticket.qrData, QR_RENDER_OPTIONS);
      passengerTickets = await Promise.all(
        ticket.passengerTickets.map(async (pt) => ({
          name: pt.passenger.name,
          seatNumber: pt.passenger.seatNumber,
          idCard: pt.passenger.idCard,
          qrCodeUrl: await QRCode.toDataURL(pt.qrData, QR_RENDER_OPTIONS),
        })),
      );
    }
  } catch {
    booking = null;
  }

  return (
    <TicketContent
      booking={booking}
      qrCodeUrl={qrCodeUrl}
      passengerTickets={passengerTickets}
      lang={lang}
    />
  );
}
