/**
 * The homes a /k page offers when its own home is taken (2026-11-22: a TikTok post kept sending people to K6823 for
 * days after the broker said taken). Pure: the page loads rows, this picks 2–3 that really are somewhere to live
 * monthly, are free, and sit near the taken home's size and rent.
 */
import { implausibleRent, notAHome } from "@/components/agent/rank";

export interface SimilarRow {
  id: number;
  title: string | null;
  propertyType: string | null;
  rentPeriod: "MONTHLY" | "NIGHTLY" | string | null;
  priceMonth: number | null;
  bedrooms: number | null;
  lostAt: Date | null;
  district: string | null;
}
export interface SimilarTarget {
  id: number;
  priceMonth: number | null;
  bedrooms: number | null;
  district: string | null;
}

export function pickSimilar<T extends SimilarRow>(target: SimilarTarget, rows: readonly T[], n = 3): T[] {
  const scored = rows
    .filter((r) => r.id !== target.id && !r.lostAt && r.rentPeriod === "MONTHLY" && !!r.priceMonth)
    .filter((r) => !notAHome({ title: r.title, propertyType: r.propertyType, rentPeriod: "MONTHLY" }, { stay: "long" }))
    .filter((r) => !implausibleRent({ title: r.title, propertyType: r.propertyType, bedrooms: r.bedrooms, priceMonth: r.priceMonth, rentPeriod: "MONTHLY" }, { cheap: null }))
    .map((r) => {
      const price = target.priceMonth ? Math.abs(r.priceMonth! - target.priceMonth) / target.priceMonth : 0;
      const beds = target.bedrooms != null && r.bedrooms != null ? Math.abs(r.bedrooms - target.bedrooms) : 0;
      const place = target.district && r.district && target.district.toUpperCase() === r.district.toUpperCase() ? 0 : 1;
      // Same size first, then same district, then nearest rent.
      return { r, key: beds * 10 + place * 5 + price * 3 };
    })
    // Never a home 40% dearer or cheaper, or two bedrooms away: that is not "like this one".
    .filter(({ r }) => !target.priceMonth || Math.abs(r.priceMonth! - target.priceMonth) / target.priceMonth <= 0.4)
    .filter(({ r }) => target.bedrooms == null || r.bedrooms == null || Math.abs(r.bedrooms - target.bedrooms) <= 1)
    .sort((a, b) => a.key - b.key);
  return scored.slice(0, n).map((x) => x.r);
}
