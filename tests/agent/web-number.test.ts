/**
 * A web tenant's number reaches the broker's answer (2026-11-08). 5 real /find chats in a week got
 * homes whose only next step was "open WhatsApp and send a message": none asked a broker, none left
 * a number, and a broker's "available" would have reached nobody. /find's card now takes the number
 * beside "Ask the broker": it opens the chat's request with the number (demand.ts optInDemand), and
 * broker.ts applyAnswer reaches the tenant there, as it does a WhatsApp chat.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn(async () => "queued");
vi.mock("@/components/agent/whatsapp", () => ({ sendMessages: (...a: unknown[]) => send(...a), postSlackCard: vi.fn(async () => {}) }));
const dealSheet = vi.fn(async () => {});
vi.mock("@/components/agent/deal", () => ({ sendDealSheet: (...a: unknown[]) => dealSheet(...a) }));
vi.mock("@/components/agent/deal-intro", () => ({ introMode: vi.fn(async () => "relay"), startIntro: vi.fn() }));
vi.mock("@/components/agent/broker-sends", () => ({ brokerSendMode: vi.fn(async () => "gated") }));

const tenantRequest = { updateMany: vi.fn(), upsert: vi.fn(async () => ({ id: "req1" })) };
const agentTask = { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({})) };
vi.mock("@/lib/db", () => ({
  db: {
    tenantRequest,
    agentTask,
    brokerRequest: { updateMany: vi.fn(async () => ({})), findMany: vi.fn(async () => []), groupBy: vi.fn(async () => []) },
    agentEvent: { create: vi.fn(async () => ({ id: 1 })), createMany: vi.fn(async () => ({})), findFirst: vi.fn(async () => null) },
    listing: { update: vi.fn(async () => ({})) },
    outboundMessage: { count: vi.fn(async () => 0) },
    broker: { findMany: vi.fn(async () => []) },
  },
}));

const { optInDemand } = await import("@/components/agent/demand");
const { applyAnswer } = await import("@/components/agent/broker");

beforeEach(() => vi.clearAllMocks());

describe("the number a web tenant leaves", () => {
  it("is saved on the chat's request, which a chat that found homes did not have", async () => {
    // First update: no open request. Second (after openDemand opens it): the number lands.
    tenantRequest.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    agentTask.findUnique.mockResolvedValueOnce({ id: "t1", profileId: "p1", requirements: { bedrooms: 2 }, locale: "en" });
    expect(await optInDemand("t1", "+250700000009")).toBe(true);
    expect(tenantRequest.upsert).toHaveBeenCalledTimes(1);
    const last = tenantRequest.updateMany.mock.calls.at(-1)![0] as { data: { phone: string; optInAt: Date } };
    expect(last.data.phone).toBe("+250700000009");
    expect(last.data.optInAt).toBeInstanceOf(Date);
  });

  it("goes straight onto an open request without opening another", async () => {
    tenantRequest.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await optInDemand("t1", "+250700000009")).toBe(true);
    expect(tenantRequest.upsert).not.toHaveBeenCalled();
  });

  it("is refused for a chat that does not exist", async () => {
    tenantRequest.updateMany.mockResolvedValueOnce({ count: 0 });
    agentTask.findUnique.mockResolvedValueOnce(null);
    expect(await optInDemand("nope", "+250700000009")).toBe(false);
  });
});

describe("a broker's answer to a web tenant", () => {
  const task = (over: Record<string, unknown> = {}) => ({
    id: "t1",
    shortlist: [{ id: 77, title: "2 bed in Kicukiro", availability: "asked" }],
    locale: "en",
    messages: [{ role: "user", text: "2 bedroom", at: new Date().toISOString() }],
    profile: { waPhone: null },
    demand: { phone: "+250700000009", optInAt: new Date() },
    brokerRequests: [{ status: "AVAILABLE" }],
    ...over,
  });

  it("reaches the number they left: the deal sheet goes to it as to a WhatsApp chat", async () => {
    agentTask.findMany.mockResolvedValueOnce([task()]);
    await applyAnswer(77, "AVAILABLE", "+250788000001");
    expect(dealSheet).toHaveBeenCalledTimes(1);
    const sent = (dealSheet.mock.calls[0] as unknown[])[0] as { id: string; profile: { waPhone: string } };
    expect(sent.id).toBe("t1");
    expect(sent.profile.waPhone).toBe("+250700000009");
  });

  it("a 'no reply' reaches it too, while the tenant is still in the search", async () => {
    agentTask.findMany.mockResolvedValueOnce([task({ brokerRequests: [{ status: "PENDING" }] })]);
    await applyAnswer(77, "NO_REPLY");
    const msgs = (send.mock.calls[0] as unknown[])[0] as { to: string; kind: string }[];
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ to: "+250700000009", kind: "TENANT_ALERT" });
  });

  it("reaches nobody when the tenant left no number (what 4 of 4 'available' answers did)", async () => {
    agentTask.findMany.mockResolvedValueOnce([task({ demand: null })]);
    await applyAnswer(77, "AVAILABLE", "+250788000001");
    expect(dealSheet).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("reaches nobody on a number that was never opted in", async () => {
    agentTask.findMany.mockResolvedValueOnce([task({ demand: { phone: "+250700000009", optInAt: null } })]);
    await applyAnswer(77, "AVAILABLE", "+250788000001");
    expect(dealSheet).not.toHaveBeenCalled();
  });

  it("a WhatsApp chat keeps its own number over a typed one", async () => {
    agentTask.findMany.mockResolvedValueOnce([task({ profile: { waPhone: "+250700000001" } })]);
    await applyAnswer(77, "AVAILABLE", "+250788000001");
    expect(((dealSheet.mock.calls[0] as unknown[])[0] as { profile: { waPhone: string } }).profile.waPhone).toBe("+250700000001");
  });
});
