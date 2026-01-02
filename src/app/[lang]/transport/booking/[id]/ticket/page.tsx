'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  Phone,
  QrCode,
} from 'lucide-react';
import { format } from 'date-fns';
import { getBooking } from '@/lib/actions/transport-actions';
import QRCode from 'qrcode';

interface BookingDetails {
  id: number;
  bookingReference: string;
  passengerName: string;
  passengerPhone: string;
  totalAmount: number;
  status: string;
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
}

export default function TicketViewPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = Number(params.id);

  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

  useEffect(() => {
    const fetchBooking = async () => {
      try {
        const data = await getBooking(bookingId);
        setBooking(data);

        // Generate QR code
        if (data) {
          const qrData = JSON.stringify({
            ref: data.bookingReference,
            passenger: data.passengerName,
            seats: data.seats.map((s: { seatNumber: string }) => s.seatNumber).join(','),
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
        }
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

  const handleDownload = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="animate-pulse space-y-4">
          <div className="h-96 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="container mx-auto py-8 px-4 text-center">
        <h1 className="text-2xl font-bold">Ticket not found</h1>
        <Button onClick={() => router.push('/transport')} className="mt-4">
          Back to Transport
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-md">
      {/* Download Button - Hidden when printing */}
      <div className="mb-4 print:hidden">
        <Button onClick={handleDownload} className="w-full">
          <Download className="h-4 w-4 mr-2" />
          Download Ticket
        </Button>
      </div>

      {/* Ticket Card */}
      <Card className="overflow-hidden border-2 border-dashed">
        <CardContent className="p-0">
          {/* Header */}
          <div className="bg-primary text-primary-foreground p-4">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm opacity-80">Mkan Transport</div>
                <div className="text-xl font-bold">Bus Ticket</div>
              </div>
              <Bus className="h-8 w-8" />
            </div>
          </div>

          {/* Route Section */}
          <div className="p-4 bg-gradient-to-r from-primary/5 to-primary/10">
            <div className="flex items-center justify-between">
              <div className="text-center">
                <div className="text-2xl font-bold">{booking.trip.route.origin.city}</div>
                <div className="text-xs text-muted-foreground truncate max-w-[100px]">
                  {booking.trip.route.origin.name}
                </div>
              </div>
              <div className="flex-1 px-4">
                <div className="relative">
                  <div className="border-t-2 border-dashed border-primary/30" />
                  <ArrowRight className="h-4 w-4 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-primary bg-white" />
                </div>
                <div className="text-center text-xs text-muted-foreground mt-1">
                  {booking.trip.route.duration} hrs
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{booking.trip.route.destination.city}</div>
                <div className="text-xs text-muted-foreground truncate max-w-[100px]">
                  {booking.trip.route.destination.name}
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
                <div className="text-xs text-muted-foreground">Date</div>
                <div className="font-medium text-sm">
                  {format(new Date(booking.trip.departureDate), 'EEE, MMM d')}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <div className="text-xs text-muted-foreground">Time</div>
                <div className="font-medium text-sm">{booking.trip.departureTime}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <User className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <div className="text-xs text-muted-foreground">Passenger</div>
                <div className="font-medium text-sm truncate max-w-[120px]">
                  {booking.passengerName}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <QrCode className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <div className="text-xs text-muted-foreground">Seat(s)</div>
                <div className="font-medium text-sm">
                  {booking.seats.map((s) => s.seatNumber).join(', ')}
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Office Info */}
          <div className="p-4 bg-muted/30">
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="text-sm">
                <div className="font-medium">{booking.trip.route.office.name}</div>
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
              <img
                src={qrCodeUrl}
                alt="Ticket QR Code"
                className="w-24 h-24"
              />
            )}
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">Booking Reference</div>
              <div className="text-xl font-mono font-bold">{booking.bookingReference}</div>
              <div className="text-xs text-muted-foreground mt-2">
                Show this QR code at the office
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-3 bg-muted text-center text-xs text-muted-foreground">
            <div>Bus: {booking.trip.bus.model || booking.trip.bus.plateNumber}</div>
            <div className="mt-1">Total: SDG {booking.totalAmount.toLocaleString()}</div>
          </div>
        </CardContent>
      </Card>

      {/* Back Button - Hidden when printing */}
      <div className="mt-4 text-center print:hidden">
        <Button
          variant="link"
          onClick={() => router.push(`/transport/booking/${booking.id}`)}
        >
          Back to Booking Details
        </Button>
      </div>

      {/* Print Styles */}
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
