"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelBooking } from "@/lib/actions/booking-actions";

interface Props {
  bookingId: number;
  lang: string;
  dict: Record<string, Record<string, string>>;
}

export default function CancelBookingButton({ bookingId, lang, dict }: Props) {
  const t = dict.booking ?? {};
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const onClick = () => {
    const confirm = window.confirm(
      t.cancelConfirm ?? "Are you sure you want to cancel this booking?"
    );
    if (!confirm) return;

    startTransition(async () => {
      try {
        await cancelBooking(bookingId);
        toast.success(t.cancelled ?? "Booking cancelled");
        router.refresh();
        // Fall back to trips page after the refresh so the guest sees the
        // updated list even if this page's Cancelled badge isn't enough.
        router.push(`/${lang}/tenants/trips`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not cancel");
      }
    });
  };

  return (
    <Button variant="outline" onClick={onClick} disabled={isPending}>
      {isPending ? "…" : (t.cancel ?? "Cancel booking")}
    </Button>
  );
}
