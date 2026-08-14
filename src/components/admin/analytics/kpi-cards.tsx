import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/i18n/formatters";
import { cn } from "@/lib/utils";
import type { AnalyticsLabels, SectionProps } from "./types";
import { fill } from "./types";

interface Kpi {
  label: string;
  value: string;
  sub?: string;
  change?: number | null;
}

function Delta({
  change,
  labels,
  days,
  locale,
}: {
  change: number | null | undefined;
  labels: AnalyticsLabels;
  days: number;
  locale: "en" | "ar";
}) {
  // `undefined` means this metric has no comparison at all; `null` means it has
  // one but the baseline was zero. Both render as text, never as a green 0%.
  if (change === undefined) return null;
  if (change === null) {
    return <p className="mt-1 text-xs text-muted-foreground">{labels.noBaseline}</p>;
  }

  const flat = Math.abs(change) < 0.05;
  const Icon = flat ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <p
      className={cn(
        "mt-1 flex items-center gap-1 text-xs",
        flat ? "text-muted-foreground" : change > 0 ? "text-emerald-600" : "text-destructive",
      )}
    >
      <Icon className="h-3 w-3 shrink-0 rtl:-scale-x-100" aria-hidden />
      <span className="tabular-nums">
        {formatNumber(Math.round(Math.abs(change) * 10) / 10, locale)}%
      </span>
      <span className="text-muted-foreground">{fill(labels.vsPrevious ?? "", { days })}</span>
    </p>
  );
}

function KpiGrid({
  title,
  items,
  labels,
  days,
  locale,
}: {
  title: string;
  items: Kpi[];
  labels: AnalyticsLabels;
  days: number;
  locale: "en" | "ar";
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{title}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{k.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums">{k.value}</div>
              {k.sub ? <p className="mt-1 text-xs text-muted-foreground">{k.sub}</p> : null}
              <Delta change={k.change} labels={labels} days={days} locale={locale} />
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function KpiCards({ data, labels, locale }: SectionProps) {
  const num = (v: number) => formatNumber(v, locale);
  const rate = (v: number | null) =>
    v === null ? "—" : formatNumber(Math.round(v * 10) / 10, locale);
  // A missing rate has no unit — rendering it as "—%" reads like a real
  // measurement that happens to be unprintable.
  const ratePct = (v: number | null) => (v === null ? "—" : `${rate(v)}%`);
  const days = data.period.days;

  return (
    <div className="space-y-8">
      <KpiGrid
        title={labels.supplyTitle ?? ""}
        labels={labels}
        days={days}
        locale={locale}
        items={[
          { label: labels.activeListings ?? "", value: num(data.supply.activeListings) },
          { label: labels.newListings ?? "", value: num(data.supply.newListings) },
          { label: labels.staleListings ?? "", value: num(data.supply.staleListings) },
          { label: labels.unclaimed ?? "", value: num(data.supply.unclaimedImported) },
        ]}
      />

      <KpiGrid
        title={labels.demandTitle ?? ""}
        labels={labels}
        days={days}
        locale={locale}
        items={[
          {
            label: labels.stageViews ?? "",
            value: num(data.demand.views),
            sub: `${num(data.demand.rawViews)} ${labels.rawViews}`,
            change: data.changes.views,
          },
          { label: labels.uniqueVisitors ?? "", value: num(data.demand.uniqueVisitors) },
          {
            label: labels.stageInquiries ?? "",
            value: num(data.demand.inquiries),
            change: data.changes.inquiries,
          },
          { label: labels.viewsPerListing ?? "", value: rate(data.rates.viewsPerListing) },
        ]}
      />

      <KpiGrid
        title={labels.conversionTitle ?? ""}
        labels={labels}
        days={days}
        locale={locale}
        items={[
          { label: labels.viewToInquiry ?? "", value: ratePct(data.rates.viewToInquiry) },
          { label: labels.inquiryToVisit ?? "", value: ratePct(data.rates.inquiryToVisit) },
          { label: labels.visitToRental ?? "", value: ratePct(data.rates.visitToRental) },
          { label: labels.inquiryToRental ?? "", value: ratePct(data.rates.inquiryToRental) },
        ]}
      />

      <KpiGrid
        title={labels.transactionsTitle ?? ""}
        labels={labels}
        days={days}
        locale={locale}
        items={[
          {
            label: labels.completedRentals ?? "",
            value: num(data.transactions.rentals),
            sub: `${num(data.transactions.fromBookings)} ${labels.fromBookings} · ${num(data.transactions.fromLeases)} ${labels.fromLeases}`,
            change: data.changes.rentals,
          },
          {
            label: labels.stageVisits ?? "",
            value: num(data.counts.visits),
            change: data.changes.visits,
          },
          { label: labels.inquiriesPerListing ?? "", value: rate(data.rates.inquiriesPerListing) },
        ]}
      />
    </div>
  );
}
