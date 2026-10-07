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

/**
 * The source language of `text`. Script detection can only tell Arabic from
 * Latin, and Kinyarwanda is Latin like English — so Latin text on a record whose
 * `canonicalLocale` is "rw" is Kinyarwanda, not English. Every other input
 * resolves exactly as detectScript() does (en/ar behaviour is unchanged).
 */
export function detectSource(
  text: string | null | undefined,
  canonicalLocale?: string | null,
): Lang {
  const script = detectScript(text);
  if (script === "en" && canonicalLocale === "rw") return "rw";
  return script;
}

/**
 * True when `text` needs translating to be shown in `displayLang`. For
 * displayLang "rw" any text needs translating unless the record's
 * canonicalLocale is "rw" (nothing can be inferred from script alone).
 */
export function needsTranslation(
  text: string | null | undefined,
  displayLang: Lang,
  canonicalLocale?: string | null,
): boolean {
  if (!text || text.trim() === "") return false;
  return detectSource(text, canonicalLocale) !== displayLang;
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
