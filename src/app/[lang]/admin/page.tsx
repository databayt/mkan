import { getPlatformMetrics } from "@/lib/actions/admin-actions";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { MetricsCards } from "@/components/admin/metrics-cards";

export default async function AdminOverviewPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const dict = await getDictionary(lang as "en" | "ar");
  const a = (dict as { admin?: Record<string, string> }).admin ?? {};
  const metrics = await getPlatformMetrics();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{a.overview ?? "Overview"}</h1>
        <p className="text-sm text-muted-foreground">
          {a.overviewDescription ?? "Cross-platform metrics and health."}
        </p>
      </header>
      <MetricsCards
        metrics={metrics}
        labels={{
          users: a.metricUsers ?? "Users",
          listings: a.metricListings ?? "Listings",
          listingsPublished: a.metricListingsPublished ?? "published",
          offices: a.metricOffices ?? "Transport offices",
          officesActive: a.metricOfficesActive ?? "active",
          homeBookings: a.metricHomeBookings ?? "Home bookings",
          transportBookings: a.metricTransportBookings ?? "Transport bookings",
          revenueHomes: a.metricRevenueHomes ?? "Home revenue",
          revenueTransport: a.metricRevenueTransport ?? "Transport revenue",
        }}
      />
    </div>
  );
}
