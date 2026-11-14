/**
 * A tenant's pick that the line cannot simply ask about. 2026-11-08: a taken home is said to be taken, and a
 * pick with nobody to ask stopped saying "I'll tell you here if the broker writes back" (no broker had been
 * asked). 2026-11-14: it no longer says "a person from Mkan will check" either — on 11-12 a real tenant got
 * that line twice and nobody wrote. A pick now re-asks a broker who was silent on the home, and where nobody
 * can be asked the tenant hears exactly that. #mkan gets a note, not a task.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn<(text: string) => Promise<void>>(async () => {});
vi.mock("@/components/agent/whatsapp", () => ({ postSlackCard: (t: string) => post(t) }));
type Opts = { tenantPick?: boolean; overrides?: Set<number> };
const requestConfirmations = vi.fn<(taskId: string, items: { id: number; availability: string }[], r: unknown, lang: string, opts?: Opts) => Promise<unknown[]>>(async () => []);
const appendTaskEvent = vi.fn(async () => {});
vi.mock("@/components/agent/broker", () => ({
  appendTaskEvent: () => appendTaskEvent(),
  homeLink: () => "https://mkan.sd/en/k/K7",
  requestConfirmations: (...a: Parameters<typeof requestConfirmations>) => requestConfirmations(...a),
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
  it("a host's own home: the tenant gets its page, #mkan a note", async () => {
    shortlist = [home({ lead: false })];
    expect((await askAvailabilityFor("t1", 7)).why).toBe("host");
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]![0]).toMatch(/host's own home/);
    expect(requestConfirmations).not.toHaveBeenCalled();
  });
  it("a broker who went quiet on it in this chat is asked once more, as the tenant's own pick", async () => {
    shortlist = [home({ availability: "no_reply" })];
    requestConfirmations.mockImplementation(async (_t, _items, _r, _l, opts) => {
      opts?.overrides?.add(7);
      return [7];
    });
    expect(await askAvailabilityFor("t1", 7)).toEqual({ ok: true, asked: true, slow: true });
    const [, items, , , opts] = requestConfirmations.mock.calls[0]!;
    // The home goes in as unconfirmed (requestConfirmations asks about nothing else), marked a tenant's pick.
    expect(items[0]).toMatchObject({ id: 7, availability: "unconfirmed" });
    expect(opts?.tenantPick).toBe(true);
    expect(post).not.toHaveBeenCalled();
  });
  it("nobody the line may ask: unreachable, with the tenant's number on the note — and no promise of a person", async () => {
    shortlist = [home({})];
    expect((await askAvailabilityFor("t1", 7)).why).toBe("unreachable");
    expect(post.mock.calls[0]![0]).toContain("+250720000011");
    expect(post.mock.calls[0]![0]).toMatch(/was told and offered another home/);
  });
  it("an open gate and a broker to ask: asked", async () => {
    shortlist = [home({})];
    requestConfirmations.mockResolvedValue([{ id: "r1" }]);
    expect(await askAvailabilityFor("t1", 7)).toEqual({ ok: true, asked: true });
    expect(post).not.toHaveBeenCalled();
  });
  it("broker sends paused: the one case still handed to a person", async () => {
    shortlist = [home({})];
    gate.mockResolvedValue({ ok: false, why: "sends-off", waPhone: "+250720000011" });
    expect((await askAvailabilityFor("t1", 7)).why).toBe("handed");
    expect(post.mock.calls[0]![0]).toMatch(/paused/);
  });
});

describe("checkText", () => {
  it("never promises a broker's answer when no broker was asked, and never promises a person", () => {
    for (const lang of ["en", "ar", "rw"] as const) {
      for (const outcome of ["taken", "unreachable", "none", "host", "retry", "confirmed", "slow"] as const) {
        const t = checkText(lang, outcome, "2-bedroom in Remera");
        expect(t).toContain("2-bedroom in Remera");
        expect(t).not.toMatch(/broker writes back|can't get an answer|ردّ الوسيط|nasubiza/);
        expect(t).not.toMatch(/person from Mkan|a person will|someone from Mkan|Umuntu wo muri Mkan|أحد من فريق/i);
      }
    }
    expect(checkText("en", "taken", "X")).toMatch(/taken/);
    expect(checkText("en", "unreachable", "X")).toMatch(/couldn't reach the broker/);
  });
});
