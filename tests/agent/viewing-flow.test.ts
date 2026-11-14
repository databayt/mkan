/**
 * The viewing loop's writes (viewing-loop.ts), with the database and the sends mocked: a tenant's time goes
 * to the broker, the broker's yes books it with no command typed, another time goes back to the tenant, and
 * anything the line may not do itself is left to the old path (null).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Msg = { kind: string; to: string; body: string; label: string };
const state = new Map<string, unknown>();
const sent: Msg[] = [];
const cards: string[] = [];
type Booking = { taskId: string; listingId: number; at: Date; place?: string | null; share?: unknown };
const bookViewing = vi.fn<(i: Booking) => Promise<{ visitId: number; dealId: string; share: null; economics: string }>>(async () => ({ visitId: 18, dealId: "d1", share: null, economics: "" }));
const applyAnswer = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});
let gate: { ok: boolean; why?: string; waPhone: string | null } = { ok: true, waPhone: "+250720000019" };
let yesRow: { brokerUserId: string; broker: { phoneNumber: string | null } } | null = { brokerUserId: "u1", broker: { phoneNumber: "+250720000011" } };
let brokerRow: { id: string; name: string; contactName: string | null; preferredLanguage: string | null; sharePct: number | null; shareFlatRwf: number | null; optOut: boolean; relationship: string } = {
  id: "b1",
  name: "Kigali Homes",
  contactName: "Eric",
  preferredLanguage: "EN",
  sharePct: null,
  shareFlatRwf: null,
  optOut: false,
  relationship: "ACTIVE",
};
let visits: { scheduledFor: Date; taskId: string | null; listingId: number }[] = [];
let paid = 0;

vi.mock("@/lib/db", () => ({
  db: {
    listingVisit: { findMany: vi.fn(async () => visits), findFirst: vi.fn(async () => null), update: vi.fn(async () => ({})) },
    brokerRequest: { findFirst: vi.fn(async () => yesRow) },
    listingBroker: { findFirst: vi.fn(async () => ({ sourceUrl: "https://www.tiktok.com/@kigali.homes/video/1", listing: { id: 7, sourceUrl: null, isPublished: false, code: null, sourceListingId: "tiktok:1", title: "3-bedroom apartment in Rebero" }, broker: brokerRow })) },
    deal: { count: vi.fn(async () => paid) },
    agentTask: { findUnique: vi.fn(async () => ({ locale: "en", shortlist: [{ id: 7, title: "3-bedroom apartment in Rebero" }] })) },
    broker: { findFirst: vi.fn(async () => brokerRow) },
    waState: {
      deleteMany: vi.fn(async ({ where }: { where: { key: string } }) => {
        state.delete(where.key);
        return { count: 1 };
      }),
      findMany: vi.fn(async () => [...state].filter(([k]) => k.startsWith("viewing-time:")).map(([key, value]) => ({ key, value }))),
    },
  },
}));
vi.mock("@/components/agent/wa-state", () => ({
  readState: async (k: string, empty: unknown) => (state.has(k) ? state.get(k) : empty),
  writeState: async (k: string, v: unknown) => void state.set(k, JSON.parse(JSON.stringify(v))),
}));
vi.mock("@/components/agent/whatsapp", () => ({
  sendMessages: async (m: Msg[]) => {
    sent.push(...m);
    return "queued";
  },
  postSlackCard: async (t: string) => void cards.push(t),
}));
vi.mock("@/components/agent/broker", () => ({ applyAnswer: (...a: unknown[]) => applyAnswer(...a), appendTaskEvent: async () => {}, homeLink: () => "https://www.tiktok.com/@kigali.homes/video/1" }));
vi.mock("@/components/agent/broker-sends", () => ({ gateForTask: async () => gate }));
vi.mock("@/components/agent/deal", () => ({
  agreementOf: (b: { sharePct: number | null } | null) => (b?.sharePct ? { pct: Number(b.sharePct), flatRwf: null } : null),
  bookViewing: (i: Booking) => bookViewing(i),
  viewingAskKey: (p: string) => `viewing-ask:${p.replace(/\D/g, "")}`,
}));
vi.mock("@/components/agent/deal-intro", () => ({ termsAskKey: (p: string) => `terms-ask:${p.replace(/\D/g, "")}` }));

const { acceptOffered, brokerViewingReply, proposeViewingAuto, viewingSweep } = await import("@/components/agent/viewing-loop");

const kigali = (s: string) => new Date(`${s}:00+02:00`);
const now = kigali("2026-11-16T10:00"); // Monday
const TENANT = "+250720000019";
const BROKER = "250720000011";
const ask = { taskId: "t1", listingId: 7, at: now.toISOString() };
const pending = () => (state.get(`viewing-time:${BROKER}`) ?? []) as { stage: string; at: string; chasedAt?: string; tenantToldAt?: string }[];
const tenantAsk = () => state.get("viewing-ask:250720000019") as { offered?: string; offeredBy?: string; proposedAt?: string } | undefined;

beforeEach(() => {
  state.clear();
  sent.length = 0;
  cards.length = 0;
  bookViewing.mockClear();
  applyAnswer.mockClear();
  gate = { ok: true, waPhone: TENANT };
  yesRow = { brokerUserId: "u1", broker: { phoneNumber: "+250720000011" } };
  brokerRow = { ...brokerRow, sharePct: null, optOut: false, relationship: "ACTIVE" };
  visits = [];
  paid = 0;
  delete process.env.MKAN_VIEWING_AUTO;
  delete process.env.MKAN_REP_WHATSAPP;
});

describe("the tenant names a time", () => {
  it("asks the broker to confirm it, and tells the tenant so — nothing waits for a person", async () => {
    const reply = await proposeViewingAuto(ask, kigali("2026-11-17T10:00"), TENANT, "en", now);
    expect(reply).toBe("Got it: Tue 17 Nov, 10:00. I'm confirming it with the broker now, and I'll message you here as soon as they answer.");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: "BROKER_REQUEST", to: "+250720000011", label: "auto-viewing-ask:7" });
    expect(sent[0]!.body).toContain("Reply 1 = yes, or send another day and time");
    // The tenant's number never goes to the broker.
    expect(sent[0]!.body).not.toContain("250720000019");
    expect(pending()).toMatchObject([{ taskId: "t1", listingId: 7, stage: "time", at: kigali("2026-11-17T10:00").toISOString() }]);
    expect(tenantAsk()?.proposedAt).toBe(kigali("2026-11-17T10:00").toISOString());
    expect(cards[0]).toMatch(/Nothing to do/);
  });

  it("offers the nearest time when Mkan's person cannot be there, and asks nobody yet", async () => {
    const reply = await proposeViewingAuto(ask, kigali("2026-11-22T10:00"), TENANT, "en", now); // a Sunday
    expect(reply).toMatch(/We can't do Sun 22 Nov, 10:00.*Can you do Mon 23 Nov, 09:00\?/);
    expect(sent).toHaveLength(0);
    expect(tenantAsk()).toMatchObject({ offered: kigali("2026-11-23T09:00").toISOString(), offeredBy: "mkan" });
  });

  it("their yes to that time then goes to the broker", async () => {
    await proposeViewingAuto(ask, kigali("2026-11-22T10:00"), TENANT, "en", now);
    const reply = await acceptOffered({ ...ask, ...tenantAsk() }, TENANT, "en", now);
    expect(reply).toMatch(/^Got it: Mon 23 Nov, 09:00\./);
    expect(sent[0]).toMatchObject({ kind: "BROKER_REQUEST", label: "auto-viewing-ask:7" });
    expect(bookViewing).not.toHaveBeenCalled();
  });

  it("leaves it to the old path when the line may not do it: switched off, sends paused or a team number, no broker, a share required", async () => {
    const at = kigali("2026-11-17T10:00");
    process.env.MKAN_VIEWING_AUTO = "off";
    expect(await proposeViewingAuto(ask, at, TENANT, "en", now)).toBeNull();
    delete process.env.MKAN_VIEWING_AUTO;
    gate = { ok: false, why: "test-phone", waPhone: TENANT };
    expect(await proposeViewingAuto(ask, at, TENANT, "en", now)).toBeNull();
    gate = { ok: true, waPhone: TENANT };
    yesRow = null;
    expect(await proposeViewingAuto(ask, at, TENANT, "en", now)).toBeNull();
    yesRow = { brokerUserId: "u1", broker: { phoneNumber: "+250720000011" } };
    brokerRow = { ...brokerRow, optOut: true };
    expect(await proposeViewingAuto(ask, at, TENANT, "en", now)).toBeNull();
    brokerRow = { ...brokerRow, optOut: false };
    // Ten deals paid and no share agreed with this broker: a person settles it first.
    paid = 10;
    expect(await proposeViewingAuto(ask, at, TENANT, "en", now)).toBeNull();
    brokerRow = { ...brokerRow, sharePct: 0.1 };
    expect(await proposeViewingAuto(ask, at, TENANT, "en", now)).toMatch(/^Got it/);
    expect(sent).toHaveLength(1);
  });
});

describe("the broker answers", () => {
  const at = kigali("2026-11-17T10:00");
  const asked = async () => {
    await proposeViewingAuto(ask, at, TENANT, "en", now);
    sent.length = 0;
  };
  const later = new Date(now.getTime() + 20 * 60_000);

  it("yes books it — no command, no card to act on — and Mkan's terms ride on the confirmation", async () => {
    await asked();
    const r = await brokerViewingReply(BROKER, "1", later);
    expect(r).toMatchObject({ listingId: 7, outcome: "booked" });
    expect(bookViewing).toHaveBeenCalledTimes(1);
    expect(bookViewing.mock.calls[0]![0]).toMatchObject({ taskId: "t1", listingId: 7, at, place: null, share: { none: true } });
    expect(r!.reply).toMatch(/^Confirmed, thank you: Tue 17 Nov, 10:00\. Osman from Mkan will be there with the tenant\. Where should they meet you\?/);
    expect(r!.reply).toMatch(/10% of your commission when they sign, and no viewing fee for them\. Reply YES/);
    // The terms ask is on record as already handed: a YES records the agreement, nothing else goes out.
    expect(state.get(`terms-ask:${BROKER}`)).toMatchObject({ listingId: 7, brokerId: "b1", handedAt: expect.any(String) });
    expect(pending()).toHaveLength(0);
  });

  it("a broker who already agreed a share is booked on it, and not asked again", async () => {
    brokerRow = { ...brokerRow, sharePct: 0.1 };
    await asked();
    const r = await brokerViewingReply(BROKER, "Yego", later);
    expect(bookViewing.mock.calls[0]![0]).toMatchObject({ share: null });
    expect(r!.reply).not.toMatch(/commission/);
    expect(state.has(`terms-ask:${BROKER}`)).toBe(false);
  });

  it("where to meet, said with the yes, is booked with it; Mkan's person is told on WhatsApp when a number is set", async () => {
    process.env.MKAN_REP_WHATSAPP = "+250720000001";
    await asked();
    const r = await brokerViewingReply(BROKER, "ok at Simba Kimironko, near the gate", later);
    expect(bookViewing.mock.calls[0]![0]).toMatchObject({ place: "at Simba Kimironko, near the gate" });
    expect(r!.reply).not.toMatch(/Where should they meet/);
    expect(sent.find((m) => m.to === "+250720000001")?.body).toMatch(/Osman, a viewing is booked: 3-bedroom apartment in Rebero \(K7\), Tue 17 Nov, 10:00, at Simba Kimironko/);
  });

  it("another time goes to the tenant; their yes books it and the broker is told", async () => {
    await asked();
    const r = await brokerViewingReply(BROKER, "tomorrow 3pm is better", later);
    expect(r).toMatchObject({ outcome: "countered" });
    expect(r!.reply).toBe("Thank you. I'll check Tue 17 Nov, 15:00 with the tenant and confirm here.");
    expect(sent[0]).toMatchObject({ kind: "TENANT_ALERT", to: TENANT });
    expect(sent[0]!.body).toMatch(/offers Tue 17 Nov, 15:00\. Does that work\?/);
    expect(pending()).toMatchObject([{ stage: "tenant" }]);
    expect(bookViewing).not.toHaveBeenCalled();
    sent.length = 0;

    const yes = await acceptOffered({ ...ask, ...tenantAsk() }, TENANT, "en", later);
    expect(yes).toMatch(/^Great, Tue 17 Nov, 15:00\./);
    expect(bookViewing.mock.calls[0]![0]).toMatchObject({ at: kigali("2026-11-17T15:00") });
    expect(sent.find((m) => m.kind === "BROKER_REQUEST")).toMatchObject({ to: "+250720000011", label: "auto-viewing-booked:7" });
    expect(pending()).toHaveLength(0);
  });

  it("a time Mkan's person cannot make is answered with the nearest one that works", async () => {
    await asked();
    const r = await brokerViewingReply(BROKER, "Sunday 10am", later);
    expect(r).toMatchObject({ outcome: "rep-cannot" });
    expect(r!.reply).toMatch(/We can't make Sun 22 Nov, 10:00 on our side\. Could you do Mon 23 Nov, 09:00\?/);
    expect(pending()).toMatchObject([{ stage: "time", at: kigali("2026-11-23T09:00").toISOString() }]);
  });

  it("no asks them when, and the tenant hears; a day with no hour asks the hour", async () => {
    await asked();
    const no = await brokerViewingReply(BROKER, "no", later);
    expect(no).toMatchObject({ outcome: "asked-when", reply: "No problem. Which day and time would work for you this week?" });
    expect(sent[0]!.body).toMatch(/The broker can't do Tue 17 Nov, 10:00/);
    expect(pending()).toMatchObject([{ stage: "when" }]);
    const day = await brokerViewingReply(BROKER, "tomorrow is fine", new Date(later.getTime() + 60_000));
    expect(day).toMatchObject({ outcome: "what-time", reply: "Thank you. What time on that day?" });
  });

  it("taken ends it: the home is marked rented for everyone waiting on it", async () => {
    await asked();
    const r = await brokerViewingReply(BROKER, "yafashwe", later);
    expect(r).toMatchObject({ outcome: "taken" });
    expect(applyAnswer).toHaveBeenCalledWith(7, "RENTED", BROKER, "typed");
    expect(pending()).toHaveLength(0);
    expect(bookViewing).not.toHaveBeenCalled();
  });

  it("is not the time's answer when nothing is on the table, a newer availability ask is, or the words cannot be placed", async () => {
    expect(await brokerViewingReply(BROKER, "1", later)).toBeNull();
    await asked();
    expect(await brokerViewingReply(BROKER, "1", later, { newestAvailabilityAskAt: new Date(later.getTime() - 60_000) })).toBeNull();
    expect(await brokerViewingReply(BROKER, "how much is their budget?", later)).toBeNull();
    expect(bookViewing).not.toHaveBeenCalled();
    // …unless they quoted the time ask itself.
    expect(await brokerViewingReply(BROKER, "1", later, { newestAvailabilityAskAt: new Date(later.getTime() - 60_000), quoted: true })).toMatchObject({ outcome: "booked" });
  });
});

describe("a broker who stays silent", () => {
  it("is chased once after three daytime hours; later the tenant is told; then the ask is dropped", async () => {
    await proposeViewingAuto(ask, kigali("2026-11-18T10:00"), TENANT, "en", now);
    sent.length = 0;
    expect(await viewingSweep(new Date(now.getTime() + 2 * 3_600_000))).toBe(0);
    expect(await viewingSweep(new Date(now.getTime() + 3.2 * 3_600_000))).toBe(1);
    expect(sent[0]).toMatchObject({ kind: "BROKER_REQUEST", label: "auto-viewing-chase:7" });
    expect(pending()[0]!.chasedAt).toBeTruthy();
    // No second chase.
    expect(await viewingSweep(new Date(now.getTime() + 5 * 3_600_000))).toBe(0);
    sent.length = 0;
    // Tuesday 11:00: ten daytime hours after the ask.
    expect(await viewingSweep(kigali("2026-11-17T11:00"))).toBe(1);
    expect(sent[0]).toMatchObject({ kind: "TENANT_ALERT", to: TENANT });
    expect(sent[0]!.body).toMatch(/hasn't confirmed the time.*Want me to check another home meanwhile\?/);
    expect(cards.at(-1)).toMatch(/call the broker if you want this one/);
    await viewingSweep(kigali("2026-11-18T11:00"));
    expect(pending()).toHaveLength(0);
  });
});
