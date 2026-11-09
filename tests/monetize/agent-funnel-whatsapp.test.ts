import { describe, expect, it, vi } from "vitest";

import { agentFunnel } from "@/lib/monetize/agent-funnel";

/** A db whose every count is zero, but for the rows a test hands it. */
function fakeDb(o: { proposedTasks?: string[]; deals?: { introducedAt: Date | null; taskId: string | null }[]; requests?: object[] }) {
  return {
    agentEvent: {
      findMany: vi.fn(async (a: { where: { kind: string } }) => (a.where.kind === "viewing_proposed" ? (o.proposedTasks ?? []).map((taskId) => ({ taskId })) : [])),
      count: vi.fn(async () => 0),
    },
    apiSpend: { findMany: vi.fn(async () => []) },
    brokerRequest: { findMany: vi.fn(async () => o.requests ?? []) },
    tenantRequest: { count: vi.fn(async () => 0) },
    outboundMessage: { count: vi.fn(async () => 0) },
    deal: { findMany: vi.fn(async () => o.deals ?? []) },
    $queryRaw: vi.fn(async () => [{ n: 0 }]),
  } as never;
}

describe("agentFunnel on the WhatsApp path", () => {
  it("counts slots named in chat and the deals that followed, with no broker request at all", async () => {
    const f = await agentFunnel(fakeDb({ proposedTasks: ["a", "b"], deals: [{ introducedAt: new Date(), taskId: "a" }, { introducedAt: null, taskId: "b" }] }));
    expect(f.proposed).toBe(2);
    expect(f.intros).toBe(1);
    expect(f.slotChosen).toBe(2);
    expect(f.booked).toBe(2);
  });
  it("does not add the broker path and the WhatsApp path twice", async () => {
    const f = await agentFunnel(fakeDb({ proposedTasks: ["a"], requests: [{ status: "AVAILABLE", respondedAt: new Date(), chosenSlot: new Date(), visitId: 7 }], deals: [{ introducedAt: null, taskId: "a" }] }));
    expect(f.slotChosen).toBe(1);
    expect(f.booked).toBe(1);
  });
  it("stays zero when nothing happened", async () => {
    const f = await agentFunnel(fakeDb({}));
    expect([f.proposed, f.intros, f.slotChosen, f.booked]).toEqual([0, 0, 0, 0]);
  });
});
