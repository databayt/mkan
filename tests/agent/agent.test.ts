import { describe, expect, it } from "vitest";
import { longStayCost, monthlyRent, shortStayCost } from "@/components/agent/cost";
import { groupDuplicates, passesHardFilters, rankCandidates, type Candidate } from "@/components/agent/rank";
import { EMPTY_REQUIREMENTS, mergeRequirements, missingHardField, parseRequirements } from "@/components/agent/requirements";

const monthlyHome = { rentPeriod: "MONTHLY" as const, pricePerNight: null, priceMonth: 300_000, monthlyDiscount: null, cleaningFee: null };

describe("cost", () => {
  it("prices a Kigali broker home the way brokers charge", () => {
    const c = longStayCost(monthlyHome)!;
    // 3 months + half-month deposit + 25% commission + 5k viewing fee
    expect(c.total).toBe(1_130_000);
    expect(c.totalHigh).toBe(1_145_000);
    expect(c.headline).toBe(300_000);
  });

  it("prices a month in a nightly home like a booking, with its discount", () => {
    const home = { rentPeriod: "NIGHTLY" as const, pricePerNight: 50_000, priceMonth: null, monthlyDiscount: 20, cleaningFee: 0 };
    expect(monthlyRent(home)).toBe(1_200_000);
    const c = longStayCost(home)!;
    expect(c.total).toBe(1_200_000 + 144_000);
    expect(c.lines.find((l) => l.key === "monthlyDiscount")?.amount).toBe(-300_000);
  });

  it("prices a short stay with the 12% service fee", () => {
    const home = { rentPeriod: "NIGHTLY" as const, pricePerNight: 40_000, priceMonth: null, monthlyDiscount: null, cleaningFee: 10_000 };
    expect(shortStayCost(home, 3)!.total).toBe(120_000 + 10_000 + 14_400);
  });
});

describe("parseRequirements", () => {
  it("reads an English long-term request", () => {
    const r = parseRequirements("I need a furnished 2-bedroom in Kicukiro, max 400k per month");
    expect(r).toMatchObject({ stay: "long", bedrooms: 2, furnished: true, district: "KICUKIRO", maxPrice: 400_000, pricePeriod: "month" });
  });

  it("reads an Arabic short stay with Arabic-Indic digits", () => {
    const r = parseRequirements("أريد ٣ ليال في غاسابو لشخصين بأقل من ٦٠ ألف لليلة");
    expect(r).toMatchObject({ stay: "short", nights: 3, district: "GASABO", maxPrice: 60_000, pricePeriod: "night" });
  });

  it("reads Kinyarwanda and a neighbourhood", () => {
    const r = parseRequirements("Ndashaka inzu ifite ibyumba 3 i Remera, 500,000 ku kwezi");
    expect(r).toMatchObject({ stay: "long", bedrooms: 3, district: "GASABO", maxPrice: 500_000 });
  });

  it("separates the move-in cash from the rent ceiling", () => {
    const r = parseRequirements("studio up to 250k monthly, I have 900k upfront");
    expect(r).toMatchObject({ bedrooms: 0, maxPrice: 250_000, maxUpfront: 900_000 });
  });

  it("asks for the stay type, then the budget", () => {
    let r = mergeRequirements(EMPTY_REQUIREMENTS, parseRequirements("2 bedroom in Kicukiro"));
    expect(missingHardField(r)).toBe("stay");
    r = mergeRequirements(r, parseRequirements("Monthly rent"));
    expect(missingHardField(r)).toBe("maxPrice");
    r = mergeRequirements(r, parseRequirements("350000"));
    expect(missingHardField(r)).toBeNull();
    expect(r).toMatchObject({ bedrooms: 2, district: "KICUKIRO", stay: "long", maxPrice: 350_000, pricePeriod: "month" });
  });
});

const cand = (over: Partial<Candidate>): Candidate => ({
  id: 1,
  hostId: "h1",
  rentPeriod: "NIGHTLY",
  pricePerNight: 10_000,
  priceMonth: null,
  monthlyDiscount: 0,
  cleaningFee: 0,
  bedrooms: 2,
  guestCount: 4,
  district: "Kicukiro",
  averageRating: 4.8,
  numberOfReviews: 20,
  confirmedAt: null,
  ...over,
});

