import { ar, enUS, type Locale as DateFnsLocale } from "date-fns/locale";

import type { Locale } from "@/components/internationalization/config";

/** Map our app locale to the matching date-fns locale for `format()`. */
export function dateLocaleFor(lang: Locale): DateFnsLocale {
  return lang === "ar" ? ar : enUS;
}

/** BCP-47 / Intl locale tag for `Intl.NumberFormat`, `toLocaleString`, etc. */
export function intlLocaleFor(lang: Locale): string {
  return lang === "ar" ? "ar-SA" : "en-US";
}
