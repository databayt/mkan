'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  Wifi,
  Wind,
  Plug,
  Armchair,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { format } from 'date-fns';
import { dateLocaleFor } from '@/lib/i18n/date-locale';
import type { Locale } from '@/components/internationalization/config';
import { toast } from 'sonner';
import { getTripDetails, createBooking } from '@/lib/actions/transport-actions';
import { getTransportDictionary } from '@/components/transport/transport-dictionary';
import { cn } from '@/lib/utils';

interface Seat {
  id: number;
  seatNumber: string;
  row: number;
  column: number;
  status: string;
}

type TripDetails = NonNullable<Awaited<ReturnType<typeof getTripDetails>>>;

const amenityIcons: Record<string, React.ElementType> = {
  WiFi: Wifi,
  AirConditioning: Wind,
  USB: Plug,
  LegRoom: Armchair,
};

export default function TripDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const lang = params.lang as Locale;
  const dateLocale = dateLocaleFor(lang);
  const tripId = Number(params.id);

  const [trip, setTrip] = useState<TripDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [passengerEmail, setPassengerEmail] = useState('');
  const [booking, setBooking] = useState(false);
  const t = getTransportDictionary(lang);

  useEffect(() => {
    const fetchTrip = async () => {
      try {
        const data = await getTripDetails(tripId);
        setTrip(data);
      } catch (error) {
        console.error('Failed to fetch trip:', error);
      } finally {
        setLoading(false);
      }
    };

    if (tripId) {
      fetchTrip();
    }
  }, [tripId]);

  const handleSeatClick = (seatNumber: string, status: string) => {
    if (status !== 'Available') return;

    setSelectedSeats((prev) => {
      if (prev.includes(seatNumber)) {
        return prev.filter((s) => s !== seatNumber);
      }
      if (prev.length >= 5) {
        return prev;
      }
      return [...prev, seatNumber];
    });
  };

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
        toast.error('Failed to create booking. Please try again.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Booking failed';
      toast.error(message);
    } finally {
      setBooking(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-muted rounded" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  // Extra translations not yet in the schema-driven dictionary type — cast
  // through a permissive lookup so missing keys don't block compilation.
  const td = t as unknown as Record<string, Record<string, string>>;
  const tTrip = td.trip ?? {};
  const tCommon = td.common ?? {};

  if (!trip) {
    return (
      <div className="container mx-auto py-8 px-4 text-center">
        <h1 className="text-2xl font-bold">{tTrip.notFound ?? 'Trip not found'}</h1>
        <Button onClick={() => router.back()} className="mt-4">
          {tCommon.back ?? 'Go Back'}
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
      ? (tTrip.cancelled ?? 'This trip was cancelled')
      : hasDeparted
        ? (tTrip.departed ?? 'This trip has already departed')
        : (tTrip.soldOut ?? 'This trip is fully booked');
    const hint = isCancelled
      ? (tTrip.cancelledHint ?? 'The operator cancelled this trip. Search for an alternative below.')
      : hasDeparted
        ? (tTrip.departedHint ?? 'Search for an upcoming departure on the same route.')
        : (tTrip.soldOutHint ?? 'All seats are taken. Try another trip on this route.');
    return (
      <div className="container mx-auto py-12 px-4 max-w-xl text-center space-y-4">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground">{hint}</p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => router.back()}>
            {tCommon.back ?? 'Back'}
          </Button>
          <Button onClick={() => router.push(`/${lang}/transport`)}>
            {tTrip.findAnother ?? 'Find another trip'}
          </Button>
        </div>
      </div>
    );
  }

  const totalAmount = trip.price * selectedSeats.length;

  // Organize seats into rows for the bus layout
  const maxRow = Math.max(...trip.seats.map((s) => s.row));
  const maxCol = Math.max(...trip.seats.map((s) => s.column));

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
                    {trip.route.origin.city}
                    <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                    {trip.route.destination.city}
                  </CardTitle>
                  <CardDescription>
                    {trip.route.office.name}
                  </CardDescription>
                </div>
                <div className="text-end">
                  <div className="text-2xl font-bold text-primary">
                    SDG {trip.price.toLocaleString()}
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
                  <span>Departs: {trip.departureTime}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>{trip.availableSeats} {t.trip.seatsAvailable}</span>
                </div>
              </div>

              <Separator className="my-4" />

              {/* Bus Amenities */}
              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Bus className="h-4 w-4" />
                  Bus: {trip.bus.model || trip.bus.plateNumber}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {trip.bus.amenities.map((amenity) => {
                    const Icon = amenityIcons[amenity] || CheckCircle2;
                    return (
                      <Badge key={amenity} variant="secondary" className="gap-1">
                        <Icon className="h-3 w-3" />
                        {amenity.replace(/([A-Z])/g, ' $1').trim()}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Seat Picker */}
          <Card>
            <CardHeader>
              <CardTitle>{t.booking.selectSeats}</CardTitle>
              <CardDescription>
                {t.booking.clickToSelect} {selectedSeats.length}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Seat Legend */}
              <div className="flex gap-4 mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-green-100 border-2 border-green-500" />
                  <span className="text-sm">{t.seat.available}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-blue-500 border-2 border-blue-600" />
                  <span className="text-sm">{t.seat.selected}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-muted border-2 border-muted-foreground/40" />
                  <span className="text-sm">{t.seat.booked}</span>
                </div>
              </div>

              {/* Bus Layout */}
              <div className="bg-muted/50 rounded-lg p-4 overflow-x-auto">
                <div className="min-w-[200px] mx-auto" style={{ maxWidth: `${(maxCol + 1) * 50}px` }}>
                  {/* Driver */}
                  <div className="text-center mb-4 text-sm text-muted-foreground">
                    Front (Driver)
                  </div>

                  {/* Seats Grid */}
                  <div className="space-y-2">
                    {Array.from({ length: maxRow }, (_, rowIndex) => {
                      const row = rowIndex + 1;
                      const rowSeats = trip.seats.filter((s) => s.row === row);

                      return (
                        <div key={row} className="flex justify-center gap-2">
                          {Array.from({ length: maxCol }, (_, colIndex) => {
                            const col = colIndex + 1;
                            const seat = rowSeats.find((s) => s.column === col);

                            if (!seat) {
                              // Aisle
                              return <div key={`${row}-${col}`} className="w-10 h-10" />;
                            }

                            const isSelected = selectedSeats.includes(seat.seatNumber);
                            const isAvailable = seat.status === 'Available';

                            return (
                              <button
                                key={seat.id}
                                onClick={() => handleSeatClick(seat.seatNumber, seat.status)}
                                disabled={!isAvailable}
                                className={cn(
                                  'w-10 h-10 rounded-lg border-2 flex items-center justify-center text-xs font-medium transition-all',
                                  isSelected
                                    ? 'bg-blue-500 border-blue-600 text-white'
                                    : isAvailable
                                    ? 'bg-green-100 border-green-500 hover:bg-green-200 cursor-pointer'
                                    : 'bg-muted border-muted-foreground/40 cursor-not-allowed'
                                )}
                              >
                                {seat.seatNumber}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>

                  <div className="text-center mt-4 text-sm text-muted-foreground">
                    Back
                  </div>
                </div>
              </div>
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
                  <span className="font-medium">
                    {trip.route.origin.city} → {trip.route.destination.city}
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
                      <span>SDG {trip.price.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>{t.booking.numberOfSeats}</span>
                      <span>× {selectedSeats.length}</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex justify-between font-bold text-lg">
                    <span>{t.booking.total}</span>
                    <span>SDG {totalAmount.toLocaleString()}</span>
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
