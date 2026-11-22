/**
 * handleBrokerReply with Claude reading (2026-11-22): the same broker texts the line saw in November, now
 * acted on with no human step. The database and the model are stubbed; what is pinned is the decision.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const NOW = new Date();
const sent = new Date(NOW.getTime() - 3_600_000);

const h = vi.hoisted(() => ({
  db: {
    broker: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    outboundMessage: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
    brokerRequest: { findMany: vi.fn(), updateMany: vi.fn() },
    agentTask: { findUnique: vi.fn() },
    listing: { findUnique: vi.fn() },
  },
  read: vi.fn(),
  applyAnswer: vi.fn(),
  appendTaskEvent: vi.fn(),
  keepOtherHome: vi.fn(),
  hook: vi.fn(),
  created: [] as { label: string; body: string }[],
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("../../../scripts/crm/public-links", () => ({ publicAppUrl: () => "https://www.mkan.sd" }));
vi.mock("@/components/agent/broker", () => ({ appendTaskEvent: h.appendTaskEvent, applyAnswer: h.applyAnswer, brokerAnswers: async () => new Map() }));
vi.mock("@/components/agent/broker-home", () => ({ createBrokerHome: vi.fn(), keepOtherHome: h.keepOtherHome }));
vi.mock("@/components/agent/deal-intro", () => ({ answerTerms: async () => null, introBrokerUpdate: async () => null, introReplyFor: async () => null }));
vi.mock("@/components/agent/viewing-loop", () => ({ brokerViewingReply: async () => null, noteMeetingPlace: async () => null, settleViewingTime: h.hook }));
vi.mock("@/components/agent/wa-state", () => ({ readState: async (_k: string, d: unknown) => d, writeState: async () => {} }));
vi.mock("@/components/agent/broker-read", () => ({ readBrokerMessage: h.read }));

import { handleBrokerReply } from "@/components/agent/broker-inbox";

const ASK_BODY = "Hi there, Mkan here. A tenant likes this one:\nhttps://www.mkan.sd/en/k/K6603\nIs it still free? Could we come Mon 23 Nov, 09:00 or Tue 24 Nov, 09:00? (Or just reply 1 = free, 2 = taken.)";
const messages = [{ role: "user", text: "2 bedroom in Remera 150k", at: "x" }];

beforeEach(() => {
  vi.clearAllMocks();
  h.created.length = 0;
  const d = h.db;
  d.broker.findUnique.mockResolvedValue({ replyMinutes: null, preferredLanguage: "EN" });
  d.broker.update.mockResolvedValue({});
  d.broker.updateMany.mockResolvedValue({ count: 1 });
  d.outboundMessage.findFirst.mockImplementation(async (q: { where?: { kind?: string } }) =>
    q?.where?.kind === "BROKER_ASK" ? null : { id: "ask1", kind: "BROKER_REQUEST", to: "+250788111222", sentAt: sent, brokerRequestIds: ["r1"], body: ASK_BODY },
  );
  d.outboundMessage.count.mockResolvedValue(0);
  d.outboundMessage.create.mockImplementation(async ({ data }: { data: { label: string; body: string } }) => {
    h.created.push({ label: data.label, body: data.body });
    return { id: `o${h.created.length}` };
  });
  d.brokerRequest.findMany.mockResolvedValue([{ listingId: 6603, status: "PENDING", need: { requirements: { maxPrice: 150000, pricePeriod: "month", stay: "long", bedrooms: 2, neighbourhood: "Remera" } }, taskId: "t1" }]);
  d.brokerRequest.updateMany.mockResolvedValue({ count: 1 });
  d.agentTask.findUnique.mockResolvedValue({ messages });
  d.listing.findUnique.mockResolvedValue({ bedrooms: 2, priceMonth: 200000, location: { neighbourhood: "Remera", address: "Remera" } });
  h.keepOtherHome.mockResolvedValue({ ok: true, listingId: 9001, created: true });
  h.hook.mockResolvedValue(undefined);
  h.read.mockResolvedValue(null);
});

const reply = (text: string, extra: Record<string, unknown> = {}) => handleBrokerReply({ brokerId: "b1", phone: "250788111222", text, photoUrls: [], at: NOW, ...extra });
const read = (over: Record<string, unknown>) => h.read.mockResolvedValue({ answer: "unclear", time: null, otherHome: null, question: null, lang: "en", ...over });

describe("the broker side acts on what Claude reads", () => {
  it("a plain yes never calls Claude and is applied as before", async () => {
    const a = await reply("Yes");
    expect(h.read).not.toHaveBeenCalled();
    expect(h.applyAnswer).toHaveBeenCalledWith(6603, "AVAILABLE", "250788111222", "typed");
    expect(a).toMatchObject({ kind: "availability", answer: "AVAILABLE" });
  });

  it("'Tomorrow 10am we can see it': available, the time handed to the viewing loop, a short confirm", async () => {
    const at = new Date(NOW.getTime() + 86_400_000);
    read({ answer: "time", time: at });
    const a = await reply("Tomorrow 10am we can see it");
    expect(h.applyAnswer).toHaveBeenCalledWith(6603, "AVAILABLE", "250788111222", "typed");
    expect(h.hook).toHaveBeenCalledWith(expect.objectContaining({ by: "broker", phone: "250788111222", slot: at, listingId: 6603 }));
    expect(h.appendTaskEvent).toHaveBeenCalledWith("t1", "viewing_proposed", "uncertain", expect.objectContaining({ by: "broker" }));
    expect(a).toMatchObject({ kind: "availability", answer: "AVAILABLE", time: at });
    expect(h.created[0]!.body).toMatch(/confirm with our tenant/);
  });

  it("'Taken but I have another one in Gikondo 2 bed 200k': home lost, the other kept as a lead, thanked", async () => {
    read({ answer: "taken", otherHome: { area: "Gikondo", bedrooms: 2, rent: 200_000, furnished: null } });
    const a = await reply("Taken but I have another one in Gikondo 2 bed 200k");
    expect(h.applyAnswer).toHaveBeenCalledWith(6603, "RENTED", "250788111222", "typed");
    expect(h.keepOtherHome).toHaveBeenCalledWith("b1", expect.objectContaining({ area: "Gikondo", bedrooms: 2, rent: 200_000 }));
    expect(h.appendTaskEvent).toHaveBeenCalledWith("t1", "broker_replied", "done", expect.objectContaining({ offered: expect.objectContaining({ place: "Gikondo" }) }));
    expect(a).toMatchObject({ kind: "availability", answer: "RENTED", otherHome: { listingId: 9001 } });
    expect(h.created[0]!.body).toMatch(/other/i);
  });

  it("the rules alone still keep the other home when Claude is off", async () => {
    h.read.mockResolvedValue(null);
    const a = await reply("Taken but I have another one in Gikondo, 2 bedrooms 200k");
    expect(h.applyAnswer).toHaveBeenCalledWith(6603, "RENTED", "250788111222", "typed");
    expect(h.keepOtherHome).toHaveBeenCalled();
    expect(a).toMatchObject({ kind: "availability", answer: "RENTED" });
  });

  it("a question about the tenant is answered from what the tenant said, in the broker's language", async () => {
    read({ answer: "question", question: "how much is the budget", lang: "fr" });
    h.db.broker.findUnique.mockResolvedValue({ replyMinutes: null, preferredLanguage: "FR" });
    const a = await reply("Quel est son budget exactement ?");
    expect(a).toMatchObject({ kind: "reply", why: "about-me" });
    expect(h.created[0]!.body).toMatch(/jusqu'à 150k/);
    expect(h.created[0]!.body).toMatch(/disponible/);
  });

  it("a budget the tenant never said is not given out", async () => {
    h.db.agentTask.findUnique.mockResolvedValue({ messages: [{ role: "user", text: "2 bedroom in Remera", at: "x" }] });
    read({ answer: "question", question: "budget?" });
    await reply("What is the budget for this one please");
    expect(h.created[0]!.body).not.toMatch(/150k|up to/);
  });

  it("unclear on an open home gets one short question; a 'thanks' after an answer gets nothing", async () => {
    read({ answer: "unclear" });
    expect(await reply("ok let me see what I can do about it later")).toMatchObject({ kind: "reply", why: "clarify" });
    h.created.length = 0;
    h.db.brokerRequest.findMany.mockResolvedValue([{ listingId: 6603, status: "AVAILABLE", need: {}, taskId: "t1" }]);
    expect(await reply("ok thanks a lot, see you then friend")).toMatchObject({ kind: "none" });
    expect(h.created).toHaveLength(0);
  });

  it("learns the language a broker writes in", async () => {
    await reply("Yego irahari");
    expect(h.db.broker.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { preferredLanguage: "RW" } }));
  });
});
