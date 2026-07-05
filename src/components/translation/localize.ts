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

/**
 * Canonical free-text fields that must localize for a listing to display fully
 * in the viewer's language. Kept here as the ONE source of truth so every
 * surface (cards, detail, bookings, favorites, checkout, messaging) localizes
 * the same set — the i18n guard asserts listing-rendering server files call one
 * of these helpers.
 */
export const LISTING_TEXT_FIELDS = ["title", "description"] as const;
export const LOCATION_TEXT_FIELDS = ["address", "city", "state", "country"] as const;

/**
 * Localize an array of listing rows for `lang`: title/description on each row +
 * the nested `location` (address/city/state/country). One batched cache
 * round-trip per field-group. Pass the RAW Prisma payload (a closed `Listing`
 * interface without an index signature won't satisfy `Record<string,unknown>` —
 * localize before any `as Listing[]` cast).
 */
export async function localizeListings<T extends Record<string, unknown>>(
  listings: T[],
  lang: Lang,
): Promise<T[]> {
  if (listings.length === 0) return listings;
  const withText = await localize(listings, LISTING_TEXT_FIELDS, lang);
  return localizeNested(withText, "location", LOCATION_TEXT_FIELDS, lang);
}

/** Localize a single listing (title/description + nested location) for `lang`. */
export async function localizeListing<T extends Record<string, unknown>>(
  listing: T,
  lang: Lang,
): Promise<T> {
  const [out] = await localizeListings([listing], lang);
  return out ?? listing;
}

/**
 * Localize string fields on a nested object (e.g. `listing.location`) across
 * rows: collects the sub-objects, batch-resolves them through localize() (one
 * cache round-trip), and returns new row copies with the localized sub-object
 * reattached. Rows without the key pass through untouched.
 */
export async function localizeNested<T extends Record<string, unknown>>(
  rows: T[],
  key: string,
  fields: readonly string[],
  lang: Lang,
): Promise<T[]> {
  const subs: Record<string, unknown>[] = [];
  const idx: number[] = [];
  rows.forEach((r, i) => {
    const v = r[key];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      subs.push(v as Record<string, unknown>);
      idx.push(i);
    }
  });
  if (subs.length === 0) return rows;
  const localized = await localize(subs, fields, lang);
  let out: T[] | null = null;
  localized.forEach((sub, j) => {
    if (sub === subs[j]) return;
    if (out === null) out = [...rows];
    const at = idx[j]!;
    out[at] = { ...out[at]!, [key]: sub };
  });
  return out ?? rows;
}
