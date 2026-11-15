import { describe, expect, it } from "vitest";
import { ALERT_EVERY_MS, BACKLOG_MS, MAX_TRIES, afterFailure, backlogAlertDue, callBudget, coalesces, isEcho, mergePayload, pushedFieldsOf } from "@/lib/crm/crm-ops-pure";
import { isTransientTwenty } from "@/lib/crm/transient";
import { isTransientTwenty as fromScripts } from "../../scripts/crm/twenty-rest";

const NOW = Date.parse("2026-11-15T10:00:00Z");

describe("coalescing", () => {
  it("upserts merge, notes never do", () => {
    expect(coalesces("tenant")).toBe(true);
    expect(coalesces("deal")).toBe(true);
    expect(coalesces("task")).toBe(true);
    expect(coalesces("note")).toBe(false);
    expect(coalesces("broker")).toBe(false);
  });
  it("the newer payload wins and the older one's other fields stay", () => {
    expect(mergePayload({ stage: "PICKED", meetingPoint: "Kimironko" }, { stage: "BROKER_YES", rentRwf: 400000 })).toEqual({ stage: "BROKER_YES", meetingPoint: "Kimironko", rentRwf: 400000 });
  });
});

describe("echo suppression", () => {
  const link = { pushedFields: ["stage", "stageChangedAt", "tenantId"], pushedAt: new Date(NOW - 30_000) };
  it("is ours when every field was pushed within 2 minutes", () => {
    expect(isEcho(["stage"], link, NOW)).toBe(true);
    expect(isEcho(["stage", "stageChangedAt", "updatedAt"], link, NOW)).toBe(true);
    expect(isEcho(["tenantId"], link, NOW)).toBe(true);
  });
  it("is a person's edit when any field is not ours", () => {
    expect(isEcho(["stage", "terms"], link, NOW)).toBe(false);
    expect(isEcho(["mkanShareRwf"], link, NOW)).toBe(false);
  });
  it("is a person's edit once the window has passed or there is no link", () => {
    expect(isEcho(["stage"], { ...link, pushedAt: new Date(NOW - 3 * 60_000) }, NOW)).toBe(false);
    expect(isEcho(["stage"], null, NOW)).toBe(false);
    expect(isEcho(["stage"], { pushedFields: ["stage"], pushedAt: null }, NOW)).toBe(false);
    expect(isEcho([], link, NOW)).toBe(false);
  });
  it("pushedFields leaves out the $ references and adds the resolved relations", () => {
    expect(pushedFieldsOf({ stage: "PICKED", $tenant: "p1", $home: 5811 }, ["tenantId"])).toEqual(["stage", "tenantId"]);
  });
});

describe("call budget and retries", () => {
  it("40 a minute, shared across passes inside the same minute", () => {
    expect(callBudget(null, NOW)).toBe(40);
    expect(callBudget({ at: new Date(NOW - 20_000).toISOString(), used: 31 }, NOW)).toBe(9);
    expect(callBudget({ at: new Date(NOW - 20_000).toISOString(), used: 60 }, NOW)).toBe(0);
    expect(callBudget({ at: new Date(NOW - 61_000).toISOString(), used: 40 }, NOW)).toBe(40);
  });
  it("a transient failure stays queued until the 8th try", () => {
    expect(afterFailure(0, true)).toEqual({ status: "QUEUED", tries: 1 });
    expect(afterFailure(MAX_TRIES - 1, true)).toEqual({ status: "FAILED", tries: MAX_TRIES });
  });
  it("a real error fails at once", () => {
    expect(afterFailure(0, false)).toEqual({ status: "FAILED", tries: 1 });
  });
  it("one copy of isTransientTwenty serves the Worker and the scripts", () => {
    expect(fromScripts).toBe(isTransientTwenty);
    expect(isTransientTwenty(null, "")).toBe(true);
    expect(isTransientTwenty(503, "")).toBe(true);
    expect(isTransientTwenty(400, "QUERY_READ_TIMEOUT")).toBe(true);
    expect(isTransientTwenty(400, "bad field")).toBe(false);
  });
});

describe("backlog alert", () => {
  it("fires after 30 minutes, once per 6 hours", () => {
    const old = new Date(NOW - BACKLOG_MS - 1);
    expect(backlogAlertDue(old, null, NOW)).toBe(true);
    expect(backlogAlertDue(new Date(NOW - 10 * 60_000), null, NOW)).toBe(false);
    expect(backlogAlertDue(old, new Date(NOW - 3_600_000), NOW)).toBe(false);
    expect(backlogAlertDue(old, new Date(NOW - ALERT_EVERY_MS), NOW)).toBe(true);
    expect(backlogAlertDue(null, null, NOW)).toBe(false);
  });
});
