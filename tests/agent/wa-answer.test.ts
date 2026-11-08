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
vi.mock("@/components/agent/wa-state", () => ({ ...state, MAX_ANSWER_TRIES: 3 }));

const { answerTenant } = await import("@/components/agent/wa-tenant");

let n = 0;
const msg = (phone: string, text: string, o: Record<string, unknown> = {}) => ({ phone, text, msgId: `m-${++n}`, sentAt: new Date(), ...o });

beforeEach(() => {
  stopped = [];
  for (const f of [sendText, personal, post, handle, silence, ...Object.values(state)]) f.mockClear();
  personal.mockResolvedValue(false);
  handle.mockResolvedValue({ reply: "Here are homes", taskId: "t1" });
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
