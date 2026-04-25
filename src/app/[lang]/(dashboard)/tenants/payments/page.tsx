import Link from "next/link";
import { CreditCard, Home, Clock, Check, AlertCircle } from "lucide-react";

import { auth } from "@/lib/auth";
import { getUserPayments } from "@/lib/actions/payment-actions";
import { getDictionary } from "@/components/internationalization/dictionaries";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PayButton } from "./pay-button";

// Force dynamic rendering because we depend on the session cookie.
export const dynamic = "force-dynamic";

type PaymentWithListing = {
  id: number;
  amountDue: number;
  amountPaid: number;
  dueDate: Date;
  paymentDate: Date;
  paymentStatus: "Pending" | "Paid" | "PartiallyPaid" | "Overdue";
  leaseId: number;
  lease: {
    id: number;
    listing: {
      id: number;
      title: string | null;
      location: { city: string; country: string } | null;
    };
  };
};

export default async function TenantPaymentsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return null; // Layout will redirect.
  }

  const dict = (await getDictionary(lang as "en" | "ar")) as unknown as Record<string, Record<string, string>>;
  const t = (dict.dashboard as Record<string, Record<string, string>> | undefined)?.payments ?? {};
  const currency = dict.common?.currency ?? "$";

  let payments: PaymentWithListing[] = [];
  try {
    const result = (await getUserPayments()) as { payments?: PaymentWithListing[] };
    payments = result?.payments ?? [];
  } catch {
    payments = [];
  }

  const now = new Date();
  const upcoming = payments.filter(
    (p) => p.paymentStatus !== "Paid" && new Date(p.dueDate) >= now
  );
  const overdue = payments.filter(
    (p) => p.paymentStatus !== "Paid" && new Date(p.dueDate) < now
  );
  const paid = payments.filter((p) => p.paymentStatus === "Paid");

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{t.title ?? "Payments"}</h1>
        <p className="text-sm text-muted-foreground">
          {t.subtitle ?? "Upcoming rent and past receipts."}
        </p>
      </div>

      {payments.length === 0 ? (
        <div className="rounded-xl border p-10 text-center">
          <Home className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {t.empty ?? "No payments yet. Rent shows up here after a manager approves your application."}
          </p>
          <Link
            href={`/${lang}/listings`}
            className="inline-block mt-4 rounded-md bg-[#E91E63] hover:bg-[#D81B60] text-white px-4 py-2 text-sm"
          >
            {t.browse ?? "Browse listings"}
          </Link>
        </div>
      ) : (
        <>
          {overdue.length > 0 && (
            <Section title={t.overdue ?? "Overdue"} icon={<AlertCircle className="w-5 h-5 text-red-600" />}>
              <PaymentsTable
                lang={lang}
                rows={overdue}
                currency={currency}
                t={t}
              />
            </Section>
          )}
          {upcoming.length > 0 && (
            <Section title={t.upcoming ?? "Upcoming"} icon={<Clock className="w-5 h-5 text-amber-600" />}>
              <PaymentsTable
                lang={lang}
                rows={upcoming}
                currency={currency}
                t={t}
              />
            </Section>
          )}
          {paid.length > 0 && (
            <Section title={t.paid ?? "Paid"} icon={<Check className="w-5 h-5 text-green-600" />}>
              <PaymentsTable
                lang={lang}
                rows={paid}
                currency={currency}
                t={t}
                isPast
              />
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-lg font-medium">{title}</h2>
      </div>
      <div className="rounded-xl border overflow-x-auto">{children}</div>
    </section>
  );
}

function PaymentsTable({
  lang,
  rows,
  currency,
  t,
  isPast,
}: {
  lang: string;
  rows: PaymentWithListing[];
  currency: string;
  t: Record<string, string>;
  isPast?: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.listing ?? "Listing"}</TableHead>
          <TableHead>{t.dueDate ?? "Due date"}</TableHead>
          <TableHead>{t.amount ?? "Amount"}</TableHead>
          <TableHead>{t.status ?? "Status"}</TableHead>
          {!isPast && <TableHead className="text-end">{t.action ?? "Action"}</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((p) => (
          <TableRow key={p.id}>
            <TableCell>
              <Link
                href={`/${lang}/listings/${p.lease.listing.id}`}
                className="hover:underline font-medium"
              >
                {p.lease.listing.title ?? "Untitled"}
              </Link>
              {p.lease.listing.location && (
                <div className="text-xs text-muted-foreground">
                  {p.lease.listing.location.city}, {p.lease.listing.location.country}
                </div>
              )}
            </TableCell>
            <TableCell>{new Date(p.dueDate).toLocaleDateString()}</TableCell>
            <TableCell className="font-medium">
              {currency}
              {p.amountDue.toLocaleString()}
            </TableCell>
            <TableCell>
              <Badge variant={p.paymentStatus === "Paid" ? "default" : "outline"}>
                {p.paymentStatus}
              </Badge>
            </TableCell>
            {!isPast && (
              <TableCell className="text-end">
                <PayButton paymentId={p.id} dict={t} />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
