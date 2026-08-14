'use client';

// Client content for the trip page (mirror pattern) — data arrives from the
// server page; this file owns only the interactive seat selection + booking.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

const MARKET_TZ = 'Africa/Khartoum';

import {
  createBooking,
  getTripSeats,
  type getTripDetails,
} from '@/lib/actions/travel-actions';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import { useLocale } from '@/components/internationalization/use-locale';
import { formatCurrency, formatNumber } from '@/lib/i18n/formatters';
import { busAmenityIcon, busAmenityLabel } from '@/components/travel/amenity-icons';
import { cityLabel } from '@/components/travel/city-names';
import { SeatPicker } from '@/components/travel/booking/seat-picker';

type TripDetails = NonNullable<Awaited<ReturnType<typeof getTripDetails>>>;

interface TripDetailsContentProps {
  trip: TripDetails | null;
  lang: string;
}

/** One booking covers at most this many riders — the picker and the page
 *  must agree, so the cap lives here and nowhere else. */
const MAX_SEATS_PER_BOOKING = 5;

/** How often we re-read the seat map while a rider is choosing. Long enough
 *  to stay cheap, short enough that a seat taken elsewhere greys out before
 *  they reach the payment step. */
const SEAT_POLL_MS = 20_000;

type PickerSeat = {
  id: number;
  seatNumber: string;
  row: number;
  column: number;
  seatType: string | null;
  status: 'Available' | 'Reserved' | 'Booked' | 'Blocked';
};

type RawSeat = {
  id: number;
  seatNumber: string;
  row: number;
  column: number;
  seatType?: string | null;
  status: string;
};

/** Adapt Prisma seat rows to the shared SeatPicker shape. */
function toPickerSeats(rows: readonly RawSeat[]): PickerSeat[] {
  return rows.map((s) => ({
    id: s.id,
    seatNumber: s.seatNumber,
    row: s.row,
    column: s.column,
    seatType: s.seatType ?? null,
    status:
      s.status === 'Available' ||
      s.status === 'Reserved' ||
      s.status === 'Booked' ||
      s.status === 'Blocked'
        ? s.status
        : 'Blocked',
  }));
}

/** True when two seat maps are identical for rendering purposes — lets a
 *  poll that found no change skip the re-render entirely. */
function sameSeatStates(a: readonly PickerSeat[] | null, b: readonly PickerSeat[]): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every((seat, i) => {
    const other = b[i];
    return other && seat.seatNumber === other.seatNumber && seat.status === other.status;
  });
}

