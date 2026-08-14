import { getMarketplaceAnalytics } from "@/lib/actions/analytics-actions";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { formatDate } from "@/lib/i18n/formatters";
import { BottleneckBanner } from "@/components/admin/analytics/bottleneck-banner";
import { Breakdowns } from "@/components/admin/analytics/breakdowns";
import { FunnelStrip } from "@/components/admin/analytics/funnel-strip";
import { KpiCards } from "@/components/admin/analytics/kpi-cards";
import { RangeTabs } from "@/components/admin/analytics/range-tabs";
import { TrendChart } from "@/components/admin/analytics/trend-chart";
import { ZoneTable } from "@/components/admin/analytics/zone-table";
import { fill, type AnalyticsLabels } from "@/components/admin/analytics/types";

/**
 * Marketplace funnel dashboard.
 *
 * Dynamic rather than cached: it is admin-only, behind a role gate, read by a
 * handful of people a day, and the entire point is that the number is current.
 * An ISR window here would mean someone acts on a stale bottleneck.
 */
export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { lang } = await params;
  const query = await searchParams;
  const locale = (lang === "ar" ? "ar" : "en") as "en" | "ar";

  const dict = await getDictionary(locale);
  const labels = ((dict as { adminAnalytics?: AnalyticsLabels }).adminAnalytics ??
    {}) as AnalyticsLabels;

  // PropertyType labels already exist and are build-gated for enum coverage —
  // reuse them rather than adding a second set that could drift.
  const typeLabels =
    ((dict as { rental?: { property?: { types?: Record<string, string> } } }).rental?.property
      ?.types ?? {}) as Record<string, string>;

  const data = await getMarketplaceAnalytics(query);
  const section = { data, labels, locale };

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{labels.title}</h1>
          <p className="text-sm text-muted-foreground">{labels.description}</p>
        </div>
        <RangeTabs labels={labels} active={data.period.rangeKey} />
      </header>

      <BottleneckBanner {...section} />
      <FunnelStrip {...section} />
      <KpiCards {...section} />
      <TrendChart trend={data.trend} labels={labels} locale={locale} />
      <ZoneTable data={data} labels={labels} locale={locale} />
      <Breakdowns {...section} lang={lang} typeLabels={typeLabels} />

      {/* States plainly that transaction counts start at the epoch, so nobody
          reads "0 rentals" as a system fault or as the whole history. */}
      <p className="text-xs text-muted-foreground">
        {fill(labels.dataSince ?? "", {
          date: formatDate(new Date(data.epoch), locale, {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
        })}
      </p>
    </div>
  );
}
