/**
 * Turns funnel counts into a single answer to "what is holding the marketplace
 * back this week?".
 *
 * Pure functions — no DB, no React — so the rules can be tested directly and
 * changed without touching a query.
 *
 * The point of a marketplace dashboard is not to show numbers, it is to say
 * where to spend Monday. A stack of KPI cards leaves that inference to the
 * reader; this makes it explicit and deterministic (no model, no judgement).
 */

export interface FunnelCounts {
  /** Published, non-draft listings at the end of the period. */
  listings: number;
  /** Distinct visitor-days on listing pages — the refresh-proof "views". */
  views: number;
  inquiries: number;
  visits: number;
  rentals: number;
}

export interface FunnelRates {
  viewsPerListing: number | null;
  inquiriesPerListing: number | null;
  viewToInquiry: number | null;
  inquiryToVisit: number | null;
  visitToRental: number | null;
  inquiryToRental: number | null;
}

/**
 * Every threshold the diagnosis depends on, in one place and exported so the
 * UI can show its own working. These are STARTING POINTS for a pre-launch
 * Sudanese market, not measured industry constants — mkan has no baseline of
 * its own yet. Revisit once there is a quarter of real traffic; until then a
 * documented guess that is visible beats a hidden one.
 */
export const FUNNEL_THRESHOLDS = {
  /** Below this the catalogue is too thin for demand work to pay off. */
  minListings: 50,
  /** Views per listing per period. Below this, people aren't finding mkan. */
  minViewsPerListing: 5,
  /** % of viewers who make contact. Below this the listing isn't convincing. */
  minViewToInquiryPct: 2,
  /** % of inquiries that become an arranged viewing. Below this, leads rot. */
  minInquiryToVisitPct: 30,
  /** % of viewings that become a rental. Below this, reality disappoints. */
  minVisitToRentalPct: 20,

  // Sample-size floors. A 0% conversion on 3 views is not a finding, and a
  // dashboard that calls it one trains people to ignore the dashboard.
  minSampleViews: 100,
  minSampleInquiries: 10,
  minSampleVisits: 5,
} as const;

export type BottleneckStage =
  | "insufficient-data"
  | "supply"
  | "demand"
  | "listing-quality"
  | "response"
  | "closing"
  | "healthy";

export interface Diagnosis {
  stage: BottleneckStage;
  /** The metric that triggered it, for showing the working in the UI. */
  observed: number | null;
  threshold: number | null;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function pct(numerator: number, denominator: number): number | null {
  const r = ratio(numerator, denominator);
  return r === null ? null : r * 100;
}

export function computeRates(c: FunnelCounts): FunnelRates {
  return {
    viewsPerListing: ratio(c.views, c.listings),
    inquiriesPerListing: ratio(c.inquiries, c.listings),
    viewToInquiry: pct(c.inquiries, c.views),
    inquiryToVisit: pct(c.visits, c.inquiries),
    visitToRental: pct(c.rentals, c.visits),
    inquiryToRental: pct(c.rentals, c.inquiries),
  };
}

/**
 * Walks the funnel from the top and stops at the first stage that is starving
 * the one below it.
 *
 * Order is the whole point: a low view→inquiry rate on a catalogue of 12 homes
 * is not a listing-quality problem, it is a supply problem wearing a disguise,
 * and fixing photos would waste the week. Each stage is only judged once the
 * stage above it has cleared both its threshold and its sample floor.
 */
export function diagnose(c: FunnelCounts, t = FUNNEL_THRESHOLDS): Diagnosis {
  // Supply first — it gates everything downstream.
  if (c.listings < t.minListings) {
    return { stage: "supply", observed: c.listings, threshold: t.minListings };
  }

  const rates = computeRates(c);

  // Demand: are people arriving at all?
  if (rates.viewsPerListing !== null && rates.viewsPerListing < t.minViewsPerListing) {
    return { stage: "demand", observed: rates.viewsPerListing, threshold: t.minViewsPerListing };
  }

  // Everything below here is a conversion rate, and conversion rates need a
  // sample. Report honestly rather than diagnosing noise.
  if (c.views < t.minSampleViews) {
    return { stage: "insufficient-data", observed: c.views, threshold: t.minSampleViews };
  }

  if (rates.viewToInquiry !== null && rates.viewToInquiry < t.minViewToInquiryPct) {
    return { stage: "listing-quality", observed: rates.viewToInquiry, threshold: t.minViewToInquiryPct };
  }

  if (c.inquiries < t.minSampleInquiries) {
    return { stage: "insufficient-data", observed: c.inquiries, threshold: t.minSampleInquiries };
  }

  if (rates.inquiryToVisit !== null && rates.inquiryToVisit < t.minInquiryToVisitPct) {
    return { stage: "response", observed: rates.inquiryToVisit, threshold: t.minInquiryToVisitPct };
  }

  if (c.visits < t.minSampleVisits) {
    return { stage: "insufficient-data", observed: c.visits, threshold: t.minSampleVisits };
  }

  if (rates.visitToRental !== null && rates.visitToRental < t.minVisitToRentalPct) {
    return { stage: "closing", observed: rates.visitToRental, threshold: t.minVisitToRentalPct };
  }

  return { stage: "healthy", observed: null, threshold: null };
}
