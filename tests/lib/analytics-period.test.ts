import { describe, it, expect } from "vitest";

import {
  addDays,
  daysBetween,
  percentChange,
  previousPeriod,
  resolvePeriod,
  startOfUtcDay,
} from "@/lib/analytics/period";

const NOW = new Date("2026-08-14T13:45:00.000Z");
const iso = (d: Date) => d.toISOString();

describe("resolvePeriod", () => {
  it("defaults to 30 days", () => {
    const { period, rangeKey } = resolvePeriod({}, NOW);
    expect(rangeKey).toBe("30d");
    expect(period.days).toBe(30);
  });

  it("honours 7d and 90d", () => {
    expect(resolvePeriod({ range: "7d" }, NOW).period.days).toBe(7);
    expect(resolvePeriod({ range: "90d" }, NOW).period.days).toBe(90);
  });

  // The bug this pins: ending the window at "now" silently drops everything
  // that happens later today, so today's own views keep vanishing from
  // "last 7 days" while you watch.
  it("ends at the start of tomorrow so today is fully included", () => {
    const { period } = resolvePeriod({ range: "7d" }, NOW);
    expect(iso(period.to)).toBe("2026-08-15T00:00:00.000Z");
    expect(iso(period.from)).toBe("2026-08-08T00:00:00.000Z");
  });

  it("accepts a custom inclusive range and extends the end by a day", () => {
    const { period, rangeKey } = resolvePeriod(
      { range: "custom", from: "2026-08-01", to: "2026-08-07" },
      NOW,
    );
    expect(rangeKey).toBe("custom");
    expect(iso(period.from)).toBe("2026-08-01T00:00:00.000Z");
    // The user picked the 7th, so the 7th must be inside the window.
    expect(iso(period.to)).toBe("2026-08-08T00:00:00.000Z");
    expect(period.days).toBe(7);
  });

  it("falls back to the default rather than rendering an empty dashboard for a bad range", () => {
    for (const bad of [
      { range: "custom", from: "not-a-date", to: "2026-08-07" },
      { range: "custom", from: "2026-08-07", to: "2026-08-01" }, // reversed
      { range: "custom" },
    ]) {
      const { period, rangeKey } = resolvePeriod(bad, NOW);
      expect(rangeKey).toBe("30d");
      expect(period.days).toBe(30);
    }
  });
});

describe("previousPeriod", () => {
  it("is the equally-long window immediately before, with no overlap", () => {
    const { period } = resolvePeriod({ range: "7d" }, NOW);
    const prev = previousPeriod(period);

    expect(prev.days).toBe(7);
    expect(iso(prev.from)).toBe("2026-08-01T00:00:00.000Z");
    // Half-open ranges meet exactly: prev.to === period.from, so the boundary
    // day is counted once, not twice.
    expect(iso(prev.to)).toBe(iso(period.from));
  });
});

describe("percentChange", () => {
  it("computes growth and decline", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(100, 100)).toBe(0);
  });

  // "0% change" and "we had nothing to compare against" look identical on a
  // dashboard unless the second one is explicitly null. The second is the
  // normal state for a metric that just started being collected.
  it("returns null when there is no baseline", () => {
    expect(percentChange(42, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
  });
});

describe("date helpers", () => {
  it("startOfUtcDay strips the time", () => {
    expect(iso(startOfUtcDay(NOW))).toBe("2026-08-14T00:00:00.000Z");
  });

  it("addDays and daysBetween round-trip", () => {
    const from = startOfUtcDay(NOW);
    expect(daysBetween(from, addDays(from, 30))).toBe(30);
  });
});
