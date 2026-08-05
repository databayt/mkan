import { describe, it, expect } from "vitest";
import {
  PRICE_FILTER_MIN_STEPS,
  PRICE_FILTER_MAX_STEPS,
  PRICE_SLIDER_MIN,
  PRICE_SLIDER_MAX,
  PRICE_SLIDER_STEP,
} from "@/lib/price-filter";
import { SEARCH_CONFIG } from "@/lib/schemas/search-schema";

/**
 * These bounds are SDG per night, and they drifted badly once already: the
 * filter offered a maximum of 10,000 while the median listing cost 36,750, so
 * every option a guest could pick returned an empty result set. Nothing failed
 * — the filter worked exactly as written, it was just written against a
 * currency the catalogue had left behind.
 *
 * So these tests assert the bounds against the shape of the real catalogue
 * rather than against themselves. `CATALOGUE` is a snapshot of the published
 * listings on 2026-08-05; refresh it when the market moves and let the
 * failures show which constants need to move with it.
 */
const CATALOGUE = {
  min: 7_000,
  median: 36_750,
  p90: 91_000,
  max: 426_000,
} as const;

describe("price filter bounds vs the real catalogue", () => {
  it("lets a guest filter up to the most expensive listing", () => {
    expect(PRICE_SLIDER_MAX).toBeGreaterThanOrEqual(CATALOGUE.max);
    expect(SEARCH_CONFIG.MAX_PRICE).toBeGreaterThanOrEqual(CATALOGUE.max);
  });

  it("never clamps a filter the slider can express", () => {
    // The page clamps incoming params to SEARCH_CONFIG.MAX_PRICE. If the slider
    // could produce a larger number, dragging it to the end would silently
    // return results for a different query than the one shown.
    expect(SEARCH_CONFIG.MAX_PRICE).toBeGreaterThanOrEqual(PRICE_SLIDER_MAX);
  });

  it("offers a maximum-price option above the median listing", () => {
    // The failure mode that shipped: every "max price" option was below the
    // median, so the common case returned nothing.
    const highest = Math.max(...PRICE_FILTER_MAX_STEPS);
    expect(highest).toBeGreaterThan(CATALOGUE.median);
    expect(highest).toBeGreaterThanOrEqual(CATALOGUE.p90);
  });

  it("offers a minimum-price option below the cheapest listing's neighbourhood", () => {
    const lowest = Math.min(...PRICE_FILTER_MIN_STEPS);
    expect(lowest).toBeLessThan(CATALOGUE.median);
    // A floor above every listing would make the option useless.
    expect(lowest).toBeLessThan(CATALOGUE.max);
  });

  it("brackets the median so the options actually split the catalogue", () => {
    for (const steps of [PRICE_FILTER_MIN_STEPS, PRICE_FILTER_MAX_STEPS]) {
      expect(steps.some((s) => s < CATALOGUE.median)).toBe(true);
      expect(steps.some((s) => s > CATALOGUE.median)).toBe(true);
    }
  });

  it("keeps both step lists ascending and free of duplicates", () => {
    for (const steps of [PRICE_FILTER_MIN_STEPS, PRICE_FILTER_MAX_STEPS]) {
      expect([...steps]).toEqual([...steps].sort((a, b) => a - b));
      expect(new Set(steps).size).toBe(steps.length);
    }
  });

  it("uses a slider step fine enough to reach the cheapest listings", () => {
    // A step coarser than the cheapest listing would make the low end of the
    // range unreachable — the guest could not express "under 7,000".
    expect(PRICE_SLIDER_STEP).toBeLessThan(CATALOGUE.min);
    expect(PRICE_SLIDER_MIN).toBe(0);
  });
});
