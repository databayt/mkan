import { ChevronRight } from "lucide-react";

import type { Locale } from "@/components/internationalization/config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber, formatPercentage } from "@/lib/i18n/formatters";
import type { Bottleneck, Stage } from "@/lib/monetize/bottleneck";
import { cn } from "@/lib/utils";

import { fill, type MonetizeLabels } from "./format";

export function BottleneckBanner({ b, labels, locale }: { b: Bottleneck; labels: MonetizeLabels; locale: Locale }) {
  const stage = labels.stages as Record<string, string>;
  const under = b.kind === "step" && b.rate != null && b.floor != null && b.rate < b.floor;
  const text =
    b.kind === "insufficient"
      ? labels.insufficient
      : fill(under ? labels.bottleneckStep : labels.bottleneckAbove, {
          from: stage[b.from!] ?? b.from!,
          to: stage[b.to!] ?? b.to!,
          rate: formatPercentage(b.rate ?? 0, locale),
          floor: formatPercentage(b.floor ?? 0, locale),
          block: labels.blocks[b.block as keyof MonetizeLabels["blocks"]]?.title ?? b.block ?? "",
        });
  return (
    <Card className={cn("border-s-4", under ? "border-s-amber-500" : b.kind === "insufficient" ? "border-s-muted-foreground/40" : "border-s-emerald-500")}>
      <CardContent className="py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{labels.bottleneckTitle}</p>
        <p className="mt-1 text-sm">{text}</p>
      </CardContent>
    </Card>
  );
}

export function FunnelStrip({ stages, labels, locale, bottleneck }: { stages: Stage[]; labels: MonetizeLabels; locale: Locale; bottleneck: Bottleneck }) {
  const stage = labels.stages as Record<string, string>;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{labels.funnelTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-wrap items-stretch gap-1">
          {stages.map((s, i) => {
            const prev = stages[i - 1];
            const rate = prev && prev.count > 0 ? s.count / prev.count : null;
            const weak = bottleneck.kind === "step" && bottleneck.to === s.key;
            return (
              <li key={s.key} className="flex items-center gap-1">
                {i > 0 && (
                  <span className="flex flex-col items-center text-[10px] text-muted-foreground">
                    <ChevronRight className="size-3 rtl:-scale-x-100" aria-hidden />
                    {rate != null && <span className="tabular-nums">{formatPercentage(rate, locale)}</span>}
                  </span>
                )}
                <div className={cn("rounded-md border px-2 py-1.5 text-center", weak && "border-amber-500 bg-amber-500/10")}>
                  <p className="text-sm font-semibold tabular-nums">{formatNumber(s.count, locale)}</p>
                  <p className="text-[11px] text-muted-foreground">{stage[s.key] ?? s.key}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
