import "server-only";

/**
 * The agent's database search: published Kigali homes that could satisfy the
 * requirements, loaded wide (price slack, nightly↔monthly conversion) so the
 * pure filters in rank.ts make the final call.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { listingPath } from "@/lib/listing-code";
import { localizeListings } from "@/components/translation/localize";
import type { Locale } from "@/components/internationalization/config";
import type { Requirements } from "./requirements";
import type { Candidate, Ranked } from "./rank";
import type { ShortlistItem } from "./types";

const MAX_CANDIDATES = 400;
/** Deepest monthly discount we assume when pre-filtering nightly homes for a monthly budget. */
const MAX_MONTHLY_DISCOUNT = 0.5;

const SELECT = {
  id: true,
  code: true,
  sourceListingId: true,
  hostId: true,
  title: true,
  pricePerNight: true,
  priceMonth: true,
  rentPeriod: true,
  currency: true,
  monthlyDiscount: true,
  cleaningFee: true,
  bedrooms: true,
  bathrooms: true,
  guestCount: true,
  photoUrls: true,
  averageRating: true,
  numberOfReviews: true,
  location: { select: { state: true, city: true, address: true, country: true } },
} satisfies Prisma.ListingSelect;

type Row = Prisma.ListingGetPayload<{ select: typeof SELECT }>;

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

export async function searchKigali(r: Requirements): Promise<{ rows: Row[]; candidates: Candidate[] }> {
  const where: Prisma.ListingWhereInput = {
    isPublished: true,
    draft: false,
    currency: "RWF",
    location: {
      city: { equals: "Kigali", mode: "insensitive" },
      ...(r.district ? { state: { equals: r.district, mode: "insensitive" } } : {}),
    },
    ...(r.bedrooms != null ? { bedrooms: { gte: r.bedrooms } } : {}),
    ...(r.stay === "short" ? { rentPeriod: "NIGHTLY" } : {}),
    ...priceWhere(r),
  };
  const rows = await db.listing.findMany({
    where,
    select: SELECT,
    orderBy: [{ averageRating: "desc" }, { numberOfReviews: "desc" }],
    take: MAX_CANDIDATES,
  });
  const candidates: Candidate[] = rows.map((row) => ({
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
    averageRating: row.averageRating,
    numberOfReviews: row.numberOfReviews,
    // Imports stamp lastAvailabilityConfirmedAt at scrape time, so it is not
    // a confirmation. Only a broker's answer (Phase 2) sets this.
    confirmedAt: null,
  }));
  return { rows, candidates };
}

/** Turn ranked ids back into display cards, localized for the tenant. */
export async function toShortlist(ranked: Ranked[], rows: Row[], lang: Locale): Promise<ShortlistItem[]> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const picked = ranked.map((r) => byId.get(r.id)).filter((r): r is Row => !!r);
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
        path: listingPath(lang, row),
        title: titleById.get(row.id) ?? row.title ?? "",
        photo: row.photoUrls[0] ?? null,
        district: row.location?.state ?? null,
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
      } satisfies ShortlistItem,
    ];
  });
}
