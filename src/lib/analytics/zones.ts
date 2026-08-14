/**
 * Zone density classification — "where do we have enough homes, and where
 * should we go get more?".
 *
 * Pure functions, no DB and no React, so the quadrant rules and the ranking
 * can be tested directly and changed without touching a query.
 *
 * The problem this answers is specific to a marketplace: supply and demand are
 * BOTH things the operator can move, and they cost different things to move.
 * Acquiring homes is expensive field work; generating demand is marketing. So
 * "we're short on homes in a place people already want" and "we have homes
 * nobody's looking at" are opposite instructions, and a single per-zone score
 * would blur them. The four quadrants keep them apart.
 */

export interface ZoneMetrics {
  key: string;
  listings: number;
  /** Distinct visitor-days on this zone's listings in the period. */
  views: number;
  inquiries: number;
  rentals: number;
}

export interface ZoneStats extends ZoneMetrics {
  viewsPerListing: number | null;
  inquiriesPerListing: number | null;
  /** % of viewers who made contact. */
  viewToInquiry: number | null;
  quadrant: Quadrant;
  /** Higher = acquire here sooner. Only meaningful for HIGH_DEMAND_LOW_SUPPLY. */
  acquisitionScore: number;
}

export type Quadrant =
  | "high-demand-low-supply" // → acquire
  | "high-demand-healthy-supply" // → hold supply, push conversion
  | "low-demand-high-supply" // → do not acquire
  | "low-demand-low-supply" // → monitor
  | "insufficient-data";

/**
 * Every knob the classification turns, in one place and exported so the UI can
 * show its own working.
 *
 * STARTING POINTS for a pre-launch Sudanese market, not measured constants —
 * mkan has no demand baseline of its own yet. The two demand thresholds are
 * relative to the median across zones rather than absolute, so the split keeps
 * meaning as total traffic grows; only the supply floor is absolute, because
 * "enough homes to be worth a visitor's time" is a property of the zone, not of
 * the current traffic.
 */
export const ZONE_THRESHOLDS = {
  /** A zone below this has too few homes to satisfy demand — a supply gap. */
  healthySupply: 15,
  /**
   * A zone is "high demand" when its views-per-listing is at least this
   * multiple of the median zone. 1.0 = at or above the typical zone.
   */
  highDemandVsMedian: 1.0,
  /** Below this many total views a zone's demand signal is noise, not a reading. */
  minViewsToClassify: 20,
} as const;

function ratio(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

/** Median of the finite values, or null when there are none. */
function median(values: number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 0 ? ((xs[mid - 1]! + xs[mid]!) / 2) : xs[mid]!;
}

/**
 * Classifies every zone against the shared demand yardstick.
 *
 * Demand is judged per-listing, not in absolute views: a zone with 4 homes and
 * 40 views is in higher demand than one with 60 homes and 120 views, even
 * though the second has more total traffic. That per-listing view is exactly
 * what tells acquisition where an extra home would be seen.
 */
export function classifyZones(
  zones: ZoneMetrics[],
  t = ZONE_THRESHOLDS,
): { stats: ZoneStats[]; medianViewsPerListing: number | null } {
  const withRates = zones.map((z) => ({
    ...z,
    viewsPerListing: ratio(z.views, z.listings),
    inquiriesPerListing: ratio(z.inquiries, z.listings),
    viewToInquiry: z.views > 0 ? (z.inquiries / z.views) * 100 : null,
  }));

  // The yardstick is the median across zones that have enough views to read.
  const readable = withRates.filter((z) => z.views >= t.minViewsToClassify);
  const med = median(
    readable.map((z) => z.viewsPerListing).filter((v): v is number => v !== null),
  );

  const stats: ZoneStats[] = withRates.map((z) => {
    const enoughSignal = z.views >= t.minViewsToClassify;

    // With no median (nobody has traffic yet) demand is unknowable, so every
    // zone is reported as insufficient-data rather than mislabelled low-demand.
    const highDemand =
      enoughSignal && med !== null && z.viewsPerListing !== null
        ? z.viewsPerListing >= med * t.highDemandVsMedian
        : null;

    const healthySupply = z.listings >= t.healthySupply;

    const quadrant: Quadrant =
      highDemand === null
        ? "insufficient-data"
        : highDemand && !healthySupply
          ? "high-demand-low-supply"
          : highDemand && healthySupply
            ? "high-demand-healthy-supply"
            : !highDemand && healthySupply
              ? "low-demand-high-supply"
              : "low-demand-low-supply";

    // Rank acquisition targets by how much unmet demand an extra home would
    // meet: demand intensity × the size of the shortfall. Zero outside the
    // acquire quadrant so the "acquire next" list can't be polluted by a
    // healthy or low-demand zone that happens to score highly on one factor.
    const shortfall = Math.max(0, t.healthySupply - z.listings);
    const acquisitionScore =
      quadrant === "high-demand-low-supply" && z.viewsPerListing !== null
        ? z.viewsPerListing * shortfall
        : 0;

    return { ...z, quadrant, acquisitionScore };
  });

  return { stats, medianViewsPerListing: med };
}

/**
 * The "acquire more homes here this week" list.
 *
 * Only high-demand/low-supply zones are eligible — the other quadrants are not
 * acquisition problems, so surfacing them here would send the field team to the
 * wrong place. Ordered by acquisition score, capped at `limit`.
 */
export function acquisitionTargets(stats: ZoneStats[], limit = 5): ZoneStats[] {
  return stats
    .filter((z) => z.quadrant === "high-demand-low-supply" && z.acquisitionScore > 0)
    .sort((a, b) => b.acquisitionScore - a.acquisitionScore)
    .slice(0, limit);
}
