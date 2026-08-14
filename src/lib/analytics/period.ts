/**
 * Reporting periods for the marketplace dashboard.
 *
 * Pure date arithmetic, no DB and no React, so the range logic and the
 * period-over-period comparison can be tested directly.
 *
 * Every period is [from, to) — half-open. Closed ranges double-count the
 * boundary day when you place two periods back to back, which is exactly what
 * the previous-period comparison does.
 */

export const RANGE_KEYS = ["7d", "30d", "90d", "custom"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export interface Period {
  from: Date;
  to: Date;
  /** Whole days covered. Drives the previous-period window. */
  days: number;
}

const DAY_MS = 86_400_000;

/** Midnight UTC on the day containing `d`. */
export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS));
}

/**
 * Resolves the period from URL params.
 *
 * `to` is the start of TOMORROW, not now: a half-open range ending at the
 * current instant would silently exclude everything that happened later today,
 * so today's own views would keep disappearing from "last 7 days" as you looked
 * at them.
 */
export function resolvePeriod(
  input: { range?: string; from?: string; to?: string },
  now: Date = new Date(),
): { period: Period; rangeKey: RangeKey } {
  const today = startOfUtcDay(now);
  const tomorrow = addDays(today, 1);

  if (input.range === "custom" || (input.from && input.to)) {
    const from = parseDate(input.from);
    const to = parseDate(input.to);
    if (from && to && from < to) {
      // Custom ranges arrive as inclusive dates from a date picker; extend the
      // end by a day so the last day the user selected is actually included.
      const end = addDays(startOfUtcDay(to), 1);
      const start = startOfUtcDay(from);
      return { period: { from: start, to: end, days: daysBetween(start, end) }, rangeKey: "custom" };
    }
    // Fall through to the default when the custom range is unusable, rather
    // than rendering an empty dashboard for a typo in a query string.
  }

  const days = input.range === "7d" ? 7 : input.range === "90d" ? 90 : 30;
  const from = addDays(tomorrow, -days);
  return { period: { from, to: tomorrow, days }, rangeKey: days === 7 ? "7d" : days === 90 ? "90d" : "30d" };
}

/** The equally-long window immediately before `period`, for change-vs-previous. */
export function previousPeriod(period: Period): Period {
  const from = addDays(period.from, -period.days);
  return { from, to: period.from, days: period.days };
}

function parseDate(v: string | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Percentage change, or null when there is no baseline.
 *
 * Returning null rather than 0 or Infinity matters: "0% change" and "we had
 * nothing to compare against" look identical on a dashboard otherwise, and the
 * second is the normal state for a metric that just started being collected.
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
