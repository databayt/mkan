/**
 * The requirement constants the client needs (wizard, refine chips), kept apart
 * from `requirements.ts` so the browser bundle does not pull in zod, the
 * parsers and the gazetteer just to know three district codes.
 */
export const DISTRICT_CODES = ["GASABO", "KICUKIRO", "NYARUGENGE"] as const;

/** Fields a "start over on this" phrase (or a ✕ on a chip) empties. */
export const CLEARABLE = [
  "district",
  "neighbourhood",
  "area",
  "maxPrice",
  "pricePeriod",
  "cheap",
  "furnished",
  "compound",
  "family",
  "bathrooms",
  "bedrooms",
  "stay",
  "nights",
  "guests",
  "maxUpfront",
] as const;
export type ClearableField = (typeof CLEARABLE)[number];

/** Round a ceiling to what a person would say: 10k steps a month, 1k a night. */
export function roundPrice(n: number, period: "night" | "month" | null): number {
  const step = period === "night" ? 1_000 : 10_000;
  return Math.max(step, Math.round(n / step) * step);
}
