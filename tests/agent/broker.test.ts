import { describe, expect, it } from "vitest";
import { availabilityMessage, needSummary, viewingChosenMessage } from "@/components/agent/broker-message";
import { EMPTY_REQUIREMENTS } from "@/components/agent/requirements";
import { planMirror } from "../../scripts/crm/tiktok-mirror";

describe("broker message", () => {
  const need = needSummary({ ...EMPTY_REQUIREMENTS, bedrooms: 3, district: "KICUKIRO", maxPrice: 600_000, pricePeriod: "month", stay: "long" });

  it("states the need in English and Kinyarwanda", () => {
    expect(need.en).toBe("3 bedrooms, in Kicukiro, up to RWF 600,000 a month");
    expect(need.rw).toBe("ibyumba 3, i Kicukiro, kugeza RWF 600,000 ku kwezi");
  });

  it("lists every home with its own one-tap link and never a tenant's details", () => {
    const text = availabilityMessage("mossa", need, [
      { title: "3-bed in Kagarama", link: "https://www.mkan.sd/en/b/aaa" },
      { title: "3-bed in Remera", link: "https://www.mkan.sd/en/b/bbb" },
    ]);
    expect(text).toContain("Hello @mossa");
    expect(text).toContain("1. 3-bed in Kagarama\nhttps://www.mkan.sd/en/b/aaa");
    expect(text).toContain("2. 3-bed in Remera\nhttps://www.mkan.sd/en/b/bbb");
    expect(text).toContain("Muraho!");
    expect(text).not.toMatch(/\+?\d{9,}/);
  });

  it("asks the broker to confirm the chosen time", () => {
    expect(viewingChosenMessage("Flat", "Sat 18 Oct, 10:00", "https://x/b/t")).toContain("Sat 18 Oct, 10:00");
  });
});

describe("tiktok mirror", () => {
  const home = {
    source: "TIKTOK",
    sourceId: "tiktok:123",
    pipelineStage: "VETTING",
    homeStatus: "SCRAPED",
    rentPeriod: "MONTH",
    priceMonthLocal: { amountMicros: 600_000_000_000, currencyCode: "RWF" },
    homeState: "KICUKIRO",
    homeAddress: { addressStreet1: "Kagarama" },
    titleEn: "3-bedroom house in Kagarama",
    bedrooms: 3,
    propertyType: "APARTMENT",
    sourceUrl: { primaryLinkUrl: "https://www.tiktok.com/@mossa/video/123", secondaryLinks: [] },
    photoUrls: { primaryLinkUrl: "https://cdn/1.jpg", secondaryLinks: [{ url: "https://cdn/2.jpg" }] },
  };
  const host = { tiktokHandle: "mossa", name: "Mossa", phone: { primaryPhoneNumber: "788000000", primaryPhoneCallingCode: "+250" }, agencySuspected: true };

  it("maps a monthly TikTok home to an unpublished lead with its broker", () => {
    const plan = planMirror(home, host);
    expect("skip" in plan).toBe(false);
    if ("skip" in plan) return;
    expect(plan.listing).toMatchObject({ priceMonth: 600_000, bedrooms: 3, propertyType: "Apartment", photoUrls: ["https://cdn/1.jpg", "https://cdn/2.jpg"] });
    expect(plan.location).toMatchObject({ address: "Kagarama", state: "Kicukiro", zoneKey: "KIGALI_KICUKIRO" });
    expect(plan.broker).toMatchObject({ handle: "mossa", role: "BROKER" });
    expect(plan.broker.phone).toMatch(/788000000/);
  });

  it("skips what the agent cannot use", () => {
    expect(planMirror({ ...home, rentPeriod: "NIGHT" }, host)).toEqual({ skip: "not a monthly rent" });
    expect(planMirror(home, { ...host, phone: null })).toEqual({ skip: "no broker phone" });
    expect(planMirror({ ...home, pipelineStage: "DUPLICATE" }, host)).toEqual({ skip: "stage DUPLICATE" });
  });
});

describe("who to ask", () => {
  const b = (userId: string) => ({ listingId: 5, userId, user: { phoneNumber: "+250788000000", username: null, sourceHostId: `tiktok:${userId}` } });
  const req = (brokerUserId: string, status: string) => ({ id: `r-${brokerUserId}`, listingId: 5, brokerUserId, status, expiresAt: new Date(), taskId: "t0" });

  it("joins a question already out, else asks the first broker not asked today", async () => {
    const { pickBroker } = await import("../../src/components/agent/broker");
    expect(pickBroker([b("a"), b("b")], new Map())).toEqual({ ask: b("a") });
    expect(pickBroker([b("a"), b("b")], new Map([["5:a", req("a", "NO_REPLY")]]))).toEqual({ ask: b("b") });
    expect(pickBroker([b("a"), b("b")], new Map([["5:b", req("b", "PENDING")]]))).toMatchObject({ join: { brokerUserId: "b" } });
    expect(pickBroker([b("a")], new Map([["5:a", req("a", "NO_REPLY")]]))).toBeNull();
  });
});

describe("one house, several brokers", () => {
  it("groups TikTok leads across brokers, never site homes", async () => {
    const { groupDuplicates } = await import("../../src/components/agent/rank");
    const lead = (id: number, hostId: string, address: string) =>
      ({ id, hostId, rentPeriod: "MONTHLY", priceMonth: 500_000, bedrooms: 2, guestCount: 4, district: "Kicukiro", averageRating: null, numberOfReviews: null, confirmedAt: null, approxLocation: true, address }) as never;
    expect(groupDuplicates([lead(1, "a", "Kabeza"), lead(2, "b", "Kabeza / Samuduha")]).removed).toBe(1);
    const site = (id: number, hostId: string) => ({ ...(lead(id, hostId, "") as object), approxLocation: false, address: "KN 5 Rd" }) as never;
    expect(groupDuplicates([site(3, "a"), site(4, "b")]).removed).toBe(0);
  });
});
