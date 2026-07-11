import QRCode from 'qrcode';

import { generateTicketData } from '@/lib/actions/travel-actions';
import type { Locale } from '@/components/internationalization/config';
import { TicketContent, type PassengerTicket } from './content';

interface TicketPageProps {
  params: Promise<{ lang: Locale; id: string }>;
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
