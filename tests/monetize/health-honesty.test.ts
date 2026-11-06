import { describe, expect, it } from "vitest";

import { blockHealth, jobStatus, START_STALE_MS } from "@/lib/monetize/health";

const now = Date.parse("2026-11-06T18:00:00Z");
const ok = { job: "a", status: "ok" as const, at: new Date(now - 3_600_000).toISOString() };

describe("the health light tells the truth (2026-11-06)", () => {
  it("a run started and never ended for 3 h is stale, not a quiet ok", () => {
    expect(jobStatus({ status: "start", at: new Date(now - START_STALE_MS - 60_000).toISOString() }, 24, now)).toBe("stale");
    expect(jobStatus({ status: "start", at: new Date(now - 20 * 60_000).toISOString() }, 24, now)).toBe("ok");
  });

  it("a block missing most of its targets is amber, not healthy", () => {
    expect(blockHealth({ jobs: [ok], lever: 5, leverPrev: 5, targets: { met: 1, known: 3 } })).toEqual({ health: "yellow", reason: "targetsMissed" });
    expect(blockHealth({ jobs: [ok], lever: 5, leverPrev: 5, targets: { met: 2, known: 3 } }).health).toBe("green");
    // Unknown targets are not misses.
    expect(blockHealth({ jobs: [ok], lever: 5, leverPrev: 5, targets: { met: 0, known: 0 } }).health).toBe("green");
  });

  it("a job that left no record is amber", () => {
    expect(blockHealth({ jobs: [ok, { job: "b", status: "missing", at: null }], lever: 5, leverPrev: 5 })).toEqual({ health: "yellow", reason: "jobMissing" });
  });

  it("red still wins", () => {
    expect(blockHealth({ jobs: [{ ...ok, status: "fail" }], lever: 5, leverPrev: 5, targets: { met: 0, known: 3 } }).health).toBe("red");
  });
});
