/**
 * Mkan's own page for a home — /en/k/K5808 — and the rule that every link a tenant can follow to
 * a broker's home goes there (Abdout, 2026-11-01). The page shows the home's photos, facts and
 * move-in cost and checks it on WhatsApp; it never shows the broker's ad, handle or number. The
 * ad's caption carries the broker's phone, so a tenant who followed it went around Mkan, which
 * stays in the middle and takes the tenant to the viewing.
 */
import type { ShortlistItem } from "./types";

/** /en/k/K5808 — the same code a TikTok post and the WhatsApp line use. */
export const homePath = (lang: string, id: number) => `/${lang}/k/K${id}`;

/** "K5808" (any case, "K-5808" too) → 5808; anything else → null. */
export function homeIdOfRef(ref: string): number | null {
  const m = decodeURIComponent(ref).trim().match(/^K-?(\d{1,7})$/i);
  const id = m ? Number(m[1]) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** A home as a tenant may see it: a broker home links to our page and carries no handle or ad. */
export function forTenant(item: ShortlistItem, lang: string): ShortlistItem {
  const external = /^https?:\/\//.test(item.path ?? "");
  if (!item.lead && !external) return item;
  return { ...item, path: homePath(lang, item.id), ...(item.lead ? { lead: { handle: null, sourceUrl: null } } : {}) };
}
