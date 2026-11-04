import { TriangleAlert } from "lucide-react";

import type { Locale } from "@/components/internationalization/config";
import { formatPercentage } from "@/lib/i18n/formatters";
import type { MonetizeOverview } from "@/lib/monetize/load";
import { cn } from "@/lib/utils";

import { fill, formatValue, type MonetizeLabels } from "./format";
import { GradientLink, INK, LINE, MUTED } from "./listing-ui";

type Props = { data: MonetizeOverview; labels: MonetizeLabels; locale: Locale; canEdit: boolean };

/** Break-even reached, 0–1. */
export const progressOf = (d: MonetizeOverview) => (d.money.breakEvenRwf > 0 ? Math.min(1, d.money.revenueRwf / d.money.breakEvenRwf) : 0);

/**
 * The Reserve card, for money: the monthly figure to beat where a listing shows its
 * nightly price, the month's numbers in the date/guest box, one gradient action,
 * and the break-even sum as the price breakdown.
 */
export function MoneyCard({ data, labels, locale, canEdit }: Props) {
  const C = labels.card;
  const m = data.money;
  const rwf = (v: number | null) => formatValue(v, "rwf", locale, labels.currency);
  const fixedMonth = data.costLines.filter((l) => l.kind === "fixed").reduce((s, l) => s + l.monthlyRwf, 0);
  const meteredMonth = data.costLines.filter((l) => l.kind === "metered").reduce((s, l) => s + l.monthlyRwf, 0);
  const progress = progressOf(data);
  const bn = data.bottleneck;
  const stage = labels.stages as Record<string, string>;

  return (
    <div className="space-y-4">
      <div className={cn("rounded-xl border bg-white p-6 shadow-[0_6px_16px_rgba(0,0,0,0.12)] dark:bg-card", LINE)}>
        <div className="mb-5 flex flex-wrap items-baseline gap-x-1.5">
          <span className={cn("text-[22px] font-semibold tabular-nums", INK)}>{rwf(m.breakEvenRwf)}</span>
          <span className={cn("text-sm", INK)}>{C.toBreakEven}</span>
        </div>

        <div className="mb-4 overflow-hidden rounded-[12px] border border-[#B0B0B0] dark:border-border">
          <div className="grid grid-cols-2">
            <div className="border-e border-[#B0B0B0] px-3 py-2.5 dark:border-border">
              <div className={cn("text-[10px] font-bold uppercase tracking-wide", INK)}>{C.revenue}</div>
              <div className={cn("text-sm tabular-nums", INK)}>{rwf(m.revenueRwf)}</div>
            </div>
            <div className="px-3 py-2.5">
              <div className={cn("text-[10px] font-bold uppercase tracking-wide", INK)}>{C.cost}</div>
              <div className={cn("text-sm tabular-nums", INK)}>{rwf(m.costRwf)}</div>
            </div>
          </div>
          <div className="border-t border-[#B0B0B0] px-3 py-2.5 dark:border-border">
            <div className={cn("text-[10px] font-bold uppercase tracking-wide", INK)}>{C.net}</div>
            <div className={cn("text-sm font-semibold tabular-nums", m.netRwf < 0 ? "text-[#C13515]" : "text-[#008A05]")}>{rwf(m.netRwf)}</div>
          </div>
        </div>

        {canEdit ? <GradientLink href="#record">{C.ctaRecord}</GradientLink> : <GradientLink href="#top-task">{C.ctaNext}</GradientLink>}
        <p className={cn("mt-3 text-center text-sm", MUTED)}>{C.refresh}</p>
        {(data.sprints.week || data.sprints.month) && (
          <a href="#sprint" className={cn("mt-4 block rounded-[10px] bg-[#F7F7F7] px-3 py-2 text-center text-sm underline-offset-2 hover:underline dark:bg-muted", INK)}>
            {fill(C.sprintLine, {
              tasks: `${(data.sprints.week?.doneTasks ?? 0) + (data.sprints.month?.doneTasks ?? 0)}/${(data.sprints.week?.tasks.length ?? 0) + (data.sprints.month?.tasks.length ?? 0)}`,
              prompts: `${data.sprints.prompts.filter((p) => p.status !== "pending").length}/${data.sprints.prompts.length}`,
            })}
          </a>
        )}

        <div className={cn("mt-5 space-y-3 text-base", INK)}>
          <div className="flex justify-between gap-4">
            <a href="#spend" className="underline underline-offset-2">
              {C.fixed}
            </a>
            <span className="shrink-0 whitespace-nowrap tabular-nums">{rwf(fixedMonth)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <a href="#spend" className="underline underline-offset-2">
              {C.metered}
            </a>
            <span className="shrink-0 whitespace-nowrap tabular-nums">{rwf(meteredMonth)}</span>
          </div>
          <hr className={cn("my-3", LINE)} />
          <div className="flex justify-between gap-4 font-semibold">
            <span>{C.needed}</span>
            <span className="shrink-0 whitespace-nowrap tabular-nums">{rwf(m.breakEvenRwf)}</span>
          </div>
          <div className="pt-1">
            <div className="mb-1.5 flex justify-between text-sm">
              <span className={MUTED}>{C.progress}</span>
              <span className="tabular-nums">{formatPercentage(progress, locale)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#EBEBEB] dark:bg-muted">
              <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: "linear-gradient(to right, #E61E4D, #D70466)" }} />
            </div>
          </div>
          <div className="flex justify-between gap-4 text-sm">
            <span className={MUTED}>{C.projected}</span>
            <span className={cn("tabular-nums", m.projectedNetRwf < 0 ? "text-[#C13515]" : "text-[#008A05]")}>{rwf(m.projectedNetRwf)}</span>
          </div>
        </div>
      </div>

      {bn.kind === "step" && bn.rate != null && (
        <a href="#funnel" className={cn("flex items-center justify-center gap-2 rounded-xl border px-4 py-4 text-sm hover:bg-[#F7F7F7] dark:hover:bg-muted", LINE, INK)}>
          <TriangleAlert className="size-4 shrink-0 text-[#E31C5F]" aria-hidden />
          <span>{fill(C.weakest, { from: stage[bn.from!] ?? bn.from!, to: stage[bn.to!] ?? bn.to!, rate: formatPercentage(bn.rate, locale) })}</span>
        </a>
      )}
    </div>
  );
}

/** The listing page's fixed mobile Reserve bar: the month's net and the next task. */
export function MobileBar({ data, labels, locale }: Omit<Props, "canEdit">) {
  const M = labels.mobile;
  const rwf = (v: number) => formatValue(v, "rwf", locale, labels.currency);
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 md:hidden">
      <div
        className={cn("flex items-center justify-between gap-4 border-t bg-white px-6 pt-3 dark:bg-background", LINE)}
        style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
      >
        <div className="min-w-0">
          <p className={cn("truncate text-base font-semibold tabular-nums", data.money.netRwf < 0 ? "text-[#C13515]" : INK)}>{fill(M.net, { v: rwf(data.money.netRwf) })}</p>
          <p className={cn("text-sm underline underline-offset-2", INK)}>{fill(M.ofBreakEven, { pct: formatPercentage(progressOf(data), locale) })}</p>
        </div>
        <a
          href="#top-task"
          style={{ background: "linear-gradient(to right, #E61E4D 0%, #E31C5F 50%, #D70466 100%)" }}
          className="flex h-12 shrink-0 items-center justify-center rounded-full px-6 text-base font-medium leading-5 text-white"
        >
          {M.cta}
        </a>
      </div>
    </div>
  );
}
