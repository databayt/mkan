/**
 * The quiet-tenant sweep (quiet-nudge.ts, 2026-11-22), with the database and the sends mocked: the line follows a
 * quiet tenant up itself — a new home first, a soft close second — never more than twice, never across STOP, a
 * person typing in the chat, a personal chat or a team number; and Mkan's person gets an FYI, never a task.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Msg = { kind: string; to: string; body: string; label: string };
const sent: Msg[] = [];
const events: [string, Record<string, unknown>][] = [];
const state = new Map<string, unknown>();
const touched: string[] = [];
const newHomesFor = vi.fn(async () => [] as { id: number; bedrooms: number | null; zone: string | null; rent: number | null }[]);
let personal = false;
let tests = new Set<string>();

const h = 3_600_000;
const now = new Date("2026-11-17T10:00:00+02:00"); // Tuesday, inside the send window
const ago = (hours: number) => new Date(now.getTime() - hours * h);
let lastWord = ago(30);
const task = () => ({
  id: "t1",
  locale: "en",
  profileId: "p1",
  requirements: { maxPrice: 400_000, neighbourhoods: ["kimironko"] },
  shortlist: [{ id: 5, availability: "unconfirmed" }, { id: 6, availability: "unconfirmed" }],
  messages: [
    { role: "user", text: "2 bedroom in Kimironko, 400k", at: lastWord.toISOString() },
    { role: "agent", kind: "shortlist", count: 2, at: lastWord.toISOString() },
  ],
  profile: { waPhone: "+250720000019" },
});

vi.mock("@/lib/db", () => ({
  db: {
    agentTask: { findMany: vi.fn(async () => [task()]), update: vi.fn(async ({ where }: { where: { id: string } }) => void touched.push(where.id)) },
    agentEvent: { findFirst: vi.fn(async () => null) },
  },
}));
vi.mock("@/components/agent/broker-sends", () => ({ testPhones: async () => tests }));
vi.mock("@/components/agent/personal", () => ({ isPersonal: async () => personal }));
vi.mock("@/components/agent/follow-homes", () => ({ newHomesFor: () => newHomesFor() }));
vi.mock("@/components/agent/deal-event", () => ({ dealEvent: (step: string, ctx: Record<string, unknown>) => void events.push([step, ctx]) }));
vi.mock("@/components/agent/wa-state", () => ({
  readState: async (k: string, empty: unknown) => (state.has(k) ? state.get(k) : empty),
  writeState: async (k: string, v: unknown) => void state.set(k, JSON.parse(JSON.stringify(v))),
}));
vi.mock("@/components/agent/whatsapp", () => ({
  sendMessages: async (m: Msg[]) => {
    sent.push(...m);
    return "queued";
  },
}));

const { quietSweep } = await import("@/components/agent/quiet-nudge");

beforeEach(() => {
  sent.length = 0;
  events.length = 0;
  touched.length = 0;
  state.clear();
  newHomesFor.mockClear();
  newHomesFor.mockResolvedValue([]);
  personal = false;
  tests = new Set();
  lastWord = ago(30);
  delete process.env.MKAN_QUIET_NUDGE;
});

describe("quietSweep", () => {
  it("first follow-up: a new matching home from their brief, then an FYI that says what the line did", async () => {
    newHomesFor.mockResolvedValue([{ id: 6711, bedrooms: 2, zone: "gasabo/kimironko", rent: 350_000 }]);
    expect(await quietSweep(now)).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: "TENANT_ALERT", to: "+250720000019", label: "tenant-quiet-nudge" });
    expect(sent[0]!.body).toMatch(/^Hi, it's Mkan\. A new one just came in that fits what you asked for: 2-bedroom in Kimironko, RWF 350,000 a month \(K6711\)\. .*Send K6711\./);
    expect(state.get("quiet:t1")).toMatchObject({ n: 1 });
    expect(touched).toEqual(["t1"]);
    expect(events).toEqual([["STALLED", expect.objectContaining({ listingId: 5, n: 1, note: "first follow-up sent: 1 new Kimironko home (K6711), no reply yet" })]]);
  });

  it("with no new home it asks the one question that unblocks the search", async () => {
    await quietSweep(now);
    expect(sent[0]!.body).toMatch(/budget fixed/);
    expect(events[0]![1]).toMatchObject({ note: "first follow-up sent: asked one question (budget), no reply yet" });
  });

  it("second follow-up, ~3 days on: a soft close — and then never again", async () => {
    lastWord = ago(80);
    state.set("quiet:t1", { at: ago(50).toISOString(), n: 1 });
    expect(await quietSweep(now)).toBe(1);
    expect(sent[0]).toMatchObject({ label: "tenant-quiet-nudge-2" });
    expect(sent[0]!.body).toMatch(/No rush\. I'll keep an eye out.*Say the word anytime/);
    expect(newHomesFor).not.toHaveBeenCalled();
    expect(state.get("quiet:t1")).toMatchObject({ n: 2 });
    expect(events[0]![1]).toMatchObject({ n: 2 });
    sent.length = 0;
    expect(await quietSweep(new Date(now.getTime() + 3 * 24 * h))).toBe(0);
    expect(await quietSweep(new Date(now.getTime() + 6 * 24 * h))).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("is spaced: nothing before ~20 h, nothing a second time within a day of the first", async () => {
    lastWord = ago(10);
    expect(await quietSweep(now)).toBe(0);
    lastWord = ago(80);
    state.set("quiet:t1", { at: ago(10).toISOString(), n: 1 });
    expect(await quietSweep(now)).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("never writes to a team number, someone who said STOP, a personal chat, or a chat Abdout typed in within 12 h", async () => {
    tests = new Set(["250720000019"]);
    expect(await quietSweep(now)).toBe(0);
    tests = new Set();
    state.set("tenant-stop", ["+250720000019"]);
    expect(await quietSweep(now)).toBe(0);
    state.delete("tenant-stop");
    personal = true;
    expect(await quietSweep(now)).toBe(0);
    personal = false;
    state.set("tenant-human", { "250720000019": ago(5).toISOString() });
    expect(await quietSweep(now)).toBe(0);
    expect(sent).toHaveLength(0);
    // …and once the 12 h hold has run out, it goes.
    state.set("tenant-human", { "250720000019": ago(13).toISOString() });
    expect(await quietSweep(now)).toBe(1);
  });

  it("waits for the send window, and switches off with MKAN_QUIET_NUDGE=off", async () => {
    expect(await quietSweep(new Date("2026-11-17T22:00:00+02:00"))).toBe(0);
    process.env.MKAN_QUIET_NUDGE = "off";
    expect(await quietSweep(now)).toBe(0);
  });

  it("writes in the tenant's language: French when that is how they write", async () => {
    lastWord = ago(30);
    const t = task();
    t.messages[0] = { role: "user", text: "Bonjour, je cherche une maison à Kimironko, c'est possible ?", at: lastWord.toISOString() };
    const { db } = await import("@/lib/db");
    vi.mocked(db.agentTask.findMany).mockResolvedValueOnce([t] as never);
    await quietSweep(now);
    expect(sent[0]!.body).toMatch(/^Bonjour, c'est Mkan\./);
  });
});
