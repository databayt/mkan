import "server-only";

/**
 * The agent's database search: published Kigali homes that could satisfy the
 * requirements, loaded wide (price slack, nightly↔monthly conversion) so the
 * pure filters in rank.ts make the final call.
 */
import type { Prisma, PropertyType } from "@prisma/client";
import { db } from "@/lib/db";
import { listingPath } from "@/lib/listing-code";
import { localizeListings } from "@/components/translation/localize";
import type { Locale } from "@/components/internationalization/config";
import type { Requirements } from "./requirements";
import { HOME_TYPE_PROPERTY, type Candidate, type Ranked } from "./rank";
import type { ShortlistItem } from "./types";
import { brokerAnswers } from "./broker";
import { AREAS, boxAround, NEIGHBOURHOOD_RADIUS_KM, neighbourhoodNamed } from "./areas";

const MAX_CANDIDATES = 400;
/**
 * Monthly rents load in a pool of their own: they carry no ratings, so the
 * best-rated 400 (all nightly apartments in most of Kigali) shut them out.
 */
const MAX_MONTHLY = 200;
/** Deepest monthly discount we assume when pre-filtering nightly homes for a monthly budget. */
const MAX_MONTHLY_DISCOUNT = 0.5;

/** What ranking reads — kept small: 400 of these load ~10× faster than display rows. */
const CANDIDATE_SELECT = {
  id: true,
  hostId: true,
  pricePerNight: true,
  priceMonth: true,
  rentPeriod: true,
  monthlyDiscount: true,
  cleaningFee: true,
  bedrooms: true,
  bathrooms: true,
  guestCount: true,
  propertyType: true,
  averageRating: true,
  numberOfReviews: true,
  isPublished: true,
  source: true,
  amenities: true,
  highlights: true,
  isPetsAllowed: true,
  isParkingIncluded: true,
  furnished: true,
  // The ad's own terms (the lead readers fill them); null where it says nothing.
  depositMonths: true,
  commissionPct: true,
  noCommission: true,
  viewingFee: true,
  waterIncluded: true,
  electricityIncluded: true,
  location: { select: { state: true, address: true, latitude: true, longitude: true, sector: true, neighbourhood: true } },
  // An owner posting their own home: no broker, no commission.
  brokers: { where: { role: "OWNER" }, select: { id: true }, take: 1 },
} satisfies Prisma.ListingSelect;

/** How far around a place the pool reaches; ranking then scores the distance. */
const NEAR_POOL_KM = 5;

/** What a card shows — loaded only for the few homes that made the shortlist. */
const DISPLAY_SELECT = {
  id: true,
  code: true,
  sourceListingId: true,
  title: true,
  currency: true,
  rentPeriod: true,
  bedrooms: true,
  bathrooms: true,
  photoUrls: true,
  averageRating: true,
  numberOfReviews: true,
  isPublished: true,
  source: true,
  sourceUrl: true,
  propertyType: true,
  furnished: true,
  host: { select: { sourceHostId: true } },
  location: { select: { state: true, city: true, address: true, country: true, sector: true, neighbourhood: true } },
} satisfies Prisma.ListingSelect;

/** An unpublished TikTok home the agent may offer as a broker lead (never in public search). */
/** Broker ads mirrored as unpublished leads: TikTok, Facebook groups, web classifieds and homes brokers sent us. */
export const LEAD_SOURCES = ["TIKTOK", "FACEBOOK", "WEB"] as const;
const isLead = (row: { isPublished: boolean; source: string | null }) => !row.isPublished && (LEAD_SOURCES as readonly string[]).includes(row.source ?? "");


function priceWhere(r: Requirements): Prisma.ListingWhereInput {
  if (!r.maxPrice) return {};
  const ceiling = r.maxPrice * 1.1;
  if (r.pricePeriod === "night") return { rentPeriod: "NIGHTLY", pricePerNight: { lte: ceiling } };
  return {
    OR: [
      { rentPeriod: "MONTHLY", priceMonth: { lte: ceiling } },
      { rentPeriod: "NIGHTLY", pricePerNight: { lte: ceiling / 30 / (1 - MAX_MONTHLY_DISCOUNT) } },
    ],
  };
}

/** A zone slug or anything under it (`gasabo/remera` holds `gasabo/remera/nyarutarama`). */
const underZone = (slug: string): Prisma.StringNullableFilter[] => [{ equals: slug }, { startsWith: `${slug}/` }];

/**
 * Where-clauses for the place, home-type and term fields; rank.ts makes the
 * exact call. Every "known opposite" filter keeps the homes whose ad says
 * nothing — rank.ts ranks them lower and the card says to ask the broker.
 */
