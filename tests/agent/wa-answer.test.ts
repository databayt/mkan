/**
 * answerTenant's guardrails end to end, with the line and the agent mocked (2026-11-08): a tenant's STOP
 * gets one reply and a #mkan card, a complaint about the homes reaches the agent, START welcomes them back
 * without a turn on the bare word, and Abdout's own contacts never get a line from the bot.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendText = vi.fn<(to: string, text: string) => Promise<{ key: { id: string } }>>(async () => ({ key: { id: "out-1" } }));
vi.mock("@/lib/whatsapp/evolution", () => ({ sendText: (to: string, text: string) => sendText(to, text), sendPresence: vi.fn(async () => {}) }));
vi.mock("@/lib/db", () => ({ db: { agentTask: { findFirst: vi.fn(async () => ({ locale: "en" })) } } }));
const personal = vi.fn<(phone: string) => Promise<boolean>>(async () => false);
vi.mock("@/components/agent/personal", () => ({ isPersonal: (p: string) => personal(p) }));
const post = vi.fn<(text: string) => Promise<void>>(async () => {});
vi.mock("@/components/agent/whatsapp", () => ({ postSlackCard: (t: string) => post(t) }));
const handle = vi.fn();
const silence = vi.fn(async () => {});
vi.mock("@/components/agent/whatsapp-chat", () => ({ handleTenantWhatsApp: (a: unknown) => handle(a), silenceTenant: () => silence() }));

let stopped: string[] = [];
const state = {
  claimMessage: vi.fn(async () => ({ mode: "fresh" as const, tries: 1 })),
  holdReply: vi.fn(async () => {}),
  settleMessage: vi.fn(async () => {}),
  releaseMessage: vi.fn(async () => {}),
  addToList: vi.fn(async (_k: string, v: string) => void stopped.push(v)),
  removeFromList: vi.fn(async (_k: string, v: string) => void (stopped = stopped.filter((p) => p !== v))),
  readState: vi.fn(async (key: string, fallback: unknown) => (key === "tenant-stop" ? stopped : fallback)),
  writeState: vi.fn(async () => {}),
  mutateState: vi.fn(async () => {}),
};
vi.mock("@/components/agent/wa-state", () => ({ ...state, MAX_ANSWER_TRIES: 3, CLAIM_STALE_MS: 120_000 }));
const kick = vi.fn();
vi.mock("@/components/agent/wa-outbox", () => ({ kickOutbox: (reason: string, ms: number) => kick(reason, ms) }));

const { answerTenant } = await import("@/components/agent/wa-tenant");

let n = 0;
const msg = (phone: string, text: string, o: Record<string, unknown> = {}) => ({ phone, text, msgId: `m-${++n}`, sentAt: new Date(), ...o });

beforeEach(() => {
  stopped = [];
  for (const f of [sendText, personal, post, handle, silence, kick, ...Object.values(state)]) f.mockClear();
  personal.mockResolvedValue(false);
  handle.mockResolvedValue({ reply: "Here are homes", taskId: "t1" });
  state.claimMessage.mockResolvedValue({ mode: "fresh", tries: 1 });
});

describe("a message another run holds, or whose turn is still writing (2026-11-08)", () => {
  it("a held claim is left alone — no answer, no settle — and a pass is scheduled", async () => {
    state.claimMessage.mockResolvedValueOnce({ mode: "held" } as never);
    expect(await answerTenant(msg("250720000017", "2 bedroom in Remera"))).toBe("held");
    expect(handle).not.toHaveBeenCalled();
    expect(state.settleMessage).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(kick).toHaveBeenCalledWith("held", 135_000));
  });
  it("a turn still writing keeps its claim: never released, never settled", async () => {
    handle.mockResolvedValueOnce({ reply: null, why: "held" });
    expect(await answerTenant(msg("250720000018", "2 bedroom in Remera"))).toBe("held");
    expect(state.releaseMessage).not.toHaveBeenCalled();
    expect(state.settleMessage).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });
});

describe("a message the line reached late", () => {
  it("is answered with an apology first", async () => {
    expect(await answerTenant(msg("250720000019", "2 bedroom in Remera", { sentAt: new Date(Date.now() - 40 * 60_000) }))).toBe("sent");
    expect(sendText.mock.calls[0]![1]).toBe("Sorry for the slow reply.\n\nHere are homes");
  });
  it("past 12 hours goes to a person, not the bot", async () => {
    expect(await answerTenant(msg("250720000010", "2 bedroom in Remera", { sentAt: new Date(Date.now() - 13 * 3_600_000) }))).toBe("skip-old");
    expect(handle).not.toHaveBeenCalled();
    expect(post.mock.calls[0]![0]).toMatch(/answer by hand/);
  });
});

describe("a tenant's STOP", () => {
  it("is recorded, answered once with how to come back, and posted to #mkan", async () => {
    expect(await answerTenant(msg("250720000011", "STOP"))).toBe("stop");
    expect(state.addToList).toHaveBeenCalledWith("tenant-stop", "250720000011");
    expect(silence).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0]![1]).toContain("START");
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]![0]).toContain("STOP");
    expect(handle).not.toHaveBeenCalled();
    expect(state.settleMessage).toHaveBeenCalled();
  });

  it("a complaint about the homes reaches the agent and stops nothing", async () => {
    expect(await answerTenant(msg("250720000012", "Stop sending me Kicukiro"))).toBe("sent");
    expect(handle).toHaveBeenCalledTimes(1);
    expect(state.addToList).not.toHaveBeenCalled();
    expect(sendText.mock.calls[0]![1]).toBe("Here are homes");
  });
});

describe("START after a STOP", () => {
  it("welcomes the tenant back with what to send, and runs no turn on the bare word", async () => {
    stopped = ["250720000013"];
    expect(await answerTenant(msg("250720000013", "START"))).toBe("sent");
    expect(state.removeFromList).toHaveBeenCalledWith("tenant-stop", "250720000013");
    expect(sendText.mock.calls[0]![1]).toMatch(/Welcome back/);
    expect(handle).not.toHaveBeenCalled();
  });
});

describe("Abdout's own contacts", () => {
  it("get no 'please type' for a voice note", async () => {
    personal.mockResolvedValue(true);
    expect(await answerTenant(msg("250720000014", "", { media: true }))).toBe("nothing");
    expect(sendText).not.toHaveBeenCalled();
  });
  it("a STOP is kept quietly: no reply, no card", async () => {
    personal.mockResolvedValue(true);
    expect(await answerTenant(msg("250720000015", "stop"))).toBe("stop");
    expect(state.addToList).toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
  it("a tenant who is not one still gets 'please type'", async () => {
    expect(await answerTenant(msg("250720000016", "", { media: true }))).toBe("sent");
    expect(sendText.mock.calls[0]![1]).toMatch(/type/i);
  });
});
