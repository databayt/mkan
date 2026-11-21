/**
 * Phase 1, item 6 — broker cadence (chat-funnel.md, "the broker side"). Brokers answered "You are not
 * serious… you ask me every day without visiting" and "Do you need a house or you keep sending sending??".
 * The rules below are the cadence: one message a broker a day, a home not asked about twice in 72 h, and an
 * ask that proposes two viewing times so one reply gives a yes and a time.
 */
import { describe, expect, it, vi } from "vitest";
import { availabilityMessage, viewingSlotLine } from "@/components/agent/broker-message";
import { brokerRest, planOutbox, type OutboxRow } from "../../scripts/wa/outbox-pure";

vi.mock("@/lib/db", () => ({ db: {} }));

const kigali = (iso: string) => new Date(`${iso}+02:00`);
const homes = [{ title: "1-bedroom in Gikondo", link: "https://www.mkan.sd/en/k/K6603", code: "K6603" }];
const slots = [
  { en: "Mon 23 Nov, 09:00", rw: "Mbere 23 Nov, 09:00" },
  { en: "Tue 24 Nov, 09:00", rw: "Kabiri 24 Nov, 09:00" },
];

describe("the ask carries two viewing times", () => {
  it("English: 'Could we view it A or B?', beside the one-tap answer", () => {
    const text = availabilityMessage(homes, "seed", { introduce: false, bilingual: false, slots });
    expect(text).toContain("Is it still available? Reply 1 = still available, 2 = taken. Could we view it Mon 23 Nov, 09:00 or Tue 24 Nov, 09:00?");
  });
  it("bilingual: Kinyarwanda carries its own times, English its own", () => {
    const text = availabilityMessage(homes, "seed", { introduce: true, slots });
    expect(text).toContain("Niba ihari, twayisura Mbere 23 Nov, 09:00 cyangwa Kabiri 24 Nov, 09:00?");
    expect(text).toContain("Could we view it Mon 23 Nov, 09:00 or Tue 24 Nov, 09:00?");
  });
  it("French broker, and a batched ask for several homes", () => {
    expect(availabilityMessage(homes, "seed", { introduce: false, lang: "FR", slots })).toContain("pourrait-on la visiter le Mon 23 Nov, 09:00 ou le Tue 24 Nov, 09:00 ?");
    const two = [...homes, { title: "Room", link: "https://www.mkan.sd/en/k/K6587" }];
    expect(availabilityMessage(two, "seed", { introduce: false, bilingual: false, slots })).toContain("If one is free, could we view it Mon 23 Nov, 09:00 or Tue 24 Nov, 09:00?");
  });
  it("no free time, no change: the ask is what it was", () => {
    const plain = availabilityMessage(homes, "seed", { introduce: false, bilingual: false });
    expect(availabilityMessage(homes, "seed", { introduce: false, bilingual: false, slots: [] })).toBe(plain);
    expect(plain).not.toMatch(/Could we view/);
    expect(viewingSlotLine("EN", false, undefined)).toBe("");
  });
  it("one time reads as one", () => {
    expect(viewingSlotLine("EN", false, [slots[0]!])).toBe(" Could we view it Mon 23 Nov, 09:00?");
  });
});

describe("one batched message per broker per day", () => {
  let n = 0;
  const ask = (over: Partial<OutboxRow> = {}): OutboxRow => ({ id: `a${++n}`, kind: "BROKER_REQUEST", to: "+250788111222", brokerId: "b1", createdAt: kigali("2026-11-23T08:30:00"), label: "@broker", ...over });
  const plan = (rows: OutboxRow[], over: Partial<Parameters<typeof planOutbox>[0]> = {}) =>
    planOutbox({ now: kigali("2026-11-23T10:00:00"), rows, sentToday: 0, lastSentAt: new Map(), optedOutBrokers: new Set(), cap: 40, ...over });

  it("two asks to one broker the same day: one goes, the other waits for tomorrow", () => {
    const p = plan([ask(), ask()]);
    expect(p.send).toHaveLength(1);
    expect(p.hold.map((h) => h.reason)).toEqual(["broker-today"]);
  });
  it("a broker already messaged today gets nothing more, a pick's re-ask included", () => {
    const sent = new Map([["to:250788111222", kigali("2026-11-23T08:00:00")]]);
    const p = plan([ask(), ask({ label: "pick:@broker" })], { lastSentAt: sent });
    expect(p.send).toHaveLength(0);
    expect(p.hold.map((h) => h.reason)).toEqual(["broker-today", "broker-today"]);
  });
  it("the line's own word back (auto-*) is not held: the broker started that conversation", () => {
    const sent = new Map([["to:250788111222", kigali("2026-11-23T08:00:00")]]);
    expect(plan([ask({ label: "auto-ack" })], { lastSentAt: sent }).send).toHaveLength(1);
  });
  it("three asks in a week, or two unanswered in a row, rest the broker", () => {
    const d = (h: number) => new Date(kigali("2026-11-23T10:00:00").getTime() - h * 3_600_000);
    expect(brokerRest([d(24), d(72), d(120)], null, kigali("2026-11-23T10:00:00"))).toBe("broker-week");
    expect(brokerRest([d(24 * 9), d(24 * 12)], null, kigali("2026-11-23T10:00:00"))).toBe("broker-resting");
    expect(brokerRest([d(24 * 9), d(24 * 12)], d(24 * 8), kigali("2026-11-23T10:00:00"))).toBeNull();
  });
});

describe("a home is not asked about twice in 72 hours", () => {
  const b = { listingId: 5, userId: "a", user: { phoneNumber: "+250788000001", username: null, sourceHostId: "tiktok:a" } };
  const now = Date.parse("2026-11-23T12:00:00Z");
  const hours = (h: number) => new Date(now + h * 3_600_000);
  const req = (status: string, createdAt: Date) => ({ id: "r", listingId: 5, brokerUserId: "a", status, expiresAt: hours(-6), taskId: "t0", createdAt });

  it("neither a search nor a tenant's own pick re-asks the same broker inside 72 h", async () => {
    const { pickBroker } = await import("../../src/components/agent/broker");
    for (const status of ["NO_REPLY", "PENDING", "AVAILABLE", "RENTED"]) {
      for (const hoursAgo of [1, 24, 48, 71]) {
        const recent = new Map([["5:a", req(status, hours(-hoursAgo))]]);
        expect(pickBroker([b as never], recent as never, now), `${status} ${hoursAgo}h`).toBeNull();
        expect(pickBroker([b as never], recent as never, now, { tenantPick: true }), `pick ${status} ${hoursAgo}h`).toBeNull();
      }
    }
  });
  it("a pick may re-ask a silent broker from 72 h on, once", async () => {
    const { pickBroker, PICK_REASK_MIN_DAYS } = await import("../../src/components/agent/broker");
    expect(PICK_REASK_MIN_DAYS * 24).toBeGreaterThanOrEqual(72);
    const recent = new Map([["5:a", req("NO_REPLY", hours(-73))]]);
    expect(pickBroker([b as never], recent as never, now, { tenantPick: true })).toMatchObject({ override: true });
    expect(pickBroker([b as never], recent as never, now, { tenantPick: true, overridden: new Set(["a"]) })).toBeNull();
  });
});
