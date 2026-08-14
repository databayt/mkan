import type { MarketplaceAnalytics } from "@/lib/actions/analytics-actions";

/**
 * Flattened label bag. Admin server pages resolve the dictionary and pass plain
 * strings down rather than the dictionary object — the house pattern, see
 * `src/app/[lang]/admin/layout.tsx`.
 */
export type AnalyticsLabels = Record<string, string>;

export interface SectionProps {
  data: MarketplaceAnalytics;
  labels: AnalyticsLabels;
  locale: "en" | "ar";
}

/** `{name}` placeholder substitution, matching the dictionary's own convention. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (out, [k, v]) => out.replaceAll(`{${k}}`, String(v)),
    template,
  );
}
