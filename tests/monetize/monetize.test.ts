import { describe, expect, it } from "vitest";

import { bottleneck, MIN_SAMPLE } from "@/lib/monetize/bottleneck";
import { fixedCostsRwf, DEFAULT_FIXED_RWF } from "@/lib/monetize/costs";
import { blockHealth, change, deltas, jobStatus, worst } from "@/lib/monetize/health";
import { money } from "@/lib/monetize/money";
import type { JobState } from "@/lib/monetize/types";
import { parseSweep } from "../../scripts/monetize/snapshot";

const NOW = Date.parse("2026-11-03T12:00:00Z");
const ok = (job = "a"): JobState => ({ job, status: "ok", at: "2026-11-03T11:00:00Z" });

describe("jobStatus — the runs.sh rule", () => {
  it("fail is fail, whatever its age", () => {
    expect(jobStatus({ status: "fail", at: "2026-11-03T11:00:00Z" }, 24, NOW)).toBe("fail");
  });
  it("older than twice the cadence is stale", () => {
    expect(jobStatus({ status: "ok", at: "2026-11-03T09:00:00Z" }, 1, NOW)).toBe("stale");
    expect(jobStatus({ status: "ok", at: "2026-11-03T10:30:00Z" }, 1, NOW)).toBe("ok");
  });
  it("no record is missing, not ok", () => {
    expect(jobStatus({}, 1, NOW)).toBe("missing");
    expect(jobStatus({ status: "ok", at: null }, 1, NOW)).toBe("missing");
  });
  it("defer reads as a warning", () => {
    expect(jobStatus({ status: "defer", at: "2026-11-03T11:30:00Z" }, 1, NOW)).toBe("warn");
  });
});

describe("blockHealth", () => {
  it("a blocker wins over everything", () => {
    expect(blockHealth({ jobs: [ok()], lever: 10, leverPrev: 5, blockers: ["capped"] })).toEqual({ health: "red", reason: "capped" });
  });
  it("a failed or stale job is red", () => {
    expect(blockHealth({ jobs: [ok(), { job: "b", status: "fail", at: null }], lever: 10, leverPrev: 10 }).health).toBe("red");
    expect(blockHealth({ jobs: [{ job: "b", status: "stale", at: null }], lever: 10, leverPrev: 10 }).reason).toBe("jobStale");
  });
  it("lever down more than 20% is yellow; 20% exactly is not", () => {
    expect(blockHealth({ jobs: [ok()], lever: 7, leverPrev: 10 }).health).toBe("yellow");
    expect(blockHealth({ jobs: [ok()], lever: 8, leverPrev: 10 }).health).toBe("green");
  });
  it("no evidence at all is unknown, never green", () => {
    expect(blockHealth({ jobs: [], lever: null, leverPrev: null }).health).toBe("unknown");
  });
  it("a zero lever is yellow", () => {
    expect(blockHealth({ jobs: [ok()], lever: 0, leverPrev: null }).reason).toBe("leverZero");
  });
  it("worst() picks the worst light", () => {
    expect(worst(["green", "yellow", "red"])).toBe("red");
    expect(worst(["green", "unknown"])).toBe("unknown");
  });
});

describe("change and deltas", () => {
  it("no baseline is null, not 0% or infinity", () => {
    expect(change(5, 0)).toBeNull();
    expect(change(5, null)).toBeNull();
    expect(change(15, 10)).toBeCloseTo(0.5);
  });
  it("deltas turns a cumulative counter into per-day growth, never negative", () => {
    expect(deltas([100, 110, 110, 125, 120])).toEqual([10, 0, 15, 0]);
    expect(deltas([5])).toEqual([]);
  });
});

describe("money", () => {
  const base = { dealEarnedRwf: 0, apiUsd: 0, tiktokUsd: 0, fixedRwf: 31_000, chats: 0, leads: 0, paidDeals: 0, monthElapsed: 0.5 };
  it("charges only the elapsed share of fixed costs", () => {
    const m = money({ ...base, received: {} });
    expect(m.fixedCostRwf).toBe(15_500);
    expect(m.revenueRwf).toBe(0);
    expect(m.netRwf).toBe(-15_500);
    expect(m.roi).toBe(0);
  });
  it("sums the four lines and computes ROI and unit costs", () => {
    const m = money({ ...base, received: { COMMISSION: 50_000, SUBSCRIPTION: 20_000 }, apiUsd: 1, chats: 10, paidDeals: 2 });
    expect(m.revenueRwf).toBe(70_000);
    expect(m.variableCostRwf).toBe(1450);
    expect(m.costRwf).toBe(16_950);
    expect(m.roi).toBeCloseTo(70_000 / 16_950);
    expect(m.costPerChatRwf).toBe(1695);
    expect(m.costPerDealRwf).toBe(8475);
    expect(m.costPerLeadRwf).toBeNull();
  });
  it("flags deal earnings not yet recorded as received", () => {
    const m = money({ ...base, received: { COMMISSION: 10_000 }, dealEarnedRwf: 40_000 });
    expect(m.unrecordedRwf).toBe(30_000);
  });
  it("break-even scales variable spend to a full month", () => {
    const m = money({ ...base, received: {}, apiUsd: 2 });
    expect(m.breakEvenRwf).toBe(31_000 + 2 * 1450 * 2);
  });
  it("negative entries cannot inflate or shrink revenue", () => {
    expect(money({ ...base, received: { LICENSE: -500 } }).revenueRwf).toBe(0);
  });
});

describe("bottleneck", () => {
  it("needs volume before it names a step", () => {
    expect(bottleneck([{ key: "chats", block: "chat", count: MIN_SAMPLE - 1 }, { key: "shortlisted", block: "chat", count: 0 }]).kind).toBe("insufficient");
  });
  it("names the hand-off furthest under its floor", () => {
    const b = bottleneck([
      { key: "chats", block: "chat", count: 100 },
      { key: "shortlisted", block: "chat", count: 90 }, // 0.9 vs 0.6
      { key: "asked", block: "chat", count: 0 }, // 0 vs 0.2
      { key: "available", block: "chat", count: 0 },
    ]);
    expect(b).toMatchObject({ kind: "step", from: "shortlisted", to: "asked", block: "chat", rate: 0 });
  });
});

describe("costs config", () => {
  it("falls back to defaults on bad JSON and drops negatives", () => {
    expect(fixedCostsRwf("not json")).toEqual(DEFAULT_FIXED_RWF);
    expect(fixedCostsRwf('{"sim":5000,"bad":-1,"x":"y"}')).toEqual({ sim: 5000 });
  });
});

describe("snapshot: parseSweep", () => {
  it("reads the sweep's own summary line", () => {
    expect(parseSweep("found 131 · fetched 19 · read 20 · 15 new home(s), 0 new broker(s), 0 new lead(s)")).toEqual({
      found: 131,
      fetched: 19,
      read: 20,
      newHomes: 15,
      newBrokers: 0,
      newLeads: 0,
    });
    expect(parseSweep(null).found).toBeUndefined();
  });
});
