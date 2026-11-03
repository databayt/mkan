import type { Locale } from "@/components/internationalization/config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/i18n/formatters";
import { REVENUE_LINES } from "@/lib/monetize/money";
import type { MoneyView } from "@/lib/monetize/money";
import { cn } from "@/lib/utils";

import { formatValue, type MonetizeLabels } from "./format";

export function MoneyStrip({
  money,
  labels,
  locale,
  fixedEstimated,
}: {
  money: MoneyView;
  labels: MonetizeLabels;
  locale: Locale;
  fixedEstimated: boolean;
}) {
  const L = labels.money;
  const rwf = (v: number | null) => formatValue(v, "rwf", locale, labels.currency);
  const tiles = [
    { key: "revenue", label: L.revenue, value: rwf(money.revenueRwf) },
    { key: "cost", label: L.cost, value: rwf(money.costRwf), sub: `${L.fixed} ${rwf(money.fixedCostRwf)} · ${L.variable} ${rwf(money.variableCostRwf)}` },
    { key: "net", label: L.net, value: rwf(money.netRwf), tone: money.netRwf >= 0 ? "pos" : "neg" },
    { key: "roi", label: L.roi, value: money.roi == null ? L.none : `${formatNumber(Math.round(money.roi * 100) / 100, locale)}×` },
  ];
  const unit = [
    { label: L.costPerChat, value: rwf(money.costPerChatRwf) },
    { label: L.costPerLead, value: rwf(money.costPerLeadRwf) },
    { label: L.costPerDeal, value: rwf(money.costPerDealRwf) },
    { label: L.breakEven, value: rwf(money.breakEvenRwf) },
    { label: L.projected, value: rwf(money.projectedNetRwf) },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{L.title}</CardTitle>
        <CardDescription>{labels.drive}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.key} className="rounded-md border p-3">
              <dt className="text-xs text-muted-foreground">{t.label}</dt>
              <dd
                className={cn(
                  "text-xl font-semibold tabular-nums",
                  t.tone === "pos" && "text-emerald-600",
                  t.tone === "neg" && "text-destructive",
                )}
              >
                {t.value}
              </dd>
              {t.sub && <p className="mt-1 text-xs text-muted-foreground">{t.sub}</p>}
            </div>
          ))}
        </dl>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {REVENUE_LINES.map((l) => (
            <div key={l} className="min-w-0">
              <dt className="truncate text-xs text-muted-foreground">{labels.lines[l]}</dt>
              <dd className="font-medium tabular-nums">{rwf(money.byLine[l])}</dd>
            </div>
          ))}
        </dl>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
          {unit.map((u) => (
            <div key={u.label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{u.label}</dt>
              <dd className="font-medium tabular-nums">{u.value}</dd>
            </div>
          ))}
        </dl>
        {money.unrecordedRwf > 0 && (
          <p className="rounded-md border-s-4 border-s-amber-500 bg-muted/50 p-2 text-sm">
            {L.unrecorded}: <span className="font-semibold tabular-nums">{rwf(money.unrecordedRwf)}</span>
          </p>
        )}
        {fixedEstimated && <p className="text-xs text-muted-foreground">{L.estimated}</p>}
      </CardContent>
    </Card>
  );
}
