import "server-only";
import { db } from "@/lib/db";
import { memoGet, memoSet } from "./memory-cache";
import { translate } from "./actions";
import { translateBatch } from "./google";
import { detectScript, isTranslationEnabled } from "./util";
import type { Lang } from "./types";

/**
 * Translate ONE string for display in `lang`. No-op (returns source) when
 * translation is disabled or the text is already in the target script; any
 * Google failure also falls back to source so a render never breaks.
 */
export async function getText(text: string | null | undefined, lang: Lang): Promise<string> {
  if (!text) return text ?? "";
  const src = detectScript(text);
  if (src === lang) return text;
  // translate() always reads the cache (curated/manual rows apply even with no
  // key) and only hits Google when the flag is on.
  try {
    return await translate(text, src, lang);
  } catch {
    return text;
  }
}

/**
 * Batched translation for a list of rows: collects the unique values across the
 * given string `fields` whose script ≠ `lang`, resolves them via LRU → ONE DB
 * `findMany` → ONE `translateBatch` for true misses, persists fresh results,
 * and returns NEW row copies with translated fields (inputs never mutated;
 * any miss falls back to source). One DB round-trip per render, not N×M.
 */
export async function localize<T extends Record<string, unknown>>(
  rows: T[],
  fields: readonly string[],
  lang: Lang,
): Promise<T[]> {
  if (rows.length === 0) return rows;
  const displayLang = lang;

  // Collect unique values needing translation, grouped by detected source lang.
  const wantedBySource = new Map<Lang, Set<string>>();
  for (const row of rows) {
    for (const field of fields) {
      const v = row[field];
      if (typeof v !== "string" || v.trim() === "") continue;
      const src = detectScript(v);
      if (src === displayLang) continue;
      let set = wantedBySource.get(src);
      if (!set) {
        set = new Set<string>();
        wantedBySource.set(src, set);
      }
      set.add(v);
    }
  }
  if (wantedBySource.size === 0) return rows;

  const resolved = new Map<string, string>(); // sourceText → translated
  for (const [src, set] of wantedBySource) {
    const values = [...set];
    const dbWanted: string[] = [];
    for (const v of values) {
      const m = memoGet(src, displayLang, v);
      if (m !== undefined) resolved.set(v, m);
      else dbWanted.push(v);
    }

    if (dbWanted.length > 0) {
      try {
        const cached = await db.translation.findMany({
          where: { sourceLanguage: src, targetLanguage: displayLang, sourceText: { in: dbWanted } },
          select: { sourceText: true, translatedText: true },
        });
        for (const c of cached) {
          resolved.set(c.sourceText, c.translatedText);
          memoSet(src, displayLang, c.sourceText, c.translatedText);
        }
      } catch (err) {
        console.error("[localize] cache read failed:", err);
      }
    }

    // Only the Google miss-path is gated: cache reads above always run so
    // curated/manual rows apply even without a live key.
    const misses = isTranslationEnabled() ? dbWanted.filter((v) => !resolved.has(v)) : [];
    if (misses.length > 0) {
      try {
        const translations = await translateBatch(misses, src, displayLang);
        const fresh = misses.map((s, i) => ({ s, t: translations[i] ?? s }));
        for (const { s, t } of fresh) {
          resolved.set(s, t);
          memoSet(src, displayLang, s, t);
        }
        void db
          .$transaction(
            fresh.map(({ s, t }) =>
              db.translation.upsert({
                where: {
                  sourceText_sourceLanguage_targetLanguage: {
                    sourceText: s,
                    sourceLanguage: src,
                    targetLanguage: displayLang,
                  },
                },
                update: { hitCount: { increment: 1 }, lastAccessedAt: new Date() },
                create: {
                  sourceText: s,
                  sourceLanguage: src,
                  targetLanguage: displayLang,
                  translatedText: t,
                  provider: "google",
                },
              }),
            ),
          )
          .catch(() => {});
      } catch (err) {
        console.warn("[localize] translate fallback to source:", err instanceof Error ? err.message : err);
      }
    }
  }

  return rows.map((row) => {
    let copy: T | null = null;
    for (const field of fields) {
      const v = row[field];
      if (typeof v !== "string" || v.trim() === "") continue;
      if (detectScript(v) === displayLang) continue;
      const t = resolved.get(v);
      if (t === undefined || t === v) continue;
      if (copy === null) copy = { ...row };
      (copy as Record<string, unknown>)[field] = t;
    }
    return copy ?? row;
  });
}

export async function localizeOne<T extends Record<string, unknown>>(
  row: T,
  fields: readonly string[],
  lang: Lang,
): Promise<T> {
  const [out] = await localize([row], fields, lang);
  return out ?? row;
}
