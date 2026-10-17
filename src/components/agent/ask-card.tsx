"use client";

import { useEffect } from "react";
import { CornerDownLeft } from "lucide-react";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { useLocale } from "@/components/internationalization/use-locale";
import { formatCurrency } from "@/lib/i18n/formatters";
import { cn } from "@/lib/utils";
import { longStayCost, shortStayCost } from "./cost";
import { fill } from "./format";
import type { HardField, Requirements } from "./requirements";

const MONTH_BUDGETS = [150_000, 300_000, 500_000, 1_000_000];
const NIGHT_BUDGETS = [30_000, 60_000, 100_000, 150_000];

interface Option {
  label: string;
  description: string;
  /** The tenant's turn text and the exact fields it sets. */
  text: string;
  filters: Partial<Requirements>;
}

/** Focus the composer of whichever surface is showing (/find or the side panel). */
const focusComposer = () => (document.querySelector<HTMLTextAreaElement>("textarea[data-agent-composer]") ?? null)?.focus();

/**
 * The agent's question as a pick-one card, in the shape of Claude Code's
 * plan-mode questions: numbered options, each with a line on what it means,
 * and a last "type something else" that hands over to the composer. Number
 * keys pick an option. Budget options show the real move-in cost from cost.ts.
 */
export function AskCard({
  field,
  requirements,
  onPick,
  disabled,
  compact = false,
}: {
  field: HardField;
  requirements: Partial<Requirements> | null;
  onPick: (text: string, filters: Partial<Requirements>) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const dict = useDictionary();
  const a = dict?.agent;
  const q = a?.question;
  const { locale } = useLocale();
  const money = (n: number) => formatCurrency(n, locale, "RWF");

  let options: Option[];
  if (field === "stay") {
    options = [
      { label: q?.months ?? "Months", description: q?.monthsHint ?? "", text: q?.months ?? "Months", filters: { stay: "long" } },
      { label: q?.nights ?? "Nights", description: q?.nightsHint ?? "", text: q?.nights ?? "Nights", filters: { stay: "short" } },
    ];
  } else {
    const nightly = requirements?.stay === "short";
    const nights = requirements?.nights ?? 1;
    options = (nightly ? NIGHT_BUDGETS : MONTH_BUDGETS).map((n) => {
      const cost = nightly
        ? shortStayCost({ rentPeriod: "NIGHTLY", pricePerNight: n, priceMonth: null, monthlyDiscount: null, cleaningFee: null }, nights)
        : longStayCost({ rentPeriod: "MONTHLY", pricePerNight: null, priceMonth: n, monthlyDiscount: null, cleaningFee: null });
      const label = fill((nightly ? q?.upToNight : q?.upToMonth) ?? "Up to {price}", { price: money(n) });
      return {
        label,
        description: cost
          ? nightly
            ? fill(q?.stayTotal ?? "About {total} for {nights} nights, with the service fee", { total: money(cost.total), nights })
            : fill(q?.moveIn ?? "About {total} to move in: 3 months, deposit and fees", { total: money(cost.total) })
          : "",
        text: label,
        filters: { maxPrice: n, pricePeriod: nightly ? "night" : "month", stay: nightly ? "short" : "long" },
      };
    });
  }

  // 1–n pick an option while the tenant is not typing.
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1) return;
      const opt = options[n - 1];
      if (opt) onPick(opt.text, opt.filters);
      else if (n === options.length + 1) {
        e.preventDefault();
        focusComposer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const row = cn(
    "group flex w-full items-start gap-3 rounded-lg px-3 text-start transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-50",
    compact ? "py-2" : "py-2.5",
  );

  return (
    <div className={cn("rounded-xl border", compact ? "p-1.5" : "p-2")} role="group" aria-label={a?.ask?.[field] ?? ""}>
      <p className={cn("px-3 pb-1 pt-2 font-medium", compact ? "text-sm" : "")}>{a?.ask?.[field]}</p>
      <ol>
        {options.map((o, i) => (
          <li key={o.label}>
            <button type="button" disabled={disabled} onClick={() => onPick(o.text, o.filters)} className={row}>
              <span className="mt-0.5 w-4 shrink-0 text-sm tabular-nums text-muted-foreground group-hover:text-foreground">{i + 1}.</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{o.label}</span>
                {o.description && <span className="block text-xs text-muted-foreground">{o.description}</span>}
              </span>
            </button>
          </li>
        ))}
        <li>
          <button type="button" disabled={disabled} onClick={focusComposer} className={row}>
            <span className="mt-0.5 w-4 shrink-0 text-sm tabular-nums text-muted-foreground">{options.length + 1}.</span>
            <span className="flex-1 text-sm text-muted-foreground">{q?.other ?? "Type something else"}</span>
            <CornerDownLeft className="mt-0.5 size-3.5 text-muted-foreground rtl:scale-x-[-1]" aria-hidden />
          </button>
        </li>
      </ol>
    </div>
  );
}
