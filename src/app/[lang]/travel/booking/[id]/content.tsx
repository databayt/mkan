'use client';

// Client content for the booking confirmation (mirror pattern) — data arrives
// from the server page; this file owns only the share action.

import React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  MapPin,
  Clock,
  Calendar,
  CheckCircle,
  Download,
  Share2,
  ArrowRight,
  Phone,
  User,
  Ticket,
} from 'lucide-react';
import { format } from 'date-fns';
import { ar, enUS } from 'date-fns/locale';
import { toast } from 'sonner';

import type { getBooking } from '@/lib/actions/transport-actions';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import { useLocale } from '@/components/internationalization/use-locale';
import { formatCurrency } from '@/lib/i18n/formatters';
import { cityLabel } from '@/components/transport/city-names';

type BookingDetails = NonNullable<Awaited<ReturnType<typeof getBooking>>>;

interface BookingConfirmationContentProps {
  booking: BookingDetails | null;
  lang: string;
}

export function BookingConfirmationContent({ booking, lang }: BookingConfirmationContentProps) {
  const router = useRouter();
  const dict = useDictionary();
  const t = dict.transport;
  const { locale } = useLocale();
  // Locale for date-fns — gives Arabic users "الثلاثاء، ١٥ أبريل" instead of
  // "Tue, Apr 15". All `format()` calls in this file must pass this.
  const dateLocale = lang === 'ar' ? ar : enUS;

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const handleShare = async () => {
    if (!booking) return;
    const url = window.location.href;
    const title = `${booking.trip.route.origin.city} → ${booking.trip.route.destination.city}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success(t.booking.linkCopied);
      }
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  };

  if (!booking) {
    return (
      <div className="container mx-auto py-8 px-4 text-center">
        <h1 className="text-2xl font-bold">{t.booking.notFound}</h1>
        <Button onClick={() => router.push(`/${lang}/transport`)} className="mt-4">
          {t.booking.backToTransport}
        </Button>
      </div>
    );
  }

  const isConfirmed = booking.status === 'Confirmed';
  const statusLabels = t.status as Partial<Record<string, string>>;
  const statusLabel = statusLabels?.[booking.status] ?? booking.status;

  return (
    <div className="container mx-auto py-8 px-4 max-w-2xl">
      {/* Success Header */}
      <div className="text-center mb-8">
        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${
          isConfirmed ? 'bg-green-100' : 'bg-yellow-100'
        }`}>
          <CheckCircle className={`h-8 w-8 ${
            isConfirmed ? 'text-green-600' : 'text-yellow-600'
          }`} />
        </div>
        <h1 className="text-2xl font-bold mb-2">
          {isConfirmed ? t.booking.confirmed : t.booking.received}
        </h1>
        <p className="text-muted-foreground">
          {isConfirmed
            ? t.booking.confirmedMessage
            : t.booking.receivedMessage}
        </p>
      </div>

      {/* Booking Reference */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">{t.booking.reference}</div>
              <div className="text-2xl font-mono font-bold" dir="ltr">{booking.bookingReference}</div>
            </div>
            <Badge className={getStatusColor(booking.status)}>{statusLabel}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Trip Details */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            {t.booking.tripDetails}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Route */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="font-medium">{cityLabel(booking.trip.route.origin.city, lang)}</div>
              <div className="text-sm text-muted-foreground">
                {lang === 'ar' && booking.trip.route.origin.nameAr
                  ? booking.trip.route.origin.nameAr
                  : booking.trip.route.origin.name}
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0 rtl:rotate-180" />
            <div className="flex-1 text-end">
              <div className="font-medium">{cityLabel(booking.trip.route.destination.city, lang)}</div>
              <div className="text-sm text-muted-foreground">
                {lang === 'ar' && booking.trip.route.destination.nameAr
                  ? booking.trip.route.destination.nameAr
                  : booking.trip.route.destination.name}
              </div>
            </div>
          </div>

          <Separator />

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-sm text-muted-foreground">{t.booking.date}</div>
                <div className="font-medium">
                  {format(new Date(booking.trip.departureDate), 'EEE, MMM d, yyyy', { locale: dateLocale })}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-sm text-muted-foreground">{t.trip.departs}</div>
                <div className="font-medium">{booking.trip.departureTime}</div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Seats and Bus */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">{t.booking.selectedSeats}</div>
              <div className="font-medium">
                {booking.seats.map((s) => s.seatNumber).join(', ')}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">{t.trip.bus}</div>
              <div className="font-medium">
                {booking.trip.bus.model || booking.trip.bus.plateNumber}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Passenger Info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {t.booking.passengerInfo}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t.booking.name}</span>
            <span className="font-medium">{booking.passengerName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t.booking.phone}</span>
            <span className="font-medium" dir="ltr">{booking.passengerPhone}</span>
          </div>
          {booking.passengerEmail && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t.booking.email}</span>
              <span className="font-medium">{booking.passengerEmail}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Office Info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            {t.booking.boardingLocation}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="font-medium">
            {lang === 'ar' && booking.trip.route.office.nameAr
              ? booking.trip.route.office.nameAr
              : booking.trip.route.office.name}
          </div>
          <div className="text-sm text-muted-foreground">
            {booking.trip.route.office.assemblyPoint?.name}
          </div>
          <div className="text-sm text-muted-foreground">
            {booking.trip.route.office.assemblyPoint?.address}
          </div>
          {booking.trip.route.office.phone && (
            <a
              href={`tel:${booking.trip.route.office.phone}`}
              className="flex items-center gap-2 text-sm text-primary hover:underline w-fit"
              dir="ltr"
            >
              <Phone className="h-4 w-4" />
              {booking.trip.route.office.phone}
            </a>
          )}
        </CardContent>
      </Card>

      {/* Payment Summary */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t.booking.paymentSummary}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center">
            <span>{t.booking.totalPaid}</span>
            <span className="text-xl font-bold">{formatCurrency(booking.totalAmount, locale)}</span>
          </div>
          {booking.payments.length > 0 && booking.payments[0] && (
            <div className="mt-2 text-sm text-muted-foreground">
              {t.booking.paidVia}{' '}
              {(() => {
                const method = booking.payments[0].method;
                const key = (
                  {
                    MobileMoney: 'mobileMoney',
                    CreditCard: 'creditCard',
                    DebitCard: 'creditCard',
                    BankTransfer: 'bankTransfer',
                    CashOnArrival: 'cashOnArrival',
                  } as const
                )[method as string];
                const methods = t.paymentMethods as Partial<
                  Record<string, { name?: string }>
                >;
                return (key && methods?.[key]?.name) ||
                  method.replace(/([A-Z])/g, ' $1').trim();
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button asChild className="flex-1">
          <Link href={`/${lang}/transport/booking/${booking.id}/ticket`}>
            <Download className="h-4 w-4 me-2" />
            {t.booking.viewTicket}
          </Link>
        </Button>
        <Button variant="outline" className="flex-1" onClick={handleShare}>
          <Share2 className="h-4 w-4 me-2" />
          {t.booking.share}
        </Button>
      </div>

      <div className="mt-6 text-center">
        <Link
          href={`/${lang}/tenants/trips`}
          className="text-sm text-primary hover:underline"
        >
          {t.booking.viewAllTrips}
        </Link>
      </div>
    </div>
  );
}
