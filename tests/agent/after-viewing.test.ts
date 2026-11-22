/**
 * "How did it go?" drives the deal forward by itself (deal.ts recordAfterViewing, 2026-11-22): liked → the broker
 * is told, the tenant gets the terms and is asked which day to sign, and the day they name goes to the broker;
 * not → the line offers the next best homes. The rep's words (signed / paid / lost K…) still override.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Msg = { kind: string; to: string; body: string; label: string };
const sent: Msg[] = [];
const cards: string[] = [];
const dealUpdates: { where: { id: string }; data: Record<string, unknown> }[] = [];
const events: [string, Record<string, unknown>][] = [];
const newHomesFor = vi.fn(async () => [] as { id: number; bedrooms: number | null; zone: string | null; rent: number | null }[]);

vi.mock("@/lib/db", () => ({
  db: {
    listingVisit: { update: vi.fn(async () => ({})) },
    deal: {
      update: vi.fn(async (a: { where: { id: string }; data: Record<string, unknown> }) => void dealUpdates.push(a)),
      findUnique: vi.fn(async () => ({ broker: { id: "b1", phones: ["250720000011"], whatsapp: null, optOut: false } })),
    },
    agentTask: { findUnique: vi.fn(async () => ({ id: "t1", profileId: "p1", requirements: { maxPrice: 400000 }, shortlist: [] })) },
  },
}));
vi.mock("@/components/agent/whatsapp", () => ({
  sendMessages: async (m: Msg[]) => {
    sent.push(...m);
    return "queued";
  },
  postSlackCard: async (t: string) => void cards.push(t),
}));
vi.mock("@/components/agent/deal-event", () => ({ dealEvent: (step: string, ctx: Record<string, unknown>) => void events.push([step, ctx]) }));
vi.mock("@/components/agent/follow-homes", () => ({ newHomesFor: () => newHomesFor() }));
vi.mock("@/components/agent/wa-state", () => ({ readState: async (_k: string, empty: unknown) => empty, writeState: async () => {} }));
vi.mock("@/components/agent/demand", () => ({ chatLink: () => "https://www.mkan.sd/en/find?c=t1" }));

const { recordAfterViewing } = await import("@/components/agent/deal");

const now = new Date("2026-11-17T14:00:00+02:00"); // Tuesday
const visit = (status: string) =>
  ({
    id: 18,
    listingId: 7,
    taskId: "t1",
    scheduledFor: new Date("2026-11-17T10:00:00+02:00"),
    listing: { title: "3-bedroom apartment in Rebero" },
    deal: { id: "d1", status, rentMonthly: 350_000, upfront: 1_050_000 },
  }) as never;
const PHONE = "+250720000019";

beforeEach(() => {
  sent.length = 0;
  cards.length = 0;
  dealUpdates.length = 0;
  events.length = 0;
  newHomesFor.mockClear();
  newHomesFor.mockResolvedValue([]);
  delete process.env.MKAN_REP_WHATSAPP;
});

describe("liked", () => {
  it("moves the deal to VIEWED, tells the broker once, and gives the tenant the terms and the day-to-sign question", async () => {
    process.env.MKAN_REP_WHATSAPP = "+250720000001";
    const reply = await recordAfterViewing(visit("VIEWING_BOOKED"), "want", "1", PHONE, "en", now);
    expect(reply).toMatch(/^Great! I've told the broker you want "3-bedroom apartment in Rebero"\. Rent is RWF 350,000 a month, and about RWF 1,050,000 is paid when you sign\. Which day suits you to sign\?/);
    expect(dealUpdates[0]).toMatchObject({ where: { id: "d1" }, data: { status: "VIEWED" } });
    expect(events.map((e) => e[0])).toEqual(["VIEWED"]);
    expect(sent.find((m) => m.label === "auto-tenant-wants")).toMatchObject({ kind: "BROKER_REQUEST", to: "+250720000011" });
    // Mkan's person is told as an FYI, with nothing for him to do but go.
    expect(sent.find((m) => m.to === "+250720000001")!.body).toMatch(/^FYI Osman: the tenant \+250720000019 wants to take .*Say `signed K7` when it is signed/);
  });

  it("a second 1 re-asks the day, and does not tell the broker twice", async () => {
    const reply = await recordAfterViewing(visit("VIEWED"), "want", "1", PHONE, "en", now);
    expect(reply).toMatch(/Which day suits you to sign\?/);
    expect(sent.find((m) => m.label === "auto-tenant-wants")).toBeUndefined();
    expect(dealUpdates).toHaveLength(0);
  });

  it("the day they name is asked of the broker, and noted for Mkan's person", async () => {
    process.env.MKAN_REP_WHATSAPP = "+250720000001";
    const reply = await recordAfterViewing(visit("VIEWED"), null, "tomorrow 11am", PHONE, "en", now);
    expect(reply).toBe('Got it: signing for "3-bedroom apartment in Rebero" on Wed 18 Nov, 11:00. I\'m asking the broker to confirm it now and I\'ll message you here as soon as they answer. Osman from Mkan will be there.');
    expect(sent.find((m) => m.label === "auto-signing:v18")).toMatchObject({ kind: "BROKER_REQUEST", to: "+250720000011" });
    expect(sent.find((m) => m.label === "auto-signing:v18")!.body).toMatch(/would like to sign for 3-bedroom apartment in Rebero \(K7\) on Wed 18 Nov, 11:00/);
    expect(dealUpdates[0]!.data.notes).toMatch(/signing asked for Wed 18 Nov, 11:00/);
    expect(sent.find((m) => m.to === "+250720000001")!.body).toMatch(/^FYI Osman: \+250720000019 would sign/);
  });

  it("a yes with a day in it is the day, not a second 'I want it'", async () => {
    const reply = await recordAfterViewing(visit("VIEWED"), "want", "yes, tomorrow 11am", PHONE, "en", now);
    expect(reply).toMatch(/^Got it: signing for/);
  });

  it("anything else once they want it asks for the day again — never the 1 / 2 question", async () => {
    expect(await recordAfterViewing(visit("VIEWED"), null, "when are you free?", PHONE, "en", now)).toBe('Which day and time suits you to sign for "3-bedroom apartment in Rebero"? For example "tomorrow 10am".');
  });
});

describe("not for me", () => {
  it("is LOST, and the line offers the next best homes from the brief", async () => {
    newHomesFor.mockResolvedValue([{ id: 6711, bedrooms: 2, zone: "gasabo/kimironko", rent: 350_000 }]);
    const reply = await recordAfterViewing(visit("VIEWING_BOOKED"), "not", "2", PHONE, "en", now);
    expect(reply).toBe("Thanks for telling me. I found another one:\n• 2-bedroom in Kimironko, RWF 350,000 a month (K6711)\nSend the code, like K6711, and I'll check with its broker that it's free, or tell me what to change.");
    expect(dealUpdates[0]).toMatchObject({ data: { status: "LOST" } });
    expect(events.map((e) => e[0])).toEqual(["LOST"]);
    expect(cards[0]).toMatch(/passed on \*K7\*.*The line offered 1 other home \(K6711\)/);
  });

  it("with nothing new to show asks what to change", async () => {
    const reply = await recordAfterViewing(visit("VIEWED"), "not", "no", PHONE, "en", now);
    expect(reply).toMatch(/What should change/);
    expect(cards[0]).toMatch(/asked what to change/);
  });
});

describe("his words override", () => {
  it("a deal he already signed, paid or lost is never moved by a late 1 or 2", async () => {
    for (const status of ["SIGNED", "PAID", "LOST"]) {
      sent.length = 0;
      dealUpdates.length = 0;
      for (const verdict of ["want", "not"] as const) {
        const reply = await recordAfterViewing(visit(status), verdict, verdict === "want" ? "1" : "2", PHONE, "en", now);
        expect(reply).toBe("Thank you! What we agreed stands, and we carry on from there.");
      }
      expect(dealUpdates).toHaveLength(0);
      expect(sent).toHaveLength(0);
      expect(newHomesFor).not.toHaveBeenCalled();
    }
    expect(events).toHaveLength(0);
  });
});
