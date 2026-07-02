"use client";

// Admin queue for short-term Booking payments. The reference rails
// (Bankak / Cashi / mobile money / bank transfer) land here as
// `PendingVerification`; an admin Approves (→ Paid + Booking Confirmed + guest
// email) or Rejects (→ Failed) via the `verifyBookingPayment` server action.
// Without this surface, every Sudanese reference payment stalls forever — it is
// the launch-critical money-path UI for the no-card market.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { verifyBookingPayment } from "@/lib/actions/payment-actions";
import { useLocale } from "@/components/internationalization/use-locale";
import { formatCurrency } from "@/lib/i18n/formatters";

type BookingPaymentRow = {
  id: number;
  amount: number;
  method: string;
  status: string;
  reference: string | null;
  createdAt: Date;
  booking: {
    id: number;
    guest: { id: string; email: string; username: string | null };
    listing: { id: number; title: string | null };
  };
};

type Labels = {
  listing: string;
  guest: string;
  amount: string;
  method: string;
  reference: string;
  status: string;
  created: string;
  actions: string;
  approve: string;
  reject: string;
  empty: string;
  approved: string;
  rejected: string;
};

export function BookingPaymentsTable({
  payments,
  labels,
}: {
  payments: BookingPaymentRow[];
  labels: Labels;
}) {
  const router = useRouter();
  const { locale } = useLocale();
  const [pending, startTransition] = useTransition();
  const [actingId, setActingId] = useState<number | null>(null);

  function handleVerify(bookingPaymentId: number, approve: boolean) {
    setActingId(bookingPaymentId);
    startTransition(async () => {
      const res = await verifyBookingPayment({ bookingPaymentId, approve });
      if (res.ok) {
        toast.success(approve ? labels.approved : labels.rejected);
        router.refresh();
      } else {
        toast.error(res.error ?? "error");
      }
      setActingId(null);
    });
  }

  if (payments.length === 0) {
    return <p className="p-6 text-sm text-muted-foreground">{labels.empty}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labels.listing}</TableHead>
          <TableHead>{labels.guest}</TableHead>
          <TableHead className="text-end">{labels.amount}</TableHead>
          <TableHead>{labels.method}</TableHead>
          <TableHead>{labels.reference}</TableHead>
          <TableHead>{labels.status}</TableHead>
          <TableHead>{labels.created}</TableHead>
          <TableHead className="text-end">{labels.actions}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((p) => {
          const isPending = p.status === "PendingVerification";
          const busy = pending && actingId === p.id;
          return (
            <TableRow key={p.id}>
              <TableCell className="text-sm">
                {p.booking.listing.title ?? `#${p.booking.listing.id}`}
              </TableCell>
              <TableCell className="text-sm">
                {p.booking.guest.username ?? p.booking.guest.email}
              </TableCell>
              <TableCell className="text-end text-sm">
                {formatCurrency(p.amount, locale)}
              </TableCell>
              <TableCell className="text-sm">{p.method}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {p.reference ?? "—"}
              </TableCell>
              <TableCell>
                <Badge variant={isPending ? "secondary" : "outline"}>
                  {p.status}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {new Date(p.createdAt).toLocaleDateString()}
              </TableCell>
              <TableCell className="text-end">
                {isPending ? (
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => handleVerify(p.id, true)}
                    >
                      {labels.approve}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => handleVerify(p.id, false)}
                    >
                      {labels.reject}
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
