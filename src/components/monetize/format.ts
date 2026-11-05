import type { Locale } from "@/components/internationalization/config";
import type en from "@/components/internationalization/en.json";
import { formatNumber, formatPercentage } from "@/lib/i18n/formatters";
import { USD_TO_RWF } from "@/lib/monetize/costs";
import type { Unit } from "@/lib/monetize/types";

export type MonetizeLabels = (typeof en)["monetize"];

/** `{name}` placeholder substitution, the dictionary's own convention. */
export const fill = (t: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((out, [k, v]) => out.replaceAll(`{${k}}`, String(v)), t);

export function formatValue(value: number | null | undefined, unit: Unit, locale: Locale): string {
  if (value == null || !Number.isFinite(value)) return "—";
  switch (unit) {
    case "pct":
      return formatPercentage(value, locale);
    case "ms":
      return value >= 1000 ? `${formatNumber(Math.round(value / 100) / 10, locale)} s` : `${formatNumber(Math.round(value), locale)} ms`;
    case "hours":
      return `${formatNumber(Math.round(value * 10) / 10, locale)} h`;
    case "usd":
      return formatNumber(value, locale, { style: "currency", currency: "USD", maximumFractionDigits: value < 1 ? 3 : 2 });
    case "rwf": {
      // Money is stored in RWF (what is actually paid and received); the page shows it in US dollars.
      const usd = value / USD_TO_RWF;
      return formatNumber(usd, locale, { style: "currency", currency: "USD", maximumFractionDigits: Math.abs(usd) >= 100 ? 0 : 2 });
    }
    default:
      return formatNumber(Math.round(value * 10) / 10, locale);
  }
}
