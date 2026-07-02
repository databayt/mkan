'use client';

// Client content for the trip page (mirror pattern) — data arrives from the
// server page; this file owns only the interactive seat selection + booking.

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  MapPin,
  Clock,
  Calendar,
  Bus,
  Users,
  ArrowRight,
  Phone,
} from 'lucide-react';
import { format } from 'date-fns';
import { ar, enUS } from 'date-fns/locale';
import { toast } from 'sonner';

import { createBooking, type getTripDetails } from '@/lib/actions/transport-actions';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import { useLocale } from '@/components/internationalization/use-locale';
import { formatCurrency, formatNumber } from '@/lib/i18n/formatters';
import { busAmenityIcon, busAmenityLabel } from '@/components/transport/amenity-icons';
import { cityLabel } from '@/components/transport/city-names';
import { SeatPicker } from '@/components/transport/booking/seat-picker';

type TripDetails = NonNullable<Awaited<ReturnType<typeof getTripDetails>>>;

interface TripDetailsContentProps {
  trip: TripDetails | null;
  lang: string;
}

export function TripDetailsContent({ trip, lang }: TripDetailsContentProps) {
  const router = useRouter();
  const dateLocale = lang === 'ar' ? ar : enUS;
  const { locale } = useLocale();

  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [passengerEmail, setPassengerEmail] = useState('');
  const [booking, setBooking] = useState(false);
  const dict = useDictionary();
  const t = dict.transport;
  const amenityLabels = t?.host?.amenityLabels as Partial<Record<string, string>> | undefined;

  const handleBooking = async () => {
    if (!trip || selectedSeats.length === 0 || !passengerName || !passengerPhone) {
      return;
    }

    setBooking(true);
    try {
      const result = await createBooking({
        tripId: trip.id,
        seatNumbers: selectedSeats,
        passengerName,
        passengerPhone,
        passengerEmail: passengerEmail || undefined,
      });

      if (result.success && result.booking) {
        router.push(`/${lang}/transport/booking/checkout?bookingId=${result.booking.id}`);
      } else {
        toast.error(t.bookingFailedRetry ?? 'Failed to create booking. Please try again.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Booking failed';
      toast.error(message);
    } finally {
      setBooking(false);
    }
  };

  if (!trip) {
    return (
      <div className="container mx-auto py-8 px-4 text-center">
        <h1 className="text-2xl font-bold">{t.trip.notFound}</h1>
        <Button onClick={() => router.back()} className="mt-4">
          {dict.common?.back ?? 'Go Back'}
        </Button>
      </div>
    );
  }

  // Unavailable-state guards run before the seat picker renders so a
  // cancelled / departed / fully-booked trip never lands a user in the
  // booking form with no way forward.
  const now = new Date();
  const hasDeparted = new Date(trip.departureDate) < now;
  const isCancelled = Boolean((trip as { isCancelled?: boolean }).isCancelled);
  const isSoldOut = (trip.availableSeats ?? 0) <= 0 && !isCancelled && !hasDeparted;

  if (isCancelled || hasDeparted || isSoldOut) {
    const title = isCancelled
      ? t.trip.cancelled
      : hasDeparted
        ? t.trip.departed
        : t.trip.soldOut;
    const hint = isCancelled
      ? t.trip.cancelledHint
      : hasDeparted
        ? t.trip.departedHint
        : t.trip.soldOutHint;
    return (
      <div className="container mx-auto py-12 px-4 max-w-xl text-center space-y-4">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground">{hint}</p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => router.back()}>
            {dict.common?.back ?? 'Back'}
          </Button>
          <Button onClick={() => router.push(`/${lang}/transport`)}>
            {t.trip.findAnother}
          </Button>
        </div>
      </div>
    );
  }

  const totalAmount = trip.price * selectedSeats.length;
  const originCity = cityLabel(trip.route.origin.city, lang);
  const destinationCity = cityLabel(trip.route.destination.city, lang);
  const officeName =
    lang === 'ar' && trip.route.office.nameAr
      ? trip.route.office.nameAr
      : trip.route.office.name;

  // Adapt Prisma seat rows to the shared SeatPicker shape.
  const pickerSeats = trip.seats.map((s) => ({
    id: s.id,
    seatNumber: s.seatNumber,
    row: s.row,
    column: s.column,
    seatType: (s as { seatType?: string | null }).seatType ?? null,
    status: (s.status === 'Available' ||
    s.status === 'Reserved' ||
    s.status === 'Booked' ||
    s.status === 'Blocked'
      ? s.status
      : 'Blocked') as 'Available' | 'Reserved' | 'Booked' | 'Blocked',
  }));

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Trip Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Route Info */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <MapPin className="h-5 w-5 text-primary" />
                    {originCity}
                    <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                    {destinationCity}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-3 flex-wrap">
                    <span>{officeName}</span>
                    {trip.route.office.phone && (
                      <a
                        href={`tel:${trip.route.office.phone}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        {t.office.callOffice}
                      </a>
                    )}
                  </CardDescription>
                </div>
                <div className="text-end">
                  <div className="text-2xl font-bold text-primary">
                    {formatCurrency(trip.price, locale)}
                  </div>
                  <div className="text-sm text-muted-foreground">{t.trip.perSeat}</div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{format(new Date(trip.departureDate), 'EEE, MMM d, yyyy', { locale: dateLocale })}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>{t.trip.departs}: {trip.departureTime}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>{formatNumber(trip.availableSeats, locale)} {t.trip.seatsAvailable}</span>
                </div>
              </div>

              <Separator className="my-4" />

              {/* Bus Amenities */}
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Bus className="h-4 w-4" />
                  {t.trip.bus}: {trip.bus.model || trip.bus.plateNumber}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {trip.bus.amenities.map((amenity) => {
                    const Icon = busAmenityIcon(amenity);
                    return (
                      <Badge key={amenity} variant="secondary" className="gap-1">
                        <Icon className="h-3 w-3" />
                        {busAmenityLabel(amenityLabels, amenity)}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Seat Picker — the shared component (legend + driver + selected chips) */}
          <Card>
            <CardHeader>
              <CardTitle>{t.booking.selectSeats}</CardTitle>
              <CardDescription>{t.booking.clickToSelect}</CardDescription>
            </CardHeader>
            <CardContent>
              <SeatPicker
                seats={pickerSeats}
                selectedSeats={selectedSeats}
                onSeatSelect={(seatNumber) =>
                  setSelectedSeats((prev) =>
                    prev.length >= 5 ? prev : [...prev, seatNumber],
                  )
                }
                onSeatDeselect={(seatNumber) =>
                  setSelectedSeats((prev) => prev.filter((s) => s !== seatNumber))
                }
                maxSeats={5}
              />
            </CardContent>
          </Card>

          {/* Passenger Info */}
          {selectedSeats.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t.booking.passengerDetails}</CardTitle>
                <CardDescription>{t.booking.enterDetails}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t.booking.fullName} *</Label>
                    <Input
                      id="name"
                      value={passengerName}
                      onChange={(e) => setPassengerName(e.target.value)}
                      placeholder={t.booking.fullNamePlaceholder}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">{t.booking.phone} *</Label>
                    <Input
                      id="phone"
                      value={passengerPhone}
                      onChange={(e) => setPassengerPhone(e.target.value)}
                      placeholder={t.booking.phonePlaceholder}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t.booking.email}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={passengerEmail}
                    onChange={(e) => setPassengerEmail(e.target.value)}
                    placeholder={t.booking.emailPlaceholder}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Booking Summary Sidebar */}
        <div className="lg:col-span-1">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle>{t.booking.summary}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{t.booking.route}</span>
                  <span className="font-medium inline-flex items-center gap-1">
                    <span>{originCity}</span>
                    <ArrowRight className="h-3 w-3 rtl:rotate-180" />
                    <span>{destinationCity}</span>
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>{t.booking.date}</span>
                  <span>{format(new Date(trip.departureDate), 'MMM d, yyyy', { locale: dateLocale })}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>{t.booking.time}</span>
                  <span>{trip.departureTime}</span>
                </div>
              </div>

              <Separator />

              {selectedSeats.length > 0 ? (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>{t.booking.selectedSeats}</span>
                      <span className="font-medium">{selectedSeats.join(', ')}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>{t.booking.pricePerSeat}</span>
                      <span>{formatCurrency(trip.price, locale)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>{t.booking.numberOfSeats}</span>
                      <span>× {formatNumber(selectedSeats.length, locale)}</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex justify-between font-bold text-lg">
                    <span>{t.booking.total}</span>
                    <span>{formatCurrency(totalAmount, locale)}</span>
                  </div>

                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleBooking}
                    disabled={booking || !passengerName || !passengerPhone}
                  >
                    {booking ? t.booking.processing : t.booking.continueToPayment}
                  </Button>
                </>
              ) : (
                <div className="text-center text-muted-foreground py-4">
                  {t.booking.selectSeatsToContinue}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
