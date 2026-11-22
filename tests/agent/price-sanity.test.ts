// @vitest-environment node
/** 2026-11-22: "2-bedroom villa · 40,000", "3-bedroom house · 70,000", an "Airbnb stay" at 36k a month, a shop in a home search reached tenants. */
import { describe, expect, it } from "vitest";
import { implausibleRent, notAHome, passesHardFilters, rankCandidates, type Candidate } from "@/components/agent/rank";
import { EMPTY_REQUIREMENTS, type Requirements } from "@/components/agent/requirements";

const r: Requirements = { ...EMPTY_REQUIREMENTS, stay: "long", pricePeriod: "month" };
let n = 100;
const home = (over: Partial<Candidate>): Candidate =>
  ({ id: ++n, hostId: "h", title: "House in Kabeza", rentPeriod: "MONTHLY", priceMonth: 200_000, pricePerNight: null, monthlyDiscount: null, cleaningFee: null, bedrooms: 2, guestCount: 4, district: "Kicukiro", averageRating: null, numberOfReviews: null, confirmedAt: null, latitude: -1.97, longitude: 30.1, propertyType: "Villa", ...over }) as Candidate;

describe("a rent no real home of that size costs", () => {
  it("drops a 2+ bed house, villa or apartment under ~60k, and a 3+ bed under ~100k", () => {
    expect(implausibleRent(home({ title: "2-bedroom villa", priceMonth: 40_000 }), r)).toBe(true);
    expect(implausibleRent(home({ title: "3-bedroom house", bedrooms: 3, priceMonth: 70_000, propertyType: "Townhouse" }), r)).toBe(true);
    expect(implausibleRent(home({ title: "Apartment, 2 bedrooms", bedrooms: null, propertyType: "Apartment", priceMonth: 55_000 }), r)).toBe(true);
    expect(passesHardFilters(home({ priceMonth: 40_000 }), r)).toBe(false);
  });
  it("keeps real rents, rooms, studios and one-bedrooms", () => {
    expect(implausibleRent(home({ priceMonth: 80_000 }), r)).toBe(false);
    expect(implausibleRent(home({ title: "Room for rent", propertyType: "Rooms", bedrooms: 1, priceMonth: 30_000 }), r)).toBe(false);
    expect(implausibleRent(home({ title: "Studio", bedrooms: 0, propertyType: "Apartment", priceMonth: 40_000 }), r)).toBe(false);
    expect(implausibleRent(home({ title: "1-bedroom apartment", bedrooms: 1, propertyType: "Apartment", priceMonth: 45_000 }), r)).toBe(false);
  });
  it("is waived when the tenant asked for the cheapest", () => {
    expect(implausibleRent(home({ priceMonth: 40_000 }), { ...r, cheap: true })).toBe(false);
  });
  it("never ranks the noise", () => {
    const real = home({ title: "2 bedroom house in Remera", priceMonth: 180_000 });
    const noise = [home({ title: "2-bedroom villa", priceMonth: 40_000 }), home({ title: "3-bedroom house", bedrooms: 3, priceMonth: 70_000 })];
    expect(rankCandidates([...noise, real], r).ranked.map((x) => x.id)).toEqual([real.id]);
  });
});

describe("no non-homes in a monthly search", () => {
  it("drops shops, offices, business rooms, hotels and Airbnb stays", () => {
    for (const title of ["Shop for rent", "Business room", "Office space for rent in Kimihurura", "Airbnb stay in Remera", "Hotel room in Nyarugenge", "Hostel bed"]) {
      expect(notAHome(home({ title, priceMonth: 36_000 }), r), title).toBe(true);
    }
    expect(notAHome(home({ title: "2 bedroom house in Remera" }), r)).toBe(false);
  });
});
