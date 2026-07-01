import "server-only";
import { db } from "@/lib/db";
import { memoGet, memoSet } from "./memory-cache";
import { translateRaw } from "./google";
import { isTranslationEnabled } from "./util";
import type { Lang } from "./types";

/**
 * Translate one string with the three-tier cache: in-memory LRU → Postgres
 * `translation_cache` → Google Translate. Persists fresh results write-through.
 * On any Google failure the caller (getText/localize) falls back to source;
 * here we simply let it throw so the caller can decide.
 */
export async function translate(text: string, sourceLang: Lang, targetLang: Lang): Promise<string> {
  if (!text || text.trim() === "") return "";
  if (sourceLang === targetLang) return text;

  // TIER 1 — in-memory LRU
  const memo = memoGet(sourceLang, targetLang, text);
  if (memo !== undefined) return memo;

  // TIER 2 — Postgres cache
  const cached = await db.translation.findUnique({
    where: {
      sourceText_sourceLanguage_targetLanguage: {
        sourceText: text,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
      },
    },
  });
  if (cached) {
    db.translation
      .update({
        where: { id: cached.id },
        data: { hitCount: { increment: 1 }, lastAccessedAt: new Date() },
      })
      .catch(() => {}); // fire-and-forget hit bump
    memoSet(sourceLang, targetLang, text, cached.translatedText);
    return cached.translatedText;
  }

  // Cache (LRU + DB) is ALWAYS read above so curated/manual rows apply without
  // a live key. The live Google call below is gated by the feature flag — when
  // off (or no key), a miss returns source instead of a doomed API round-trip.
  if (!isTranslationEnabled()) return text;

  // TIER 3 — Google (throws on failure → caller handles)
  const translated = await translateRaw(text, sourceLang, targetLang);

  db.translation
    .create({
      data: {
        sourceText: text,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        translatedText: translated,
        provider: "google",
      },
    })
    .catch(() => {}); // ignore duplicate-key races

  memoSet(sourceLang, targetLang, text, translated);
  return translated;
}
