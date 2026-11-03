import { ChevronRight, TriangleAlert } from "lucide-react";

import type { Locale } from "@/components/internationalization/config";
import { formatNumber, formatPercentage } from "@/lib/i18n/formatters";
import type { Bottleneck, Stage } from "@/lib/monetize/bottleneck";
import { cn } from "@/lib/utils";

import { fill, type MonetizeLabels } from "./format";
import { Section } from "./ui";

function bottleneckText(b: Bottleneck, labels: MonetizeLabels, locale: Locale) {
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
  return { text, under };
}

/** The whole business as one row of steps, the weakest hand-off marked. */
export function FunnelSection({ stages, labels, locale, bottleneck }: { stages: Stage[]; labels: MonetizeLabels; locale: Locale; bottleneck: Bottleneck }) {
  const stage = labels.stages as Record<string, string>;
  const { text, under } = bottleneckText(bottleneck, labels, locale);
  return (
    <Section id="funnel" title={labels.funnelTitle}>
      <div className={cn("mb-6 flex items-start gap-3 rounded-2xl border p-5", under ? "border-amber-500/40 bg-amber-500/5" : "bg-muted/30")}>
        <TriangleAlert className={cn("mt-0.5 size-5 shrink-0", under ? "text-amber-600" : "text-muted-foreground")} aria-hidden />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{labels.bottleneckTitle}</p>
          <p className="mt-1 text-[15px] text-foreground">{text}</p>
        </div>
      </div>
      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <ol className="my-0 ms-0 list-none [&>li]:mt-0 flex min-w-max items-stretch gap-1.5">
          {stages.map((s, i) => {
            const prev = stages[i - 1];
            const rate = prev && prev.count > 0 ? s.count / prev.count : null;
            const weak = bottleneck.kind === "step" && bottleneck.to === s.key;
            return (
              <li key={s.key} className="flex items-center gap-1.5">
                {i > 0 && (
                  <span className="flex w-10 flex-col items-center text-[11px] text-muted-foreground">
                    <ChevronRight className="size-3.5 rtl:-scale-x-100" aria-hidden />
                    {rate != null && <span className="tabular-nums">{formatPercentage(rate, locale)}</span>}
                  </span>
                )}
                <div className={cn("min-w-[5.5rem] rounded-xl border bg-card px-3 py-3 text-center", weak && "border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/20")}>
                  <p className="text-foreground text-lg font-semibold tabular-nums">{formatNumber(s.count, locale)}</p>
                  <p className="text-xs text-muted-foreground">{stage[s.key] ?? s.key}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </Section>
  );
}
