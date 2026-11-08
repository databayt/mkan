/**
 * A tenant's pick that the line cannot check (2026-11-08): a taken home is said to be taken, and one with
 * nobody to ask — a host's own, a broker who went quiet, no broker with a number — goes to a person in
 * #mkan. It used to be "I'll tell you here if the broker writes back" with no broker asked at all.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn<(text: string) => Promise<void>>(async () => {});
vi.mock("@/components/agent/whatsapp", () => ({ postSlackCard: (t: string) => post(t) }));
const requestConfirmations = vi.fn<() => Promise<unknown[]>>(async () => []);
const appendTaskEvent = vi.fn(async () => {});
vi.mock("@/components/agent/broker", () => ({
  appendTaskEvent: () => appendTaskEvent(),
  homeLink: () => "https://mkan.sd/en/k/K7",
  requestConfirmations: () => requestConfirmations(),
}));
const gate = vi.fn(async () => ({ ok: true, why: undefined as string | undefined, waPhone: "+250720000011" }));
vi.mock("@/components/agent/broker-sends", () => ({ gateForTask: () => gate() }));
let shortlist: Record<string, unknown>[] = [];
vi.mock("@/lib/db", () => ({
  db: {
    agentTask: {
      findUnique: vi.fn(async () => ({ id: "t1", locale: "en", requirements: null, shortlist, status: "DONE" })),
      update: vi.fn(async () => ({})),
    },
    listingBroker: { findMany: vi.fn(async () => []) },
    brokerRequest: { updateMany: vi.fn(async () => ({ count: 1 })) },
  },
}));

const { askAvailabilityFor } = await import("@/components/agent/availability");
const { checkText } = await import("@/components/agent/whatsapp-format");

const home = (o: Record<string, unknown>) => ({ id: 7, title: "2-bedroom in Remera", path: "/en/k/K7", lead: true, availability: "unconfirmed", ...o });

beforeEach(() => {
  post.mockClear();
  requestConfirmations.mockReset();
  requestConfirmations.mockResolvedValue([]);
  gate.mockResolvedValue({ ok: true, why: undefined, waPhone: "+250720000011" });
});

describe("askAvailabilityFor", () => {
  it("a home a broker said is rented is taken: no card, no broker", async () => {
    shortlist = [home({ availability: "rented" })];
    expect(await askAvailabilityFor("t1", 7)).toEqual({ ok: true, asked: false, why: "taken" });
    expect(post).not.toHaveBeenCalled();
    expect(requestConfirmations).not.toHaveBeenCalled();
  });
  it("a host's own home goes to a person", async () => {
    shortlist = [home({ lead: false })];
    expect((await askAvailabilityFor("t1", 7)).why).toBe("person");
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]![0]).toMatch(/not a broker's lead/);
  });
  it("a broker who went quiet on it: a person checks", async () => {
    shortlist = [home({ availability: "no_reply" })];
    expect((await askAvailabilityFor("t1", 7)).why).toBe("person");
    expect(post.mock.calls[0]![0]).toMatch(/went quiet/);
  });
  it("nobody to ask (no broker with a number): a person checks, with the tenant's number on the card", async () => {
    shortlist = [home({})];
    expect((await askAvailabilityFor("t1", 7)).why).toBe("person");
    expect(post.mock.calls[0]![0]).toContain("+250720000011");
  });
  it("an open gate and a broker to ask: asked", async () => {
    shortlist = [home({})];
    requestConfirmations.mockResolvedValue([{ id: "r1" }]);
    expect(await askAvailabilityFor("t1", 7)).toEqual({ ok: true, asked: true });
    expect(post).not.toHaveBeenCalled();
  });
});

describe("checkText", () => {
  it("never promises a broker's answer when no broker was asked", () => {
    for (const lang of ["en", "ar", "rw"] as const) {
      for (const outcome of ["taken", "person", "none"] as const) {
        const t = checkText(lang, outcome, "2-bedroom in Remera");
        expect(t).toContain("2-bedroom in Remera");
        expect(t).not.toMatch(/broker writes back|can't get an answer|ردّ الوسيط|nasubiza/);
      }
    }
    expect(checkText("en", "taken", "X")).toMatch(/taken/);
    expect(checkText("en", "person", "X")).toMatch(/A person from Mkan/);
  });
});
