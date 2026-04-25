import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Metrics = {
  users: number;
  listings: number;
  publishedListings: number;
  offices: number;
  activeOffices: number;
  homeBookings: number;
  transportBookings: number;
  revenueHomes: number;
  revenueTransport: number;
};

type MetricsLabels = {
  users: string;
  listings: string;
  listingsPublished: string;
  offices: string;
  officesActive: string;
  homeBookings: string;
  transportBookings: string;
  revenueHomes: string;
  revenueTransport: string;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function MetricsCards({
  metrics,
  labels,
}: {
  metrics: Metrics;
  labels: MetricsLabels;
}) {
  const cards = [
    { label: labels.users, value: metrics.users.toLocaleString() },
    {
      label: labels.listings,
      value: metrics.listings.toLocaleString(),
      sub: `${metrics.publishedListings.toLocaleString()} ${labels.listingsPublished}`,
    },
    {
      label: labels.offices,
      value: metrics.offices.toLocaleString(),
      sub: `${metrics.activeOffices.toLocaleString()} ${labels.officesActive}`,
    },
    { label: labels.homeBookings, value: metrics.homeBookings.toLocaleString() },
    { label: labels.transportBookings, value: metrics.transportBookings.toLocaleString() },
    { label: labels.revenueHomes, value: formatMoney(metrics.revenueHomes) },
    { label: labels.revenueTransport, value: formatMoney(metrics.revenueTransport) },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {c.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{c.value}</div>
            {c.sub ? <p className="text-xs text-muted-foreground mt-1">{c.sub}</p> : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
