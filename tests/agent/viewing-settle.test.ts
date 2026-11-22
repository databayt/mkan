/**
 * settleViewingTime (viewing-loop.ts, 2026-11-22): the ONE function both sides of a viewing time call. Whoever
 * speaks first — the tenant naming a time, or the broker naming one — the line settles it: it respects the
 * rep's hours, days off and the 90-minute gap, offers the next free slot to whoever is waiting, books through
 * bookViewing on a yes, and tells both sides in their own language. The database and the sends are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Msg = { kind: string; to: string; body: string; label: string };
const state = new Map<string, unknown>();
const sent: Msg[] = [];
const cards: string[] = [];
type Booking = { taskId: string; listingId: number; at: Date; place?: string | null; share?: unknown };
const bookViewing = vi.fn<(i: Booking) => Promise<{ visitId: number; dealId: string; share: null; economics: string }>>(async () => ({ visitId: 18, dealId: "d1", share: null, economics: "" }));
const askAvailabilityFor = vi.fn<(taskId: string, listingId: number) => Promise<{ ok: boolean; asked: boolean; why?: string }>>(async () => ({ ok: true, asked: true }));
let gate: { ok: boolean; why?: string; waPhone: string | null } = { ok: true, waPhone: "+250720000019" };
let yesRow: { brokerUserId: string; broker: { phoneNumber: string | null } } | null = { brokerUserId: "u1", broker: { phoneNumber: "+250720000011" } };
let brokerRow = { id: "b1", name: "Kigali Homes", contactName: "Eric", preferredLanguage: "EN" as string | null, sharePct: null as number | null, shareFlatRwf: null as number | null, optOut: false, relationship: "ACTIVE" };
let visits: { scheduledFor: Date; taskId: string | null; listingId: number }[] = [];
let waiting: { taskId: string; listingId: number }[] = [];
let location: { latitude: number; longitude: number; neighbourhood: string | null; sector: string | null } | null = { latitude: -1.935, longitude: 30.127, neighbourhood: null, sector: "gasabo/kimironko" };
let paid = 0;

vi.mock("@/lib/db", () => ({
  db: {
    listingVisit: { findMany: vi.fn(async () => visits), findFirst: vi.fn(async () => null), update: vi.fn(async () => ({})) },
    brokerRequest: { findFirst: vi.fn(async () => yesRow), findMany: vi.fn(async () => waiting) },
    listingBroker: { findFirst: vi.fn(async () => ({ sourceUrl: "https://www.tiktok.com/@kigali.homes/video/1", listing: { id: 7, sourceUrl: null, isPublished: false, code: null, sourceListingId: "tiktok:1", title: "3-bedroom apartment in Rebero" }, broker: brokerRow })) },
    listing: { findUnique: vi.fn(async () => ({ location })) },
    deal: { count: vi.fn(async () => paid) },
    agentTask: { findUnique: vi.fn(async () => ({ locale: "en", shortlist: [{ id: 7, title: "3-bedroom apartment in Rebero" }], profile: { waPhone: "+250720000019" } })) },
    broker: { findFirst: vi.fn(async () => brokerRow) },
    waState: {
      deleteMany: vi.fn(async ({ where }: { where: { key: string } }) => {
        state.delete(where.key);
        return { count: 1 };
      }),
      findMany: vi.fn(async ({ where }: { where: { key: { startsWith: string } } }) => [...state].filter(([k]) => k.startsWith(where.key.startsWith)).map(([key, value]) => ({ key, value }))),
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
vi.mock("@/components/agent/broker", () => ({ applyAnswer: vi.fn(async () => {}), appendTaskEvent: async () => {}, homeLink: () => "https://www.tiktok.com/@kigali.homes/video/1" }));
vi.mock("@/components/agent/broker-sends", () => ({ gateForTask: async () => gate }));
vi.mock("@/components/agent/availability", () => ({ askAvailabilityFor: (t: string, l: number) => askAvailabilityFor(t, l) }));
vi.mock("@/components/agent/deal", () => ({
  agreementOf: (b: { sharePct: number | null } | null) => (b?.sharePct ? { pct: Number(b.sharePct), flatRwf: null } : null),
  bookViewing: (i: Booking) => bookViewing(i),
  viewingAskKey: (p: string) => `viewing-ask:${p.replace(/\D/g, "")}`,
}));
vi.mock("@/components/agent/deal-intro", () => ({ termsAskKey: (p: string) => `terms-ask:${p.replace(/\D/g, "")}` }));

const { settleViewingTime } = await import("@/components/agent/viewing-loop");

const kigali = (s: string) => new Date(`${s}:00+02:00`);
const now = kigali("2026-11-16T10:00"); // Monday
const TENANT = "+250720000019";
const BROKER = "250720000011";
const ask = { taskId: "t1", listingId: 7, at: now.toISOString() };
const pending = () => (state.get(`viewing-time:${BROKER}`) ?? []) as { stage: string; at: string }[];
const tenantAsk = () => state.get("viewing-ask:250720000019") as { offered?: string; offeredBy?: string; proposedAt?: string; wanted?: string } | undefined;
const tenantTime = (s: string, extra: Record<string, unknown> = {}) => settleViewingTime({ by: "tenant", tenant: TENANT, ask, lang: "en", at: kigali(s), now, ...extra } as never);

beforeEach(() => {
  state.clear();
  sent.length = 0;
  cards.length = 0;
  bookViewing.mockClear();
  askAvailabilityFor.mockClear();
  askAvailabilityFor.mockResolvedValue({ ok: true, asked: true });
  gate = { ok: true, waPhone: TENANT };
  yesRow = { brokerUserId: "u1", broker: { phoneNumber: "+250720000011" } };
  brokerRow = { ...brokerRow, preferredLanguage: "EN", sharePct: null, optOut: false, relationship: "ACTIVE" };
  visits = [];
  waiting = [];
  location = { latitude: -1.935, longitude: 30.127, neighbourhood: null, sector: "gasabo/kimironko" };
  paid = 0;
  delete process.env.MKAN_VIEWING_AUTO;
  delete process.env.MKAN_REP_WHATSAPP;
});

describe("the tenant names a time", () => {
  it("asks the broker, answers the tenant, and nothing waits for a person", async () => {
    const r = await tenantTime("2026-11-17T10:00");
    expect(r).toMatchObject({ outcome: "asked-broker", listingId: 7, reply: expect.stringMatching(/^Got it: Tue 17 Nov, 10:00\./) });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: "BROKER_REQUEST", to: "+250720000011", label: "auto-viewing-ask:7" });
    expect(pending()).toMatchObject([{ stage: "time" }]);
    expect(cards[0]).toMatch(/Nothing to do/);
  });

  it("a day Mkan's person is off: the next free day goes back to the tenant, the broker is asked nothing", async () => {
    state.set("rep-off:2026-11-17", { at: "x" });
    const r = await tenantTime("2026-11-17T10:00");
    expect(r?.outcome).toBe("rep-busy");
    expect(r?.reply).toMatch(/We can't do Tue 17 Nov, 10:00.*Can you do Wed 18 Nov, 09:00\?/);
    expect(sent).toHaveLength(0);
    expect(tenantAsk()).toMatchObject({ offered: kigali("2026-11-18T09:00").toISOString(), offeredBy: "mkan" });
  });

  it("a clash inside the 90-minute gap: the first time after the gap is offered", async () => {
    visits = [{ scheduledFor: kigali("2026-11-17T09:30"), taskId: "other", listingId: 99 }];
    const r = await tenantTime("2026-11-17T10:00");
    expect(r?.outcome).toBe("rep-busy");
    expect(r?.reply).toMatch(/Can you do Tue 17 Nov, 11:00\?/);
  });

  it("a Sunday, or after hours, is offered the next working time", async () => {
    expect((await tenantTime("2026-11-22T10:00"))?.reply).toMatch(/Can you do Mon 23 Nov, 09:00\?/);
    expect((await tenantTime("2026-11-17T19:00"))?.outcome).toBe("rep-busy");
  });

  it("the tenant's yes to that time asks the broker for it", async () => {
    await tenantTime("2026-11-22T10:00");
    const r = await settleViewingTime({ by: "tenant", tenant: TENANT, ask: { ...ask, ...tenantAsk()! }, lang: "en", accept: true, now });
    expect(r).toMatchObject({ outcome: "asked-broker", reply: expect.stringMatching(/^Got it: Mon 23 Nov, 09:00\./) });
    expect(sent[0]).toMatchObject({ kind: "BROKER_REQUEST", label: "auto-viewing-ask:7" });
  });

  it("a home no broker has confirmed yet: the broker is asked if it is free, and the time is kept", async () => {
    yesRow = null;
    const r = await tenantTime("2026-11-17T10:00");
    expect(askAvailabilityFor).toHaveBeenCalledWith("t1", 7);
    expect(r).toMatchObject({ outcome: "asked-availability", reply: expect.stringMatching(/first checking with the broker that the home is still free/) });
    expect(tenantAsk()?.wanted).toBe(kigali("2026-11-17T10:00").toISOString());
    expect(sent).toHaveLength(0);
  });

  it("a home that was taken, or has no broker to ask: the tenant hears it plainly and is offered another, never a person", async () => {
    yesRow = null;
    askAvailabilityFor.mockResolvedValue({ ok: true, asked: false, why: "taken" });
    expect((await tenantTime("2026-11-17T10:00"))?.reply).toMatch(/was taken/);
    askAvailabilityFor.mockResolvedValue({ ok: true, asked: false, why: "unreachable" });
    const r = await tenantTime("2026-11-17T10:00");
    expect(r).toMatchObject({ outcome: "no-broker", reply: expect.stringMatching(/Want me to check another one/) });
    expect(r?.reply).not.toMatch(/person|someone|Osman/i);
    expect(cards.at(-1)).toMatch(/FYI/);
  });

  it("says why it could not, instead of promising: auto off, sends paused, a team number, a web tenant, a share required", async () => {
    process.env.MKAN_VIEWING_AUTO = "off";
    expect(await tenantTime("2026-11-17T10:00")).toMatchObject({ outcome: "fallback", why: "auto-off", reply: null });
    delete process.env.MKAN_VIEWING_AUTO;
    gate = { ok: false, why: "test-phone", waPhone: TENANT };
    expect(await tenantTime("2026-11-17T10:00")).toMatchObject({ outcome: "fallback", why: "test-number" });
    gate = { ok: false, why: "sends-off", waPhone: TENANT };
    expect(await tenantTime("2026-11-17T10:00")).toMatchObject({ outcome: "fallback", why: "sends-off" });
    gate = { ok: false, why: "not-whatsapp", waPhone: null };
    expect(await tenantTime("2026-11-17T10:00")).toMatchObject({ outcome: "fallback", why: "no-whatsapp" });
    gate = { ok: true, waPhone: TENANT };
    paid = 10;
    expect(await tenantTime("2026-11-17T10:00")).toMatchObject({ outcome: "fallback", why: "share-required" });
    expect(sent).toHaveLength(0);
  });
});

describe("the broker answers a time on the table", () => {
  const at = kigali("2026-11-17T10:00");
  const later = new Date(now.getTime() + 20 * 60_000);
  const broker = (text: string, extra: Record<string, unknown> = {}) => settleViewingTime({ by: "broker", phone: BROKER, text, at: later, ...extra } as never);

  it("yes books it through bookViewing, and the broker's confirmation carries the time, the pin and who comes", async () => {
    await tenantTime("2026-11-17T10:00");
    sent.length = 0;
    const r = await broker("1");
    expect(r).toMatchObject({ outcome: "booked", visitId: 18, dealId: "d1" });
    expect(bookViewing.mock.calls[0]![0]).toMatchObject({ taskId: "t1", listingId: 7, at, place: null, share: { none: true } });
    expect(r!.reply).toMatch(/^Confirmed, thank you: Tue 17 Nov, 10:00\. Osman from Mkan will be there with the tenant\. We'll come to the home's pin: 📍 https:\/\/maps\.google\.com\/\?q=-1\.935000,30\.127000/);
    expect(r!.reply).toMatch(/Tell us if another spot is better/);
  });

  it("a French-speaking broker is confirmed in French, a Kinyarwanda one in Kinyarwanda with English under it", async () => {
    brokerRow = { ...brokerRow, preferredLanguage: "FR" };
    await tenantTime("2026-11-17T10:00");
    expect((await broker("oui"))?.reply).toMatch(/^Confirmé, merci : Tue 17 Nov, 10:00\. Osman de Mkan sera là avec le locataire\./);
    brokerRow = { ...brokerRow, preferredLanguage: "RW" };
    await tenantTime("2026-11-17T10:00");
    const rw = (await broker("yego", { at: new Date(later.getTime() + 60_000) }))?.reply;
    expect(rw).toMatch(/^Byemejwe, murakoze: /);
    expect(rw).toMatch(/\n\nConfirmed, thank you: /);
  });

  it("a home with no real pin (a lead stored at the centre of Kigali) is never sent as a pin — the area is named instead", async () => {
    location = { latitude: -1.9441, longitude: 30.0619, neighbourhood: null, sector: "gasabo/kimironko" };
    await tenantTime("2026-11-17T10:00");
    const r = await broker("1");
    expect(r!.reply).not.toMatch(/maps\.google/);
    expect(r!.reply).toMatch(/We'll come to Kimironko: where exactly should they meet you\?/);
  });

  it("another time goes to the tenant; one Mkan's person cannot do goes back to the broker as the nearest that works", async () => {
    await tenantTime("2026-11-17T10:00");
    const counter = await broker("tomorrow 3pm is better");
    expect(counter).toMatchObject({ outcome: "countered", reply: "Thank you. I'll check Tue 17 Nov, 15:00 with the tenant and confirm here." });
    expect(pending()).toMatchObject([{ stage: "tenant" }]);
    expect(sent.at(-1)).toMatchObject({ kind: "TENANT_ALERT", to: TENANT });
    expect(tenantAsk()).toMatchObject({ offered: kigali("2026-11-17T15:00").toISOString(), offeredBy: "broker" });

    state.clear();
    sent.length = 0;
    await tenantTime("2026-11-17T10:00");
    state.set("rep-off:2026-11-18", { at: "x" });
    const cannot = await broker("Wednesday 10am");
    expect(cannot).toMatchObject({ outcome: "rep-cannot", reply: expect.stringMatching(/We can't make Wed 18 Nov, 10:00 on our side\. Could you do Thu 19 Nov, 09:00\?/) });
  });

  it("the tenant's yes to the broker's own time books it at once and confirms both", async () => {
    await tenantTime("2026-11-17T10:00");
    await broker("tomorrow 3pm is better");
    sent.length = 0;
    const r = await settleViewingTime({ by: "tenant", tenant: TENANT, ask: { ...ask, ...tenantAsk()! }, lang: "en", accept: true, now: later });
    expect(r).toMatchObject({ outcome: "booked", visitId: 18, reply: expect.stringMatching(/^Great, Tue 17 Nov, 15:00\./) });
    expect(bookViewing.mock.calls[0]![0]).toMatchObject({ at: kigali("2026-11-17T15:00") });
    expect(sent.find((m) => m.kind === "BROKER_REQUEST")).toMatchObject({ to: "+250720000011", label: "auto-viewing-booked:7", body: expect.stringMatching(/^Confirmed, thank you: Tue 17 Nov, 15:00/) });
    expect(pending()).toHaveLength(0);
  });

  it("Mkan's person is told with an FYI when the number is set", async () => {
    process.env.MKAN_REP_WHATSAPP = "+250720000001";
    await tenantTime("2026-11-17T10:00");
    await broker("ok at Simba Kimironko, near the gate");
    const fyi = sent.find((m) => m.to === "+250720000001")!;
    expect(fyi.body).toMatch(/a viewing is booked: 3-bedroom apartment in Rebero \(K7\), Tue 17 Nov, 10:00, at Simba Kimironko/);
    expect(fyi.body).toMatch(/FYI: the line agreed this with the tenant and the broker/);
  });
});

describe("the broker names a time first", () => {
  const later = new Date(now.getTime() + 2 * 3_600_000);
  const named = (extra: Record<string, unknown>) => settleViewingTime({ by: "broker", phone: BROKER, at: later, ...extra } as never);

  it("after their yes, with a tenant waiting: the time goes to the tenant, and their yes books it", async () => {
    waiting = [{ taskId: "t1", listingId: 7 }];
    const r = await named({ text: "come tomorrow at 3pm" });
    expect(r).toMatchObject({ outcome: "countered", listingId: 7 });
    expect(sent[0]).toMatchObject({ kind: "TENANT_ALERT", to: TENANT });
    expect(sent[0]!.body).toMatch(/offers Tue 17 Nov, 15:00/);
    expect(pending()).toMatchObject([{ stage: "tenant" }]);
    const yes = await settleViewingTime({ by: "tenant", tenant: TENANT, ask: { ...ask, ...tenantAsk()! }, lang: "en", accept: true, now: later });
    expect(yes?.outcome).toBe("booked");
  });

  it("takes a slot the caller already read (the second of the two times the ask offered)", async () => {
    waiting = [{ taskId: "t1", listingId: 7 }];
    const r = await named({ slot: kigali("2026-11-18T09:00") });
    expect(r?.outcome).toBe("countered");
    expect(tenantAsk()).toMatchObject({ offered: kigali("2026-11-18T09:00").toISOString(), offeredBy: "broker" });
  });

  it("a time on an off day or past the hours comes back to the broker as the nearest that works", async () => {
    waiting = [{ taskId: "t1", listingId: 7 }];
    state.set("rep-off:2026-11-17", { at: "x" });
    const r = await named({ slot: kigali("2026-11-17T10:00") });
    expect(r).toMatchObject({ outcome: "rep-cannot", reply: expect.stringMatching(/Could you do Wed 18 Nov, 09:00\?/) });
  });

  it("no tenant waiting, or no time named: it is not a viewing time — null, read as before", async () => {
    expect(await named({ text: "come tomorrow at 3pm" })).toBeNull();
    waiting = [{ taskId: "t1", listingId: 7 }];
    expect(await named({ text: "yes it is available" })).toBeNull();
    expect(await named({ text: "how much is their budget?" })).toBeNull();
  });
});
