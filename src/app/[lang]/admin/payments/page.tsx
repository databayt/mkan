import {
  listAllHomePaymentsAdmin,
  listAllTransportPaymentsAdmin,
} from "@/lib/actions/admin-actions";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  HomePaymentsTable,
  TransportPaymentsTable,
} from "@/components/admin/payments-tables";

export default async function AdminPaymentsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale = lang as "en" | "ar";
  const dict = await getDictionary(locale);
  const a = (dict as { admin?: Record<string, string> }).admin ?? {};

  const [homes, transport] = await Promise.all([
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
      <Tabs defaultValue="homes" className="w-full">
        <TabsList>
          <TabsTrigger value="homes">
            {a.tabHomes ?? "Homes"} ({homes.total})
          </TabsTrigger>
          <TabsTrigger value="transport">
            {a.tabTransport ?? "Transport"} ({transport.total})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="homes">
          <div className="rounded-md border">
            <HomePaymentsTable
              lang={locale}
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
              lang={locale}
              payments={transport.payments}
              labels={{
                office: a.office ?? "Office",
                user: a.user ?? "User",
                amount: a.amount ?? "Amount",
                method: a.method ?? "Method",
                status: a.status ?? "Status",
                created: a.created ?? "Created",
              }}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
