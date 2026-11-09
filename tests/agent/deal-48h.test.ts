/** The 48-hour rule: the plan, who the sweep looks at, the nudge's words, "signed", and the second try. */
import { describe, expect, it } from "vitest";

import { asOn, plan48h, selectAsks, RULE_WINDOW_MS, NUDGE_AFTER_MS, type AskRow } from "@/components/agent/deal-48h-pure";
import { dealNudgeMessage } from "@/components/agent/deal-pure";
import { dueFollowUps, followUpTenantMessage, readTenantFollowUp, saysSigned } from "@/components/agent/intro-pure";

const H = 3_600_000;
const t0 = new Date("2026-11-09T08:00:00Z");
const at = (h: number) => new Date(t0.getTime() + h * H);
const base = { on: true, answeredAt: t0, now: at(2), sheetSent: false, nudged: false, tenantActed: false, inWindow: true };

describe("plan48h", () => {
  it("is off unless the switch says on", () => {
    expect(asOn({ mode: "on" })).toBe(true);
    expect(asOn({ mode: "off" })).toBe(false);
    expect(asOn(null)).toBe(false);
    expect(plan48h({ ...base, on: false })).toEqual({ do: "none", why: "off" });
  });
  it("sends the sheet first, even late, inside the 48 hours", () => {
    expect(plan48h(base)).toEqual({ do: "sheet" });
    expect(plan48h({ ...base, now: at(40) })).toEqual({ do: "sheet" });
  });
  it("nudges once, 24 h after the yes", () => {
    expect(plan48h({ ...base, now: at(23), sheetSent: true })).toEqual({ do: "none", why: "too-early" });
    expect(plan48h({ ...base, now: new Date(t0.getTime() + NUDGE_AFTER_MS), sheetSent: true })).toEqual({ do: "nudge" });
    expect(plan48h({ ...base, now: at(30), sheetSent: true, nudged: true })).toEqual({ do: "none", why: "done" });
  });
  it("lets go at 48 h, outside the send window, and once the tenant acted", () => {
    expect(plan48h({ ...base, now: new Date(t0.getTime() + RULE_WINDOW_MS) })).toEqual({ do: "none", why: "stale" });
    expect(plan48h({ ...base, inWindow: false })).toEqual({ do: "none", why: "window" });
    expect(plan48h({ ...base, tenantActed: true })).toEqual({ do: "none", why: "tenant-acted" });
    expect(plan48h({ ...base, answeredAt: at(5) })).toEqual({ do: "none", why: "too-early" });
  });
});

const row = (o: Partial<AskRow>): AskRow => ({ id: "a", listingId: 1, taskId: "t1", status: "AVAILABLE", respondedAt: at(0), ...o });
const now = at(5);

describe("the sweep's selection", () => {
  it("takes an answered ask", () => {
    expect(selectAsks([row({})], new Set(), now).map((c) => c.row.id)).toEqual(["a"]);
  });
  it("takes an ask handed on to a second broker and a tenant who joined another's ask", () => {
    const rows = [row({ id: "a" }), row({ id: "b", taskId: "t2", respondedAt: null }), row({ id: "c", taskId: "t3", respondedAt: at(1) })];
    const got = selectAsks(rows, new Set(), now);
    expect(got.map((c) => c.row.id).sort()).toEqual(["a", "b", "c"]);
    expect(got.find((c) => c.row.id === "b")!.answeredAt).toEqual(at(0));
  });
  it("skips a tenant whose broker still has a terms ask open", () => {
    expect(selectAsks([row({})], new Set(["t1:1"]), now)).toEqual([]);
    expect(selectAsks([row({})], new Set(["t1:2"]), now)).toHaveLength(1);
  });
  it("skips older, unanswered, non-available and chat-less asks; one per tenant and home", () => {
    expect(selectAsks([row({ respondedAt: new Date(t0.getTime() - 49 * H) })], new Set(), now)).toEqual([]);
    expect(selectAsks([row({ respondedAt: null })], new Set(), now)).toEqual([]);
    expect(selectAsks([row({ status: "PENDING" }), row({ id: "x", taskId: null })], new Set(), now)).toEqual([]);
    expect(selectAsks([row({ id: "a" }), row({ id: "b", respondedAt: at(1) })], new Set(), now)).toHaveLength(1);
  });
});

describe("dealNudgeMessage", () => {
  it("speaks en, ar and rw and names the home and the person", () => {
    for (const lang of ["en", "ar", "rw"] as const) {
      const m = dealNudgeMessage(lang, "2-bed in Kibagabaga", "Osman");
      expect(m).toContain("2-bed in Kibagabaga");
      expect(m).toContain("Osman");
    }
    expect(dealNudgeMessage("en", "x", "O")).toMatch(/still available/);
    expect(dealNudgeMessage("ar", "x", "O")).toMatch(/متاح/);
    expect(dealNudgeMessage("rw", "x", "O")).toMatch(/iracyahari/);
  });
});

describe("saysSigned", () => {
  it("reads a signing in English, Arabic and Kinyarwanda", () => {
    expect(saysSigned("We signed yesterday")).toBe(true);
    expect(saysSigned("وقّعنا العقد")).toBe(true);
    expect(saysSigned("Twasinye amasezerano")).toBe(true);
  });
  it("does not read a negation, a wait or a no", () => {
    expect(saysSigned("we did not sign")).toBe(false);
    expect(saysSigned("haven't signed yet")).toBe(false);
    expect(saysSigned("not for me")).toBe(false);
    expect(saysSigned("yes")).toBe(false);
    expect(saysSigned("لم أوقع")).toBe(false);
  });
});

describe("the tenant 48 h follow-up", () => {
  const intro = new Date("2026-11-01T08:00:00Z");
  const after = (h: number) => new Date(intro.getTime() + h * H);
  it("is asked once, only when the 24 h question went unanswered", () => {
    expect(dueFollowUps(intro, ["tenant-24h"], after(30))).toEqual([]);
    expect(dueFollowUps(intro, ["tenant-24h"], after(49))).toEqual(["tenant-48h"]);
    expect(dueFollowUps(intro, ["tenant-24h", "tenant-24h:answered"], after(49))).toEqual([]);
    expect(dueFollowUps(intro, ["tenant-24h", "tenant-48h"], after(60))).toEqual([]);
  });
  it("has its words in en, ar and rw", () => {
    for (const lang of ["en", "ar", "rw"] as const) expect(followUpTenantMessage(lang, "tenant-48h", "K5808")).toContain("K5808");
  });
  it("reads the answers like the 24 h one", () => {
    expect(readTenantFollowUp("1", "tenant-48h")).toBe("viewed");
    expect(readTenantFollowUp("not yet", "tenant-48h")).toBe("wait");
    expect(readTenantFollowUp("3", "tenant-48h")).toBe("lost");
    expect(readTenantFollowUp("we signed", "tenant-48h")).toBe("signed");
    expect(readTenantFollowUp("hello", "tenant-48h")).toBeNull();
  });
});
