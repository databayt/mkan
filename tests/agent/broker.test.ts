import { describe, expect, it } from "vitest";
import {
  aboutMeMessage,
  availabilityMessage,
  nudgeMessage,
  availableAckMessage,
  greetName,
  offersReplyMenu,
  needSummary,
  pickPhrase,
  priceQuestionMessage,
  reAskMessage,
  takenAckMessage,
  viewingChosenMessage,
} from "@/components/agent/broker-message";
import { parseBrokerReply } from "@/components/agent/broker-reply";
import { EMPTY_REQUIREMENTS } from "@/components/agent/requirements";
import { planMirror } from "../../scripts/crm/tiktok-mirror";

const ad = (k: string) => `https://www.tiktok.com/@kigali.homes/video/${k}`;
const seeds = ["a", "b", "c", "d", "e", "f", "g", "h"];
/** What a message from Mkan must never carry: a renter's voice, a link to tap, a form. */
const POSING = /I'm looking|my family|I'm a student|one tap|tap here|form|reply with a number/i;

describe("broker message", () => {
  const need = needSummary({ ...EMPTY_REQUIREMENTS, bedrooms: 3, district: "KICUKIRO", maxPrice: 600_000, pricePeriod: "month", stay: "long" });

  it("states the need the way brokers write it, in Kinyarwanda for the form, and as Mkan tells it", () => {
    expect(need.en).toBe("a 3-bedroom, in Kicukiro, up to 600k");
    expect(need.rw).toBe("ibyumba 3, i Kicukiro, kugeza RWF 600,000 ku kwezi");
    expect(need.they).toBe("They're looking for a 3-bedroom in Kicukiro, up to 600k.");
    expect(needSummary({ ...EMPTY_REQUIREMENTS, bedrooms: 2, purpose: "family" }).they).toBe("They're looking for a 2-bedroom in Kigali. It's for a family.");
  });

  it("introduces Mkan in a broker's first message: who we are, the ad, the ask, how to stop", () => {
    for (const k of seeds) {
      const t = availabilityMessage([{ title: "3-bed in Kagarama", link: ad(k) }], k, { introduce: true, name: "Eric", need: need.they });
      expect(t).toMatch(/^Muraho Eric, ni Mkan\./);
      expect(t).toMatch(/\n\nHi Eric, this is Mkan\./);
      expect(t).toContain(ad(k));
      expect(t).toContain(need.they);
      expect(t).toMatch(/Is it still available\? Reply 1 = still available, 2 = taken\./);
      expect(t).toMatch(/just reply stop\.$/);
      expect(t).not.toContain("3-bed in Kagarama");
      expect(t).not.toMatch(POSING);
    }
    expect(availabilityMessage([{ title: "A", link: ad("1") }], "s", { introduce: true, bilingual: false })).toMatch(/^Hi there, this is Mkan\./);
  });

  it("keeps later asks short, as Mkan, with the tenant's need", () => {
    const texts = seeds.map((k) => availabilityMessage([{ title: "A", link: ad(k) }], k, { introduce: false, name: "Eric", need: need.they }));
    texts.forEach((t, i) => {
      expect(t).toMatch(/Mkan/);
      expect(t).toContain(ad(seeds[i]!));
      expect(t).toContain(need.they);
      expect(t).toMatch(/available\? Reply 1 = still available, 2 = taken\.$/);
      expect(t).not.toMatch(/reply stop/);
      expect(t).not.toMatch(POSING);
    });
    expect(new Set(texts.map((t) => t.replace(/https:\S+/, ""))).size).toBeGreaterThan(1);
  });

  it("asks about several ads in one message, links only", () => {
    const text = availabilityMessage([{ title: "A", link: ad("1") }, { title: "B", link: ad("2") }, { title: "A again", link: ad("1") }], "s", { introduce: false });
    expect(text).toMatch(/Are they still available\?$/);
    // "1" could mean either home: several homes get no digit menu, and no ref.
    expect(offersReplyMenu(text)).toBe(false);
    expect(text).not.toMatch(/ref /);
    expect(text.match(/https:/g)).toHaveLength(2);
    expect(text).not.toMatch(/\+?\d{9,}|A again/);
  });

  it("writes in the broker's language when their ads use French or Kinyarwanda", () => {
    const fr = availabilityMessage([{ title: "A", link: ad("1") }], "s", { introduce: true, lang: "FR" });
    expect(fr).toMatch(/^Bonjour, ici Mkan\./);
    expect(fr).toMatch(/répondez simplement stop\.$/);
    const rw = availabilityMessage([{ title: "A", link: ad("1") }], "s", { introduce: true, lang: "RW", bilingual: false });
    expect(rw).toMatch(/^Muraho, ni Mkan\./);
    expect(rw).toMatch(/subiza stop\.$/);
    expect(availabilityMessage([{ title: "A", link: ad("1") }], "s", { introduce: true, lang: "SW", bilingual: false })).toMatch(/^Hi there, this is Mkan/);
    // The one-digit answer, in their language.
    expect(rw).toContain("Iracyahari? Subiza 1 = iracyahari, 2 = yafashwe.");
    expect(fr).toContain("Est-elle toujours disponible ? Répondez 1 = disponible, 2 = déjà prise.");
    for (const lang of ["EN", "FR", "RW"]) for (const k of seeds) expect(offersReplyMenu(availabilityMessage([{ title: "A", link: ad(k) }], k, { introduce: false, lang }))).toBe(true);
  });

  it("writes Kinyarwanda first with English under it, the link once", () => {
    for (const lang of [undefined, "EN", "RW"]) {
      const t = availabilityMessage([{ title: "A", link: ad("1") }], "s", { introduce: false, lang, need: "They're looking for a studio." });
      const [rw, en, ...rest] = t.split("\n\n");
      expect(rest).toHaveLength(0);
      expect(rw).toMatch(/^Muraho/);
      expect(en).toMatch(/^(Hi|Hello)/);
      expect(t.split(ad("1"))).toHaveLength(2); // the link appears once, in the Kinyarwanda half
      expect(en).toContain("They're looking for a studio.");
      expect(offersReplyMenu(t)).toBe(true);
    }
    // French brokers keep French only.
    expect(availabilityMessage([{ title: "A", link: ad("1") }], "s", { introduce: false, lang: "FR" })).not.toMatch(/Muraho|Hi /);
  });

  it("nudges in Kinyarwanda first with English under it, never naming a person", () => {
    const one = nudgeMessage([ad("1"), ad("1")], "RW", "Eric");
    expect(one).toMatch(/^Muraho Eric, ni Mkan nanone: iracyahari\?/);
    expect(one).toMatch(/\n\nHi Eric, a quick reminder from Mkan: is this still available\?/);
    expect(one.split(ad("1"))).toHaveLength(2);
    expect(offersReplyMenu(one)).toBe(true);
    const many = nudgeMessage([ad("1"), ad("2")], null);
    expect(many).toContain("ziracyahari");
    expect(offersReplyMenu(many)).toBe(false);
    expect(nudgeMessage([ad("1")], "FR")).toMatch(/^Bonjour/);
    expect(one + many).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("puts the home's Mkan ref beside its link, when it has one", () => {
    const t = availabilityMessage([{ title: "A", link: ad("1"), code: "0002-05" }], "s", { introduce: false });
    expect(t).toContain(`${ad("1")} (ref 0002-05)`);
    expect(availabilityMessage([{ title: "A", link: ad("1"), code: null }], "s", { introduce: false })).not.toMatch(/ref/);
  });

  it("greets a person by name, never an agency, a handle or a flag", () => {
    expect(greetName("Eric")).toBe("Eric");
    expect(greetName("Marie Claire")).toBe("Marie Claire");
    for (const n of ["Ibra real estate 🇷🇼", "@kigali.homes", "Kigali Students Living Services", "", null]) expect(greetName(n)).toBeNull();
  });

  it("follows up as Mkan, with only what the tenant said", () => {
    expect(aboutMeMessage(need, "x")).toMatch(/^They're looking for a 3-bedroom in Kicukiro, up to 600k\. Is it still (available|free)\?$/);
    expect(aboutMeMessage(need, "x", true)).toMatch(/Are (they|these) still/);
    for (const k of seeds) {
      expect(availableAckMessage(k)).toMatch(/viewing/);
      expect(availableAckMessage(k)).not.toMatch(POSING);
      expect(takenAckMessage(k)).not.toMatch(POSING);
    }
    expect(reAskMessage("Hi", "x")).toMatch(/is it still available\?/i);
    expect(reAskMessage("Hello how are you?", "x")).toMatch(/^(Good|Fine)/);
    expect(priceQuestionMessage("x")).toMatch(/month/);
  });

  it("never uses an emoji in anything a broker reads", () => {
    const emoji = /\p{Extended_Pictographic}/u;
    const demand = needSummary({ ...EMPTY_REQUIREMENTS, bedrooms: 2, purpose: "family" });
    for (const k of seeds) {
      for (const t of [
        availabilityMessage([{ title: "A", link: ad(k) }], k, { introduce: true, name: "Ibra real estate 🇷🇼" }),
        availabilityMessage([{ title: "A", link: ad(k) }], k, { introduce: false }),
        availabilityMessage([{ title: "A", link: ad("1") }, { title: "B", link: ad("2") }], k),
        availabilityMessage([{ title: "A", link: ad(k) }], k, { introduce: true, lang: "RW" }),
        availabilityMessage([{ title: "A", link: ad(k) }], k, { introduce: true, lang: "FR" }),
        aboutMeMessage(demand, k),
        reAskMessage("Hi", k),
        reAskMessage("Hello how are you?", k),
        availableAckMessage(k),
        takenAckMessage(k),
        priceQuestionMessage(k),
        viewingChosenMessage("Flat", "Sat 18 Oct, 10:00", `https://x/b/${k}`),
      ]) expect(t, t).not.toMatch(emoji);
    }
  });

  it("picks the same phrasing for the same seed", () => {
    expect(pickPhrase("seed", ["a", "b", "c"])).toBe(pickPhrase("seed", ["a", "b", "c"]));
  });

  it.each(["Are you a bot?", "r u a robot", "is this automatic?", "Are you a real person?", "Uri umuntu?"])("%s goes to a person", (t) => {
    expect(parseBrokerReply(t).asksIfBot).toBe(true);
  });
  it.each(["How much?", "Is there a washing machine", "Yes available", "Price 300k"])("%s is not a bot question", (t) => {
    expect(parseBrokerReply(t).asksIfBot).toBe(false);
  });

  it("asks for the chosen viewing time as Mkan, for its tenant", () => {
    const text = viewingChosenMessage("Flat", "Sat 18 Oct, 10:00", "https://x/b/t");
    expect(text).toContain("Sat 18 Oct, 10:00");
    expect(text).toMatch(/Mkan/);
    expect(text).not.toContain("Flat");
    expect(text).not.toMatch(POSING);
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
    // A duplicate still at VETTING is skipped for its status, and says so (it read "stage VETTING").
    expect(planMirror({ ...home, pipelineStage: "VETTING", homeStatus: "DUPLICATE" }, host)).toEqual({ skip: "status DUPLICATE" });
  });
});

describe("who to ask", () => {
  // Each broker their own number: one number under two accounts is one person (pickBroker asks it once).
  const b = (userId: string) => ({ listingId: 5, userId, user: { phoneNumber: `+25078800000${userId.charCodeAt(0) % 10}`, username: null, sourceHostId: `tiktok:${userId}` } });
  const now = Date.parse("2026-11-01T12:00:00Z");
  const hours = (h: number) => new Date(now + h * 3_600_000);
  const req = (brokerUserId: string, status: string, createdAt = hours(-30), expiresAt = hours(-6)) => ({ id: `r-${brokerUserId}`, listingId: 5, brokerUserId, status, expiresAt, taskId: "t0", createdAt });

  it("joins a question still out, else asks the first broker not asked about the home lately", async () => {
    const { pickBroker } = await import("../../src/components/agent/broker");
    expect(pickBroker([b("a"), b("b")], new Map(), now)).toEqual({ ask: b("a") });
    expect(pickBroker([b("a"), b("b")], new Map([["5:a", req("a", "NO_REPLY")]]), now)).toEqual({ ask: b("b") });
    expect(pickBroker([b("a"), b("b")], new Map([["5:b", req("b", "PENDING", hours(-2), hours(22))]]), now)).toMatchObject({ join: { brokerUserId: "b" } });
  });

  it("never asks the same broker about the same home again the next day (the 10-24..11-01 loop)", async () => {
    const { pickBroker } = await import("../../src/components/agent/broker");
    // One broker, asked 30 h ago, silent: the hourly cron used to ask them again every day for a week.
    expect(pickBroker([b("a")], new Map([["5:a", req("a", "NO_REPLY")]]), now)).toBeNull();
    // A pending ask past its expiry is neither joined nor repeated.
    expect(pickBroker([b("a")], new Map([["5:a", req("a", "PENDING")]]), now)).toBeNull();
    // A broker who said "rented" is not asked again either.
    expect(pickBroker([b("a")], new Map([["5:a", req("a", "RENTED")]]), now)).toBeNull();
  });

  it("hands a slow ask on to the next broker, never back to the one still being asked", async () => {
    const { pickBroker } = await import("../../src/components/agent/broker");
    const pending = new Map([["5:a", req("a", "PENDING", hours(-4), hours(20))]]);
    expect(pickBroker([b("a"), b("b")], pending, now, { join: false })).toEqual({ ask: b("b") });
    expect(pickBroker([b("a")], pending, now, { join: false })).toBeNull();
  });

  it("asks again a broker who said it was available, once that answer is old", async () => {
    const { pickBroker } = await import("../../src/components/agent/broker");
    expect(pickBroker([b("a")], new Map([["5:a", req("a", "AVAILABLE", hours(-24))]]), now)).toBeNull();
    expect(pickBroker([b("a")], new Map([["5:a", req("a", "AVAILABLE", hours(-24 * 4))]]), now)).toEqual({ ask: b("a") });
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

  it("keeps the ad a tenant's ref named, and keeps it on the shortlist when it fits", async () => {
    const { groupDuplicates, rankCandidates } = await import("../../src/components/agent/rank");
    const { EMPTY_REQUIREMENTS: E } = await import("../../src/components/agent/requirements");
    const lead = (id: number, price: number, address: string) =>
      ({ id, hostId: `h${id}`, rentPeriod: "MONTHLY", priceMonth: price, bedrooms: 2, guestCount: 4, district: "Kicukiro", averageRating: null, numberOfReviews: null, confirmedAt: null, approxLocation: true, address, amenities: [], highlights: [] }) as never;
    // Two brokers posted the same house: the one the tenant's ref named stands for it.
    expect(groupDuplicates([lead(1, 500_000, "Kabeza"), lead(2, 500_000, "Kabeza")], 2).kept.map((c) => (c as { id: number }).id)).toEqual([2]);
    // Seven homes fit and one is left off the six: pinned, it leads them.
    const homes = [1, 2, 3, 4, 5, 6, 7].map((i) => lead(i, 200_000 + i * 20_000, `Place${i}`));
    const r = { ...E, stay: "long" as const, district: "KICUKIRO" as const, bedrooms: 2, maxPrice: 400_000, pricePeriod: "month" as const };
    const plain = rankCandidates(homes, r).ranked.map((x) => x.id);
    const last = [1, 2, 3, 4, 5, 6, 7].find((id) => !plain.includes(id))!;
    expect(plain).toHaveLength(6);
    const pinned = rankCandidates(homes, r, 6, new Date(), last).ranked.map((x) => x.id);
    expect(pinned[0]).toBe(last);
    expect(pinned).toHaveLength(6);
  });
});

describe("one person, two accounts", () => {
  it("is not asked again as 'the next broker' for the same home", async () => {
    const { pickBroker } = await import("@/components/agent/broker");
    const now = Date.parse("2026-11-06T10:00:00Z");
    const link = (userId: string, phone: string) => ({ listingId: 5, userId, user: { phoneNumber: phone, username: null, sourceHostId: null } });
    const silent = { id: "r1", listingId: 5, brokerUserId: "u1", status: "NO_REPLY", createdAt: new Date(now - 30 * 3_600_000), expiresAt: new Date(now - 6 * 3_600_000) };
    const brokers = [link("u1", "+250720000015"), link("u2", "250720000015"), link("u3", "+250720000016")];
    expect(pickBroker(brokers as never, new Map([["5:u1", silent as never]]), now)).toEqual({ ask: brokers[2] });
  });
});
