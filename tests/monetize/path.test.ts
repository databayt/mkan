/**
 * The money on /monetize's path (2026-11-14): what a paid deal earns Mkan, and how many cover the month.
 */
import { describe, expect, it } from "vitest";
import { PAID_SAMPLE_MIN, pathToMoney } from "@/lib/monetize/path";

const base = { breakEvenRwf: 79_980, paidShares: [] as number[], typicalRentRwf: 350_000, commissionPct: [0.25, 0.3] as const, sharePct: 0.1, paidThisMonth: 0 };

describe("pathToMoney", () => {
  it("estimates a deal from the usual terms on the rent tenants ask about, until deals are paid", () => {
    // 350,000 × 27.5% × 10% = 9,625 → 9,600.
    expect(pathToMoney(base)).toEqual({ sharePerDealRwf: 9_600, basis: "typical", typicalRentRwf: 350_000, breakEvenRwf: 79_980, dealsToBreakEven: 9, paidThisMonth: 0, dealsLeft: 9 });
  });

  it("uses what paid deals really brought once there are a few", () => {
    expect(PAID_SAMPLE_MIN).toBe(3);
    expect(pathToMoney({ ...base, paidShares: [5_000, 20_000] }).basis).toBe("typical");
    const v = pathToMoney({ ...base, paidShares: [5_000, 12_000, 20_000], paidThisMonth: 2 });
    expect(v).toMatchObject({ sharePerDealRwf: 12_000, basis: "paid", dealsToBreakEven: 7, dealsLeft: 5 });
    // An even count takes the middle two; zeros (deals closed with no share) are left out.
    expect(pathToMoney({ ...base, paidShares: [0, 8_000, 10_000, 12_000, 30_000] }).sharePerDealRwf).toBe(11_000);
  });

  it("never asks for fewer than one deal, and never counts below zero left", () => {
    expect(pathToMoney({ ...base, breakEvenRwf: 0 }).dealsToBreakEven).toBe(1);
    expect(pathToMoney({ ...base, paidThisMonth: 12 }).dealsLeft).toBe(0);
  });

  it("says nothing it cannot work out", () => {
    expect(pathToMoney({ ...base, typicalRentRwf: null })).toMatchObject({ sharePerDealRwf: null, basis: null, dealsToBreakEven: null, dealsLeft: null });
  });

  it("cheaper costs need fewer deals; a dearer home earns more", () => {
    expect(pathToMoney({ ...base, breakEvenRwf: 37_580 }).dealsToBreakEven).toBe(4);
    expect(pathToMoney({ ...base, typicalRentRwf: 1_000_000 }).sharePerDealRwf).toBe(27_500);
  });
});
