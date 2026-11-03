import type { Locale } from "@/components/internationalization/config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatPercentage } from "@/lib/i18n/formatters";
import { change } from "@/lib/monetize/health";
import type { BlockView } from "@/lib/monetize/types";
import { cn } from "@/lib/utils";

import { fill, formatValue, type MonetizeLabels } from "./format";
import { HealthBadge } from "./health-badge";
import { Sparkline } from "./sparkline";

const JOB_TONE: Record<string, string> = {
  ok: "text-emerald-600",
  warn: "text-amber-600",
  fail: "text-destructive",
  stale: "text-destructive",
  missing: "text-muted-foreground",
};

export function BlockCard({ block, labels, locale, days }: { block: BlockView; labels: MonetizeLabels; locale: Locale; days: number }) {
  const copy = labels.blocks[block.key];
  const kpiLabel = labels.kpis as Record<string, string>;
  const lever = block.kpis.find((k) => k.lever);
  const rest = block.kpis.filter((k) => !k.lever);
  const delta = lever ? change(lever.value, lever.prev) : null;

  return (
    <Card className={cn("flex h-full flex-col", block.health === "red" && "border-destructive/50")}>
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{copy.title}</CardTitle>
          <HealthBadge health={block.health} label={labels.health[block.health]} />
        </div>
        <CardDescription>{copy.desc}</CardDescription>
        <p className={cn("text-xs", block.health === "red" ? "text-destructive" : "text-muted-foreground")}>
          {(labels.reasons as Record<string, string>)[block.reason] ?? block.reason}
        </p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {lever && (
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">
              {labels.lever} · {kpiLabel[lever.key] ?? lever.key}
            </p>
            <div className="flex items-end justify-between gap-2">
              <p className="text-2xl font-semibold tabular-nums">{formatValue(lever.value, lever.unit, locale, labels.currency)}</p>
              <Sparkline values={block.trend} label={kpiLabel[lever.key] ?? lever.key} />
            </div>
            <p className={cn("text-xs", delta == null ? "text-muted-foreground" : delta >= 0 ? "text-emerald-600" : "text-destructive")}>
              {delta == null ? labels.noBaseline : fill(labels.vsPrev, { pct: formatPercentage(delta, locale), days })}
            </p>
          </div>
        )}
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          {rest.map((k) => (
            <div key={k.key} className="min-w-0">
              <dt className="truncate text-xs text-muted-foreground">{kpiLabel[k.key] ?? k.key}</dt>
              <dd className="font-medium tabular-nums">{formatValue(k.value, k.unit, locale, labels.currency)}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto space-y-1 border-t pt-3 text-xs">
          <p className="text-muted-foreground">
            {block.snapshotAt ? fill(labels.lastPush, { time: formatDateTime(new Date(block.snapshotAt), locale) }) : labels.noSnapshot}
          </p>
          {block.jobs.length > 0 && (
            <ul className="space-y-0.5">
              {block.jobs.map((j) => (
                <li key={j.job} className="flex justify-between gap-2" title={j.summary ?? undefined}>
                  <span className="truncate font-mono" dir="ltr">
                    {j.job.replace(/^hermes_/, "")}
                  </span>
                  <span className={cn("shrink-0", JOB_TONE[j.status])}>{(labels.jobStatus as Record<string, string>)[j.status]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
