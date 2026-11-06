import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { chatSig, verifyChatSig } from "@/components/agent/chat-link";

describe("signed chat links (a WhatsApp chat opens in any browser, read-only)", () => {
  const saved = process.env.MKAN_WA_BRIDGE_SECRET;
  beforeAll(() => {
    process.env.MKAN_WA_BRIDGE_SECRET = "test-bridge-secret";
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.MKAN_WA_BRIDGE_SECRET;
    else process.env.MKAN_WA_BRIDGE_SECRET = saved;
  });

  it("verifies its own signature, and only for that chat", () => {
    const s = chatSig("cmtask1")!;
    expect(s).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(verifyChatSig("cmtask1", s)).toBe(true);
    expect(verifyChatSig("cmtask2", s)).toBe(false);
    expect(verifyChatSig("cmtask1", s.slice(0, -1) + (s.endsWith("A") ? "B" : "A"))).toBe(false);
    expect(verifyChatSig("cmtask1", null)).toBe(false);
  });

  it("signs nothing without the secret (the old, unsigned link)", () => {
    delete process.env.MKAN_WA_BRIDGE_SECRET;
    expect(chatSig("cmtask1")).toBeNull();
    expect(verifyChatSig("cmtask1", "anything")).toBe(false);
    process.env.MKAN_WA_BRIDGE_SECRET = "test-bridge-secret";
  });
});
