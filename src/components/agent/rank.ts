/**
 * Filter, group and rank candidate homes against the tenant's requirements.
 * Pure — `search.ts` feeds it Prisma rows, the tests feed it fixtures.
 */
import type { Requirements } from "./requirements";
import { longStayCost, monthlyRent, shortStayCost, type CostEstimate, type PricedHome } from "./cost";

export interface Candidate extends PricedHome {
  id: number;
  hostId: string;
  bedrooms: number | null;
  guestCount: number;
  district: string | null;
  averageRating: number | null;
  numberOfReviews: number | null;
  /** Set only by a broker/owner answer (Phase 2) — never by an import. */
  confirmedAt: Date | null;
}

export type ReasonKey =
  | "inBudget"
  | "slightlyOverBudget"
  | "district"
  | "bedroomsExact"
  | "bedroomsMore"
  | "furnished"
  | "wellRated"
  | "confirmed"
  | "upfrontOver";

export interface Ranked {
  id: number;
  score: number;
  reasons: ReasonKey[];
  cost: CostEstimate;
  /** Other ads grouped into this home by `groupDuplicates`. */
  duplicates: number;
}

/** A broker's answer older than this no longer counts as "available". */
export const CONFIRMATION_TTL_DAYS = 3;
const OVER_BUDGET_SLACK = 0.1;

export function isFresh(confirmedAt: Date | null, now = new Date()): boolean {
  if (!confirmedAt) return false;
  return now.getTime() - confirmedAt.getTime() < CONFIRMATION_TTL_DAYS * 86_400_000;
}

/** The price compared against the tenant's ceiling, in the ceiling's period. */
function comparablePrice(c: Candidate, r: Requirements): number | null {
  if (r.pricePeriod === "night") return c.rentPeriod === "NIGHTLY" ? c.pricePerNight : null;
  return monthlyRent(c);
}

/**
 * The same home advertised more than once — one host reposting, or several
 * imported rows of one unit — keeps its best-rated row. Key: host, bedrooms,
 * district and price within 2%.
 */
export function groupDuplicates(cands: Candidate[]): { kept: Candidate[]; dupCount: Map<number, number>; removed: number } {
  const groups = new Map<string, Candidate[]>();
  for (const c of cands) {
    const price = monthlyRent(c) ?? 0;
    const bucket = Math.round(Math.log(Math.max(price, 1)) / Math.log(1.02));
    const key = `${c.hostId}|${c.bedrooms ?? "?"}|${c.district ?? "?"}|${bucket}`;
    const arr = groups.get(key);
    if (arr) arr.push(c);
    else groups.set(key, [c]);
  }
  const kept: Candidate[] = [];
  const dupCount = new Map<number, number>();
  for (const arr of groups.values()) {
    arr.sort((a, b) => (b.averageRating ?? 0) - (a.averageRating ?? 0) || (b.numberOfReviews ?? 0) - (a.numberOfReviews ?? 0));
    const best = arr[0]!;
    kept.push(best);
    dupCount.set(best.id, arr.length - 1);
  }
  return { kept, dupCount, removed: cands.length - kept.length };
}

/** Hard constraints: a home failing any of these is never shown. */
export function passesHardFilters(c: Candidate, r: Requirements): boolean {
  if (r.district && c.district && c.district.toUpperCase() !== r.district) return false;
  if (r.bedrooms != null && c.bedrooms != null && c.bedrooms < r.bedrooms) return false;
  if (r.guests != null && c.guestCount < r.guests && c.rentPeriod === "NIGHTLY") return false;
  if (r.stay === "short" && c.rentPeriod !== "NIGHTLY") return false;
  if (r.maxPrice) {
    const p = comparablePrice(c, r);
    if (p == null || p > r.maxPrice * (1 + OVER_BUDGET_SLACK)) return false;
  }
  return true;
}

export function costFor(c: Candidate, r: Requirements): CostEstimate | null {
  return r.stay === "short" ? shortStayCost(c, r.nights ?? 1) : longStayCost(c);
}

export function scoreCandidate(c: Candidate, r: Requirements, dupes = 0, now = new Date()): Ranked | null {
  const cost = costFor(c, r);
  if (!cost) return null;
  const reasons: ReasonKey[] = [];
  let score = 0;

  const p = comparablePrice(c, r);
  if (r.maxPrice && p != null) {
    if (p <= r.maxPrice) {
      reasons.push("inBudget");
      // Closer to the ceiling is closer to what they asked for; far under is
      // often a smaller or older home. Peak at ~85% of budget.
      score += 30 - Math.abs(p / r.maxPrice - 0.85) * 30;
    } else {
      reasons.push("slightlyOverBudget");
      score -= 10;
    }
  }
  if (r.district && c.district?.toUpperCase() === r.district) {
    reasons.push("district");
    score += 15;
  }
  if (r.bedrooms != null && c.bedrooms != null) {
    if (c.bedrooms === r.bedrooms) {
      reasons.push("bedroomsExact");
      score += 15;
    } else if (c.bedrooms > r.bedrooms) {
      reasons.push("bedroomsMore");
      score += 5;
    }
  }
  if (r.furnished && c.rentPeriod === "NIGHTLY") {
    reasons.push("furnished");
    score += 3;
  }
  const rating = c.averageRating ?? 0;
  const reviews = c.numberOfReviews ?? 0;
  if (rating >= 4.7 && reviews >= 5) reasons.push("wellRated");
  score += rating * 2 + Math.min(Math.log10(reviews + 1) * 4, 8);
  if (isFresh(c.confirmedAt, now)) {
    reasons.push("confirmed");
    score += 20;
  }
  if (r.maxUpfront && cost.total > r.maxUpfront) {
    reasons.push("upfrontOver");
    score -= 25;
  }
  return { id: c.id, score: Math.round(score * 10) / 10, reasons, cost, duplicates: dupes };
}

export interface RankResult {
  ranked: Ranked[];
  candidates: number;
  duplicatesRemoved: number;
  matching: number;
}

export function rankCandidates(cands: Candidate[], r: Requirements, limit = 6, now = new Date()): RankResult {
  const { kept, dupCount, removed } = groupDuplicates(cands);
  const matching = kept.filter((c) => passesHardFilters(c, r));
  const ranked = matching
    .map((c) => scoreCandidate(c, r, dupCount.get(c.id) ?? 0, now))
    .filter((x): x is Ranked => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return { ranked, candidates: cands.length, duplicatesRemoved: removed, matching: matching.length };
}
