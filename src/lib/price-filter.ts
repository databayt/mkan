/**
 * Price-filter buckets, in SDG per night.
 *
 * These used to be `[500 … 10000]` — inherited from a US-dollar monthly-rent
 * prototype and never revisited. Against the real catalogue that made the
 * highest available "maximum price" 10,000 SDG while the median listing costs
 * 36,750, so every filter option a guest could pick returned nothing.
 *
 * The steps below come from the published catalogue's actual distribution
 * (140 listings, 2026-08-05):
 *
 *   min 7,000 · p10 17,500 · p25 28,000 · median 36,750
 *   p75 59,625 · p90 91,000 · max 426,000
 *
 * Chosen so each option splits the catalogue somewhere useful rather than
 * landing on a round number that everything or nothing clears. If the currency
 * moves again, re-derive them — the query at the top of `getPriceBounds` gives
 * the same percentiles.
 */

/** Options for the "minimum price" selector — a floor the guest is willing to pass. */
export const PRICE_FILTER_MIN_STEPS = [10_000, 20_000, 30_000, 50_000, 75_000, 100_000, 150_000] as const;

/** Options for the "maximum price" selector — a ceiling the guest wants to stay under. */
export const PRICE_FILTER_MAX_STEPS = [20_000, 30_000, 50_000, 75_000, 100_000, 150_000, 250_000] as const;

/**
 * Default range for a two-handle slider that has no data-derived bounds yet.
 * Covers the whole catalogue, so an untouched slider filters nothing out.
 */
export const PRICE_SLIDER_MIN = 0;
export const PRICE_SLIDER_MAX = 500_000;
export const PRICE_SLIDER_STEP = 1_000;
