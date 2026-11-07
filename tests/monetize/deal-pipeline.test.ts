import { describe, expect, it } from "vitest";

import { nextStepOf, sortDeals, type DealRow } from "@/lib/monetize/deal-pipeline";

const NOW = new Date("2026-11-20T10:00:00Z");
const row = (over: Partial<DealRow>): DealRow => ({
  id: "d1",
  listingId: 6041,
  title: "2-bed in Kimihurura",
  status: "VIEWING_BOOKED",
  intro: true,
  createdAt: "2026-11-18T10:00:00Z",
  introducedAt: "2026-11-18T10:00:00Z",
  signedAt: null,
  paidAt: null,
  tenantPhone: "+250700000012",
  broker: "Jean",
  brokerPhone: "+250700000011",
  mkanShare: null,
  commission: null,
  shareAskedAt: null,
  ...over,
});

describe("the deal pipeline", () => {
  it("names who Mkan waits on, and the money tap once signed", () => {
    expect(nextStepOf(row({}), NOW)).toEqual({ key: "tenant24h", since: "2026-11-18T10:00:00Z", days: 2 });
    expect(nextStepOf(row({ introducedAt: "2026-11-10T10:00:00Z" }), NOW).key).toBe("followUp7d");
    expect(nextStepOf(row({ intro: false, introducedAt: null }), NOW).key).toBe("booked");
    expect(nextStepOf(row({ status: "SIGNED", signedAt: "2026-11-19T10:00:00Z" }), NOW).key).toBe("askCommission");
    expect(nextStepOf(row({ status: "SIGNED", mkanShare: 12000 }), NOW).key).toBe("sendShare");
    expect(nextStepOf(row({ status: "SIGNED", mkanShare: 12000, shareAskedAt: "2026-11-19T12:00:00Z" }), NOW)).toMatchObject({ key: "awaitPayment", days: 0 });
    expect(nextStepOf(row({ status: "PAID", paidAt: "2026-11-20T09:00:00Z" }), NOW).key).toBe("paid");
  });

  it("puts the deals waiting on money first", () => {
    const sorted = sortDeals(
      [row({ id: "a" }), row({ id: "b", status: "SIGNED", mkanShare: 12000 }), row({ id: "c", status: "PAID" }), row({ id: "d", status: "SIGNED", mkanShare: 9000, shareAskedAt: "2026-11-19T12:00:00Z" })],
      NOW,
    );
    expect(sorted.map((d) => d.id)).toEqual(["b", "d", "a", "c"]);
  });
});
