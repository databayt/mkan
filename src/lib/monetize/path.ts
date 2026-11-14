/**
 * The money on the path (2026-11-14, Abdout: "make it a clear path to money"). /monetize already showed
 * the road from a post to a paid deal in counts; it never said what a paid deal is worth or how many of
 * them cover the costs. One line under the funnel now does:
 *
 *   a paid deal earns Mkan about X  ·  break-even is N paid deals a month  ·  P paid this month, L to go
 *
 * X is the median of what paid deals really brought once there are a few; until then it is Mkan's share
 * (intro-pure.ts MKAN_TERMS) of the usual broker commission (cost.ts KIGALI_LONG_TERMS) on the rent
 * tenants actually ask about. Pure, so the arithmetic is tested.
 */

/** Paid deals needed before their median is trusted over the estimate. */
export const PAID_SAMPLE_MIN = 3;

export interface PathInput {
  /** What a month costs (money.ts breakEvenRwf). */
  breakEvenRwf: number;
  /** Mkan's share on each deal paid in the last 90 days. */
  paidShares: readonly number[];
  /** The median monthly rent of the homes tenants picked lately, else of the live broker homes. */
  typicalRentRwf: number | null;
  /** The usual broker commission, as a share of one month's rent: [low, high]. */
  commissionPct: readonly [number, number];
  /** Mkan's share of that commission. */
  sharePct: number;
  paidThisMonth: number;
}

export interface PathView {
  sharePerDealRwf: number | null;
  /** Where the figure comes from: real paid deals, or the usual terms on a typical rent. */
  basis: "paid" | "typical" | null;
  typicalRentRwf: number | null;
  breakEvenRwf: number;
  dealsToBreakEven: number | null;
  paidThisMonth: number;
  dealsLeft: number | null;
}

const median = (xs: readonly number[]): number | null => {
  const s = xs.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (s.length === 0) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
};

export function pathToMoney(i: PathInput): PathView {
  const paid = i.paidShares.filter((x) => x > 0);
  const fromPaid = paid.length >= PAID_SAMPLE_MIN ? median(paid) : null;
  const rent = i.typicalRentRwf != null && i.typicalRentRwf > 0 ? Math.round(i.typicalRentRwf) : null;
  // Rounded to the hundred: an estimate should not read as a measurement.
  const fromTerms = rent != null ? Math.round((rent * ((i.commissionPct[0] + i.commissionPct[1]) / 2) * i.sharePct) / 100) * 100 : null;
  const sharePerDealRwf = fromPaid ?? fromTerms;
  const breakEvenRwf = Math.max(0, Math.round(i.breakEvenRwf));
  const dealsToBreakEven = sharePerDealRwf != null && sharePerDealRwf > 0 ? Math.max(1, Math.ceil(breakEvenRwf / sharePerDealRwf)) : null;
  return {
    sharePerDealRwf,
    basis: fromPaid != null ? "paid" : fromTerms != null ? "typical" : null,
    typicalRentRwf: rent,
    breakEvenRwf,
    dealsToBreakEven,
    paidThisMonth: i.paidThisMonth,
    dealsLeft: dealsToBreakEven != null ? Math.max(0, dealsToBreakEven - i.paidThisMonth) : null,
  };
}
