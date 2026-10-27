import { describe, expect, it } from "vitest";
import { demandMessage, needSummary, tenantAlertMessage } from "@/components/agent/broker-message";
import { AREA_ZONES, brokerFitScore, normalisePhone, pickBrokersForDemand, wantedZone, zoneMatch, type BrokerFit } from "@/components/agent/demand-pure";
import { KIGALI_ZONE_BY_SLUG } from "@/lib/geo/kigali-zones";
import { EMPTY_REQUIREMENTS, type Requirements } from "@/components/agent/requirements";

const now = new Date("2026-10-21T10:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
const broker = (over: Partial<BrokerFit> = {}): BrokerFit => ({
  id: "b",
  kind: "BROKER",
  phones: ["+250780000001"],
  districts: ["KICUKIRO"],
  neighbourhoods: ["Niboye"],
  stays: ["month"],
  priceMin: 250_000,
  priceMax: 900_000,
  lastSeenAt: daysAgo(2),
  lastAskedAt: null,
  asks: 0,
  answers: 0,
  optOut: false,
  ...over,
});
const want = (over: Partial<Requirements> = {}): Requirements => ({ ...EMPTY_REQUIREMENTS, stay: "long", district: "KICUKIRO", bedrooms: 2, maxPrice: 400_000, pricePeriod: "month", ...over });

describe("brokerFitScore", () => {
  it("never asks a broker who opted out, has no phone, or was asked in the last 24 h", () => {
    expect(brokerFitScore(broker({ optOut: true }), want(), now)).toBeNull();
    expect(brokerFitScore(broker({ phones: [] }), want(), now)).toBeNull();
    expect(brokerFitScore(broker({ lastAskedAt: new Date(now.getTime() - 3_600_000) }), want(), now)).toBeNull();
    expect(brokerFitScore(broker({ lastAskedAt: daysAgo(2) }), want(), now)).not.toBeNull();
  });

  it("skips brokers outside the district, but an agency with unknown coverage stays in", () => {
    expect(brokerFitScore(broker({ districts: ["GASABO"] }), want(), now)).toBeNull();
    expect(brokerFitScore(broker({ districts: [] }), want(), now)).toBeNull();
    expect(brokerFitScore(broker({ districts: [], kind: "AGENCY" }), want(), now)).not.toBeNull();
  });

  it("finds the district from a neighbourhood alone", () => {
    expect(brokerFitScore(broker(), want({ district: null, neighbourhood: "Niboye" }), now)).not.toBeNull();
    expect(brokerFitScore(broker({ districts: ["GASABO"] }), want({ district: null, neighbourhood: "Niboye" }), now)).toBeNull();
  });

  it("skips brokers whose cheapest homes are far above the budget", () => {
    expect(brokerFitScore(broker({ priceMin: 1_500_000 }), want(), now)).toBeNull();
  });
});

describe("pickBrokersForDemand", () => {
  it("ranks the neighbourhood specialist, recent and responsive brokers first, and caps the fan-out", () => {
    const list = [
      broker({ id: "stale", neighbourhoods: [], lastSeenAt: daysAgo(200) }),
      broker({ id: "local" }),
      broker({ id: "silent", neighbourhoods: [], asks: 10, answers: 0 }),
      ...Array.from({ length: 10 }, (_, i) => broker({ id: `x${i}`, neighbourhoods: [], lastSeenAt: daysAgo(20) })),
    ];
    const picked = pickBrokersForDemand(list, want({ neighbourhood: "Niboye" }), now);
    expect(picked).toHaveLength(8);
    expect(picked[0]!.id).toBe("local");
    expect(picked.map((b) => b.id)).not.toContain("stale");
  });
});

describe("zones served", () => {
  const remera = (over: Partial<BrokerFit> = {}) => broker({ districts: ["GASABO"], neighbourhoods: [], ...over });
  const inGasabo = (over: Partial<Requirements> = {}) => want({ district: "GASABO", ...over });

  it("knows the tenant's zone from the neighbourhood they named or their near pin", () => {
    expect(wantedZone(want({ neighbourhood: "Nyarutarama" }))?.slug).toBe("gasabo/remera/nyarutarama");
    expect(wantedZone(want({ neighbourhood: "Kimironko" }))?.slug).toBe("gasabo/kimironko");
    expect(wantedZone(want({ near: { name: "Kigali Heights", lat: -1.9531, lng: 30.0936 } }))?.level).not.toBe("district");
    expect(wantedZone(want())).toBeNull();
  });

  it("matches the place, then the sector", () => {
    const nyarutarama = KIGALI_ZONE_BY_SLUG.get("gasabo/remera/nyarutarama")!;
    expect(zoneMatch(["gasabo/remera/nyarutarama"], nyarutarama)).toBe(2);
    expect(zoneMatch(["gasabo/remera"], nyarutarama)).toBe(2);
    expect(zoneMatch(["gasabo/remera/kisimenti"], nyarutarama)).toBe(1);
    expect(zoneMatch(["gasabo"], nyarutarama)).toBe(0);
    expect(zoneMatch(["gasabo/kimironko"], nyarutarama)).toBe(0);
  });

  it("a neighbourhood or sector match outranks the district alone", () => {
    const r = inGasabo({ neighbourhood: "Nyarutarama" });
    const exact = brokerFitScore(remera({ zoneSlugs: ["gasabo/remera/nyarutarama"] }), r, now)!;
    const sector = brokerFitScore(remera({ zoneSlugs: ["gasabo/remera/kisimenti"] }), r, now)!;
    const district = brokerFitScore(remera({ zoneSlugs: ["gasabo/kimironko"] }), r, now)!;
    expect(exact).toBeGreaterThan(sector);
    expect(sector).toBeGreaterThan(district);
    const picked = pickBrokersForDemand(
      [remera({ id: "district", zoneSlugs: ["gasabo"] }), remera({ id: "sector", zoneSlugs: ["gasabo/remera/kisimenti"] }), remera({ id: "exact", zoneSlugs: ["gasabo/remera"] })],
      r,
      now,
    );
    expect(picked.map((b) => b.id)).toEqual(["exact", "sector", "district"]);
  });

  it("reads districts from zones when the old column is empty, and still excludes other districts", () => {
    expect(brokerFitScore(broker({ districts: [], zoneSlugs: ["gasabo/remera"] }), inGasabo(), now)).not.toBeNull();
    expect(brokerFitScore(broker({ districts: [], zoneSlugs: ["kicukiro/niboye"] }), inGasabo(), now)).toBeNull();
  });

  it("maps a 'near the business district' area to its zones", () => {
    expect(AREA_ZONES.business).toEqual(expect.arrayContaining(["gasabo/kimihurura", "gasabo/kacyiru"]));
    const r = inGasabo({ area: "business" });
    expect(brokerFitScore(remera({ zoneSlugs: ["gasabo/kacyiru"] }), r, now)!).toBeGreaterThan(brokerFitScore(remera({ zoneSlugs: ["gasabo/kimironko"] }), r, now)!);
  });

  it("an agency with no known zones is asked, but well after the locals", () => {
    const agency = brokerFitScore(broker({ kind: "AGENCY", districts: [], neighbourhoods: [] }), inGasabo(), now);
    const local = brokerFitScore(remera({ zoneSlugs: ["gasabo/remera"] }), inGasabo(), now);
    expect(agency).not.toBeNull();
    expect(local! - agency!).toBeGreaterThanOrEqual(20);
  });
});

describe("normalisePhone", () => {
  it("reads Rwandan numbers the ways tenants type them", () => {
    expect(normalisePhone("0788 123 456")).toBe("+250788123456");
    expect(normalisePhone("788123456")).toBe("+250788123456");
    expect(normalisePhone("+250 788-123-456")).toBe("+250788123456");
    expect(normalisePhone("00971501234567")).toBe("+971501234567");
  });
  it("refuses what cannot be a WhatsApp number", () => {
    expect(normalisePhone("hello")).toBeNull();
    expect(normalisePhone("12345")).toBeNull();
    expect(normalisePhone("+25012345")).toBeNull();
  });
});

describe("demand messages", () => {
  const need = needSummary(want());
  it("asks a broker for a home in plain words, with no tenant details", () => {
    const text = demandMessage(need, "req:broker");
    expect(text).toContain(need.me);
    expect(text).toMatch(/photos/i);
    expect(text).not.toMatch(/mkan|https?:|STOP|tenant|client|\+?\d{9,}/i);
  });
  it("alerts a tenant in their language with the chat link", () => {
    expect(tenantAlertMessage("en", 2, "L")).toMatch(/2 new homes.*\nL/);
    expect(tenantAlertMessage("ar", 1, "L")).toContain("منزلاً جديداً");
    expect(tenantAlertMessage("rw", 1, "L")).toContain("inzu nshya");
  });
});

describe("the ask answers what brokers ask back", () => {
  it("names type, furnishing, place, budget, move-in and household", () => {
    const need = needSummary(want({ homeType: "house", furnished: false, neighbourhood: "Kibagabaga", district: "GASABO", maxPrice: 400_000, moveIn: "2026-11-01", purpose: "family" }));
    expect(need.en).toBe("a 2-bedroom house with its own compound, unfurnished, in Kibagabaga, up to 400k, from 1 Nov, for a family");
    expect(need.rw).toContain("igipangu");
    expect(need.me).toBe("I'm looking for a 2-bedroom house with its own compound in Kibagabaga, unfurnished, up to 400k, from 1 Nov. It's for my family.");
    expect(demandMessage(need, "L")).toMatch(/price/);
    for (const k of ["a", "b", "c", "d"]) expect(demandMessage(need, k)).not.toMatch(/for a family|client/);
  });
});

describe("responsiveness", () => {
  it("asks the broker who answers in minutes before the one who takes a day", () => {
    const fast = brokerFitScore(broker({ replyMinutes: 2 }), want(), now)!;
    const slow = brokerFitScore(broker({ replyMinutes: 2_000 }), want(), now)!;
    const unknown = brokerFitScore(broker(), want(), now)!;
    expect(fast).toBeGreaterThan(unknown);
    expect(unknown).toBeGreaterThan(slow);
  });
});
