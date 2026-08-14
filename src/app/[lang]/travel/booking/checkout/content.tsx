'use client';

// Client content for checkout (mirror pattern) — the booking arrives from the
// server page; this file owns the payment-method interaction only.

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
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
  Phone,
} from 'lucide-react';
import { format } from 'date-fns';
import { ar, enUS } from 'date-fns/locale';
import { toast } from 'sonner';
import { processPayment, type getBooking } from '@/lib/actions/travel-actions';
import { TransportCardCheckout } from '@/components/travel/card-checkout';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import { formatCurrency } from '@/lib/i18n/formatters';
import { cityLabel } from '@/components/travel/city-names';

type PaymentMethod = 'MobileMoney' | 'CreditCard' | 'BankTransfer' | 'CashOnArrival';

type BookingDetails = NonNullable<Awaited<ReturnType<typeof getBooking>>>;

function CheckoutInner({
  showCard,
  booking,
}: {
  showCard: boolean;
  booking: BookingDetails | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // Locale string drives the post-payment redirect path (not display text).
  const pathParts = pathname.split('/');
  const locale = pathParts[1] === 'ar' ? 'ar' : 'en';
  const dateLocale = locale === 'ar' ? ar : enUS;

  const dict = useDictionary();
  const t = dict?.travel;
  const c = t?.checkout;
  const pm = t?.paymentMethods;

  // Per-operator payment instructions live on the office row — empty
  // strings mean the operator hasn't published details yet.
  //
  // These must be declared BEFORE paymentMethods: the .filter() below runs
  // during render, so reading them from further down the component body threw
  // a temporal-dead-zone ReferenceError and took the whole checkout with it.
  // tsc does not catch this — the reference sits inside a callback, which it
  // treats as deferred even though .filter() invokes it synchronously.
  const office = booking?.trip.route.office;
  const hasBankDetails = Boolean(office?.bankName && office?.bankAccount);
  const hasMomoDetails = Boolean(office?.momoNumber);

  // Build payment methods with translated content
  const paymentMethods = [
    { id: 'MobileMoney' as PaymentMethod, name: pm?.mobileMoney?.name ?? "Mobile Money", description: pm?.mobileMoney?.description ?? "Pay with MTN or Bankak", icon: Smartphone },
    { id: 'CreditCard' as PaymentMethod, name: pm?.creditCard?.name ?? "Credit/Debit Card", description: pm?.creditCard?.description ?? "Visa, Mastercard", icon: CreditCard },
    { id: 'BankTransfer' as PaymentMethod, name: pm?.bankTransfer?.name ?? "Bank Transfer", description: pm?.bankTransfer?.description ?? "Direct bank transfer", icon: Building2 },
    { id: 'CashOnArrival' as PaymentMethod, name: pm?.cashOnArrival?.name ?? "Cash on Arrival", description: pm?.cashOnArrival?.description ?? "Pay at the office", icon: Banknote },
  ].filter((m) => {
    if (m.id === 'CreditCard') return showCard;
    if (m.id === 'BankTransfer') return hasBankDetails;
    if (m.id === 'MobileMoney') return hasMomoDetails;
    return true;
  });

  const [processing, setProcessing] = useState(false);
  // Start on a method the operator actually accepts. Hardcoding 'MobileMoney'
  // meant that for any office without a wallet configured the radio list showed
  // nothing selected, the Mobile Money panel rendered for an option that wasn't
  // on offer, and the Pay button sat permanently disabled waiting for a number
  // the rider had no reason to type — checkout was a dead end even though Cash
  // on Arrival was right there.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    () => paymentMethods[0]?.id ?? 'CashOnArrival',
  );
  const [mobileNumber, setMobileNumber] = useState('');
  const [bankReference, setBankReference] = useState('');

  // showCard is resolved asynchronously (geo-gated Stripe availability), so the
  // offered set can change after mount. If the current pick drops out of it,
  // fall back to the first one that remains rather than leaving the form
  // pointing at a method that is no longer on the page.
  const offeredIds = paymentMethods.map((m) => m.id).join(',');
  useEffect(() => {
    const ids = offeredIds ? (offeredIds.split(',') as PaymentMethod[]) : [];
    const first = ids[0];
    if (first && !ids.includes(paymentMethod)) {
      setPaymentMethod(first);
    }
  }, [offeredIds, paymentMethod]);

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
        router.push(`/${locale}/travel/booking/${booking.id}`);
      } else if (result.error === 'RATE_LIMITED') {
        // Throttled, not declined — nothing was charged and the booking still
        // holds its seats. Say so with the wait, instead of the generic
        // "Payment failed" that would send a rider off to re-book.
        toast.error(
          (t?.booking?.rateLimited ??
            'Too many attempts. Try again in {seconds} seconds.')
            .replace('{seconds}', String(result.retryAfter)),
        );
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

  if (!booking) {
    return (
      <div className="container mx-auto py-8 px-4 text-center">
        <h1 className="text-2xl font-bold">{c?.bookingNotFound ?? "Booking not found"}</h1>
        <Button onClick={() => router.push(`/${locale}/travel`)} className="mt-4">
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
                    router.push(`/${locale}/travel/booking/${booking.id}`);
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
                  <p className="text-sm text-amber-800 dark:text-amber-200">{c?.cashWarning ?? "Your seats are held until 6 hours before departure. Pay at the office before then to collect your tickets."}</p>
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
                  : `${c?.pay ?? "Pay"} ${formatCurrency(booking.totalAmount, locale)}`}
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
                  {cityLabel(booking.trip.route.origin.city, locale)}
                  <ArrowRight className="h-3 w-3 rtl:rotate-180" />
                  {cityLabel(booking.trip.route.destination.city, locale)}
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{format(new Date(booking.trip.departureDate), 'EEE, MMM d, yyyy', { locale: dateLocale })}</span>
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
                <span dir={locale === 'ar' ? 'rtl' : 'ltr'}>{formatCurrency(booking.totalAmount, locale)}</span>
              </div>

              {/* Contact-first: any payment question is a phone call away */}
              {office?.phone && (
                <>
                  <Separator />
                  <a
                    href={`tel:${office.phone}`}
                    className="flex items-center justify-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Phone className="h-4 w-4" />
                    {t?.office?.callOffice ?? "Call office"}
                  </a>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutContent({
  showCard,
  booking,
}: {
  showCard: boolean;
  booking: BookingDetails | null;
}) {
  return <CheckoutInner showCard={showCard} booking={booking} />;
}
