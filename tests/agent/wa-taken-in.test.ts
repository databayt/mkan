/**
 * Where a WhatsApp message stands in its chat, and what a retry does with it (2026-11-08): a turn a
 * restart killed is run again, a reply written but never sent is sent, a turn still writing keeps its
 * claim, and the chat's previous reply never stands in for this message's.
 */
import { describe, expect, it } from "vitest";
import { retryPlan, takenIn } from "@/components/agent/whatsapp-format";
import type { AgentMessage } from "@/components/agent/types";

const user = (wa: string, text = "2 bedroom in Kicukiro"): AgentMessage => ({ role: "user", text, at: "", wa });
const reply = (kind: "shortlist" | "error" | "clarify" = "shortlist") => ({ role: "agent", kind, at: "" }) as unknown as AgentMessage;

const STUCK = 90_000;
const NOW = Date.UTC(2026, 10, 8, 10, 0);
const running = (agoMs: number) => ({ status: "RUNNING", updatedAt: new Date(NOW - agoMs) });
const done = { status: "DONE", updatedAt: new Date(NOW - 5_000) };

describe("takenIn", () => {
  it("is not in a chat that never took it in", () => {
    expect(takenIn([user("a"), reply()], "z")).toBe("not-in");
  });
  it("only replies AFTER the message count — the previous turn's homes are not this one's", () => {
    expect(takenIn([user("a"), reply(), user("b")], "b")).toBe("unanswered");
    expect(takenIn([user("a"), reply(), user("b"), reply("clarify")], "b")).toBe("replied");
  });
  it("a reply that is only the error, and a message the tenant already wrote past", () => {
    expect(takenIn([user("a"), reply("error")], "a")).toBe("errored");
    expect(takenIn([user("a"), user("b"), reply()], "a")).toBe("superseded");
  });
});

describe("retryPlan", () => {
  it("a turn still writing keeps its claim; one a restart killed runs again", () => {
    expect(retryPlan("unanswered", running(30_000), true, NOW, STUCK)).toBe("held");
    expect(retryPlan("unanswered", running(5 * 60_000), true, NOW, STUCK)).toBe("rerun");
    expect(retryPlan("unanswered", done, false, NOW, STUCK)).toBe("rerun");
  });
  it("a reply the chat holds is sent on a retry, and is a duplicate otherwise", () => {
    expect(retryPlan("replied", done, true, NOW, STUCK)).toBe("resend");
    expect(retryPlan("replied", done, false, NOW, STUCK)).toBe("duplicate");
  });
  it("an error nobody sent is replaced by a real answer on a retry", () => {
    expect(retryPlan("errored", { status: "FAILED", updatedAt: new Date(NOW) }, true, NOW, STUCK)).toBe("rerun");
    expect(retryPlan("errored", done, false, NOW, STUCK)).toBe("duplicate");
  });
  it("a message the tenant wrote past, or one not in the chat, is answered already", () => {
    expect(retryPlan("superseded", done, true, NOW, STUCK)).toBe("duplicate");
    expect(retryPlan("not-in", done, true, NOW, STUCK)).toBe("duplicate");
  });
});
