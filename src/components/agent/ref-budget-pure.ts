/**
 * A home code's search carries the home's own rent as a ceiling (home-ref.ts: up to 15% over it) so "similar" homes
 * come back at that price. That ceiling is the LISTING's, never the tenant's: 11-22, a tenant who sent K6823 was
 * asked about on a broker's side as "budget 402k" (his own words never gave one), and the driver treated the budget
 * as known and never asked for it. Pure, so tests read it.
 */

/** The ref's filters without the listing's price: what the tenant actually said (place, size) stays. */
export function withoutListingBudget(filters: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!filters) return {};
  const { maxPrice: _maxPrice, pricePeriod: _pricePeriod, ...rest } = filters;
  return rest;
}

/** Whether a budget is a listing's rent in disguise: the rent itself, or the ref search's ceiling (rent + 15%). */
export function listingDerivedBudget(maxPrice: number | null | undefined, rents: readonly (number | null | undefined)[]): boolean {
  if (!maxPrice) return false;
  return rents.some((r) => !!r && (Math.abs(maxPrice - r) <= 1 || Math.abs(maxPrice - Math.round(r * 1.15)) <= 1));
}
