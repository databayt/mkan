"use client";

// Stripe Card Element wrapper for short-term Booking checkout. The parent
// (bookings/[id]/checkout/content.tsx) mounts this when the user picks the
// "Card" method. On mount we create a BookingPayment + PaymentIntent
// server-side, then render <PaymentElement /> against the resulting
// clientSecret. handleStripeWebhook (payment-actions.ts) flips
// BookingPayment.status to Paid and Booking.status to Confirmed when
// payment_intent.succeeded arrives with metadata.kind === "booking_payment".

import { useEffect, useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createBookingPaymentIntent } from "@/lib/actions/payment-actions";

// loadStripe must be called outside the component tree so the Stripe.js
// script isn't re-downloaded on every render. Returning null disables the
// integration cleanly when the env var is absent (the wrapper renders the
// `configMissing` fallback instead of crashing).
const stripePromise: Promise<Stripe | null> | null = (() => {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY;
  return key ? loadStripe(key) : null;
})();

export interface CardCheckoutLabels {
  pay: string;
  processing: string;
  loading: string;
  configMissing: string;
  errorPrefix: string;
}

interface CardCheckoutProps {
  bookingId: number;
  amount: number;
  currency: string;
  labels: CardCheckoutLabels;
  onSuccess: () => void;
}

export function CardCheckout(props: CardCheckoutProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    if (!stripePromise) return;
    let cancelled = false;
    createBookingPaymentIntent({ bookingId: props.bookingId }).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setClientSecret(res.clientSecret ?? null);
      } else {
        setInitError(res.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [props.bookingId]);

  if (!stripePromise) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {props.labels.configMissing}
      </p>
    );
  }

  if (initError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {props.labels.errorPrefix}: {initError}
      </p>
    );
  }

  if (!clientSecret) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        {props.labels.loading}
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <CardForm {...props} />
    </Elements>
  );
}

function CardForm(props: CardCheckoutProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    // `redirect: 'if_required'` keeps single-page SCA/3DS in a modal when
    // possible; we only navigate away if the bank insists on a full
    // redirect. The booking page will reflect Confirmed once the webhook
    // delivers (usually <1s in prod, longer in dev w/ Stripe CLI).
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url:
          typeof window !== "undefined" ? window.location.href : undefined,
      },
      redirect: "if_required",
    });

    if (result.error) {
      setError(result.error.message ?? props.labels.errorPrefix);
      setSubmitting(false);
      return;
    }

    // No error + no redirect ⇒ confirmed inline. Hand off to the parent
    // (typically a router.push to /bookings/[id]).
    props.onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        size="lg"
        className="w-full bg-[#E91E63] hover:bg-[#D81B60] text-white"
        disabled={!stripe || submitting}
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin me-2" />
            {props.labels.processing}
          </>
        ) : (
          <>
            {props.labels.pay} {props.currency}
            {props.amount}
          </>
        )}
      </Button>
    </form>
  );
}
