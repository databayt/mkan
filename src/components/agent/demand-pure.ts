/**
 * Who to ask when nothing on Mkan fits: the brokers and agencies whose own ads
 * cover the tenant's area, budget and stay. Pure, so the tests read exactly
 * which brokers a request reaches.
 */
import { NEIGHBOURHOODS } from "./areas";
import type { Requirements } from "./requirements";

/** Brokers asked per unmet request. */
export const DEMAND_FAN_OUT = 8;
/** A broker gets at most one demand ask per this many hours, whatever the requests. */
export const BROKER_ASK_GAP_HOURS = 24;
/** Unmet demand is kept, matched and alerted on this long. */
export const DEMAND_TTL_DAYS = 14;

export interface BrokerFit {
  id: string;
  kind: "BROKER" | "AGENCY" | "LANDLORD";
  phones: string[];
  districts: string[];
  neighbourhoods: string[];
  stays: string[];
  priceMin: number | null;
  priceMax: number | null;
  lastSeenAt: Date | null;
  lastAskedAt: Date | null;
  asks: number;
  answers: number;
  optOut: boolean;
}

const lower = (xs: string[]) => xs.map((x) => x.toLowerCase());

/** The neighbourhood's district, when the tenant named only a neighbourhood. */
function districtOf(r: Requirements): string | null {
  if (r.district) return r.district;
  const hood = r.neighbourhood ? NEIGHBOURHOODS.find((n) => n.name.toLowerCase() === r.neighbourhood!.toLowerCase()) : undefined;
  return hood?.district ?? null;
}

/** The tenant's ceiling as RWF per month, or null. */
export function monthlyCeiling(r: Requirements): number | null {
  if (!r.maxPrice) return null;
  return r.pricePeriod === "night" ? r.maxPrice * 30 : r.maxPrice;
}

/**
 * How well one broker fits a request, or null when they must not be asked:
 * opted out, no phone, asked too recently, or not covering the district.
 * Coverage beats everything; then budget, stay, recency and answer rate.
 */
export function brokerFitScore(b: BrokerFit, r: Requirements, now: Date): number | null {
  if (b.optOut || b.phones.length === 0) return null;
  if (b.lastAskedAt && now.getTime() - b.lastAskedAt.getTime() < BROKER_ASK_GAP_HOURS * 3_600_000) return null;
  let score = 0;

  const district = districtOf(r);
  const districts = lower(b.districts);
  if (district) {
    // An agency with no known coverage still works the whole city.
    if (districts.length === 0 && b.kind !== "AGENCY") return null;
    if (districts.length > 0 && !districts.includes(district.toLowerCase())) return null;
    score += 30;
  }
  if (r.neighbourhood && lower(b.neighbourhoods).includes(r.neighbourhood.toLowerCase())) score += 20;

  const ceiling = monthlyCeiling(r);
  if (ceiling && b.priceMin != null) {
    // Their cheapest homes are far above the budget: they will not have one.
    if (b.priceMin > ceiling * 1.3) return null;
    score += b.priceMax == null || b.priceMax >= ceiling * 0.5 ? 15 : 5;
  }

  const stay = r.stay === "short" ? "night" : r.stay === "long" ? "month" : null;
  if (stay && b.stays.length) score += b.stays.includes(stay) ? 10 : -10;

  if (b.lastSeenAt) {
    const days = (now.getTime() - b.lastSeenAt.getTime()) / 86_400_000;
    score += days <= 7 ? 15 : days <= 30 ? 8 : days <= 90 ? 2 : -5;
  }
  // Answer rate once there is history; a broker who never answers sinks.
  if (b.asks >= 3) score += Math.round((b.answers / b.asks) * 20) - 5;
  if (b.kind === "AGENCY") score += 3;
  return score;
}

/** The best-fitting brokers for a request, best first. */
export function pickBrokersForDemand<T extends BrokerFit>(brokers: T[], r: Requirements, now: Date, limit = DEMAND_FAN_OUT): T[] {
  return brokers
    .map((b) => ({ b, s: brokerFitScore(b, r, now) }))
    .filter((x): x is { b: T; s: number } => x.s !== null)
    .sort((x, y) => y.s - x.s)
    .slice(0, limit)
    .map((x) => x.b);
}

/**
 * A phone the tenant typed, as +<digits>, or null. Rwandan numbers may come
 * as 07…, 7… or 250…; anything else must already be international.
 */
export function normalisePhone(input: string): string | null {
  const raw = input.replace(/[\s\-().]/g, "");
  let digits = raw.replace(/^\+/, "").replace(/^00/, "");
  if (!/^\d+$/.test(digits)) return null;
  if (/^07\d{8}$/.test(digits)) digits = `250${digits.slice(1)}`;
  else if (/^7\d{8}$/.test(digits)) digits = `250${digits}`;
  if (digits.startsWith("250") && !/^2507\d{8}$/.test(digits)) return null;
  if (digits.length < 9 || digits.length > 15) return null;
  return `+${digits}`;
}
