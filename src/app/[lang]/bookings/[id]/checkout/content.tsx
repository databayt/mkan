"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { BookingPayload } from "./page";

type PaymentMethod = "card" | "cash";

interface Props {
  lang: string;
  booking: BookingPayload;
  dict: Record<string, Record<string, string>>;
}

export default function BookingCheckoutContent({ lang, booking, dict }: Props) {
  const t = dict.booking ?? {};
  const currency = dict.common?.currency ?? "$";
  const router = useRouter();

  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [isPending, startTransition] = useTransition();

  const onSubmit = () => {
    startTransition(() => {
      // Phase 1: card flow is a stub. Stripe lands in Phase 3 (P1 epic).
      // Cash flow simply leaves the booking Pending (host will confirm).
      if (method === "card") {
        toast.info(t.cardSoon ?? "Card payment coming soon. Using cash for now.");
      }
      router.push(`/${lang}/bookings/${booking.id}`);
    });
  };

  const checkIn = new Date(booking.checkIn).toLocaleDateString();
  const checkOut = new Date(booking.checkOut).toLocaleDateString();
  const locationLabel = booking.listing.location
    ? `${booking.listing.location.city}, ${booking.listing.location.country}`
    : "";
  const cover = booking.listing.photoUrls?.[0];

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
                <span>{checkIn}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t.checkOut ?? "Check-out"}</span>
                <span>{checkOut}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t.guests ?? "Guests"}</span>
                <span>{booking.guestCount}</span>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-medium mb-3">{t.paymentMethod ?? "Payment method"}</h2>
            <RadioGroup value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <div className="flex items-center space-s-2 rounded-lg border p-3">
                <RadioGroupItem value="cash" id="method-cash" />
                <Label htmlFor="method-cash" className="ms-3">
                  {t.cash ?? "Pay on arrival"}
                </Label>
              </div>
              <div className="flex items-center space-s-2 rounded-lg border p-3">
                <RadioGroupItem value="card" id="method-card" />
                <Label htmlFor="method-card" className="ms-3">
                  {t.card ?? "Credit / Debit card"}
                </Label>
              </div>
            </RadioGroup>
          </section>

          <Button
            size="lg"
            className="w-full bg-[#E91E63] hover:bg-[#D81B60] text-white"
            disabled={isPending}
            onClick={onSubmit}
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Check className="w-4 h-4 me-2" />
                {t.confirmAndPay ?? "Confirm and pay"}
              </>
            )}
          </Button>
        </div>

        {/* Summary sidebar */}
        <aside className="border rounded-xl p-4 h-fit sticky top-24">
          {cover && (
            <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden mb-3">
              <Image
                src={cover}
                alt={booking.listing.title ?? ""}
                fill
                sizes="360px"
                className="object-cover"
              />
            </div>
          )}
          <div className="text-sm font-medium">{booking.listing.title}</div>
          <div className="text-sm text-muted-foreground mb-4">{locationLabel}</div>

          <h3 className="text-sm font-medium mb-2">{t.priceDetails ?? "Price details"}</h3>
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
            {booking.cleaningFee > 0 && (
              <div className="flex justify-between">
                <span>{t.cleaningFee ?? "Cleaning fee"}</span>
                <span>
                  {currency}
                  {booking.cleaningFee}
                </span>
              </div>
            )}
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
      </div>
    </div>
  );
}
