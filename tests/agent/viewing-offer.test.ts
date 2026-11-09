/** proposeViewing's one-tap half (offerViewingDecision): one blocked prompt + one deal.book decision per chat and home. */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;
const s = vi.hoisted(() => ({ sprint: { id: "sp1" } as Row | null, prompts: [] as Row[], state: new Map<string, any>() }));

vi.mock("@/lib/db", () => ({
  db: {
    sprint: { findFirst: vi.fn(async () => s.sprint) },
    sprintPrompt: {
      findMany: vi.fn(async ({ where }: Row) => s.prompts.filter((p) => p.status === where.status && p.text.startsWith(where.text.startsWith))),
      count: vi.fn(async () => s.prompts.length),
      create: vi.fn(async ({ data }: Row) => { const p = { id: `p${s.prompts.length + 1}`, ...data }; s.prompts.push(p); return p; }),
    },
    waState: {
      findUnique: vi.fn(async ({ where }: Row) => (s.state.has(where.key) ? { value: s.state.get(where.key) } : null)),
      create: vi.fn(async ({ data }: Row) => { s.state.set(data.key, data.value); }),
      update: vi.fn(async ({ where, data }: Row) => { s.state.set(where.key, data.value); }),
    },
  },
}));
vi.mock("@/components/agent/whatsapp", () => ({ postSlackCard: vi.fn(), sendMessages: vi.fn() }));

import { offerViewingDecision } from "@/components/agent/deal";

const task = "cmw1sxpzz0009vmsdgwy7dym7";
const ask = { taskId: task, listingId: 6041, at: "2026-11-09T08:00:00Z" };
const at = new Date("2026-11-10T08:00:00Z");

beforeEach(() => { s.sprint = { id: "sp1" }; s.prompts = []; s.state = new Map(); });

describe("offerViewingDecision", () => {
  it("creates a blocked prompt and a deal.book decision carrying the slot and the share choice", async () => {
    expect(await offerViewingDecision(ask, at, null, 400000)).toBe(true);
    expect(s.prompts).toHaveLength(1);
    expect(s.prompts[0]).toMatchObject({ status: "blocked", metric: "viewingsBooked", sprintId: "sp1" });
    const rec = s.state.get("decision:p1");
    expect(rec).toMatchObject({ promptId: "p1", kind: "deal.book", params: { task, listing: 6041, at: "2026-11-10 10:00", rent: 400000, noShare: true } });
    expect(rec.effect).toMatch(/no share for this deal/);
    expect(rec.decision).toBeUndefined();
  });
  it("carries the agreed percent when the broker has one", async () => {
    await offerViewingDecision(ask, at, { pct: 0.4, flatRwf: null }, null);
    expect(s.state.get("decision:p1").params).toMatchObject({ sharePct: 40 });
  });
  it("moves the open one when the tenant names another time, instead of stacking", async () => {
    await offerViewingDecision(ask, at, null, null);
    await offerViewingDecision(ask, new Date("2026-11-11T09:00:00Z"), null, null);
    expect(s.prompts).toHaveLength(1);
    expect(s.state.get("decision:p1").params.at).toBe("2026-11-11 11:00");
  });
  it("leaves an answered decision alone and opens a new one", async () => {
    await offerViewingDecision(ask, at, null, null);
    s.state.set("decision:p1", { ...s.state.get("decision:p1"), decision: "yes" });
    await offerViewingDecision(ask, new Date("2026-11-11T09:00:00Z"), null, null);
    expect(s.prompts).toHaveLength(2);
    expect(s.state.get("decision:p1").params.at).toBe("2026-11-10 10:00");
  });
  it("is false with no open sprint, so the Slack card stays the path", async () => {
    s.sprint = null;
    expect(await offerViewingDecision(ask, at, null, null)).toBe(false);
    expect(s.prompts).toHaveLength(0);
  });
});
