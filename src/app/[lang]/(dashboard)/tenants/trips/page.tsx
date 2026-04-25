'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Home, Bus, Calendar, MapPin, Clock, Download, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { ar, enUS } from 'date-fns/locale';
import Link from 'next/link';
import { getMyBookings } from '@/lib/actions/transport-actions';
import { getGuestBookings, cancelBooking } from '@/lib/actions/booking-actions';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import { useLocale } from '@/components/internationalization/use-locale';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { useTransition } from 'react';

interface TransportBooking {
  id: number;
  bookingReference: string;
  passengerName: string;
  passengerPhone: string;
  totalAmount: number;
  status: string;
  bookedAt: Date;
  confirmedAt?: Date | null;
  trip: {
    id: number;
    departureDate: Date;
    departureTime: string;
    arrivalTime?: string | null;
    route: {
      origin: { name: string; city: string };
      destination: { name: string; city: string };
    };
    bus: {
      plateNumber: string;
      capacity?: number;
    };
  };
  office: {
    name: string;
    phone?: string;
  };
  _count: { seats: number };
}

interface HomeBooking {
  id: number;
  checkIn: Date;
  checkOut: Date;
  guestCount: number;
  totalPrice: number;
  status: string;
  listing: {
    id: number;
    title: string | null;
    photoUrls: string[];
    location: { city: string; country: string } | null;
  };
}

