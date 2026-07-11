'use client';

// Client content for the printable ticket (mirror pattern) — the booking and
// pre-rendered signed QR data-URLs arrive from the server page; this file owns
// only the print interaction and print-scoped styles. Group bookings render
// one boarding card per passenger (each with its own seat-scoped QR); legacy
// bookings without Passenger rows fall back to the single booking-level card.

import React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  MapPin,
  Clock,
  Calendar,
  Download,
  ArrowRight,
  Bus,
  User,
  QrCode,
} from 'lucide-react';
import { format } from 'date-fns';
import { ar, enUS } from 'date-fns/locale';

import type { getBooking } from '@/lib/actions/travel-actions';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import { useLocale } from '@/components/internationalization/use-locale';
import { formatCurrency, formatNumber } from '@/lib/i18n/formatters';
import { cityLabel } from '@/components/travel/city-names';

type BookingDetails = NonNullable<Awaited<ReturnType<typeof getBooking>>>;

export interface PassengerTicket {
  name: string;
  seatNumber: string;
  idCard: string | null;
  qrCodeUrl: string;
}

interface TicketContentProps {
  booking: BookingDetails | null;
  qrCodeUrl: string;
  passengerTickets: PassengerTicket[];
  lang: string;
}

interface TicketCardProps {
  booking: BookingDetails;
  lang: string;
  passengerName: string;
  seatsLabel: string;
  fare: number;
  qrCodeUrl: string;
  pageLabel?: string;
}

