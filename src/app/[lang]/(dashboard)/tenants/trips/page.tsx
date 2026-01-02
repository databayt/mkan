'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Home, Bus, Calendar, MapPin, Clock, Download, Eye } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import { getMyBookings } from '@/lib/actions/transport-actions';

interface TransportBooking {
  id: number;
  bookingReference: string;
  passengerName: string;
  passengerPhone: string;
  totalAmount: number;
  status: string;
  bookedAt: Date;
  trip: {
    departureDate: Date;
    departureTime: string;
    price: number;
    route: {
      origin: { name: string; city: string };
      destination: { name: string; city: string };
      duration: number;
    };
    bus: {
      plateNumber: string;
      model: string | null;
    };
  };
  office: {
    name: string;
  };
  seats: { seatNumber: string }[];
}

const TripsPage = () => {
  const [transportBookings, setTransportBookings] = useState<TransportBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const bookings = await getMyBookings();
        setTransportBookings(bookings || []);
      } catch (error) {
        console.error('Failed to fetch transport bookings:', error);
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
        <h1 className="text-2xl font-bold text-gray-900">My Trips</h1>
        <p className="text-gray-500">View and manage all your bookings</p>
      </div>

      <Tabs defaultValue="transport" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="stays" className="flex items-center gap-2">
            <Home className="h-4 w-4" />
            Stays
          </TabsTrigger>
          <TabsTrigger value="transport" className="flex items-center gap-2">
            <Bus className="h-4 w-4" />
            Transport
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stays" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Rental Stays</CardTitle>
              <CardDescription>Your property rental bookings</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-gray-500">
                <Home className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No rental stays yet</p>
                <p className="text-sm">Browse properties to book your first stay</p>
                <Button asChild className="mt-4">
                  <Link href="/search">Browse Properties</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transport" className="mt-6 space-y-6">
          {/* Upcoming Transport */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Upcoming Trips
              </CardTitle>
              <CardDescription>Your upcoming bus tickets</CardDescription>
            </CardHeader>
            <CardContent>
              {upcomingTransport.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Bus className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No upcoming trips</p>
                  <Button asChild className="mt-4">
                    <Link href="/transport">Book a Trip</Link>
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
                  Past Trips
                </CardTitle>
                <CardDescription>Your completed or cancelled trips</CardDescription>
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

interface TransportBookingCardProps {
  booking: TransportBooking;
  getStatusColor: (status: string) => string;
  isPast?: boolean;
}

const TransportBookingCard = ({ booking, getStatusColor, isPast }: TransportBookingCardProps) => {
  return (
    <div className={`border rounded-lg p-4 ${isPast ? 'opacity-75' : ''}`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge className={getStatusColor(booking.status)}>{booking.status}</Badge>
            <span className="text-sm text-gray-500">Ref: {booking.bookingReference}</span>
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
              {format(new Date(booking.trip.departureDate), 'EEE, MMM d, yyyy')}
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {booking.trip.departureTime}
            </div>
            <div>
              Seats: {booking.seats.map((s) => s.seatNumber).join(', ')}
            </div>
          </div>

          <div className="text-sm text-gray-500">
            {booking.office.name} • {booking.trip.bus.model || booking.trip.bus.plateNumber}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="text-xl font-bold">SDG {booking.totalAmount.toLocaleString()}</div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/transport/booking/${booking.id}`}>
                <Eye className="h-4 w-4 mr-1" />
                View
              </Link>
            </Button>
            {!isPast && booking.status === 'Confirmed' && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/transport/booking/${booking.id}/ticket`}>
                  <Download className="h-4 w-4 mr-1" />
                  Ticket
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