function placeWhere(r: Requirements): Prisma.ListingWhereInput[] {
  const out: Prisma.ListingWhereInput[] = [];
  const hood = neighbourhoodNamed(r.neighbourhood);
  if (hood) {
    // A lead's zone (Location.neighbourhood / sector) places it; older leads only have their address text.
    out.push({
      OR: [
        { location: boxAround([[hood.lat, hood.lng]], NEIGHBOURHOOD_RADIUS_KM) },
        ...underZone(hood.slug).flatMap((f) => [{ location: { neighbourhood: f } }, { location: { sector: f } }]),
        { source: { in: [...LEAD_SOURCES] }, location: { address: { contains: hood.name, mode: "insensitive" } } },
      ],
    });
  }
  // Leads carry a district-centre pin that says nothing about distance — they stay in, scored neutrally.
  if (r.area) out.push({ OR: [{ location: boxAround(AREAS[r.area].points, AREAS[r.area].radiusKm) }, { source: { in: [...LEAD_SOURCES] } }] });
  if (r.near) out.push({ OR: [{ location: boxAround([[r.near.lat, r.near.lng]], NEAR_POOL_KM) }, { source: { in: [...LEAD_SOURCES] } }] });
  if (r.homeType && r.homeType !== "studio") {
    out.push({ OR: [{ propertyType: null }, { propertyType: { in: [...HOME_TYPE_PROPERTY[r.homeType]] as PropertyType[] } }] });
  }
  if (r.bathrooms != null) out.push({ OR: [{ bathrooms: null }, { bathrooms: { gte: r.bathrooms } }] });
  // A studio is no bedroom; any other count a minimum. A lead that does not say stays in.
  if (r.bedrooms != null) {
    out.push({ OR: [{ bedrooms: null }, r.bedrooms === 0 && r.homeType === "studio" ? { bedrooms: 0 } : { bedrooms: { gte: r.bedrooms } }] });
  }
  if (r.furnished === true) out.push({ OR: [{ rentPeriod: "NIGHTLY" }, { furnished: null }, { furnished: true }] });
  if (r.furnished === false) out.push({ rentPeriod: "MONTHLY", OR: [{ furnished: null }, { furnished: false }] });
  if (r.waterIncluded) out.push({ OR: [{ rentPeriod: "NIGHTLY" }, { waterIncluded: null }, { waterIncluded: true }] });
  if (r.noCommission) {
    out.push({
      OR: [
        { rentPeriod: "NIGHTLY" },
        { noCommission: true },
        { commissionPct: 0 },
        { brokers: { some: { role: "OWNER" } } },
        { noCommission: null, commissionPct: null },
      ],
    });
  }
  return out;
}

/**
 * `take` widens the load for a pool the caller ranks several ways (the zero-match
 * widening); `truncated` says a pool hit its cap, so it may be missing rows.
 * `excludeIds` keeps out homes the tenant passed on; `createdAfter` finds the
 * homes listed since their last search ("new since Tuesday").
 */
