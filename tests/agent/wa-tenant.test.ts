import { describe, expect, it } from "vitest";
import { HUMAN_HOLD_MS, isDirectChat, MAX_AGE_MS, PER_PHONE_PER_HOUR, tenantDecision } from "../../scripts/wa/tenant-pure";

const now = new Date("2026-10-24T10:00:00Z");
const base = { text: "2 bedroom in Kicukiro", sentAt: now, now, stopped: false, humanAt: null, phoneRepliesLastHour: 0, lineRepliesLastHour: 0 };

describe("tenantDecision", () => {
  it("answers a fresh message from a tenant", () => {
    expect(tenantDecision(base)).toBe("answer");
  });
  it("honours STOP and START", () => {
    expect(tenantDecision({ ...base, text: "STOP" })).toBe("stop");
    expect(tenantDecision({ ...base, text: "hagarika" })).toBe("stop");
    expect(tenantDecision({ ...base, stopped: true })).toBe("skip-stopped");
    expect(tenantDecision({ ...base, text: "start", stopped: true })).toBe("start");
  });
  it("stays quiet while a person handles the chat, on old messages and over the ceiling", () => {
    expect(tenantDecision({ ...base, humanAt: new Date(now.getTime() - HUMAN_HOLD_MS + 60_000) })).toBe("skip-human");
    expect(tenantDecision({ ...base, humanAt: new Date(now.getTime() - HUMAN_HOLD_MS - 60_000) })).toBe("answer");
    expect(tenantDecision({ ...base, sentAt: new Date(now.getTime() - MAX_AGE_MS - 1) })).toBe("skip-old");
    expect(tenantDecision({ ...base, phoneRepliesLastHour: PER_PHONE_PER_HOUR })).toBe("skip-rate");
    expect(tenantDecision({ ...base, text: "  " })).toBe("skip-empty");
  });
  it("only one-to-one chats are tenants", () => {
    expect(isDirectChat("250780000001@s.whatsapp.net")).toBe(true);
    expect(isDirectChat("1203630@g.us")).toBe(false);
    expect(isDirectChat("status@broadcast")).toBe(false);
  });
});
