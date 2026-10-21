/**
 * Filter, group and rank candidate homes against the tenant's requirements.
 * Pure — `search.ts` feeds it Prisma rows, the tests feed it fixtures.
 */
import { haversineKm } from "@/lib/geo/rwanda-places";
import { placeToken } from "@/lib/geo/place-token";
import type { MustHave, Requirements } from "./requirements";
import { longStayCost, monthlyRent, shortStayCost, type CostEstimate, type PricedHome } from "./cost";
import { inArea, inNeighbourhood } from "./areas";

/** Standalone homes with their own compound. */
const COMPOUND_TYPES = new Set(["Villa", "Townhouse", "Cottage"]);
/** Bedrooms a "family" search wants when no count was given. */
const FAMILY_BEDROOMS = 3;
/** "Cheapest first" with no budget: prices are scored against these (RWF). */
const CHEAP_SCALE = { night: 150_000, month: 1_500_000 };
/**
 * An unrated home scores as a decent one, not as a zero: broker homes carry no
 * ratings at all, and up to ~18 rating points kept them under every rated
 * Airbnb flat however well they fit.
 */
const UNRATED_RATING = 4.5;
/** Points for each must-have a home is known to have; one it is known to lack costs a little. */
const MUST_HAVE_POINTS = 8;
const MUST_HAVE_MISSING = -4;

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
  bathrooms?: number | null;
  propertyType?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** True when the pin is a district centre, not the home (TikTok leads). */
  approxLocation?: boolean;
  /** Free-text address; a lead's neighbourhood lives here. */
  address?: string | null;
  amenities?: string[];
  highlights?: string[];
  isPetsAllowed?: boolean;
  isParkingIncluded?: boolean;
  /** Known furnishing; null when the listing does not say. */
  furnished?: boolean | null;
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
  | "upfrontOver"
  | "neighbourhood"
  | "nearCenter"
  | "nearBusiness"
  | "nearUniversity"
  | "selfCompound"
  | "familySize"
  | "lowPrice"
  | "typicalPrice"
  | "nearPlace";

export interface Ranked {
  id: number;
  score: number;
  reasons: ReasonKey[];
  cost: CostEstimate;
  /** Other ads grouped into this home by `groupDuplicates`. */
  duplicates: number;
  /** The tenant's must-haves this home is known to have, and the ones nobody knows yet. */
  mustHaves?: { matched: MustHave[]; unknown: MustHave[] };
  /** Kilometres from the place the tenant wants to be near (a trusted pin only). */
  km?: number;
}

const has = (list: string[] | undefined, ...values: string[]) => !!list && values.some((v) => list.includes(v));

/**
 * Whether a home has a must-have: true / false when its listing says, null
 * when it says nothing at all (a broker lead with no amenity list) — then the
 * card says "ask the broker" instead of guessing.
 */
export function hasMustHave(c: Candidate, key: MustHave): boolean | null {
  const a = c.amenities;
  const h = c.highlights;
  const known = (a?.length ?? 0) > 0 || (h?.length ?? 0) > 0 || c.isPetsAllowed || c.isParkingIncluded;
  const yes = (() => {
    switch (key) {
      case "parking":
        return !!c.isParkingIncluded || has(a, "Parking");
      case "pets":
        return !!c.isPetsAllowed || has(a, "PetsAllowed");
      case "wifi":
        return has(a, "WiFi", "HighSpeedInternet") || has(h, "HighSpeedInternetAccess");
      case "workspace":
        return has(a, "DedicatedWorkspace");
      case "ac":
        return has(a, "AirConditioning") || has(h, "AirConditioning");
      case "security":
        return has(a, "SecurityCameras");
      case "quiet":
        return has(h, "QuietNeighborhood");
      case "transit":
        return has(h, "CloseToTransit");
      case "kitchen":
        return has(a, "Kitchen");
      case "washer":
        return has(a, "WasherDryer") || has(h, "WasherDryer");
      case "balcony":
        return has(a, "PatioOrBalcony");
      case "garden":
        return has(a, "Backyard");
      case "elevator":
        return has(a, "Elevator");
      case "waterTank":
        return has(a, "WaterTank");
      case "generator":
        return has(a, "BackupGenerator");
    }
  })();
  return yes ? true : known ? false : null;
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
  // No budget yet: the stay type says which price the tenant will compare.
  if (r.pricePeriod === "night" || (!r.pricePeriod && r.stay === "short")) return c.rentPeriod === "NIGHTLY" ? c.pricePerNight : null;
  return monthlyRent(c);
}

