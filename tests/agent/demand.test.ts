import { describe, expect, it } from "vitest";
import { demandMessage, needSummary, tenantAlertMessage } from "@/components/agent/broker-message";
import { brokerFitScore, normalisePhone, pickBrokersForDemand, type BrokerFit } from "@/components/agent/demand-pure";
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
  it("asks a broker for a home with one link, an opt-out, and no tenant details", () => {
    const text = demandMessage("@mossa", need, "https://www.mkan.sd/en/b/d/tok");
    expect(text).toContain("Hello @mossa");
    expect(text).toContain(need.en);
    expect(text).toContain("https://www.mkan.sd/en/b/d/tok");
    expect(text).toMatch(/STOP/);
    expect(text).toMatch(/HAGARIKA/);
  });
  it("alerts a tenant in their language with the chat link", () => {
    expect(tenantAlertMessage("en", 2, "L")).toMatch(/2 new homes.*\nL/);
    expect(tenantAlertMessage("ar", 1, "L")).toContain("منزلاً جديداً");
    expect(tenantAlertMessage("rw", 1, "L")).toContain("inzu nshya");
  });
});
