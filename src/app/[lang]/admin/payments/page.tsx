import {
  listAllBookingPaymentsAdmin,
  listAllHomePaymentsAdmin,
  listAllTransportPaymentsAdmin,
} from "@/lib/actions/admin-actions";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  HomePaymentsTable,
  TransportPaymentsTable,
} from "@/components/admin/payments-tables";
import { BookingPaymentsTable } from "@/components/admin/booking-payments-table";

export default async function AdminPaymentsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const dict = await getDictionary(lang as "en" | "ar");
  const a = (dict as { admin?: Record<string, string> }).admin ?? {};

  const [bookings, homes, transport] = await Promise.all([
    listAllBookingPaymentsAdmin(),
    listAllHomePaymentsAdmin(),
    listAllTransportPaymentsAdmin(),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{a.payments ?? "Payments"}</h1>
        <p className="text-sm text-muted-foreground">
          {a.paymentsDescription ?? "Home lease payments and transport fares."}
        </p>
      </header>
      <Tabs defaultValue="bookings" className="w-full">
        <TabsList>
          <TabsTrigger value="bookings">
            {a.tabBookings ?? "Bookings"}
            {bookings.pendingCount > 0
              ? ` (${bookings.pendingCount} ${a.pending ?? "pending"})`
              : ` (${bookings.total})`}
          </TabsTrigger>
          <TabsTrigger value="homes">
            {a.tabHomes ?? "Homes"} ({homes.total})
          </TabsTrigger>
          <TabsTrigger value="transport">
            {a.tabTransport ?? "Travel"} ({transport.total})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="bookings">
          <div className="rounded-md border">
            <BookingPaymentsTable
              payments={bookings.payments}
              labels={{
                listing: a.listing ?? "Listing",
                guest: a.guest ?? "Guest",
                amount: a.amount ?? "Amount",
                method: a.method ?? "Method",
                reference: a.reference ?? "Reference",
                status: a.status ?? "Status",
                created: a.created ?? "Created",
                actions: a.actions ?? "Actions",
                approve: a.approve ?? "Approve",
                reject: a.reject ?? "Reject",
                empty: a.noBookingPayments ?? "No booking payments yet.",
                approved: a.paymentApproved ?? "Payment approved — booking confirmed.",
                rejected: a.paymentRejected ?? "Payment rejected.",
              }}
            />
          </div>
        </TabsContent>
        <TabsContent value="homes">
          <div className="rounded-md border">
            <HomePaymentsTable
              payments={homes.payments}
              labels={{
                listing: a.listing ?? "Listing",
                tenant: a.tenant ?? "Tenant",
                due: a.amountDue ?? "Due",
                paid: a.amountPaid ?? "Paid",
                dueDate: a.dueDate ?? "Due date",
                paidAt: a.paidAt ?? "Paid at",
                status: a.status ?? "Status",
              }}
            />
          </div>
        </TabsContent>
        <TabsContent value="transport">
          <div className="rounded-md border">
            <TransportPaymentsTable
              payments={transport.payments}
              labels={{
                office: a.office ?? "Office",
                user: a.user ?? "User",
                amount: a.amount ?? "Amount",
                method: a.method ?? "Method",
                status: a.status ?? "Status",
                created: a.created ?? "Created",
                actions: a.actions ?? "Actions",
                approve: a.approve ?? "Approve",
                reject: a.reject ?? "Reject",
                approved: a.paymentApproved ?? "Payment approved — booking confirmed.",
                rejected: a.paymentRejected ?? "Payment rejected.",
                actionFailed: a.actionError ?? "Action failed",
              }}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