/**
 * The same home advertised more than once — one host reposting, or several
 * imported rows of one unit — keeps its best-rated row. Key: host, bedrooms,
 * district and price within 2%.
 *
 * TikTok leads are grouped across brokers (Kigali brokers re-post each other's
 * homes): bedrooms, district, the neighbourhood named in the address and price
 * within 5%. Not for site homes — two Airbnb hosts with a 1-bed in Gasabo at
 * one price are two homes.
 */
export function groupDuplicates(cands: Candidate[]): { kept: Candidate[]; dupCount: Map<number, number>; removed: number } {
  const groups = new Map<string, Candidate[]>();
  for (const c of cands) {
    const price = monthlyRent(c) ?? 0;
    const bucket = Math.round(Math.log(Math.max(price, 1)) / Math.log(1.02));
    const place = c.approxLocation ? placeToken(c.address) : "";
    const key = place
      ? `lead|${c.bedrooms ?? "?"}|${c.district ?? "?"}|${place}|${Math.round(Math.log(Math.max(price, 1)) / Math.log(1.05))}`
      : `${c.hostId}|${c.bedrooms ?? "?"}|${c.district ?? "?"}|${bucket}`;
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

/** Where the home is, when its pin can be trusted. */
const point = (c: Candidate): [number, number] | null =>
  !c.approxLocation && c.latitude != null && c.longitude != null ? [c.latitude, c.longitude] : null;

function matchesNeighbourhood(c: Candidate, name: string): boolean {
  const p = point(c);
  if (p) return inNeighbourhood(p[0], p[1], name);
  return !!c.address && c.address.toLowerCase().includes(name.toLowerCase());
}

/** Hard constraints: a home failing any of these is never shown. */
export function passesHardFilters(c: Candidate, r: Requirements): boolean {
  if (r.neighbourhood && !matchesNeighbourhood(c, r.neighbourhood)) return false;
  if (r.area) {
    // A district-centre pin says nothing about the distance to the CBD or a
    // campus: a broker lead stays in (neutral), a pinned home must be in it.
    const p = point(c);
    if (p && !inArea(p[0], p[1], r.area)) return false;
  }
  // "Unfurnished" is a long-term ask: nightly homes are furnished by definition.
  if (r.furnished === false && (c.rentPeriod === "NIGHTLY" || c.furnished === true)) return false;
  if (r.compound && !COMPOUND_TYPES.has(c.propertyType ?? "")) return false;
  if (r.bathrooms != null && c.bathrooms != null && c.bathrooms < r.bathrooms) return false;
  if (r.family && r.bedrooms == null && c.bedrooms != null && c.bedrooms < FAMILY_BEDROOMS) return false;
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

/** Within this share of the median, a home is "typical" for the search. */
const TYPICAL_BAND = 0.25;

/** Fewer real monthly rents than this and the median falls back to every home. */
const MIN_MONTHLY_SAMPLE = 3;

/**
 * The going price for the search, in the period the tenant compares. For a
 * monthly search it is the median of the real monthly rents that matched
 * (broker homes): a nightly apartment priced by the month runs 3–5× Kigali's
 * rents, and those far outnumber them.
 */
export function medianPrice(cands: Candidate[], r: Requirements): number | null {
  const priced = (list: Candidate[]) =>
    list
      .map((c) => comparablePrice(c, r))
      .filter((p): p is number => p != null && p > 0)
      .sort((a, b) => a - b);
  const monthly = r.stay === "short" ? [] : priced(cands.filter((c) => c.rentPeriod === "MONTHLY"));
  const prices = monthly.length >= MIN_MONTHLY_SAMPLE ? monthly : priced(cands);
  if (prices.length === 0) return null;
  const mid = prices.length >> 1;
  return prices.length % 2 ? prices[mid]! : (prices[mid - 1]! + prices[mid]!) / 2;
}

/**
 * `median` stands in for a budget the tenant has not given: homes near the
 * middle of what matched lead, so a first shortlist is not five luxury
 * apartments because they carry the best ratings.
 */
export function scoreCandidate(c: Candidate, r: Requirements, dupes = 0, now = new Date(), median: number | null = null): Ranked | null {
  const cost = costFor(c, r);
  if (!cost) return null;
  const reasons: ReasonKey[] = [];
  let score = 0;

  const p = comparablePrice(c, r);
  if (r.cheap && p != null) {
    // Cheapest first: price dominates the score (≈ up to 60 points).
    reasons.push("lowPrice");
    // Without a ceiling, measure against the top of Kigali's market.
    const scale = r.maxPrice ?? (r.pricePeriod === "night" || (!r.pricePeriod && r.stay === "short") ? CHEAP_SCALE.night : CHEAP_SCALE.month);
    score += 60 - Math.min(60, (p / scale) * 60);
  } else if (r.maxPrice && p != null) {
    if (p <= r.maxPrice) {
      reasons.push("inBudget");
      // Closer to the ceiling is closer to what they asked for; far under is
      // often a smaller or older home. Peak at ~85% of budget.
      score += 30 - Math.abs(p / r.maxPrice - 0.85) * 30;
    } else {
      reasons.push("slightlyOverBudget");
      score -= 10;
    }
  } else if (median && p != null) {
    // Distance on a log scale: double the median and half of it weigh the same.
    const off = Math.abs(Math.log(p / median));
    if (off <= Math.log(1 + TYPICAL_BAND)) reasons.push("typicalPrice");
    score += Math.max(0, 30 - off * 25);
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
  if (r.neighbourhood) reasons.push("neighbourhood");
  const pin = point(c);
  if (r.area && pin) reasons.push(r.area === "center" ? "nearCenter" : r.area === "business" ? "nearBusiness" : "nearUniversity");
  // Near a place: by distance, softly — 20 points on the spot, none past ~3.3 km.
  // A lead's district-centre pin says nothing, so it neither gains nor loses.
  let km: number | undefined;
  if (r.near && pin) {
    km = Math.round(haversineKm(pin[0], pin[1], r.near.lat, r.near.lng) * 10) / 10;
    score += Math.max(0, 20 - 6 * km);
    if (km <= 3) reasons.push("nearPlace");
  }
  let mustHaves: Ranked["mustHaves"];
  if (r.mustHaves?.length) {
    mustHaves = { matched: [], unknown: [] };
    for (const key of r.mustHaves) {
      const known = hasMustHave(c, key);
      if (known === true) {
        mustHaves.matched.push(key);
        score += MUST_HAVE_POINTS;
      } else if (known === false) score += MUST_HAVE_MISSING;
      else mustHaves.unknown.push(key);
    }
  }
  if (r.compound) reasons.push("selfCompound");
  if (r.family) {
    if ((c.bedrooms ?? 0) >= FAMILY_BEDROOMS) reasons.push("familySize");
    if (COMPOUND_TYPES.has(c.propertyType ?? "")) score += 8;
  }
  if (r.furnished && (c.rentPeriod === "NIGHTLY" || c.furnished === true)) {
    reasons.push("furnished");
    score += c.rentPeriod === "NIGHTLY" ? 3 : 6;
  }
  const rating = c.averageRating && c.averageRating > 0 ? c.averageRating : UNRATED_RATING;
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
  return {
    id: c.id,
    score: Math.round(score * 10) / 10,
    reasons,
    cost,
    duplicates: dupes,
    ...(mustHaves ? { mustHaves } : {}),
    ...(km != null ? { km } : {}),
  };
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
  const median = !r.maxPrice && !r.cheap ? medianPrice(matching, r) : null;
  const ranked = matching
    .map((c) => scoreCandidate(c, r, dupCount.get(c.id) ?? 0, now, median))
    .filter((x): x is Ranked => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return { ranked, candidates: cands.length, duplicatesRemoved: removed, matching: matching.length };
}
