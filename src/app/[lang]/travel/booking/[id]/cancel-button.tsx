"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cancelBooking } from "@/lib/actions/travel-actions";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { formatCurrency } from "@/lib/i18n/formatters";

interface Props {
  bookingId: number;
  lang: string;
  /** Hours between now and departure — drives which refund the copy promises. */
  hoursBeforeDeparture: number;
}

/**
 * Guest-side cancellation for a bus booking.
 *
 * The server action and its refund policy (full 24h+ out, half between 24h and
 * 6h, nothing inside 6h) have existed since June with no way for a traveller to
 * reach them: nothing in the app called travel's cancelBooking, so a rider who
 * booked a seat could only phone the office, and no refund could ever be
 * triggered from the product. The Stays tab had its button; Travel never did.
 *
 * The confirm names the refund the policy will actually pay, computed from the
 * same thresholds the server uses, so nobody agrees to a cancellation expecting
 * money back inside the six-hour window.
 */
export default function CancelTravelBookingButton({
  bookingId,
  lang,
  hoursBeforeDeparture,
}: Props) {
  const dict = useDictionary();
  const t = dict.travel?.booking;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const refundNote =
    hoursBeforeDeparture >= 24
      ? (t?.refundFull ?? "You are more than 24 hours from departure, so any payment is refunded in full.")
      : hoursBeforeDeparture >= 6
        ? (t?.refundHalf ?? "You are within 24 hours of departure, so half of any payment is refunded.")
        : (t?.refundNone ?? "You are within 6 hours of departure, so no refund is due.");

  const onClick = () => {
    const ok = window.confirm(
      `${t?.cancelConfirm ?? "Cancel this booking? Your seats will be released."}\n\n${refundNote}`,
    );
    if (!ok) return;

    startTransition(async () => {
      try {
        const result = await cancelBooking(bookingId);
        const refunded = result?.refundAmount ?? 0;
        toast.success(
          refunded > 0
            ? `${t?.cancelled ?? "Booking cancelled"} — ${formatCurrency(refunded, lang === 'ar' ? 'ar' : 'en')}`
            : (t?.cancelled ?? "Booking cancelled"),
        );
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error && err.message
            ? err.message
            : (t?.couldNotCancel ?? "Could not cancel this booking."),
        );
      }
    });
  };

  return (
    <Button
      variant="outline"
      className="flex-1 text-destructive hover:text-destructive"
      onClick={onClick}
      disabled={isPending}
    >
      <X className="h-4 w-4 me-2" />
      {isPending
        ? (t?.cancelling ?? "Cancelling…")
        : (t?.cancelBooking ?? "Cancel booking")}
    </Button>
  );
}