describe("rank", () => {
  const req = { ...EMPTY_REQUIREMENTS, stay: "long" as const, district: "KICUKIRO" as const, bedrooms: 2, maxPrice: 400_000, pricePeriod: "month" as const };

  it("groups one host's reposts of the same unit", () => {
    const { kept, removed } = groupDuplicates([cand({ id: 1 }), cand({ id: 2, averageRating: 4.9 }), cand({ id: 3, hostId: "h2" })]);
    expect(removed).toBe(1);
    expect(kept.map((k) => k.id).sort()).toEqual([2, 3]);
  });

  it("drops homes over budget, in another district or too small", () => {
    expect(passesHardFilters(cand({ pricePerNight: 20_000 }), req)).toBe(false); // 600k/month
    expect(passesHardFilters(cand({ district: "Gasabo" }), req)).toBe(false);
    expect(passesHardFilters(cand({ bedrooms: 1 }), req)).toBe(false);
    expect(passesHardFilters(cand({}), req)).toBe(true);
  });

  it("never marks an imported home as confirmed", () => {
    const { ranked } = rankCandidates([cand({})], req);
    expect(ranked[0]?.reasons).not.toContain("confirmed");
  });

  it("ranks a broker-confirmed home above an unconfirmed twin", () => {
    const { ranked } = rankCandidates([cand({ id: 1 }), cand({ id: 2, hostId: "h2", confirmedAt: new Date() })], req);
    expect(ranked[0]?.id).toBe(2);
  });
});

describe("badges and place filters", () => {
  const base = { ...EMPTY_REQUIREMENTS, stay: "long" as const, maxPrice: 1_000_000, pricePeriod: "month" as const };
  const at = (lat: number, lng: number, extra: Partial<Candidate> = {}) =>
    ({
      id: Math.round(Math.abs(lat * lng * 1000)),
      hostId: `h${lat}`,
      rentPeriod: "MONTHLY",
      pricePerNight: null,
      priceMonth: 500_000,
      monthlyDiscount: null,
      cleaningFee: null,
      bedrooms: 2,
      guestCount: 2,
      district: "GASABO",
      averageRating: 4.8,
      numberOfReviews: 10,
      confirmedAt: null,
      latitude: lat,
      longitude: lng,
      ...extra,
    }) as Candidate;

  it("reads compound, area, family, cheap, baths and a neighbourhood from text", () => {
    const r = parseRequirements("cheap self compound for a family near a university in Kibagabaga with 2 bathrooms");
    expect(r).toMatchObject({ compound: true, area: "university", family: true, cheap: true, bathrooms: 2, neighbourhood: "Kibagabaga" });
  });

  it("keeps a home in the picked neighbourhood and drops one across town", () => {
    const r = { ...base, neighbourhood: "Kimihurura" };
    expect(passesHardFilters(at(-1.951, 30.091), r)).toBe(true);
    expect(passesHardFilters(at(-1.98, 30.04), r)).toBe(false); // Nyamirambo
  });

  it("matches a lead's neighbourhood on its address, not its district-centre pin", () => {
    const r = { ...base, neighbourhood: "Kimihurura" };
    expect(passesHardFilters(at(-1.94, 30.1, { approxLocation: true, address: "Kimihurura, near KCC" }), r)).toBe(true);
    // A district-centre pin never satisfies "near the city centre".
    expect(passesHardFilters(at(-1.9441, 30.0619, { approxLocation: true }), { ...base, area: "center" })).toBe(false);
  });

  it("self compound means a villa, townhouse or cottage", () => {
    const r = { ...base, compound: true };
    expect(passesHardFilters(at(-1.95, 30.09, { propertyType: "Villa" }), r)).toBe(true);
    expect(passesHardFilters(at(-1.95, 30.09, { propertyType: "Apartment" }), r)).toBe(false);
  });

  it("cheap ranks the lowest price first", () => {
    const pricey = at(-1.95, 30.09, { id: 1, hostId: "a", priceMonth: 900_000 });
    const cheap = at(-1.95, 30.091, { id: 2, hostId: "b", priceMonth: 300_000, averageRating: 4.2 });
    const { ranked } = rankCandidates([pricey, cheap], { ...base, cheap: true });
    expect(ranked[0]?.id).toBe(2);
  });

  it("badge picks win over what the text said", () => {
    const merged = mergeRequirements(parseRequirements("2 bedroom in Gasabo"), { district: "NYARUGENGE", bedrooms: 1 });
    expect(merged).toMatchObject({ district: "NYARUGENGE", bedrooms: 1 });
  });
});
