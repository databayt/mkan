import type { Locale } from "@/components/internationalization/config";

const AR_LABELS: Record<string, string> = {
  SDG: "ج.س",
  RWF: "فرنك رواندي",
};

/**
 * Short currency label for host price inputs (a prefix next to the field).
 * Pass the listing's own currency; missing falls back to SDG so old data is
 * unchanged. Arabic uses the house abbreviation, every other locale the ISO code.
 */
export function currencyLabel(currency: string | null | undefined, locale: Locale): string {
  const code = currency || "SDG";
  return locale === "ar" ? (AR_LABELS[code] ?? code) : code;
}
