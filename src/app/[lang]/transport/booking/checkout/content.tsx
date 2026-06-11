'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
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
import { toast } from 'sonner';
import { getBooking, processPayment } from '@/lib/actions/transport-actions';
import { TransportCardCheckout } from '@/components/transport/card-checkout';
import { useDictionary } from '@/components/internationalization/dictionary-context';

type PaymentMethod = 'MobileMoney' | 'CreditCard' | 'BankTransfer' | 'CashOnArrival';

type BookingDetails = NonNullable<Awaited<ReturnType<typeof getBooking>>>;

function CheckoutInner({ showCard }: { showCard: boolean }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const bookingId = Number(searchParams.get('bookingId'));

  // Locale string drives the post-payment redirect path (not display text).
  const pathParts = pathname.split('/');
  const locale = pathParts[1] === 'ar' ? 'ar' : 'en';

  const dict = useDictionary();
  const t = dict?.transport;
  const c = t?.checkout;
  const pm = t?.paymentMethods;

  // Build payment methods with translated content
  const paymentMethods = [
    { id: 'MobileMoney' as PaymentMethod, name: pm?.mobileMoney?.name ?? "Mobile Money", description: pm?.mobileMoney?.description ?? "Pay with MTN or Bankak", icon: Smartphone },
    { id: 'CreditCard' as PaymentMethod, name: pm?.creditCard?.name ?? "Credit/Debit Card", description: pm?.creditCard?.description ?? "Visa, Mastercard", icon: CreditCard },
    { id: 'BankTransfer' as PaymentMethod, name: pm?.bankTransfer?.name ?? "Bank Transfer", description: pm?.bankTransfer?.description ?? "Direct bank transfer", icon: Building2 },
    { id: 'CashOnArrival' as PaymentMethod, name: pm?.cashOnArrival?.name ?? "Cash on Arrival", description: pm?.cashOnArrival?.description ?? "Pay at the office", icon: Banknote },
  ].filter((m) => showCard || m.id !== 'CreditCard'); // Stripe can't serve Sudan — hide card for non-diaspora.

  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('MobileMoney');
  const [mobileNumber, setMobileNumber] = useState('');
  const [bankReference, setBankReference] = useState('');

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
        bankReference: bankReference || undefined,
      });

      if (result.success) {
        toast.success(
          result.pendingVerification
            ? (c?.submittedForVerification ??
                "Payment submitted — the operator will verify it and confirm your booking.")
            : (t?.bookingPage?.paymentSuccess ?? "Payment successful")
        );
        router.push(`/${locale}/transport/booking/${booking.id}`);
      } else {
        toast.error(t?.bookingPage?.paymentFailed ?? "Payment failed. Please try again.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Payment failed';
      toast.error(message);
    } finally {
      setProcessing(false);
    }
  };

  // Per-operator payment instructions live on the office row — empty
  // strings mean the operator hasn't published details yet.
  const office = booking?.trip.route.office;
  const hasBankDetails = Boolean(office?.bankName && office?.bankAccount);
  const hasMomoDetails = Boolean(office?.momoNumber);

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-muted rounded" />
          <div className="h-96 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="container mx-auto py-8 px-4 text-center">
        <h1 className="text-2xl font-bold">{c?.bookingNotFound ?? "Booking not found"}</h1>
        <Button onClick={() => router.push(`/${locale}/transport`)} className="mt-4">
          {c?.backToTransport ?? "Back to Transport"}
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">{c?.title ?? "Complete Your Booking"}</h1>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Payment Methods */}
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{c?.selectPayment ?? "Select Payment Method"}</CardTitle>
              <CardDescription>{c?.choosePayment ?? "Choose how you would like to pay"}</CardDescription>
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
                          <div className="text-sm text-muted-foreground">{method.description}</div>
                        </div>
                      </Label>
                    </div>
                  );
                })}
              </RadioGroup>
            </CardContent>
          </Card>

          {paymentMethod === 'MobileMoney' && (
            <Card>
              <CardHeader>
                <CardTitle>{c?.mobileMoneyDetails ?? "Mobile Money Details"}</CardTitle>
                <CardDescription>
                  {hasMomoDetails
                    ? (c?.momoSendTo ?? "Send the total to the operator's wallet, then enter your number below")
                    : (c?.enterMobileNumber ?? "Enter your mobile money number")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {hasMomoDetails && office && (
                  <div className="bg-muted p-4 rounded-lg space-y-2">
                    {office.momoProvider ? (
                      <div className="flex justify-between"><span className="text-muted-foreground">{c?.momoProviderLabel ?? "Provider"}</span><span className="font-medium">{office.momoProvider}</span></div>
                    ) : null}
                    <div className="flex justify-between"><span className="text-muted-foreground">{c?.momoNumberLabel ?? "Wallet number"}</span><span className="font-medium font-mono" dir="ltr">{office.momoNumber}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">{c?.reference ?? "Reference"}</span><span className="font-medium font-mono" dir="ltr">{booking.bookingReference}</span></div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="mobile">{c?.mobileNumber ?? "Mobile Number"}</Label>
                  <Input id="mobile" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} placeholder="e.g., 0912345678" dir="ltr" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="momo-ref">{c?.transferReference ?? "Transaction reference (optional)"}</Label>
                  <Input id="momo-ref" value={bankReference} onChange={(e) => setBankReference(e.target.value)} placeholder={c?.transferReferencePlaceholder ?? "e.g., MM-20260611-1234"} dir="ltr" />
                </div>
                <p className="text-sm text-muted-foreground">{c?.verificationNote ?? "Your booking is confirmed once the operator verifies the payment."}</p>
              </CardContent>
            </Card>
          )}

          {paymentMethod === 'BankTransfer' && (
            <Card>
              <CardHeader>
                <CardTitle>{c?.bankDetails ?? "Bank Transfer Details"}</CardTitle>
                <CardDescription>{c?.transferTo ?? "Transfer to the following account"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {hasBankDetails && office ? (
                  <>
                    <div className="bg-muted p-4 rounded-lg space-y-2">
                      <div className="flex justify-between"><span className="text-muted-foreground">{c?.bankName ?? "Bank Name"}</span><span className="font-medium">{office.bankName}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">{c?.accountName ?? "Account Name"}</span><span className="font-medium">{office.bankHolder || office.name}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">{c?.accountNumber ?? "Account Number"}</span><span className="font-medium font-mono" dir="ltr">{office.bankAccount}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">{c?.reference ?? "Reference"}</span><span className="font-medium font-mono" dir="ltr">{booking.bookingReference}</span></div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bank-ref">{c?.transferReference ?? "Your transfer reference"}</Label>
                      <Input id="bank-ref" value={bankReference} onChange={(e) => setBankReference(e.target.value)} placeholder={c?.transferReferencePlaceholder ?? "e.g., MM-20260611-1234"} dir="ltr" />
                    </div>
                    <p className="text-sm text-muted-foreground">{c?.includeReference ?? "Please include the booking reference in your transfer description. Your booking will be confirmed once payment is verified."}</p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {c?.noBankDetails ?? "This operator hasn't published bank transfer details yet. Please pick another payment method or contact the office."}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {paymentMethod === 'CreditCard' && (
            <Card>
              <CardHeader>
                <CardTitle>{c?.cardDetails ?? "Card Payment"}</CardTitle>
                <CardDescription>{c?.cardSubtitle ?? "Pay securely with your card"}</CardDescription>
              </CardHeader>
              <CardContent>
                <TransportCardCheckout
                  bookingId={booking.id}
                  amount={booking.totalAmount}
                  currency="SDG"
                  labels={{
                    pay: c?.pay ?? "Pay",
                    processing: c?.processing ?? "Processing...",
                    loading: c?.cardLoading ?? "Preparing secure payment...",
                    configMissing: c?.cardConfigMissing ?? "Card payments are not available right now.",
                    errorPrefix: c?.cardError ?? "Payment error",
                  }}
                  onSuccess={() => {
                    toast.success(t?.bookingPage?.paymentSuccess ?? "Payment successful");
                    router.push(`/${locale}/transport/booking/${booking.id}`);
                  }}
                />
              </CardContent>
            </Card>
          )}

          {paymentMethod === 'CashOnArrival' && (
            <Card>
              <CardHeader>
                <CardTitle>{c?.cashTitle ?? "Cash on Arrival"}</CardTitle>
                <CardDescription>{c?.cashSubtitle ?? "Pay at the transport office"}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 rounded-lg">
                  <p className="text-sm text-amber-800 dark:text-amber-200">{c?.cashWarning ?? "Your seats will be reserved for 30 minutes. Please arrive at the office early to complete payment and collect your tickets."}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {paymentMethod !== 'CreditCard' && (
            <Button
              className="w-full"
              size="lg"
              onClick={handlePayment}
              disabled={
                processing ||
                (paymentMethod === 'MobileMoney' && !mobileNumber) ||
                (paymentMethod === 'BankTransfer' && (!hasBankDetails || !bankReference))
              }
            >
              {processing
                ? (c?.processing ?? "Processing...")
                : paymentMethod === 'CashOnArrival'
                  ? (c?.reserveSeats ?? "Reserve seats")
                  : `${c?.pay ?? "Pay"} SDG ${booking.totalAmount.toLocaleString()}`}
            </Button>
          )}

          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>{c?.paySecure ?? "Your payment is secure and encrypted"}</span>
          </div>
        </div>

        {/* Order Summary */}
        <div className="md:col-span-1">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle>{c?.orderSummary ?? "Order Summary"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  {booking.trip.route.origin.city}
                  <ArrowRight className="h-3 w-3 rtl:rotate-180" />
                  {booking.trip.route.destination.city}
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span dir="ltr">{format(new Date(booking.trip.departureDate), 'EEE, MMM d, yyyy')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span dir="ltr">{booking.trip.departureTime}</span>
                </div>
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">{c?.passenger ?? "Passenger"}</span><span>{booking.passengerName}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{c?.seats ?? "Seats"}</span><span dir="ltr">{booking.seats.map((s) => s.seatNumber).join(', ')}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{c?.reference ?? "Reference"}</span><span className="font-mono text-xs" dir="ltr">{booking.bookingReference}</span></div>
              </div>

              <Separator />

              <div className="flex justify-between font-bold">
                <span>{c?.total ?? "Total"}</span>
                <span dir="ltr">SDG {booking.totalAmount.toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function CheckoutFallback() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-64 bg-muted rounded" />
        <div className="h-96 bg-muted rounded" />
      </div>
    </div>
  );
}

export default function CheckoutContent({ showCard }: { showCard: boolean }) {
  return (
    <Suspense fallback={<CheckoutFallback />}>
      <CheckoutInner showCard={showCard} />
    </Suspense>
  );
}
