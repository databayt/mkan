import type { Locale } from "@/components/internationalization/config";
import { formatPercentage } from "@/lib/i18n/formatters";
import type { MonetizeOverview } from "@/lib/monetize/load";
import { cn } from "@/lib/utils";

import { fill, formatValue, type MonetizeLabels } from "./format";
import { cardData } from "./card-data";
import { INK, LINE } from "./listing-ui";
import { ScrollCard } from "./scroll-card";

type Props = { data: MonetizeOverview; labels: MonetizeLabels; locale: Locale; canEdit: boolean };

/** Break-even reached, 0–1. */
export const progressOf = (d: MonetizeOverview) => (d.money.breakEvenRwf > 0 ? Math.min(1, d.money.revenueRwf / d.money.breakEvenRwf) : 0);

/**
 * The Reserve card, for money — and it follows the page: the money at the top, then a chart for the
 * section beside it as you scroll (scroll-card.tsx). Built here on the server; the card only draws.
 */
export function MoneyCard({ data, labels, locale, canEdit }: Props) {
  const C = labels.card;
  return (
    <ScrollCard
      data={cardData(data, labels, locale)}
      labels={{
        panels: labels.panels,
        card: C,
        cta: canEdit ? C.ctaRecord : C.ctaNext,
        ctaHref: canEdit ? "#record" : "#top-task",
      }}
    />
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
