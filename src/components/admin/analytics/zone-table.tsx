import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber } from "@/lib/i18n/formatters";
import { zoneLabel } from "@/lib/geo/zone";
import { cn } from "@/lib/utils";
import type { MarketplaceAnalytics } from "@/lib/actions/analytics-actions";
import type { AnalyticsLabels } from "./types";
import { fill } from "./types";

/**
 * The supply/demand density table and the acquisition shortlist — the answer to
 * "where do we need more homes?".
 *
 * Zones come pre-classified from the server; this only presents them. The
 * status column carries the whole decision: a coloured word per quadrant plus a
 * tooltip spelling out the instruction, because the point is that someone reads
 * one column and knows where to send the field team.
 */

const QUADRANT_STYLE: Record<string, { labelKey: string; hintKey: string; tone: string }> = {
  "high-demand-low-supply": { labelKey: "quadAcquire", hintKey: "quadAcquireHint", tone: "text-amber-600" },
  "high-demand-healthy-supply": { labelKey: "quadHold", hintKey: "quadHoldHint", tone: "text-emerald-600" },
  "low-demand-high-supply": { labelKey: "quadOversupplied", hintKey: "quadOversuppliedHint", tone: "text-muted-foreground" },
  "low-demand-low-supply": { labelKey: "quadMonitor", hintKey: "quadMonitorHint", tone: "text-muted-foreground" },
  "insufficient-data": { labelKey: "quadUnknown", hintKey: "quadUnknownHint", tone: "text-muted-foreground/70" },
};

export function ZoneTable({
  data,
  labels,
  locale,
}: {
  data: MarketplaceAnalytics;
  labels: AnalyticsLabels;
  locale: "en" | "ar";
}) {
  const { zoneReport } = data;
  const num = (v: number) => formatNumber(v, locale);
  const rate = (v: number | null) =>
    v === null ? "—" : formatNumber(Math.round(v * 10) / 10, locale);

  const name = (key: string): string =>
    key === "UNZONED" ? (labels.unzoned ?? key) : (zoneLabel(key, locale) ?? key);

  const median =
    zoneReport.medianViewsPerListing === null
      ? (labels.medianUnknown ?? "—")
      : rate(zoneReport.medianViewsPerListing);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">{labels.zonesTitle}</CardTitle>
          <p className="text-xs text-muted-foreground">{labels.zonesNote}</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.colZone}</TableHead>
                <TableHead className="text-end">{labels.colSupply}</TableHead>
                <TableHead className="text-end">{labels.colViews}</TableHead>
                <TableHead className="text-end">{labels.colViewsPerListing}</TableHead>
                <TableHead className="text-end">{labels.colInquiries}</TableHead>
                <TableHead className="text-end">{labels.colRentals}</TableHead>
                <TableHead>{labels.colStatus}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {zoneReport.zones.map((z) => {
                const style = QUADRANT_STYLE[z.quadrant] ?? QUADRANT_STYLE["insufficient-data"]!;
                return (
                  <TableRow key={z.key}>
                    <TableCell className="font-medium">{name(z.key)}</TableCell>
                    <TableCell className="text-end tabular-nums">{num(z.listings)}</TableCell>
                    <TableCell className="text-end tabular-nums">{num(z.views)}</TableCell>
                    <TableCell className="text-end tabular-nums">{rate(z.viewsPerListing)}</TableCell>
                    <TableCell className="text-end tabular-nums">{num(z.inquiries)}</TableCell>
                    <TableCell className="text-end tabular-nums">{num(z.rentals)}</TableCell>
                    <TableCell>
                      <span
                        className={cn("text-xs font-medium", style.tone)}
                        title={labels[style.hintKey]}
                      >
                        {labels[style.labelKey]}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground/70">
            {fill(labels.methodNote ?? "", {
              median,
              supply: num(zoneReport.thresholds.healthySupply),
            })}
          </p>
        </CardContent>
      </Card>

      <Card className="border-s-4 border-s-amber-500">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">{labels.recommendTitle}</CardTitle>
          <p className="text-xs text-muted-foreground">{labels.recommendNote}</p>
        </CardHeader>
        <CardContent>
          {zoneReport.targets.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">{labels.recommendEmpty}</p>
          ) : (
            <ol className="space-y-2">
              {zoneReport.targets.map((z, i) => (
                <li key={z.key} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-xs font-semibold text-amber-700 tabular-nums">
                    {formatNumber(i + 1, locale)}
                  </span>
                  <span>
                    {fill(labels.recommendLine ?? "", {
                      zone: name(z.key),
                      views: num(z.views),
                      listings: num(z.listings),
                      perListing: rate(z.viewsPerListing),
                    })}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
