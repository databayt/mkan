'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import {
  MapPin,
  Clock,
  Calendar,
  CreditCard,
  Smartphone,
  Building2,
  Banknote,
  ArrowRight,
  Shield,
} from 'lucide-react';
import { format } from 'date-fns';
import { getBooking, processPayment } from '@/lib/actions/transport-actions';

type PaymentMethod = 'MobileMoney' | 'CreditCard' | 'BankTransfer' | 'CashOnArrival';

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
    price: number;
    route: {
      origin: { name: string; city: string };
      destination: { name: string; city: string };
      duration: number;
      office: {
        name: string;
        phone: string;
      };
    };
    bus: {
      plateNumber: string;
      model: string | null;
    };
  };
  seats: { seatNumber: string }[];
}

const paymentMethods = [
  {
    id: 'MobileMoney' as PaymentMethod,
    name: 'Mobile Money',
    description: 'Pay with MTN or Bankak',
    icon: Smartphone,
  },
  {
    id: 'CreditCard' as PaymentMethod,
    name: 'Credit/Debit Card',
    description: 'Visa, Mastercard',
    icon: CreditCard,
  },
  {
    id: 'BankTransfer' as PaymentMethod,
    name: 'Bank Transfer',
    description: 'Direct bank transfer',
    icon: Building2,
  },
  {
    id: 'CashOnArrival' as PaymentMethod,
    name: 'Cash on Arrival',
    description: 'Pay at the office',
    icon: Banknote,
  },
];

export default function CheckoutPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const bookingId = Number(searchParams.get('bookingId'));

  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('MobileMoney');
  const [mobileNumber, setMobileNumber] = useState('');

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

  const handlePayment = async () => {
    if (!booking) return;

    setProcessing(true);
    try {
      const result = await processPayment(booking.id, {
        method: paymentMethod,
        mobileMoneyNumber: paymentMethod === 'MobileMoney' ? mobileNumber : undefined,
      });

      if (result.success) {
        router.push(`/transport/booking/${booking.id}`);
      }
    } catch (error) {
      console.error('Payment failed:', error);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-gray-200 rounded" />
          <div className="h-96 bg-gray-200 rounded" />
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

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Complete Your Booking</h1>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Payment Methods */}
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Select Payment Method</CardTitle>
              <CardDescription>Choose how you would like to pay</CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
                className="space-y-3"
              >
                {paymentMethods.map((method) => {
                  const Icon = method.icon;
                  return (
                    <div key={method.id}>
                      <Label
                        htmlFor={method.id}
                        className="flex items-center gap-4 p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors [&:has(:checked)]:border-primary [&:has(:checked)]:bg-primary/5"
                      >
                        <RadioGroupItem value={method.id} id={method.id} />
                        <Icon className="h-5 w-5 text-muted-foreground" />
                        <div className="flex-1">
                          <div className="font-medium">{method.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {method.description}
                          </div>
                        </div>
                      </Label>
                    </div>
                  );
                })}
              </RadioGroup>
            </CardContent>
          </Card>

          {/* Payment Details */}
          {paymentMethod === 'MobileMoney' && (
            <Card>
              <CardHeader>
                <CardTitle>Mobile Money Details</CardTitle>
                <CardDescription>Enter your mobile money number</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="mobile">Mobile Number</Label>
                  <Input
                    id="mobile"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    placeholder="e.g., 0912345678"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {paymentMethod === 'BankTransfer' && (
            <Card>
              <CardHeader>
                <CardTitle>Bank Transfer Details</CardTitle>
                <CardDescription>Transfer to the following account</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted p-4 rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bank Name</span>
                    <span className="font-medium">Bank of Khartoum</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Account Name</span>
                    <span className="font-medium">Mkan Transport Services</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Account Number</span>
                    <span className="font-medium font-mono">1234567890</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reference</span>
                    <span className="font-medium font-mono">{booking.bookingReference}</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Please include the booking reference in your transfer description.
                  Your booking will be confirmed once payment is verified.
                </p>
              </CardContent>
            </Card>
          )}

          {paymentMethod === 'CashOnArrival' && (
            <Card>
              <CardHeader>
                <CardTitle>Cash on Arrival</CardTitle>
                <CardDescription>Pay at the transport office</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    Your seats will be reserved for 30 minutes. Please arrive at the
                    office early to complete payment and collect your tickets.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <Button
            className="w-full"
            size="lg"
            onClick={handlePayment}
            disabled={processing || (paymentMethod === 'MobileMoney' && !mobileNumber)}
          >
            {processing ? 'Processing...' : `Pay SDG ${booking.totalAmount.toLocaleString()}`}
          </Button>

          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>Your payment is secure and encrypted</span>
          </div>
        </div>

        {/* Order Summary */}
        <div className="md:col-span-1">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  {booking.trip.route.origin.city}
                  <ArrowRight className="h-3 w-3" />
                  {booking.trip.route.destination.city}
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {format(new Date(booking.trip.departureDate), 'EEE, MMM d, yyyy')}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  {booking.trip.departureTime}
                </div>
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Passenger</span>
                  <span>{booking.passengerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Seats</span>
                  <span>{booking.seats.map((s) => s.seatNumber).join(', ')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reference</span>
                  <span className="font-mono text-xs">{booking.bookingReference}</span>
                </div>
              </div>

              <Separator />

              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span>SDG {booking.totalAmount.toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
