import { ChevronRight, TriangleAlert } from "lucide-react";

import type { Locale } from "@/components/internationalization/config";
import { formatNumber, formatPercentage } from "@/lib/i18n/formatters";
import type { Bottleneck, Stage } from "@/lib/monetize/bottleneck";
import { cn } from "@/lib/utils";

import { fill, type MonetizeLabels } from "./format";
import { H2, INK, LINE, MUTED } from "./listing-ui";

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

/** The whole business as one row of steps, full width under the columns like a listing's calendar. */
export function FunnelSection({ stages, labels, locale, bottleneck }: { stages: Stage[]; labels: MonetizeLabels; locale: Locale; bottleneck: Bottleneck }) {
  const stage = labels.stages as Record<string, string>;
  const { text, under } = bottleneckText(bottleneck, labels, locale);
  return (
    <section id="funnel" className={cn("scroll-mt-28 border-b py-12", LINE)}>
      <H2>{labels.funnelTitle}</H2>
      <p className={cn("mt-3 flex items-start gap-2 text-base leading-6", INK)}>
        <TriangleAlert className={cn("mt-1 size-4 shrink-0", under ? "text-[#E31C5F]" : "text-[#6A6A6A]")} aria-hidden />
        <span>
          <span className="font-semibold">{labels.bottleneckTitle}: </span>
          {text}
        </span>
      </p>
      <div className="-mx-6 mt-6 overflow-x-auto px-6 pb-2 md:mx-0 md:px-0">
        <ol className="my-0 ms-0 flex min-w-max list-none items-stretch gap-1.5 [&>li]:mt-0">
          {stages.map((s, i) => {
            const prev = stages[i - 1];
            const rate = prev && prev.count > 0 ? s.count / prev.count : null;
            const weak = bottleneck.kind === "step" && bottleneck.to === s.key;
            return (
              <li key={s.key} className="flex items-center gap-1.5">
                {i > 0 && (
                  <span className={cn("flex w-11 flex-col items-center text-[11px]", MUTED)}>
                    <ChevronRight className="size-3.5 rtl:-scale-x-100" aria-hidden />
                    {rate != null && <span className="tabular-nums">{formatPercentage(rate, locale)}</span>}
                  </span>
                )}
                <div className={cn("min-w-[5.75rem] rounded-xl border px-3 py-3 text-center", weak ? "border-[#E31C5F] bg-[#FFF0F3]" : LINE)}>
                  <p className={cn("text-lg font-semibold tabular-nums", INK)}>{formatNumber(s.count, locale)}</p>
                  <p className={cn("text-xs", MUTED)}>{stage[s.key] ?? s.key}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
