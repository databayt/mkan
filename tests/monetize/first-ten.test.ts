import { describe, expect, it } from "vitest";
import { firstTenOf } from "@/lib/monetize/deal-pipeline";

describe("firstTenOf — the first 10 paid deals (2026-11-15)", () => {
  it("is all zeros, with no net, before any deal", () => {
    expect(firstTenOf([])).toEqual({ paid: 0, target: 10, open: 0, revenue: 0, tripCosts: 0, netPerDeal: null });
  });

  it("counts paid and open deals, Mkan's share in, and every trip — a lost deal's trip cost money too", () => {
    const t = firstTenOf([
      { status: "PAID", mkanShare: 9000, tripCost: 2000 },
      { status: "PAID", mkanShare: 6000, tripCost: null },
      { status: "SIGNED", mkanShare: 8000, tripCost: 1500 },
      { status: "VIEWING_BOOKED", mkanShare: null, tripCost: null },
      { status: "LOST", mkanShare: null, tripCost: 3000 },
    ]);
    expect(t.paid).toBe(2);
    expect(t.open).toBe(2);
    expect(t.revenue).toBe(15000); // a SIGNED share is not in yet
    expect(t.tripCosts).toBe(6500);
    expect(t.netPerDeal).toBe(4250); // (15000 − 6500) / 2
  });

  it("goes negative when the trips cost more than the shares — the number that says lean to bigger homes", () => {
    expect(firstTenOf([{ status: "PAID", mkanShare: 2000, tripCost: 5000 }]).netPerDeal).toBe(-3000);
  });
});
