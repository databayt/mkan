/**
 * Who to ask when nothing on Mkan fits: the brokers and agencies whose own ads
 * cover the tenant's area, budget and stay. Pure, so the tests read exactly
 * which brokers a request reaches.
 */
import { KIGALI_ZONES, KIGALI_ZONE_BY_SLUG, zoneAt, zoneNamed, zoneWithin, type KigaliZone } from "@/lib/geo/kigali-zones";
import { haversineKm } from "@/lib/geo/rwanda-places";
import { AREA_KEYS, AREAS, NEIGHBOURHOODS, type AreaKey } from "./areas";
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
  /** Zones served (kigali-zones slugs) — the precise coverage; districts/neighbourhoods are its older names. */
  zoneSlugs?: string[];
  stays: string[];
  priceMin: number | null;
  priceMax: number | null;
  lastSeenAt: Date | null;
  lastAskedAt: Date | null;
  asks: number;
  answers: number;
  optOut: boolean;
  /** Median minutes they take to answer on WhatsApp (from chats and replies). */
  replyMinutes?: number | null;
}

const lower = (xs: string[]) => xs.map((x) => x.toLowerCase());

/** The neighbourhood's district, when the tenant named only a neighbourhood. */
function districtOf(r: Requirements): string | null {
  if (r.district) return r.district;
  const hood = r.neighbourhood ? NEIGHBOURHOODS.find((n) => n.name.toLowerCase() === r.neighbourhood!.toLowerCase()) : undefined;
  return hood?.district ?? null;
}

/** Sector and neighbourhood zones whose centre falls inside each "near…" area. */
export const AREA_ZONES: Record<AreaKey, string[]> = Object.fromEntries(
  AREA_KEYS.map((k) => [
    k,
    KIGALI_ZONES.filter((z) => z.level !== "district" && AREAS[k].points.some(([lat, lng]) => haversineKm(lat, lng, z.lat, z.lng) <= AREAS[k].radiusKm)).map((z) => z.slug),
  ]),
) as Record<AreaKey, string[]>;

/** The sector or neighbourhood the tenant wants: the one they named, else the one their "near" pin is in. */
export function wantedZone(r: Requirements): KigaliZone | null {
  if (r.neighbourhood) {
    const hood = NEIGHBOURHOODS.find((n) => n.name.toLowerCase() === r.neighbourhood!.toLowerCase());
    const z = hood ? KIGALI_ZONE_BY_SLUG.get(hood.slug) : zoneNamed(r.neighbourhood);
    if (z && z.level !== "district") return z;
  }
  if (r.near) return zoneAt(r.near.lat, r.near.lng);
  return null;
}

/** A broker zone covers a place when it is that place or inside it, or is a sector/neighbourhood holding it. */
const covers = (brokerZone: string, place: string) => zoneWithin(place, brokerZone) || (brokerZone.includes("/") && zoneWithin(brokerZone, place));

/** 2: they work that very place · 1: the same sector · 0: neither. */
export function zoneMatch(zoneSlugs: string[], want: KigaliZone): 0 | 1 | 2 {
  if (zoneSlugs.some((s) => covers(s, want.slug))) return 2;
  const sector = want.level === "neighbourhood" ? want.parent : null;
  if (sector && zoneSlugs.some((s) => zoneWithin(sector, s))) return 1;
  return 0;
}

/** The tenant's ceiling as RWF per month, or null. */
export function monthlyCeiling(r: Requirements): number | null {
  if (!r.maxPrice) return null;
  return r.pricePeriod === "night" ? r.maxPrice * 30 : r.maxPrice;
}

/**
 * How well one broker fits a request, or null when they must not be asked:
 * opted out, no phone, asked too recently, or not covering the district.
 * Coverage beats everything — the tenant's neighbourhood or sector (from
 * `zoneSlugs`) over the district alone — then budget, stay, recency and
 * answer rate. An agency with no known coverage is asked, but last.
 */
export function brokerFitScore(b: BrokerFit, r: Requirements, now: Date): number | null {
  if (b.optOut || b.phones.length === 0) return null;
  if (b.lastAskedAt && now.getTime() - b.lastAskedAt.getTime() < BROKER_ASK_GAP_HOURS * 3_600_000) return null;
  let score = 0;

  const district = districtOf(r);
  const zones = b.zoneSlugs ?? [];
  const districts = [...new Set([...lower(b.districts), ...zones.map((s) => KIGALI_ZONE_BY_SLUG.get(s)?.district.toLowerCase()).filter((d): d is string => !!d)])];
  if (district) {
    if (districts.length > 0 && !districts.includes(district.toLowerCase())) return null;
    if (districts.length > 0) score += 30;
    // An agency with no known coverage may still work the whole city — asked, but after the locals.
    else if (b.kind === "AGENCY") score += 5;
    else return null;
  }
  // Sector and neighbourhood outrank the district: the zone they really work, else the names their ads used.
  const want = wantedZone(r);
  const match = want && zones.length ? zoneMatch(zones, want) : 0;
  const named = !!r.neighbourhood && lower(b.neighbourhoods).includes(r.neighbourhood.toLowerCase());
  if (match === 2 || named) score += 20;
  else if (match === 1) score += 10;
  // "Near the centre / business district / a university": the zones inside that area.
  if (r.area && zones.some((s) => AREA_ZONES[r.area!].some((a) => covers(s, a)))) score += 15;

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
  // Brokers who answer within minutes close deals; one who takes a day loses the tenant.
  if (b.replyMinutes != null) score += b.replyMinutes <= 15 ? 10 : b.replyMinutes <= 120 ? 5 : b.replyMinutes >= 24 * 60 ? -5 : 0;
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