const TripsPage = () => {
  const dict = useDictionary();
  const { locale } = useLocale();
  const params = useParams();
  const lang = (params?.lang as string) ?? 'en';
  const dateLocale = locale === 'ar' ? ar : enUS;
  const [transportBookings, setTransportBookings] = useState<TransportBooking[]>([]);
  const [homeBookings, setHomeBookings] = useState<HomeBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const [transportResult, homeResult] = await Promise.all([
          getMyBookings().catch(() => null),
          getGuestBookings().catch(() => null),
        ]);
        setTransportBookings((transportResult?.bookings || []) as unknown as TransportBooking[]);
        setHomeBookings(((homeResult as { bookings?: HomeBooking[] } | null)?.bookings || []) as HomeBooking[]);
      } catch (error) {
        console.error('Failed to fetch bookings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBookings();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const upcomingTransport = transportBookings.filter(
    (b) => new Date(b.trip.departureDate) >= new Date() && b.status !== 'Cancelled'
  );
  const pastTransport = transportBookings.filter(
    (b) => new Date(b.trip.departureDate) < new Date() || b.status === 'Cancelled'
  );
  const upcomingStays = homeBookings.filter(
    (b) => new Date(b.checkOut) >= new Date() && b.status !== 'Cancelled'
  );
  const pastStays = homeBookings.filter(
    (b) => new Date(b.checkOut) < new Date() || b.status === 'Cancelled'
  );

  const handleCancelStay = async (id: number) => {
    if (!window.confirm(dict.booking?.cancelConfirm ?? 'Cancel this booking?')) return;
    try {
      await cancelBooking(id);
      setHomeBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: 'Cancelled' } : b))
      );
      toast.success('Booking cancelled');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not cancel');
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{dict.dashboard?.tenantTrips?.title ?? "My Trips"}</h1>
        <p className="text-gray-500">{dict.dashboard?.tenantTrips?.subtitle ?? "View and manage all your bookings"}</p>
      </div>

      <Tabs defaultValue="transport" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="stays" className="flex items-center gap-2">
            <Home className="h-4 w-4" />
            {dict.dashboard?.tenantTrips?.stays ?? "Stays"}
          </TabsTrigger>
          <TabsTrigger value="transport" className="flex items-center gap-2">
            <Bus className="h-4 w-4" />
            {dict.dashboard?.tenantTrips?.transport ?? "Transport"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stays" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming stays</CardTitle>
              <CardDescription>
                {dict.dashboard?.tenantTrips?.rentalStaysSubtitle ?? "Your property rental bookings"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {upcomingStays.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Home className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{dict.dashboard?.tenantTrips?.noRentalStays ?? "No upcoming stays"}</p>
                  <p className="text-sm">
                    {dict.dashboard?.tenantTrips?.browseProperties ?? "Browse properties to book your first stay"}
                  </p>
                  <Button asChild className="mt-4">
                    <Link href={`/${lang}/listings`}>
                      {dict.dashboard?.tenantTrips?.browsePropertiesBtn ?? "Browse Properties"}
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {upcomingStays.map((stay) => (
                    <HomeBookingCard
                      key={stay.id}
                      booking={stay}
                      lang={lang}
                      dict={dict}
                      getStatusColor={getStatusColor}
                      onCancel={() => handleCancelStay(stay.id)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {pastStays.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Past stays</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {pastStays.map((stay) => (
                    <HomeBookingCard
                      key={stay.id}
                      booking={stay}
                      lang={lang}
                      dict={dict}
                      getStatusColor={getStatusColor}
                      isPast
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="transport" className="mt-6 space-y-6">
          {/* Upcoming Transport */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                {dict.dashboard?.tenantTrips?.upcomingTrips ?? "Upcoming Trips"}
              </CardTitle>
              <CardDescription>{dict.dashboard?.tenantTrips?.upcomingTripsSubtitle ?? "Your upcoming bus tickets"}</CardDescription>
            </CardHeader>
            <CardContent>
              {upcomingTransport.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Bus className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{dict.dashboard?.tenantTrips?.noUpcomingTrips ?? "No upcoming trips"}</p>
                  <Button asChild className="mt-4">
                    <Link href="/transport">{dict.dashboard?.tenantTrips?.bookATrip ?? "Book a Trip"}</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {upcomingTransport.map((booking) => (
                    <TransportBookingCard key={booking.id} booking={booking} getStatusColor={getStatusColor} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Past Transport */}
          {pastTransport.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  {dict.dashboard?.tenantTrips?.pastTrips ?? "Past Trips"}
                </CardTitle>
                <CardDescription>{dict.dashboard?.tenantTrips?.pastTripsSubtitle ?? "Your completed or cancelled trips"}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {pastTransport.map((booking) => (
                    <TransportBookingCard key={booking.id} booking={booking} getStatusColor={getStatusColor} isPast />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

interface HomeBookingCardProps {
  booking: HomeBooking;
  lang: string;
  dict: ReturnType<typeof useDictionary>;
  getStatusColor: (status: string) => string;
  isPast?: boolean;
  onCancel?: () => void;
}

const HomeBookingCard = ({ booking, lang, dict, getStatusColor, isPast, onCancel }: HomeBookingCardProps) => {
  const [isPending, startTransition] = useTransition();
  const cover = booking.listing.photoUrls?.[0];
  const loc = booking.listing.location;

  return (
    <div className={`border rounded-lg p-4 ${isPast ? 'opacity-75' : ''}`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge className={getStatusColor(booking.status)}>{booking.status}</Badge>
          </div>
          <div className="text-lg font-medium">{booking.listing.title ?? "Untitled stay"}</div>
          {loc && (
            <div className="flex items-center gap-1 text-sm text-gray-600">
              <MapPin className="h-4 w-4" />
              {loc.city}, {loc.country}
            </div>
          )}
          <div className="flex flex-wrap gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {new Date(booking.checkIn).toLocaleDateString()} →{" "}
              {new Date(booking.checkOut).toLocaleDateString()}
            </div>
            <div>{booking.guestCount} {dict.booking?.guestsPlural ?? "guests"}</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-xl font-bold">
            {(dict.common as Record<string, string> | undefined)?.currency ?? "$"}
            {booking.totalPrice.toLocaleString()}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/${lang}/bookings/${booking.id}`}>
                <Eye className="h-4 w-4 me-1" />
                {dict.dashboard?.common?.view ?? "View"}
              </Link>
            </Button>
            {cover && <span className="hidden" aria-hidden>{cover}</span>}
            {!isPast && booking.status !== 'Cancelled' && onCancel && (
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => startTransition(onCancel)}
              >
                {dict.booking?.cancel ?? "Cancel"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface TransportBookingCardProps {
  booking: TransportBooking;
  getStatusColor: (status: string) => string;
  isPast?: boolean;
}

const TransportBookingCard = ({ booking, getStatusColor, isPast }: TransportBookingCardProps) => {
  const dict = useDictionary();
  const { locale } = useLocale();
  const dateLocale = locale === 'ar' ? ar : enUS;
  return (
    <div className={`border rounded-lg p-4 ${isPast ? 'opacity-75' : ''}`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge className={getStatusColor(booking.status)}>{booking.status}</Badge>
            <span className="text-sm text-gray-500">{dict.dashboard?.tenantTrips?.ref ?? "Ref"}: {booking.bookingReference}</span>
          </div>

          <div className="flex items-center gap-2 text-lg font-medium">
            <MapPin className="h-4 w-4 text-gray-400" />
            <span>{booking.trip.route.origin.city}</span>
            <span className="text-gray-400">→</span>
            <span>{booking.trip.route.destination.city}</span>
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {format(new Date(booking.trip.departureDate), 'EEE, MMM d, yyyy', { locale: dateLocale })}
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {booking.trip.departureTime}
            </div>
            <div>
              {dict.dashboard?.common?.seats ?? "Seats"}: {booking._count.seats}
            </div>
          </div>

          <div className="text-sm text-gray-500">
            {booking.office.name} • {booking.trip.bus.plateNumber}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="text-xl font-bold">{`${booking.totalAmount.toLocaleString()} ${dict.dashboard?.tenantTrips?.currencySDG ?? "SDG"}`}</div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/transport/booking/${booking.id}`}>
                <Eye className="h-4 w-4 me-1" />
                {dict.dashboard?.common?.view ?? "View"}
              </Link>
            </Button>
            {!isPast && booking.status === 'Confirmed' && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/transport/booking/${booking.id}/ticket`}>
                  <Download className="h-4 w-4 me-1" />
                  {dict.dashboard?.tenantTrips?.ticket ?? "Ticket"}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TripsPage;
