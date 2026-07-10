"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { verifyPayment } from "@/lib/actions/travel-actions";
import { useLocale } from "@/components/internationalization/use-locale";
import { formatCurrency } from "@/lib/i18n/formatters";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type HomePayment = {
  id: number;
  amountDue: number;
  amountPaid: number;
  dueDate: Date;
  paymentDate: Date | null;
  paymentStatus: string;
  lease: {
    id: number;
    tenant: { userId: string; name: string } | null;
    listing: { id: number; title: string | null };
  };
};

type TransportPayment = {
  id: number;
  amount: number;
  status: string;
  method: string;
  createdAt: Date;
  booking: {
    id: number;
    user: { id: string; email: string };
    office: { id: number; name: string };
  };
};

type HomeLabels = {
  listing: string;
  tenant: string;
  due: string;
  paid: string;
  dueDate: string;
  paidAt: string;
  status: string;
};

type TransportLabels = {
  office: string;
  user: string;
  amount: string;
  method: string;
  status: string;
  created: string;
  actions: string;
  approve: string;
  reject: string;
  approved: string;
  rejected: string;
};

export function HomePaymentsTable({
  payments,
  labels,
}: {
  payments: HomePayment[];
  labels: HomeLabels;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labels.listing}</TableHead>
          <TableHead>{labels.tenant}</TableHead>
          <TableHead className="text-end">{labels.due}</TableHead>
          <TableHead className="text-end">{labels.paid}</TableHead>
          <TableHead>{labels.dueDate}</TableHead>
          <TableHead>{labels.paidAt}</TableHead>
          <TableHead>{labels.status}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="text-sm">
              {p.lease.listing.title ?? `#${p.lease.listing.id}`}
            </TableCell>
            <TableCell className="text-sm">{p.lease.tenant?.name ?? "—"}</TableCell>
            <TableCell className="text-end text-sm">${p.amountDue.toFixed(0)}</TableCell>
            <TableCell className="text-end text-sm">${p.amountPaid.toFixed(0)}</TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {new Date(p.dueDate).toLocaleDateString()}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : "—"}
            </TableCell>
            <TableCell>
              <Badge variant="outline">{p.paymentStatus}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function TransportPaymentsTable({
  payments,
  labels,
}: {
  payments: TransportPayment[];
  labels: TransportLabels;
}) {
  const router = useRouter();
  const { locale } = useLocale();
  const [pending, startTransition] = useTransition();
  const [actingId, setActingId] = useState<number | null>(null);

  function handleVerify(paymentId: number, approve: boolean) {
    setActingId(paymentId);
    startTransition(async () => {
      try {
        const res = await verifyPayment(paymentId, approve);
        if (res.success) {
          toast.success(approve ? labels.approved : labels.rejected);
          router.refresh();
        } else {
          toast.error("Action failed");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Error verifying payment");
      } finally {
        setActingId(null);
      }
    });
  }

  if (payments.length === 0) {
    return <p className="p-6 text-sm text-muted-foreground">{labels.actions === "Actions" ? "No travel payments yet." : "لا توجد مدفوعات رحلات بعد."}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labels.office}</TableHead>
          <TableHead>{labels.user}</TableHead>
          <TableHead className="text-end">{labels.amount}</TableHead>
          <TableHead>{labels.method}</TableHead>
          <TableHead>{labels.status}</TableHead>
          <TableHead>{labels.created}</TableHead>
          <TableHead className="text-end">{labels.actions}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((p) => {
          const isPending = p.status === "Pending";
          const busy = pending && actingId === p.id;
          return (
            <TableRow key={p.id}>
              <TableCell className="text-sm">{p.booking.office.name}</TableCell>
              <TableCell className="text-sm">{p.booking.user.email}</TableCell>
              <TableCell className="text-end text-sm">
                {formatCurrency(p.amount, locale)}
              </TableCell>
              <TableCell className="text-sm">{p.method}</TableCell>
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
