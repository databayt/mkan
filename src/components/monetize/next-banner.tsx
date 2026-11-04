import { ArrowRight, CircleCheck, Lightbulb } from "lucide-react";

import type { Locale } from "@/components/internationalization/config";
import { formatPercentage } from "@/lib/i18n/formatters";
import type { MonetizeOverview } from "@/lib/monetize/load";
import { cn } from "@/lib/utils";

import { fill, formatValue, type MonetizeLabels } from "./format";
import { INK, MUTED, RichText } from "./listing-ui";
import { PRIORITY_ICON, PRIORITY_TONE, stepCopy } from "./todo-section";

/**
 * The banner where a listing shows its photos: the one thing to do next, in full,
 * or — with nothing open — a piece of advice from the numbers.
 */
export function NextBanner({ data, labels, locale }: { data: MonetizeOverview; labels: MonetizeLabels; locale: Locale }) {
  const B = labels.banner;
  const top = data.nextSteps[0];
  const copy = top ? stepCopy(top, labels, locale) : null;

  if (!top || !copy) {
    const bn = data.bottleneck;
    const stage = labels.stages as Record<string, string>;
    const gap = data.money.breakEvenRwf - data.money.revenueRwf;
    const advice =
      bn.kind === "step" && bn.rate != null
        ? fill(B.adviceBottleneck, { from: stage[bn.from!] ?? bn.from!, to: stage[bn.to!] ?? bn.to!, rate: formatPercentage(bn.rate, locale) })
        : gap > 0
          ? fill(B.adviceBreakEven, { gap: formatValue(gap, "rwf", locale, labels.currency) })
          : B.adviceDone;
    return (
      <div id="top-task" className="flex scroll-mt-28 items-start gap-4 rounded-2xl bg-[#F7F7F7] p-6 md:p-8 dark:bg-muted">
        <Lightbulb className={cn("size-7 shrink-0", INK)} strokeWidth={1.5} />
        <div>
          <p className={cn("text-xs font-semibold uppercase tracking-wide", MUTED)}>{B.advice}</p>
          <p className={cn("mt-2 text-xl font-semibold leading-7 md:text-2xl", INK)}>{advice}</p>
        </div>
      </div>
    );
  }

  const Icon = PRIORITY_ICON[top.priority];
  const money = top.priority === 1;
  return (
    <div
      id="top-task"
      className={cn(
        "relative scroll-mt-28 overflow-hidden rounded-2xl p-6 md:p-10",
        money ? "bg-gradient-to-br from-[#FFF1F4] via-[#FFF7F5] to-white dark:from-muted dark:via-muted dark:to-background" : "bg-[#F7F7F7] dark:bg-muted",
      )}
    >
      {money && <div className="absolute inset-y-0 start-0 w-1.5" style={{ background: "linear-gradient(to bottom, #E61E4D, #D70466)" }} aria-hidden />}
      <div className="grid gap-8 md:grid-cols-[1fr_18rem] md:items-end">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-full bg-white shadow-sm dark:bg-background">
              <Icon className={cn("size-5", INK)} strokeWidth={1.5} />
            </span>
            <span className={cn("text-sm font-semibold", INK)}>{B.next}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", PRIORITY_TONE[top.priority])}>{copy.priority}</span>
            {copy.block && <span className={cn("text-sm", MUTED)}>· {copy.block}</span>}
          </div>
          <h2 className={cn("mt-4 text-[26px] font-semibold leading-8 tracking-[-0.5px] md:text-[32px] md:leading-10", INK)}>{copy.title}</h2>
          <p className={cn("mt-3 max-w-2xl text-base leading-6", MUTED)}>{copy.why}</p>
          <div className={cn("mt-5 flex max-w-2xl gap-3 rounded-xl bg-white/80 p-4 text-[15px] leading-6 shadow-sm dark:bg-background/60", INK)}>
            <ArrowRight className="mt-1 size-4 shrink-0 rtl:-scale-x-100" aria-hidden />
            <span>
              <span className="font-semibold">{labels.todo.how}: </span>
              <RichText t={copy.how} />
            </span>
          </div>
        </div>
        <div className="space-y-4">
          <p className={cn("flex gap-2 text-sm leading-5", MUTED)}>
            <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <span className={cn("font-semibold", INK)}>{labels.todo.done}: </span>
              {copy.done}
            </span>
          </p>
          <a
            href="#todo"
            className={cn(
              "flex h-12 items-center justify-center rounded-[12px] border border-[#222222] bg-white text-base font-semibold hover:bg-[#F7F7F7] dark:border-foreground dark:bg-background",
              INK,
            )}
          >
            {fill(B.seeAll, { n: data.nextSteps.length })}
          </a>
        </div>
      </div>
    </div>
  );
}