export function TripDetailsContent({ trip, lang }: TripDetailsContentProps) {
  const router = useRouter();
  const dateLocale = lang === 'ar' ? ar : enUS;
  const { locale } = useLocale();

  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [passengerEmail, setPassengerEmail] = useState('');
  // Extra travellers keyed by seat — the lead passenger covers the first
  // selected seat, every other seat needs its own named passenger (T-MP.2).
  const [extraPassengers, setExtraPassengers] = useState<
    Record<string, { name: string; idCard: string }>
  >({});
  const [booking, setBooking] = useState(false);
  const dict = useDictionary();
  const t = dict.travel;
  const amenityLabels = t?.host?.amenityLabels as Partial<Record<string, string>> | undefined;

  // Seat map: the server render seeds it, the poll below keeps it honest.
  const tripId = trip?.id;
  const serverSeats = useMemo(() => toPickerSeats(trip?.seats ?? []), [trip?.seats]);
  const [liveSeats, setLiveSeats] = useState<PickerSeat[] | null>(null);
  const [isRefreshingSeats, setIsRefreshingSeats] = useState(false);
  const seatRows = liveSeats ?? serverSeats;
  // Once the booking lands our own seats flip to Reserved; without this the
  // next poll would tell the rider someone stole the seats they just bought.
  const bookingLandedRef = useRef(false);

  const dropSeats = useCallback((gone: readonly string[]) => {
    const goneSet = new Set(gone);
    setSelectedSeats((prev) => prev.filter((s) => !goneSet.has(s)));
    setExtraPassengers((prev) => {
      const next = { ...prev };
      for (const seat of gone) delete next[seat];
      return next;
    });
  }, []);

  const seatsTakenMessage = useCallback(
    (gone: readonly string[]) => {
      const template =
        gone.length === 1
          ? (t?.seatPicker?.justTaken ??
            'Seat {seats} was just taken by someone else — we removed it from your selection.')
          : (t?.seatPicker?.justTakenPlural ??
            'Seats {seats} were just taken by someone else — we removed them from your selection.');
      return template.replace('{seats}', gone.join(', '));
    },
    [t?.seatPicker?.justTaken, t?.seatPicker?.justTakenPlural],
  );

  // Live availability — a seat sold while the rider is still choosing greys
  // out in place instead of failing at the payment step.
  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;

    const refresh = async () => {
      if (document.visibilityState !== 'visible' || bookingLandedRef.current) return;
      setIsRefreshingSeats(true);
      try {
        const fresh = toPickerSeats(await getTripSeats(tripId));
        if (!cancelled) {
          setLiveSeats((prev) => (sameSeatStates(prev, fresh) ? prev : fresh));
        }
      } catch {
        // Transient — the next tick retries, and submit re-checks anyway.
      } finally {
        if (!cancelled) setIsRefreshingSeats(false);
      }
    };

    const interval = setInterval(refresh, SEAT_POLL_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [tripId]);

  // Reconcile the rider's picks against whatever the map now says.
  useEffect(() => {
    if (bookingLandedRef.current || selectedSeats.length === 0) return;
    const gone = selectedSeats.filter((seatNumber) => {
      const row = seatRows.find((r) => r.seatNumber === seatNumber);
      return row != null && row.status !== 'Available';
    });
    if (gone.length === 0) return;
    dropSeats(gone);
    toast.warning(seatsTakenMessage(gone));
  }, [seatRows, selectedSeats, dropSeats, seatsTakenMessage]);

  const extraSeats = selectedSeats.slice(1);
  const allPassengersNamed =
    Boolean(passengerName && passengerPhone) &&
    extraSeats.every((seat) => (extraPassengers[seat]?.name ?? '').trim().length >= 2);

  const setExtraPassenger = (seat: string, patch: Partial<{ name: string; idCard: string }>) => {
    setExtraPassengers((prev) => ({
      ...prev,
      [seat]: { name: '', idCard: '', ...prev[seat], ...patch },
    }));
  };

  const handleBooking = async () => {
    if (!trip || selectedSeats.length === 0 || !allPassengersNamed) {
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
        passengers: selectedSeats.map((seat, index) =>
          index === 0
            ? { name: passengerName, phone: passengerPhone, seatNumber: seat }
            : {
                name: extraPassengers[seat]?.name ?? '',
                idCard: extraPassengers[seat]?.idCard || undefined,
                seatNumber: seat,
              },
        ),
      });

      if (result.success) {
        bookingLandedRef.current = true;
        router.push(`/${lang}/travel/booking/checkout?bookingId=${result.booking.id}`);
        return;
      }

      // Throttled: too many booking attempts from this account. Nothing was
      // reserved, so the rider's selection stays exactly as it is — they just
      // have to wait out the window and press Reserve again.
      if (result.error === 'RATE_LIMITED') {
        toast.error(
          (t.booking?.rateLimited ?? 'Too many booking attempts. Try again in {seconds} seconds.')
            .replace('{seconds}', String(result.retryAfter)),
        );
        return;
      }

      // Someone else got there first. Strike exactly those seats and leave
      // the rest of the rider's selection — and their typed-in passengers —
      // intact so they only have to re-pick what they lost.
      dropSeats(result.unavailableSeats);
      setLiveSeats(toPickerSeats(await getTripSeats(trip.id)));
      toast.warning(seatsTakenMessage(result.unavailableSeats));
    } catch {
      toast.error(t.bookingFailedRetry ?? 'Failed to create booking. Please try again.');
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
  const departureZoned = toZonedTime(new Date(trip.departureDate), MARKET_TZ);
  const [h, m] = (trip.departureTime ?? '00:00').split(':').map(Number);
  departureZoned.setHours(h || 0, m || 0, 0, 0);
  const departureDateTime = fromZonedTime(departureZoned, MARKET_TZ);
  const hasDeparted = departureDateTime < now;
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
          <Button onClick={() => router.push(`/${lang}/travel`)}>
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

  // Prefer the polled count over the server render — the map next to it is
  // already live, and the two disagreeing is worse than either being stale.
  const seatsLeft = liveSeats
    ? liveSeats.filter((s) => s.status === 'Available').length
    : trip.availableSeats;

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
                  <span>{format(toZonedTime(new Date(trip.departureDate), MARKET_TZ), 'EEE, MMM d, yyyy', { locale: dateLocale })}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>{t.trip.departs}: {trip.departureTime}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>{formatNumber(seatsLeft, locale)} {t.trip.seatsAvailable}</span>
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

          {/* Seat Picker — the shared component owns its header (title + live count),
              legend, driver marker and selected-seat chips */}
          <Card>
            <CardContent className="pt-6">
              <SeatPicker
                seats={seatRows}
                selectedSeats={selectedSeats}
                onSeatSelect={(seatNumber) =>
                  setSelectedSeats((prev) =>
                    prev.length >= MAX_SEATS_PER_BOOKING ? prev : [...prev, seatNumber],
                  )
                }
                onSeatDeselect={(seatNumber) => dropSeats([seatNumber])}
                onMaxReached={() =>
                  toast.info(
                    t?.seatPicker?.capHit ??
                      "That's the most seats you can book in one booking.",
                  )
                }
                maxSeats={MAX_SEATS_PER_BOOKING}
                isRefreshing={isRefreshingSeats}
              />
            </CardContent>
          </Card>

          {/* Passenger Info — one identity per seat */}
          {selectedSeats.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t.booking.passengerDetails}</CardTitle>
                <CardDescription>{t.booking.enterDetails}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedSeats.length > 1 && (
                  <div className="text-sm font-medium text-muted-foreground">
                    {(t.booking.leadPassengerSeat ?? "Lead passenger — seat {seat}").replace(
                      '{seat}',
                      selectedSeats[0] ?? '',
                    )}
                  </div>
                )}
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

                {extraSeats.map((seat) => (
                  <div key={seat} className="pt-4 border-t space-y-4">
                    <div className="text-sm font-medium text-muted-foreground">
                      {(t.booking.passengerForSeat ?? "Passenger — seat {seat}").replace('{seat}', seat)}
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`pax-name-${seat}`}>{t.booking.fullName} *</Label>
                        <Input
                          id={`pax-name-${seat}`}
                          value={extraPassengers[seat]?.name ?? ''}
                          onChange={(e) => setExtraPassenger(seat, { name: e.target.value })}
                          placeholder={t.booking.fullNamePlaceholder}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`pax-id-${seat}`}>
                          {t.booking.idCardOptional ?? "ID number (optional)"}
                        </Label>
                        <Input
                          id={`pax-id-${seat}`}
                          value={extraPassengers[seat]?.idCard ?? ''}
                          onChange={(e) => setExtraPassenger(seat, { idCard: e.target.value })}
                          placeholder={t.booking.idCardPlaceholder ?? "e.g., 123-456-789"}
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {selectedSeats.length > 1 && !allPassengersNamed && (
                  <p className="text-sm text-muted-foreground">
                    {t.booking.namePerSeatHint ??
                      "Enter a name for every seat — each passenger gets their own ticket."}
                  </p>
                )}
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
                  <span>{format(toZonedTime(new Date(trip.departureDate), MARKET_TZ), 'MMM d, yyyy', { locale: dateLocale })}</span>
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
                    disabled={booking || !allPassengersNamed}
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
