import type { Lang } from "./types";

/**
 * Decide a string's TRUE script — never trust a stored `lang` flag. Any Arabic
 * char wins → "ar"; else any Latin letter → "en"; else default "ar". Used to
 * skip values already in the display language (zero-cost, never garbled).
 */
export function detectScript(text: string | null | undefined): Lang {
  if (!text) return "ar";
  if (/[؀-ۿ]/.test(text)) return "ar";
  if (/[a-zA-Z]/.test(text)) return "en";
  return "ar";
}

/** True when `text` needs translating to be shown in `displayLang`. */
export function needsTranslation(
  text: string | null | undefined,
  displayLang: Lang,
): boolean {
  if (!text || text.trim() === "") return false;
  return detectScript(text) !== displayLang;
}

/**
 * Content translation is gated behind the ENABLE_CONTENT_TRANSLATION flag AND a
 * configured key (mirrors src/lib/env-check.ts). When off, the engine returns
 * source text unchanged — no Google calls, no DB writes.
 */
export function isTranslationEnabled(): boolean {
  return (
    process.env.ENABLE_CONTENT_TRANSLATION === "true" &&
    Boolean(process.env.GOOGLE_TRANSLATE_API_KEY)
  );
}