function TicketCard({
  booking,
  lang,
  passengerName,
  seatsLabel,
  fare,
  qrCodeUrl,
  pageLabel,
}: TicketCardProps) {
  const dateLocale = lang === 'ar' ? ar : enUS;
  const tv = useDictionary()?.travel?.ticketView;
  const { locale } = useLocale();

  const officeName =
    lang === 'ar' && booking.trip.route.office.nameAr
      ? booking.trip.route.office.nameAr
      : booking.trip.route.office.name;

  return (
    <Card className="overflow-hidden border-2 border-dashed break-inside-avoid">
      <CardContent className="p-0">
        {/* Header */}
        <div className="bg-primary text-primary-foreground p-4">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm opacity-80">{tv?.mkanTransport ?? "Mkan Transport"}</div>
              <div className="text-xl font-bold">{tv?.busTicket ?? "Bus Ticket"}</div>
            </div>
            <div className="flex items-center gap-3">
              {pageLabel && (
                <span className="text-xs opacity-80">{pageLabel}</span>
              )}
              <Bus className="h-8 w-8" />
            </div>
          </div>
        </div>

        {/* Route Section */}
        <div className="p-4 bg-gradient-to-r from-primary/5 to-primary/10">
          <div className="flex items-center justify-between">
            <div className="text-center">
              <div className="text-2xl font-bold">{cityLabel(booking.trip.route.origin.city, lang)}</div>
              <div className="text-xs text-muted-foreground truncate max-w-[100px]">
                {lang === 'ar' && booking.trip.route.origin.nameAr
                  ? booking.trip.route.origin.nameAr
                  : booking.trip.route.origin.name}
              </div>
            </div>
            <div className="flex-1 px-4">
              <div className="relative">
                <div className="border-t-2 border-dashed border-primary/30" />
                <ArrowRight className="h-4 w-4 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-primary bg-white rtl:rotate-180" />
              </div>
              <div className="text-center text-xs text-muted-foreground mt-1">
                {/* route.duration is stored in MINUTES */}
                {formatNumber(Math.round(booking.trip.route.duration / 60), locale)} {tv?.hrs ?? "hrs"}
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{cityLabel(booking.trip.route.destination.city, lang)}</div>
              <div className="text-xs text-muted-foreground truncate max-w-[100px]">
                {lang === 'ar' && booking.trip.route.destination.nameAr
                  ? booking.trip.route.destination.nameAr
                  : booking.trip.route.destination.name}
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Details Grid */}
        <div className="p-4 grid grid-cols-2 gap-4">
          <div className="flex items-start gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div>
              <div className="text-xs text-muted-foreground">{tv?.dateLabel ?? "Date"}</div>
              <div className="font-medium text-sm">
                {format(new Date(booking.trip.departureDate), 'EEE, MMM d', { locale: dateLocale })}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div>
              <div className="text-xs text-muted-foreground">{tv?.timeLabel ?? "Time"}</div>
              <div className="font-medium text-sm">{booking.trip.departureTime}</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <User className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div>
              <div className="text-xs text-muted-foreground">{tv?.passengerLabel ?? "Passenger"}</div>
              <div className="font-medium text-sm truncate max-w-[120px]">
                {passengerName}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <QrCode className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div>
              <div className="text-xs text-muted-foreground">{tv?.seatLabel ?? "Seat(s)"}</div>
              <div className="font-medium text-sm">{seatsLabel}</div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Office Info */}
        <div className="p-4 bg-muted/30">
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="text-sm">
              <div className="font-medium">{officeName}</div>
              <div className="text-muted-foreground text-xs">
                {booking.trip.route.office.assemblyPoint?.address}
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* QR Code and Reference */}
        <div className="p-4 flex items-center gap-4">
          {qrCodeUrl && (
            <Image
              src={qrCodeUrl}
              alt={tv?.qrAlt ?? "Ticket QR Code"}
              width={96}
              height={96}
              unoptimized
              className="w-24 h-24"
            />
          )}
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">{tv?.bookingReference ?? "Booking Reference"}</div>
            <div className="text-xl font-mono font-bold" dir="ltr">{booking.bookingReference}</div>
            <div className="text-xs text-muted-foreground mt-2">
              {tv?.showQrCode ?? "Show this QR code at the office"}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-muted text-center text-xs text-muted-foreground">
          <div>{tv?.busLabel ?? "Bus"}: {booking.trip.bus.model || booking.trip.bus.plateNumber}</div>
          <div className="mt-1">{tv?.totalLabel ?? "Total"}: {formatCurrency(fare, locale)}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TicketContent({ booking, qrCodeUrl, passengerTickets, lang }: TicketContentProps) {
  const router = useRouter();
  const tv = useDictionary()?.travel?.ticketView;

  const handleDownload = () => {
    window.print();
  };

  if (!booking) {
    return (
      <div className="container mx-auto py-8 px-4 text-center">
        <h1 className="text-2xl font-bold">{tv?.ticketNotFound ?? "Ticket not found"}</h1>
        <Button onClick={() => router.push(`/${lang}/travel`)} className="mt-4">
          {tv?.backToTransport ?? "Back to Transport"}
        </Button>
      </div>
    );
  }

  const hasPerPassengerTickets = passengerTickets.length > 0;
  const ticketOfTpl = tv?.ticketOf ?? "Ticket {n} of {total}";

  return (
    <div className="container mx-auto py-8 px-4 max-w-md">
      {/* Download Button - Hidden when printing */}
      <div className="mb-4 print:hidden">
        <Button onClick={handleDownload} className="w-full">
          <Download className="h-4 w-4 me-2" />
          {tv?.downloadTicket ?? "Download Ticket"}
        </Button>
        {hasPerPassengerTickets && passengerTickets.length > 1 && (
          <p className="text-xs text-muted-foreground text-center mt-2">
            {tv?.groupTicketsHint ??
              "Each passenger has their own ticket and QR code — print or share all of them."}
          </p>
        )}
      </div>

      {/* One boarding card per passenger; legacy bookings get the single card */}
      <div className="space-y-6">
        {hasPerPassengerTickets ? (
          passengerTickets.map((pt, index) => (
            <TicketCard
              key={pt.seatNumber}
              booking={booking}
              lang={lang}
              passengerName={pt.name}
              seatsLabel={pt.seatNumber}
              fare={booking.trip.price}
              qrCodeUrl={pt.qrCodeUrl}
              pageLabel={ticketOfTpl
                .replace('{n}', String(index + 1))
                .replace('{total}', String(passengerTickets.length))}
            />
          ))
        ) : (
          <TicketCard
            booking={booking}
            lang={lang}
            passengerName={booking.passengerName}
            seatsLabel={booking.seats.map((s) => s.seatNumber).join(', ')}
            fare={booking.totalAmount}
            qrCodeUrl={qrCodeUrl}
          />
        )}
      </div>

      {/* Back Button - Hidden when printing */}
      <div className="mt-4 text-center print:hidden">
        <Button
          variant="link"
          onClick={() => router.push(`/${lang}/travel/booking/${booking.id}`)}
        >
          {tv?.backToBooking ?? "Back to Booking Details"}
        </Button>
      </div>

      {/* Print styles — i18n-exempt (CSS selectors, not user-facing copy) */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .container,
          .container * {
            visibility: visible;
          }
          .container {
            position: absolute;
            left: 0;
            top: 0;
          }
        }
      `}</style>
    </div>
  );
}
