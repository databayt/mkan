"use client";

// Booking checkout: routes the chosen method to the real payment flow.
//   - Card → mount CardCheckout, which creates a BookingPayment +
//     Stripe PaymentIntent, then renders <PaymentElement />. The webhook
//     (handleStripeWebhook in payment-actions.ts) flips the Booking to
//     Confirmed when payment_intent.succeeded arrives.
//   - Reference methods (Bankak / Cashi / mobile money / bank transfer) →
//     record a BookingPayment(status=PendingVerification) with the
//     user-supplied transaction reference; admin reconciles via
//     verifyBookingPayment.
//   - Cash → record BookingPayment(status=Pending, method=Cash); the host
//     confirms receipt in person.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

import { CardCheckout } from "@/components/booking/payment/card-checkout";
import {
  createBookingCashPayment,
  createBookingReferencePayment,
} from "@/lib/actions/payment-actions";

import type { BookingPayload } from "./page";

type ReferenceMethod = "bankak" | "cashi" | "mobile_money" | "bank_transfer";
type PaymentMethod = "card" | ReferenceMethod | "cash";

// Map UI snake_case to the Prisma BookingPaymentMethod enum values.
const REFERENCE_ENUM: Record<ReferenceMethod, "Bankak" | "Cashi" | "MobileMoney" | "BankTransfer"> = {
  bankak: "Bankak",
  cashi: "Cashi",
  mobile_money: "MobileMoney",
  bank_transfer: "BankTransfer",
};

interface Props {
  lang: string;
  booking: BookingPayload;
  dict: Record<string, Record<string, string>>;
  /** Whether to offer the Stripe card rail (diaspora only — hidden in Sudan). */
  showCard: boolean;
}

export default function BookingCheckoutContent({ lang, booking, dict, showCard }: Props) {
  const t = dict.booking ?? {};
  const currency = dict.common?.currency ?? "$";
  const router = useRouter();

  // Default to the card rail only when it's offered; otherwise start on Bankak
  // (the dominant Sudanese digital wallet) so the first option is payable.
  const [method, setMethod] = useState<PaymentMethod>(showCard ? "card" : "bankak");

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold mb-6">
        {t.confirmAndPay ?? "Confirm and pay"}
      </h1>

      <div className="grid md:grid-cols-[1fr_360px] gap-10">
        <div className="space-y-8">
          <section>
            <h2 className="text-lg font-medium mb-3">{t.yourTrip ?? "Your trip"}</h2>
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t.checkIn ?? "Check-in"}</span>
                <span>{new Date(booking.checkIn).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t.checkOut ?? "Check-out"}</span>
                <span>{new Date(booking.checkOut).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t.guests ?? "Guests"}</span>
                <span>{booking.guestCount}</span>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-medium mb-3">{t.paymentMethod ?? "Payment method"}</h2>
            <RadioGroup
              value={method}
              onValueChange={(v) => setMethod(v as PaymentMethod)}
            >
              {showCard && (
                <MethodRow id="method-card" value="card" label={t.card ?? "Credit / Debit card (Stripe)"} method={method} />
              )}
              <MethodRow id="method-bankak" value="bankak" label={t.bankak ?? "Bankak"} method={method} />
              <MethodRow id="method-cashi" value="cashi" label={t.cashi ?? "Cashi"} method={method} />
              <MethodRow id="method-mobile" value="mobile_money" label={t.mobileMoney ?? "Mobile money"} method={method} />
              <MethodRow id="method-bank" value="bank_transfer" label={t.bankTransfer ?? "Bank transfer"} method={method} />
              <MethodRow id="method-cash" value="cash" label={t.cash ?? "Pay on arrival (cash)"} method={method} />
            </RadioGroup>
          </section>

          <section>
            {method === "card" ? (
              <CardCheckout
                bookingId={booking.id}
                amount={booking.totalPrice}
                currency={currency}
                labels={{
                  pay: t.confirmAndPay ?? "Confirm and pay",
                  processing: t.cardProcessing ?? "Processing payment…",
                  loading: t.cardLoading ?? "Preparing secure checkout…",
                  configMissing:
                    t.cardConfigMissing ??
                    "Card payments are not configured in this environment.",
                  errorPrefix: t.cardErrorPrefix ?? "Payment failed",
                }}
                onSuccess={() =>
                  router.push(`/${lang}/bookings/${booking.id}?payment=succeeded`)
                }
              />
            ) : method === "cash" ? (
              <CashForm lang={lang} booking={booking} t={t} router={router} />
            ) : (
              <ReferenceForm
                lang={lang}
                booking={booking}
                method={method}
                t={t}
                router={router}
              />
            )}
          </section>
        </div>

        <CheckoutSummary booking={booking} currency={currency} t={t} />
      </div>
    </div>
  );
}

function MethodRow({
  id,
  value,
  label,
  method,
}: {
  id: string;
  value: PaymentMethod;
  label: string;
  method: PaymentMethod;
}) {
  return (
    <div
      className={`flex items-center space-s-2 rounded-lg border p-3 ${
        method === value ? "border-foreground" : ""
      }`}
    >
      <RadioGroupItem value={value} id={id} />
      <Label htmlFor={id} className="ms-3 cursor-pointer flex-1">
        {label}
      </Label>
    </div>
  );
}

