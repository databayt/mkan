"use client";

// Stripe Card Element wrapper for transport-booking checkout. The parent
// (transport/booking/checkout/content.tsx) mounts this when the user picks
// the card method (diaspora only — Stripe can't serve Sudan). On mount we
// create a TransportPayment + PaymentIntent server-side, then render
// <PaymentElement /> against the resulting clientSecret. handleStripeWebhook
// (payment-actions.ts) flips TransportPayment to Paid, the booking to
// Confirmed, and the seats to Booked when payment_intent.succeeded arrives
// with metadata.kind === "transport_booking".

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createTransportPaymentIntent } from "@/lib/actions/payment-actions";
import { formatCurrency } from "@/lib/i18n/formatters";
import type { Locale } from "@/components/internationalization/config";

const stripePromise: Promise<Stripe | null> | null = (() => {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY;
  return key ? loadStripe(key) : null;
})();

export interface TransportCardCheckoutLabels {
  pay: string;
  processing: string;
  loading: string;
  configMissing: string;
  errorPrefix: string;
}

interface TransportCardCheckoutProps {
  bookingId: number;
  amount: number;
  currency: string;
  labels: TransportCardCheckoutLabels;
  onSuccess: () => void;
}

export function TransportCardCheckout(props: TransportCardCheckoutProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    if (!stripePromise) return;
    let cancelled = false;
    createTransportPaymentIntent({ bookingId: props.bookingId }).then((res) => {
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

function CardForm(props: TransportCardCheckoutProps) {
  const params = useParams();
  const locale = ((params?.lang as string) ?? "en") as Locale;
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
    // redirect. The booking page reflects Confirmed once the webhook lands.
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
      <Button type="submit" size="lg" className="w-full" disabled={!stripe || submitting}>
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin me-2" />
            {props.labels.processing}
          </>
        ) : (
          <>
            {props.labels.pay} {formatCurrency(props.amount, locale, props.currency)}
          </>
        )}
      </Button>
    </form>
  );
}
