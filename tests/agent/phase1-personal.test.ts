/**
 * Phase 1, item 7 — the line still carries Abdout's personal chats (chat-funnel.md, evidence 9: personal
 * contacts and vendors reached the bot, …100, …612, …638). The agent stays out of a chat a person already
 * lived in, and out of Mkan's own person's messages.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HUMAN_HOLD_MS, humanChatBeforeBot, tenantDecision } from "../../scripts/wa/tenant-pure";

const upsert = vi.fn().mockResolvedValue({});
const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({ db: { waState: { upsert: (...a: unknown[]) => upsert(...a), findUnique: (...a: unknown[]) => findUnique(...a) } } }));
vi.mock("server-only", () => ({}));

const now = new Date("2026-11-21T10:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const DAY = 86_400_000;
const base = { text: "Hello, do you sell furniture?", sentAt: ago(60_000), now, stopped: false, humanAt: null, phoneRepliesLastHour: 0, lineRepliesLastHour: 0 };

describe("a chat a person lived in before the agent", () => {
  it("is personal: a person talked there long ago, the agent never did", () => {
    expect(humanChatBeforeBot({ humanAt: ago(3 * DAY), now, botSentToPhone: false, hasAgentChat: false })).toBe(true);
    expect(humanChatBeforeBot({ humanAt: ago(HUMAN_HOLD_MS), now, botSentToPhone: false, hasAgentChat: false })).toBe(true);
  });
  it("is not, when the agent has ever spoken there or opened a chat for the number", () => {
    expect(humanChatBeforeBot({ humanAt: ago(3 * DAY), now, botSentToPhone: true, hasAgentChat: false })).toBe(false);
    expect(humanChatBeforeBot({ humanAt: ago(3 * DAY), now, botSentToPhone: false, hasAgentChat: true })).toBe(false);
  });
  it("is not a brand-new tenant a person answered by hand just now: that chat stays the agent's afterwards", () => {
    expect(humanChatBeforeBot({ humanAt: ago(60 * 60_000), now, botSentToPhone: false, hasAgentChat: false })).toBe(false);
    expect(humanChatBeforeBot({ humanAt: null, now, botSentToPhone: false, hasAgentChat: false })).toBe(false);
  });
  it("gets no reply — and still no 'please type' or any other line", () => {
    expect(tenantDecision({ ...base, personalChat: true })).toBe("skip-personal");
    expect(tenantDecision({ ...base, text: "", media: true, personalChat: true })).toBe("skip-personal");
  });
  it("STOP and START are still heard in such a chat", () => {
    expect(tenantDecision({ ...base, text: "stop", personalChat: true })).toBe("stop");
    expect(tenantDecision({ ...base, text: "start", stopped: true, personalChat: true })).toBe("start");
  });
  it("a normal tenant is answered", () => {
    expect(tenantDecision({ ...base, text: "2 bedroom in Remera" })).toBe("answer");
  });
});

describe("the list", () => {
  beforeEach(() => {
    upsert.mockClear();
    findUnique.mockReset();
  });
  it("a number marked personal by itself is the same row `pnpm wa:personal add` writes, never overwritten", async () => {
    const { markPersonal, personalKey, isPersonal } = await import("@/components/agent/personal");
    await markPersonal("250788123456", "a person talked in this chat before the agent did");
    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0]![0] as { where: { key: string }; create: { key: string; value: { auto: boolean } }; update: object };
    expect(arg.where.key).toBe(personalKey("250788123456"));
    expect(arg.where.key).toBe("personal:250788123456");
    expect(arg.create.value.auto).toBe(true);
    expect(arg.update).toEqual({});
    findUnique.mockResolvedValueOnce({ key: "personal:250788123456" });
    expect(await isPersonal("250788123456")).toBe(true);
    findUnique.mockResolvedValueOnce(null);
    expect(await isPersonal("250788999999")).toBe(false);
  });
  it("an empty address is never marked", async () => {
    const { markPersonal } = await import("@/components/agent/personal");
    await markPersonal("", "x");
    expect(upsert).not.toHaveBeenCalled();
  });
});
