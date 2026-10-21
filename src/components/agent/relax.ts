/**
 * When nothing matches every detail, widen the search one detail at a time —
 * the narrowest, least important first — instead of answering "no homes".
 * The tenant's requirements are never changed; each step is a search-only copy
 * and the reply names every step taken. Pure — run.ts drives the searches.
 */
import { neighbourhoodNamed } from "./areas";
import { roundPrice, type Requirements } from "./requirements";

export type RelaxKey = "neighbourhood" | "area" | "near" | "type" | "bathrooms" | "furnished" | "budget" | "district";

/** One widening, with what it widened to (a district code, a new ceiling). */
export interface Relaxed {
  key: RelaxKey;
  to?: string | number;
}

/** Widen the budget by this much, once. */
const BUDGET_STEP = 1.3;

type Step = (r: Requirements) => { next: Requirements; step: Relaxed } | null;

const STEPS: Step[] = [
  // A neighbourhood widens to its own district, never straight to the city.
  (r) => {
    if (!r.neighbourhood) return null;
    const district = r.district ?? neighbourhoodNamed(r.neighbourhood)?.district ?? null;
    return { next: { ...r, neighbourhood: null, district: district as Requirements["district"] }, step: { key: "neighbourhood", to: district ?? undefined } };
  },
  (r) => (r.area ? { next: { ...r, area: null }, step: { key: "area" } } : null),
  // "Near Kigali Heights": the place goes, so homes further out can show.
  (r) => (r.near ? { next: { ...r, near: null }, step: { key: "near", to: r.near.name } } : null),
  (r) => (r.compound || r.family ? { next: { ...r, compound: null, family: null }, step: { key: "type" } } : null),
  (r) => (r.bathrooms != null ? { next: { ...r, bathrooms: null }, step: { key: "bathrooms" } } : null),
  (r) => (r.furnished != null ? { next: { ...r, furnished: null }, step: { key: "furnished" } } : null),
  (r) => {
    if (!r.maxPrice) return null;
    const to = roundPrice(r.maxPrice * BUDGET_STEP, r.pricePeriod);
    return { next: { ...r, maxPrice: to }, step: { key: "budget", to } };
  },
  (r) => (r.district ? { next: { ...r, district: null }, step: { key: "district" } } : null),
];

/**
 * The widened searches to try: each detail dropped on its own first (one
 * change is the smallest surprise), then the ladder — every step carrying all
 * the ones before it, so the last entry relaxes everything. The caller runs
 * them together and keeps the fewest-steps attempt that finds homes.
 */
export function relaxations(r: Requirements): { requirements: Requirements; steps: Relaxed[] }[] {
  const singles: { requirements: Requirements; steps: Relaxed[] }[] = [];
  for (const step of STEPS) {
    const res = step(r);
    if (res) singles.push({ requirements: res.next, steps: [res.step] });
  }
  const ladder: { requirements: Requirements; steps: Relaxed[] }[] = [];
  let current = r;
  const steps: Relaxed[] = [];
  for (const step of STEPS) {
    const res = step(current);
    if (!res) continue;
    current = res.next;
    steps.push(res.step);
    if (steps.length > 1) ladder.push({ requirements: current, steps: [...steps] });
  }
  return [...singles, ...ladder];
}
