import {
  listAllHomeBookingsAdmin,
  listAllTransportBookingsAdmin,
} from "@/lib/actions/admin-actions";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  HomeBookingsTable,
  TransportBookingsTable,
} from "@/components/admin/bookings-tables";

export default async function AdminBookingsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale = lang as "en" | "ar";
  const dict = await getDictionary(locale);
  const a = (dict as { admin?: Record<string, string> }).admin ?? {};

  const [homes, transport] = await Promise.all([
    listAllHomeBookingsAdmin(),
    listAllTransportBookingsAdmin(),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{a.bookings ?? "Bookings"}</h1>
        <p className="text-sm text-muted-foreground">
          {a.bookingsDescription ?? "All home and transport reservations."}
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
            <HomeBookingsTable
              lang={locale}
              bookings={homes.bookings}
              labels={{
                guest: a.guest ?? "Guest",
                listing: a.listing ?? "Listing",
                checkIn: a.checkIn ?? "Check in",
                checkOut: a.checkOut ?? "Check out",
                status: a.status ?? "Status",
                total: a.total ?? "Total",
                created: a.created ?? "Created",
              }}
            />
          </div>
        </TabsContent>
        <TabsContent value="transport">
          <div className="rounded-md border">
            <TransportBookingsTable
              lang={locale}
              bookings={transport.bookings}
              labels={{
                passenger: a.passenger ?? "Passenger",
                office: a.office ?? "Office",
                reference: a.reference ?? "Ref",
                status: a.status ?? "Status",
                total: a.total ?? "Total",
                created: a.created ?? "Created",
              }}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
