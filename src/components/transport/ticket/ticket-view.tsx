'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Download, Share2, MapPin, Clock, User, Phone, Bus } from 'lucide-react';
import QRCode from 'qrcode';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Booking {
  id: number;
  bookingReference: string;
  passengerName: string;
  passengerPhone: string;
  passengerEmail: string | null;
  totalAmount: number;
  status: 'Pending' | 'Confirmed' | 'Cancelled' | 'Completed' | 'NoShow';
  qrCode: string | null;
  trip: {
    departureDate: Date;
    departureTime: string;
    arrivalTime: string | null;
    route: {
      origin: { name: string; city: string };
      destination: { name: string; city: string };
      duration: number;
      office: {
        name: string;
        assemblyPoint: {
          name: string;
          address: string;
        };
      };
    };
    bus: {
      model: string | null;
    };
  };
  seats: Array<{ seatNumber: string }>;
}

interface TicketViewProps {
  booking: Booking;
  showDownload?: boolean;
  variant?: 'full' | 'compact';
  dictionary?: {
    title: string;
    reference: string;
    download: string;
    share: string;
    scanQr: string;
    passenger: string;
    phone: string;
    seats: string;
    departure: string;
    arrival: string;
    duration: string;
    office: string;
    assemblyPoint: string;
    status: string;
    total: string;
  };
}

export function TicketView({
  booking,
  showDownload = true,
  variant = 'full',
  dictionary = {
    title: 'E-Ticket',
    reference: 'Booking Reference',
    download: 'Download PDF',
    share: 'Share',
    scanQr: 'Scan QR code at boarding',
    passenger: 'Passenger',
    phone: 'Phone',
    seats: 'Seats',
    departure: 'Departure',
    arrival: 'Arrival',
    duration: 'Duration',
    office: 'Transport Office',
    assemblyPoint: 'Assembly Point',
    status: 'Status',
    total: 'Total Amount',
  },
}: TicketViewProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

  useEffect(() => {
    const generateQR = async () => {
      try {
        const qrData = booking.qrCode || JSON.stringify({
          ref: booking.bookingReference,
          passenger: booking.passengerName,
          seats: booking.seats.map(s => s.seatNumber),
        });
        const url = await QRCode.toDataURL(qrData, {
          width: 200,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });
        setQrCodeUrl(url);
      } catch {
        console.error('Failed to generate QR code');
      }
    };
    generateQR();
  }, [booking]);

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const statusColors: Record<string, string> = {
    Pending: 'bg-yellow-100 text-yellow-800',
    Confirmed: 'bg-green-100 text-green-800',
    Cancelled: 'bg-red-100 text-red-800',
    Completed: 'bg-blue-100 text-blue-800',
    NoShow: 'bg-gray-100 text-gray-800',
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Bus Ticket - ${booking.bookingReference}`,
          text: `${booking.trip.route.origin.city} to ${booking.trip.route.destination.city} on ${format(new Date(booking.trip.departureDate), 'PPP')}`,
          url: window.location.href,
        });
      } catch {
        // User cancelled or share failed
      }
    }
  };

  if (variant === 'compact') {
    return (
      <div className="bg-background border rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{dictionary.reference}</p>
            <p className="font-mono font-bold">{booking.bookingReference}</p>
          </div>
          <Badge className={statusColors[booking.status]}>
            {booking.status}
          </Badge>
        </div>
        <div className="flex items-center gap-4">
          <div>
            <p className="font-bold text-lg">{booking.trip.departureTime}</p>
            <p className="text-sm text-muted-foreground">
              {booking.trip.route.origin.city}
            </p>
          </div>
          <div className="flex-1 border-t border-dashed" />
          <div className="text-right">
            <p className="font-bold text-lg">
              {booking.trip.arrivalTime || '--:--'}
            </p>
            <p className="text-sm text-muted-foreground">
              {booking.trip.route.destination.city}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background border rounded-2xl overflow-hidden max-w-md mx-auto">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-6 text-center">
        <Bus className="h-10 w-10 mx-auto mb-2" />
        <h2 className="text-xl font-bold">{dictionary.title}</h2>
        <p className="text-sm opacity-80">{booking.trip.route.office.name}</p>
      </div>

      {/* QR Code */}
      <div className="p-6 flex flex-col items-center border-b">
        {qrCodeUrl ? (
          <img
            src={qrCodeUrl}
            alt="Ticket QR Code"
            className="w-40 h-40 rounded-lg"
          />
        ) : (
          <div className="w-40 h-40 bg-muted animate-pulse rounded-lg" />
        )}
        <p className="text-xs text-muted-foreground mt-2">
          {dictionary.scanQr}
        </p>
      </div>

      {/* Booking Reference */}
      <div className="p-4 bg-muted/30 text-center border-b">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          {dictionary.reference}
        </p>
        <p className="text-2xl font-mono font-bold tracking-wider">
          {booking.bookingReference}
        </p>
      </div>

      {/* Route Info */}
      <div className="p-6 border-b space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{dictionary.departure}</p>
            <p className="text-2xl font-bold">{booking.trip.departureTime}</p>
            <p className="text-sm flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {booking.trip.route.origin.city}
            </p>
          </div>
          <div className="flex-1 px-4">
            <div className="relative py-4">
              <div className="border-t border-dashed" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            <p className="text-xs text-center text-muted-foreground">
              {formatDuration(booking.trip.route.duration)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{dictionary.arrival}</p>
            <p className="text-2xl font-bold">
              {booking.trip.arrivalTime || '--:--'}
            </p>
            <p className="text-sm flex items-center gap-1 justify-end">
              <MapPin className="h-3 w-3" />
              {booking.trip.route.destination.city}
            </p>
          </div>
        </div>

        <div className="pt-4 border-t">
          <p className="text-sm text-muted-foreground">
            {format(new Date(booking.trip.departureDate), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
      </div>

      {/* Passenger & Seat Info */}
      <div className="p-6 border-b space-y-3">
        <div className="flex items-center gap-3">
          <User className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">{dictionary.passenger}</p>
            <p className="font-medium">{booking.passengerName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Phone className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">{dictionary.phone}</p>
            <p className="font-medium">{booking.passengerPhone}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">💺</span>
          <div>
            <p className="text-xs text-muted-foreground">{dictionary.seats}</p>
            <p className="font-medium">
              {booking.seats.map((s) => s.seatNumber).join(', ')}
            </p>
          </div>
        </div>
      </div>

      {/* Assembly Point */}
      <div className="p-6 border-b bg-muted/30">
        <p className="text-xs text-muted-foreground mb-1">
          {dictionary.assemblyPoint}
        </p>
        <p className="font-medium">
          {booking.trip.route.office.assemblyPoint.name}
        </p>
        <p className="text-sm text-muted-foreground">
          {booking.trip.route.office.assemblyPoint.address}
        </p>
      </div>

      {/* Status & Amount */}
      <div className="p-6 border-b flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{dictionary.status}</p>
          <Badge className={statusColors[booking.status]}>
            {booking.status}
          </Badge>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">{dictionary.total}</p>
          <p className="text-xl font-bold">
            {booking.totalAmount.toLocaleString()} SDG
          </p>
        </div>
      </div>

      {/* Actions */}
      {showDownload && (
        <div className="p-6 flex gap-3">
          <Button className="flex-1" variant="outline">
            <Download className="h-4 w-4 mr-2" />
            {dictionary.download}
          </Button>
          <Button variant="outline" size="icon" onClick={handleShare}>
            <Share2 className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
