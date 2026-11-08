/**
 * The direct intro end to end on an in-memory database (deal-intro.ts): a broker's yes → Mkan's terms →
 * their agreement → both numbers, in English and Kinyarwanda; and what happens when the line may not send:
 * the held ask shows as a #mkan card, not as silence. Numbers are made up (+250 700 000 0xx) — the repo is public.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;
const store = vi.hoisted(() => ({
  state: new Map<string, unknown>(),
  out: [] as Row[],
  deals: [] as Row[],
  brokers: [] as Row[],
  cards: [] as string[],
  mode: "gated" as "gated" | "off",
  n: 0,
}));

vi.mock("@/lib/db", () => {
  const match = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (k === "OR") return (v as Row[]).some((w) => match(row, w));
      if (v && typeof v === "object" && !(v instanceof Date)) {
        if ("in" in v) return (v.in as unknown[]).includes(row[k]);
        if ("not" in v) return row[k] !== v.not && !(v.not === null && row[k] == null);
        if ("gte" in v) return +new Date(row[k]) >= +new Date(v.gte);
        if ("startsWith" in v) return String(row[k]).startsWith(v.startsWith);
        if ("hasSome" in v) return (row[k] as string[]).some((x) => (v.hasSome as string[]).includes(x));
      }
      return row[k] === v;
    });
  const db = {
    waState: {
      findUnique: async ({ where }: Row) => (store.state.has(where.key) ? { key: where.key, value: store.state.get(where.key) } : null),
      upsert: async ({ where, create }: Row) => void store.state.set(where.key, create.value),
      deleteMany: async ({ where }: Row) => void store.state.delete(where.key),
      findMany: async ({ where }: Row) =>
        [...store.state].filter(([k]) => where.key.startsWith ? k.startsWith(where.key.startsWith) : true).map(([key, value]) => ({ key, value })),
    },
    outboundMessage: {
      findMany: async ({ where }: Row) => store.out.filter((r) => match(r, { kind: where.kind, to: where.to })),
      create: async ({ data }: Row) => (store.out.push({ id: `o${++store.n}`, createdAt: new Date(), ...data }), { id: `o${store.n}` }),
    },
    deal: {
      findFirst: async ({ where }: Row) => store.deals.find((d) => d.taskId === where.taskId && d.listingId === where.listingId && d.introducedAt) ?? null,
      findMany: async () => [],
      count: async ({ where }: Row) => store.deals.filter((d) => (where?.status ? d.status === where.status : true)).length,
      create: async ({ data }: Row) => (store.deals.push({ id: `d${++store.n}`, status: "VIEWING_BOOKED", introFollowUps: [], ...data }), { id: `d${store.n}` }),
    },
    broker: {
      findFirst: async ({ where }: Row) => store.brokers.find((b) => match(b, where)) ?? null,
      findUnique: async ({ where }: Row) => store.brokers.find((b) => b.id === where.id) ?? null,
      update: async ({ where, data }: Row) => Object.assign(store.brokers.find((b) => b.id === where.id)!, data),
      updateMany: async () => ({ count: 1 }),
    },
    brokerRequest: { findFirst: async () => ({ brokerUserId: "u1", broker: { phoneNumber: "+250700000043" } }) },
    listingBroker: { findFirst: async () => ({ brokerId: "b1" }) },
    listing: { findUnique: async () => ({ title: "2-bedroom apartment in Kimironko" }) },
    agentTask: { findUnique: vi.fn(async () => ({ shortlist: [] })) },
  };
  return { db };
});
vi.mock("@/components/agent/whatsapp", () => ({
  postSlackCard: async (t: string) => void store.cards.push(t),
  sendMessages: async (ms: Row[]) => void ms.forEach((m) => store.out.push({ id: `o${++store.n}`, createdAt: new Date(), status: "QUEUED", ...m })),
}));
vi.mock("@/components/agent/broker-sends", () => ({ brokerSendMode: async () => store.mode }));
vi.mock("@/components/agent/deal", () => ({
  agreementOf: (b: Row) => (b && Number(b.sharePct) > 0 ? { pct: Number(b.sharePct), flatRwf: null } : null),
  sendDealSheet: vi.fn(async () => true),
  setDealStatus: vi.fn(),
}));

import { answerTerms, introReplyFor, introSweep, startIntro, termsAskKey } from "@/components/agent/deal-intro";
import { sendDealSheet } from "@/components/agent/deal";

const BROKER = "250700000043";
const task = (id: string, phone: string, locale = "en") => ({ id, locale, shortlist: [], profile: { waPhone: phone } });
// 10:00 Kigali on a Saturday: inside the send window.
const noon = new Date("2026-11-07T08:00:00Z");
const mins = (m: number) => new Date(noon.getTime() + m * 60_000);

beforeEach(() => {
  store.state.clear();
  store.out.length = 0;
  store.deals.length = 0;
  store.cards.length = 0;
  store.mode = "gated";
  store.brokers.splice(0, store.brokers.length, { id: "b1", name: "Test Homes", contactName: null, phones: [`+${BROKER}`], whatsapp: null, sharePct: null, shareFlatRwf: null, relationship: "NEW", optOut: false });
  vi.mocked(sendDealSheet).mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(noon);
});

describe("no YES in 2 daytime hours: the tenant goes the usual way (Abdout, 2026-11-08)", () => {
  it("hands the tenant the deal sheet once, tells #mkan, and keeps the ask for a late YES", async () => {
    await startIntro([task("t1", "+250700000011")], 6041, BROKER, { typed: false });
    await introSweep(mins(119));
    expect(sendDealSheet).not.toHaveBeenCalled();
    await introSweep(mins(121));
    expect(sendDealSheet).toHaveBeenCalledTimes(1);
    expect(store.cards.some((c) => c.includes("2 daytime hours") && c.includes("K6041"))).toBe(true);
    const ask = store.state.get(termsAskKey(BROKER)) as Row;
    expect(ask.handedAt).toBeTruthy();
    // Later ticks send nothing more for it.
    const queued = store.out.length;
    await introSweep(mins(180));
    expect(sendDealSheet).toHaveBeenCalledTimes(1);
    expect(store.out.length).toBe(queued);
  });

  it("a YES after the hand-off records the terms and tells #mkan — no deal, no number to the tenant", async () => {
    await startIntro([task("t1", "+250700000011")], 6041, BROKER, { typed: false });
    await introSweep(mins(121));
    const alerts = store.out.filter((r) => r.kind === "TENANT_ALERT").length;
    const res = await answerTerms(BROKER, "Yes", mins(200));
    expect(res?.answer).toBe("yes");
    expect(store.brokers[0]!.sharePct).toBe(0.1);
    expect(store.brokers[0]!.agreedAt).toBeInstanceOf(Date);
    expect(store.deals).toHaveLength(0);
    expect(store.out.filter((r) => r.kind === "TENANT_ALERT")).toHaveLength(alerts);
    expect(res?.reply).not.toContain("+250700000011");
    expect(store.cards.some((c) => c.includes("Terms agreed late"))).toBe(true);
    expect(store.state.has(termsAskKey(BROKER))).toBe(false);
  });

  it("a web tenant who left a number gets the deal sheet at that number (25c82d7's re-reads took only WhatsApp's)", async () => {
    const { db } = await import("@/lib/db");
    await startIntro([task("t2", "+250720000012")], 6041, BROKER, { typed: false });
    vi.mocked(db.agentTask.findUnique).mockResolvedValueOnce({ id: "t2", locale: "en", shortlist: [], messages: [], profile: null, demand: { phone: "+250720000012", optInAt: new Date() } } as never);
    await introSweep(mins(121));
    expect(vi.mocked(sendDealSheet).mock.calls[0]![0]).toMatchObject({ id: "t2", profile: { waPhone: "+250720000012" } });
    expect(store.cards.some((c) => c.includes("the tenant got the deal sheet"))).toBe(true);
  });

  it("when no sheet could go, #mkan hears that — never \"the tenant got the deal sheet\"", async () => {
    vi.mocked(sendDealSheet).mockResolvedValueOnce(false);
    await startIntro([task("t3", "+250720000013")], 6041, BROKER, { typed: false });
    await introSweep(mins(121));
    expect(store.cards.some((c) => c.includes("no deal sheet could go out"))).toBe(true);
    expect(store.cards.some((c) => c.includes("the tenant got the deal sheet"))).toBe(false);
  });

  it("the ask is gone once its 72 h are over", async () => {
    await startIntro([task("t1", "+250700000011")], 6041, BROKER, { typed: false });
    await introSweep(mins(121));
    await introSweep(mins(73 * 60));
    expect(store.state.has(termsAskKey(BROKER))).toBe(false);
  });
});

describe("yes → terms → agreed → both numbers", () => {
  for (const [lang, yes] of [["en", "Yes"], ["rw", "Ndabyemera"]] as const) {
    it(`${lang}: the broker's typed yes asks the terms; their "${yes}" sends each side the other's number`, async () => {
      const res = await startIntro([task("t1", "+250700000011", lang)], 6041, BROKER, { typed: true });
      // The tenant hears "the broker will connect"; no number goes before the broker agrees.
      expect(res.started).toBe(true);
      const pending = store.out.filter((r) => r.kind === "TENANT_ALERT");
      expect(pending).toHaveLength(1);
      expect(pending[0]!.body).not.toMatch(/\+250700000043/);
      // The terms ask rides on the line's reply to their yes — nothing is queued for it.
      expect(await introReplyFor(BROKER, 6041)).toMatch(/Reply YES to agree/);
      expect(store.out.some((r) => r.label === "auto-terms")).toBe(false);

      const terms = await answerTerms(BROKER, yes, mins(2));
      expect(terms?.answer).toBe("yes");
      // The agreement is on the broker, a deal exists, and the broker is told the tenant's number…
      expect(store.brokers[0]!.sharePct).toBe(0.1);
      expect(store.deals).toHaveLength(1);
      expect(store.deals[0]!.introducedAt).toBeInstanceOf(Date);
      expect(terms?.reply).toContain("+250700000011");
      // …and the tenant is sent the broker's, in their own language.
      const intro = store.out.filter((r) => r.kind === "TENANT_ALERT").at(-1)!;
      expect(intro.body).toContain("+250700000043");
      expect(intro.label).toBe("tenant-intro");
      if (lang === "rw") expect(intro.body).toMatch(/Mwandikire kuri WhatsApp/);
      else expect(intro.body).toMatch(/WhatsApp them/);
      expect(store.state.has(termsAskKey(BROKER))).toBe(false);
    });
  }

  it("a form yes (no reply to ride on) queues the terms ask at once, not at the next sweep", async () => {
    await startIntro([task("t1", "+250700000011")], 6041, BROKER, { typed: false });
    const ask = store.out.filter((r) => r.label === "auto-terms");
    expect(ask).toHaveLength(1);
    expect(ask[0]!.to).toBe(`+${BROKER}`);
    // The sweep does not queue it a second time.
    await introSweep(mins(20));
    expect(store.out.filter((r) => r.label === "auto-terms")).toHaveLength(1);
  });

  it("a typed yes whose reply never went is queued by the sweep after ten minutes", async () => {
    await startIntro([task("t1", "+250700000011")], 6041, BROKER, { typed: true });
    await introSweep(mins(5));
    expect(store.out.filter((r) => r.label === "auto-terms")).toHaveLength(0);
    await introSweep(mins(12));
    expect(store.out.filter((r) => r.label === "auto-terms")).toHaveLength(1);
  });
});

describe("a gated intro is a card, not silence", () => {
  it("broker sends off: the terms ask is held, #mkan names who waits (once), nothing is queued", async () => {
    store.mode = "off";
    await startIntro([task("t1", "+250700000011")], 6041, BROKER, { typed: false });
    expect(store.out.filter((r) => r.label === "auto-terms")).toHaveLength(0);
    const held = store.cards.filter((c) => c.includes("Intro held"));
    expect(held).toHaveLength(1);
    expect(held[0]).toContain("K6041");
    expect(held[0]).toContain("Test Homes");
    expect(held[0]).toContain("…011");
    expect(held[0]).not.toContain("+250700000011");
    // Another tick does not repeat the card.
    await introSweep(mins(30));
    expect(store.cards.filter((c) => c.includes("Intro held"))).toHaveLength(1);
    expect((store.state.get(termsAskKey(BROKER)) as Row).heldAt).toBeTruthy();
  });

  it("turning sends on releases it: the next sweep queues the held ask", async () => {
    store.mode = "off";
    await startIntro([task("t1", "+250700000011")], 6041, BROKER, { typed: false });
    store.mode = "gated";
    await introSweep(mins(15));
    expect(store.out.filter((r) => r.label === "auto-terms" && r.status === "QUEUED")).toHaveLength(1);
    expect((store.state.get(termsAskKey(BROKER)) as Row).heldAt).toBeUndefined();
  });

  it("a reply the outbox SKIPPED (sends flipped off after the yes) is held, not marked replied forever", async () => {
    await startIntro([task("t1", "+250700000011")], 6041, BROKER, { typed: true });
    // The inbox wrote the reply as SENT; the outbox then SKIPPED it ("broker sends off").
    store.out.push({ id: "r1", createdAt: new Date(), kind: "BROKER_REQUEST", to: `+${BROKER}`, label: "auto-terms", body: "x", status: "SKIPPED" });
    store.mode = "off";
    await introSweep(mins(1));
    expect(store.cards.filter((c) => c.includes("Intro held"))).toHaveLength(1);
    store.mode = "gated";
    await introSweep(mins(16));
    expect(store.out.filter((r) => r.label === "auto-terms" && r.status === "QUEUED")).toHaveLength(1);
  });

  it("a web chat with no WhatsApp number is named in #mkan instead of vanishing", async () => {
    await startIntro([task("t1", "+250700000011"), { id: "web123456", locale: "en", shortlist: [], profile: { waPhone: null } as never }], 6041, BROKER, { typed: false });
    expect(store.cards.some((c) => c.includes("no WhatsApp number") && c.includes("123456"))).toBe(true);
  });
});
