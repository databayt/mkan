'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { getBooking } from '@/lib/actions/transport-actions';

interface BookingDetails {
  id: number;
  bookingReference: string;
  passengerName: string;
  passengerPhone: string;
  passengerEmail: string | null;
  totalAmount: number;
  status: string;
  bookedAt: Date;
  confirmedAt: Date | null;
  trip: {
    departureDate: Date;
    departureTime: string;
    arrivalTime: string | null;
    price: number;
    route: {
      origin: { name: string; city: string; address: string };
      destination: { name: string; city: string; address: string };
      duration: number;
      office: {
        name: string;
        phone: string;
        assemblyPoint: {
          name: string;
          address: string;
        };
      };
    };
    bus: {
      plateNumber: string;
      model: string | null;
    };
  };
  seats: { seatNumber: string }[];
  payments: {
    amount: number;
    method: string;
    status: string;
    paidAt: Date | null;
  }[];
}

export default function BookingConfirmationPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = Number(params.id);

  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBooking = async () => {
      try {
        const data = await getBooking(bookingId);
        setBooking(data);
      } catch (error) {
        console.error('Failed to fetch booking:', error);
      } finally {
        setLoading(false);
      }
    };

    if (bookingId) {
      fetchBooking();
    }
  }, [bookingId]);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="animate-pulse space-y-4">
          <div className="h-16 w-16 bg-gray-200 rounded-full mx-auto" />
          <div className="h-8 w-64 bg-gray-200 rounded mx-auto" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="container mx-auto py-8 px-4 text-center">
        <h1 className="text-2xl font-bold">Booking not found</h1>
        <Button onClick={() => router.push('/transport')} className="mt-4">
          Back to Transport
        </Button>
      </div>
    );
  }

  const isConfirmed = booking.status === 'Confirmed';

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
          {isConfirmed ? 'Booking Confirmed!' : 'Booking Received'}
        </h1>
        <p className="text-muted-foreground">
          {isConfirmed
            ? 'Your bus ticket has been confirmed. Show your ticket at the office.'
            : 'Your booking is being processed. You will receive confirmation shortly.'}
        </p>
      </div>

      {/* Booking Reference */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Booking Reference</div>
              <div className="text-2xl font-mono font-bold">{booking.bookingReference}</div>
            </div>
            <Badge className={getStatusColor(booking.status)}>{booking.status}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Trip Details */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            Trip Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Route */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="font-medium">{booking.trip.route.origin.city}</div>
              <div className="text-sm text-muted-foreground">
                {booking.trip.route.origin.name}
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 text-right">
              <div className="font-medium">{booking.trip.route.destination.city}</div>
              <div className="text-sm text-muted-foreground">
                {booking.trip.route.destination.name}
              </div>
            </div>
          </div>

          <Separator />

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-sm text-muted-foreground">Date</div>
                <div className="font-medium">
                  {format(new Date(booking.trip.departureDate), 'EEE, MMM d, yyyy')}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-sm text-muted-foreground">Departure</div>
                <div className="font-medium">{booking.trip.departureTime}</div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Seats and Bus */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Seats</div>
              <div className="font-medium">
                {booking.seats.map((s) => s.seatNumber).join(', ')}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Bus</div>
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
            Passenger Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{booking.passengerName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Phone</span>
            <span className="font-medium">{booking.passengerPhone}</span>
          </div>
          {booking.passengerEmail && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
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
            Boarding Location
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="font-medium">{booking.trip.route.office.name}</div>
          <div className="text-sm text-muted-foreground">
            {booking.trip.route.office.assemblyPoint?.name}
          </div>
          <div className="text-sm text-muted-foreground">
            {booking.trip.route.office.assemblyPoint?.address}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4" />
            {booking.trip.route.office.phone}
          </div>
        </CardContent>
      </Card>

      {/* Payment Summary */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Payment Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center">
            <span>Total Paid</span>
            <span className="text-xl font-bold">SDG {booking.totalAmount.toLocaleString()}</span>
          </div>
          {booking.payments.length > 0 && (
            <div className="mt-2 text-sm text-muted-foreground">
              Paid via {booking.payments[0].method.replace(/([A-Z])/g, ' $1').trim()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button asChild className="flex-1">
          <Link href={`/transport/booking/${booking.id}/ticket`}>
            <Download className="h-4 w-4 mr-2" />
            View Ticket
          </Link>
        </Button>
        <Button variant="outline" className="flex-1">
          <Share2 className="h-4 w-4 mr-2" />
          Share
        </Button>
      </div>

      <div className="mt-6 text-center">
        <Link
          href="/tenants/trips"
          className="text-sm text-primary hover:underline"
        >
          View all my trips
        </Link>
      </div>
    </div>
  );
}