export async function searchKigali(
  r: Requirements,
  { take = MAX_CANDIDATES, excludeIds = [], createdAfter }: { take?: number; excludeIds?: number[]; createdAfter?: Date } = {},
): Promise<{ candidates: Candidate[]; truncated: boolean }> {
  // Leads are monthly broker homes, so they only join long-stay searches.
  const visible: Prisma.ListingWhereInput =
    r.stay === "short"
      ? { isPublished: true, draft: false }
      : // A lead whose video was taken down loses its link (crm:hygiene) — and with it, its place here.
        { OR: [{ isPublished: true, draft: false }, { source: { in: [...LEAD_SOURCES] }, rentPeriod: "MONTHLY", sourceUrl: { not: null } }] };
  const where: Prisma.ListingWhereInput = {
    // Airbnb imports never reach the agent (Abdout, 2026-10-22); a host's own home has no source and stays.
    AND: [visible, { OR: [{ source: null }, { source: { not: "AIRBNB" } }] }, priceWhere(r), ...placeWhere(r)],
    currency: "RWF",
    location: {
      city: { equals: "Kigali", mode: "insensitive" },
      ...(r.district ? { state: { equals: r.district, mode: "insensitive" } } : {}),
    },
    ...(r.stay === "short" ? { rentPeriod: "NIGHTLY" } : {}),
    ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
    ...(createdAfter ? { createdAt: { gt: createdAfter } } : {}),
  };
  const [rated, monthly] = await Promise.all([
    db.listing.findMany({
      where,
      select: CANDIDATE_SELECT,
      // "Cheap" loads the cheapest 400, not the best-rated 400.
      orderBy: r.cheap ? [{ pricePerNight: "asc" }, { priceMonth: "asc" }] : [{ averageRating: "desc" }, { numberOfReviews: "desc" }],
      take,
    }),
    r.stay === "short"
      ? []
      : db.listing.findMany({ where: { AND: [where, { rentPeriod: "MONTHLY" }] }, select: CANDIDATE_SELECT, orderBy: { priceMonth: "asc" }, take: MAX_MONTHLY }),
  ]);
  const seen = new Set(rated.map((row) => row.id));
  const rows = [...rated, ...monthly.filter((row) => !seen.has(row.id))];
  const answers = await brokerAnswers(rows.map((row) => row.id));
  const candidates: Candidate[] = rows
    .filter((row) => answers.get(row.id)?.status !== "RENTED")
    .map((row) => ({
    id: row.id,
    hostId: row.hostId,
    rentPeriod: row.rentPeriod,
    pricePerNight: row.pricePerNight,
    priceMonth: row.priceMonth,
    monthlyDiscount: row.monthlyDiscount,
    cleaningFee: row.cleaningFee,
    bedrooms: row.bedrooms,
    guestCount: row.guestCount,
    district: row.location?.state ?? null,
    bathrooms: row.bathrooms,
    propertyType: row.propertyType,
    latitude: row.location?.latitude ?? null,
    longitude: row.location?.longitude ?? null,
    approxLocation: isLead(row),
    address: row.location?.address ?? null,
    amenities: row.amenities,
    highlights: row.highlights,
    isPetsAllowed: row.isPetsAllowed,
    isParkingIncluded: row.isParkingIncluded,
    furnished: row.furnished,
    zone: row.location?.neighbourhood ?? row.location?.sector ?? null,
    terms: {
      depositMonths: row.depositMonths,
      commissionPct: row.commissionPct,
      noCommission: row.noCommission,
      viewingFee: row.viewingFee,
      waterIncluded: row.waterIncluded,
      electricityIncluded: row.electricityIncluded,
      owner: row.brokers.length > 0,
    },
    averageRating: row.averageRating,
    numberOfReviews: row.numberOfReviews,
    // Imports stamp lastAvailabilityConfirmedAt at scrape time, so it is not
    // a confirmation. Only a broker's answer sets this.
    confirmedAt: answers.get(row.id)?.status === "AVAILABLE" ? answers.get(row.id)!.at : null,
  }));
  // Either pool at its cap may be missing rows — the monthly one too (it fed the typical-price median).
  return { candidates, truncated: rated.length >= take || monthly.length >= MAX_MONTHLY };
}

/** The card's word for a listing's type. */
function homeTypeOf(t: string | null): ShortlistItem["homeType"] {
  if (!t) return null;
  if (HOME_TYPE_PROPERTY.house.includes(t)) return "house";
  if (t === "Apartment") return "apartment";
  if (t === "Rooms") return "room";
  return null;
}

/** Turn ranked ids into display cards, localized for the tenant: one small query for the winners. */
export async function toShortlist(ranked: Ranked[], lang: Locale, near?: string | null): Promise<ShortlistItem[]> {
  const picked = await db.listing.findMany({ where: { id: { in: ranked.map((r) => r.id) } }, select: DISPLAY_SELECT });
  const byId = new Map(picked.map((r) => [r.id, r]));
  const localized = await localizeListings(picked as unknown as Record<string, unknown>[], lang).catch(
    () => picked as unknown as Record<string, unknown>[],
  );
  const titleById = new Map(localized.map((l) => [l.id as number, (l.title as string | null) ?? null]));
  return ranked.flatMap((rk) => {
    const row = byId.get(rk.id);
    if (!row) return [];
    return [
      {
        id: row.id,
        // A lead has no public page; its card points at the broker's own ad.
        path: isLead(row) ? row.sourceUrl ?? "" : listingPath(lang, row),
        title: titleById.get(row.id) ?? row.title ?? "",
        photo: row.photoUrls[0] ?? null,
        district: row.location?.state ?? null,
        zone: row.location?.neighbourhood ?? row.location?.sector ?? null,
        homeType: homeTypeOf(row.propertyType),
        furnished: row.rentPeriod === "NIGHTLY" ? true : row.furnished,
        bedrooms: row.bedrooms,
        bathrooms: row.bathrooms,
        rating: row.averageRating,
        reviews: row.numberOfReviews,
        currency: row.currency,
        rentPeriod: row.rentPeriod,
        score: rk.score,
        reasons: rk.reasons,
        cost: rk.cost,
        duplicates: rk.duplicates,
        availability: rk.reasons.includes("confirmed") ? "confirmed" : "unconfirmed",
        ...(rk.mustHaves ? { mustHaves: rk.mustHaves } : {}),
        ...(rk.ask ? { ask: rk.ask } : {}),
        ...(near && rk.km != null ? { place: { name: near, km: rk.km } } : {}),
        ...(isLead(row)
          ? { lead: { handle: row.host.sourceHostId?.startsWith("tiktok:") ? row.host.sourceHostId.slice(7) : null, sourceUrl: row.sourceUrl } }
          : {}),
      } satisfies ShortlistItem,
    ];
  });
}