function CashForm({
  lang,
  booking,
  t,
  router,
}: {
  lang: string;
  booking: BookingPayload;
  t: Record<string, string>;
  router: ReturnType<typeof useRouter>;
}) {
  const [submitting, startTransition] = useTransition();

  const onSubmit = () => {
    startTransition(async () => {
      const res = await createBookingCashPayment({ bookingId: booking.id });
      if (res.ok) {
        toast.success(
          t.cashSuccess ??
            "Booked. Pay your host on arrival; they'll confirm in person.",
        );
        router.push(`/${lang}/bookings/${booking.id}`);
      } else {
        toast.error(`${t.cardErrorPrefix ?? "Payment failed"}: ${res.error}`);
      }
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t.cashInstruction ??
          "Your booking will be held as Pending until your host confirms cash payment on arrival."}
      </p>
      <Button
        type="button"
        size="lg"
        className="w-full bg-[#E91E63] hover:bg-[#D81B60] text-white"
        disabled={submitting}
        onClick={onSubmit}
      >
        {submitting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            <Check className="w-4 h-4 me-2" />
            {t.cashSubmit ?? "Confirm cash booking"}
          </>
        )}
      </Button>
    </div>
  );
}

function ReferenceForm({
  lang,
  booking,
  method,
  t,
  router,
}: {
  lang: string;
  booking: BookingPayload;
  method: ReferenceMethod;
  t: Record<string, string>;
  router: ReturnType<typeof useRouter>;
}) {
  const [reference, setReference] = useState("");
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = () => {
    if (reference.trim().length < 3) {
      setError(
        t.referenceTooShort ?? "Reference must be at least 3 characters.",
      );
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await createBookingReferencePayment({
        bookingId: booking.id,
        method: REFERENCE_ENUM[method],
        reference: reference.trim(),
      });
      if (res.ok) {
        toast.success(
          t.referenceSuccess ??
            "Reference recorded. We verify within 24 hours and confirm your booking.",
        );
        router.push(`/${lang}/bookings/${booking.id}`);
      } else {
        toast.error(`${t.cardErrorPrefix ?? "Payment failed"}: ${res.error}`);
      }
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t.referenceInstruction ??
          "Pay in your wallet or bank app, then enter the transaction reference here. An admin verifies within 24 hours."}
      </p>
      <div className="space-y-2">
        <Label htmlFor="reference-input" className="text-sm">
          {t.referenceLabel ?? "Transaction reference"}
        </Label>
        <Input
          id="reference-input"
          type="text"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder={t.referencePlaceholder ?? "e.g. TXN-2026-049238"}
          disabled={submitting}
          maxLength={200}
        />
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <Button
        type="button"
        size="lg"
        className="w-full bg-[#E91E63] hover:bg-[#D81B60] text-white"
        disabled={submitting}
        onClick={onSubmit}
      >
        {submitting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            <Check className="w-4 h-4 me-2" />
            {t.referenceSubmit ?? "Submit reference"}
          </>
        )}
      </Button>
    </div>
  );
}

function CheckoutSummary({
  booking,
  currency,
  t,
}: {
  booking: BookingPayload;
  currency: string;
  t: Record<string, string>;
}) {
  const cover = booking.listing.photoUrls?.[0];
  const locationLabel = booking.listing.location
    ? `${booking.listing.location.city}, ${booking.listing.location.country}`
    : "";

  return (
    <aside className="border rounded-xl p-4 h-fit sticky top-24">
      {cover ? (
        <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden mb-3">
          <Image
            src={cover}
            alt={booking.listing.title ?? ""}
            fill
            sizes="360px"
            className="object-cover"
          />
        </div>
      ) : null}
      <div className="text-sm font-medium">{booking.listing.title}</div>
      <div className="text-sm text-muted-foreground mb-4">{locationLabel}</div>

      <h3 className="text-sm font-medium mb-2">
        {t.priceDetails ?? "Price details"}
      </h3>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span>
            {currency}
            {booking.nightlyRate} × {booking.nightsCount}{" "}
            {booking.nightsCount === 1
              ? (t.nightSingular ?? "night")
              : (t.nightsPlural ?? "nights")}
          </span>
          <span>
            {currency}
            {booking.subtotal}
          </span>
        </div>
        {booking.cleaningFee > 0 ? (
          <div className="flex justify-between">
            <span>{t.cleaningFee ?? "Cleaning fee"}</span>
            <span>
              {currency}
              {booking.cleaningFee}
            </span>
          </div>
        ) : null}
        <div className="flex justify-between">
          <span>{t.serviceFee ?? "Service fee"}</span>
          <span>
            {currency}
            {booking.serviceFee}
          </span>
        </div>
        <hr className="my-2" />
        <div className="flex justify-between font-medium">
          <span>{t.total ?? "Total"}</span>
          <span>
            {currency}
            {booking.totalPrice}
          </span>
        </div>
      </div>
    </aside>
  );
}
