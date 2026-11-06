import type { Locale } from "@/components/internationalization/config";
import { formatPercentage } from "@/lib/i18n/formatters";
import type { MonetizeOverview } from "@/lib/monetize/load";
import { REVENUE_LINES } from "@/lib/monetize/money";
import { cn } from "@/lib/utils";

import { fill, formatValue, type MonetizeLabels } from "./format";
import { GRADIENT, GradientLink, INK, LINE, MUTED } from "./listing-ui";

type Props = { data: MonetizeOverview; labels: MonetizeLabels; locale: Locale; canEdit: boolean };

/** Break-even reached, 0–1. */
export const progressOf = (d: MonetizeOverview) => (d.money.breakEvenRwf > 0 ? Math.min(1, d.money.revenueRwf / d.money.breakEvenRwf) : 0);

/**
 * The money, in one card (the listing's Reserve card): what came in this month and from which line, what it
 * cost, the net, and how far the month is to break-even. Every cost line sits one click below.
 */
export function MoneyCard({ data, labels, locale, canEdit }: Props) {
  const C = labels.card;
  const rwf = (v: number) => formatValue(v, "rwf", locale);
  const m = data.money;
  const p = progressOf(data);
  return (
    <div className={cn("rounded-xl border bg-white p-6 shadow-[0_6px_16px_rgba(0,0,0,0.12)] dark:bg-background", LINE)}>
      <p className={cn("text-sm", MUTED)}>{labels.money.revenue}</p>
      <p className={cn("text-[28px] font-semibold leading-8 tabular-nums", INK)}>{rwf(m.revenueRwf)}</p>

      <div className="mt-4 space-y-1.5">
        <div className="h-2 overflow-hidden rounded-full bg-[#EBEBEB] dark:bg-muted">
          <div className="h-full rounded-full" style={{ width: `${Math.max(p > 0 ? 3 : 0, Math.round(p * 100))}%`, background: GRADIENT }} />
        </div>
        <p className={cn("text-sm tabular-nums", INK)}>
          {formatPercentage(p, locale)} · <span className={MUTED}>{rwf(m.breakEvenRwf)} {C.toBreakEven}</span>
        </p>
      </div>

      <dl className={cn("mt-5 space-y-2 border-t pt-4 text-sm", LINE)}>
        {REVENUE_LINES.map((l) => (
          <div key={l} className="flex items-baseline justify-between gap-4">
            <dt className={MUTED}>{labels.lines[l]}</dt>
            <dd className={cn("tabular-nums", m.byLine[l] > 0 ? cn("font-semibold", INK) : MUTED)}>{rwf(m.byLine[l])}</dd>
          </div>
        ))}
      </dl>

      <dl className={cn("mt-4 space-y-2 border-t pt-4 text-sm", LINE)}>
        <div className="flex items-baseline justify-between gap-4">
          <dt className={MUTED}>{C.cost}</dt>
          <dd className={cn("tabular-nums", INK)}>{rwf(m.costRwf)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className={cn("font-semibold", INK)}>{C.net}</dt>
          <dd className={cn("font-semibold tabular-nums", m.netRwf < 0 ? "text-[#C13515]" : "text-[#008A05]")}>{rwf(m.netRwf)}</dd>
        </div>
      </dl>

      <details className={cn("mt-4 border-t pt-3", LINE)}>
        <summary className={cn("cursor-pointer list-none text-sm font-medium underline underline-offset-2 [&::-webkit-details-marker]:hidden", INK)}>{labels.spend.title}</summary>
        <ul className="mt-3 space-y-2 text-sm">
          {data.costLines.map((l) => {
            const name = (labels.spend.lines as Record<string, { name: string }>)[l.key]?.name ?? l.key;
            return (
              <li key={l.key} className="flex items-baseline justify-between gap-4">
                <span className={cn("min-w-0", MUTED)}>{name}</span>
                <span className={cn("shrink-0 tabular-nums", INK)}>
                  {rwf(l.soFarRwf)}
                  {l.monthlyRwf > 0 && <span className={MUTED}> · {fill(labels.spend.perMonth, { v: rwf(l.monthlyRwf) })}</span>}
                </span>
              </li>
            );
          })}
        </ul>
        {data.fixedEstimated && <p className={cn("mt-3 text-xs", MUTED)}>{labels.money.estimated}</p>}
      </details>

      {canEdit && <GradientLink href="#record" className="mt-5">{C.ctaRecord}</GradientLink>}
      <p className={cn("mt-3 text-center text-xs", MUTED)}>{C.refresh}</p>
    </div>
  );
}

/** The listing page's fixed mobile Reserve bar: the month's net and a jump to the loop. */
export function MobileBar({ data, labels, locale }: Omit<Props, "canEdit">) {
  const M = labels.mobile;
  const rwf = (v: number) => formatValue(v, "rwf", locale);
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 md:hidden">
      <div className={cn("flex items-center justify-between gap-4 border-t bg-white px-6 pt-3 dark:bg-background", LINE)} style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
        <div className="min-w-0">
          <p className={cn("truncate text-base font-semibold tabular-nums", data.money.netRwf < 0 ? "text-[#C13515]" : INK)}>{fill(M.net, { v: rwf(data.money.netRwf) })}</p>
          <p className={cn("text-sm underline underline-offset-2", INK)}>{fill(M.ofBreakEven, { pct: formatPercentage(progressOf(data), locale) })}</p>
        </div>
        <a href="#top-task" style={{ background: GRADIENT }} className="flex h-12 shrink-0 items-center justify-center rounded-full px-6 text-base font-medium leading-5 text-white">
          {M.cta}
        </a>
      </div>
    </div>
  );
}
