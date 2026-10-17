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
