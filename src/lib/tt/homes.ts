/**
 * The homes on /tt — the page the TikTok profile's link opens (2026-11-07). The homes of today's and the
 * last 3 days' TikTok posts, newest post first, one card per home. The query takes the client so the
 * tests can hand it a fake; only the shape of the `where` and the dedupe matter.
 */
import { zoneLabel } from "@/lib/geo/kigali-zones";
import { districtName } from "@/lib/geo/rwanda-places";

/** Kigali is UTC+2 all year: "today" starts at its midnight. */
const KIGALI_MS = 2 * 3_600_000;
const DAY = 86_400_000;
export const TT_DAYS_BACK = 3;
export const TT_MAX_HOMES = 24;

/** The start of Kigali's day `back` days before `now`, as an instant. */
export function windowStart(now: number, back = TT_DAYS_BACK): Date {
  const local = now + KIGALI_MS;
  return new Date(local - (local % DAY) - back * DAY - KIGALI_MS);
}

export interface TtHome {
  id: number;
  /** The code a tenant sends: K<id>. */
  ref: string;
  title: string | null;
  photo: string;
  priceMonth: number;
  currency: string;
  bedrooms: number | null;
  place: { en: string | null; ar: string | null; rw: string | null };
  postedAt: Date;
}

interface PostRowT {
  listingId: number;
  postedAt: Date | null;
  listing: {
    id: number;
    title: string | null;
    photoUrls: string[];
    priceMonth: number | null;
    currency: string | null;
    bedrooms: number | null;
    lostAt: Date | null;
    location: { state: string | null; sector: string | null; neighbourhood: string | null } | null;
  } | null;
}

export interface TtDb {
  tikTokPost: { findMany(args: unknown): Promise<unknown[]> };
}

const placeIn = (l: PostRowT["listing"], lang: "en" | "ar" | "rw"): string | null => {
  if (!l) return null;
  const zone = zoneLabel(l.location?.neighbourhood ?? l.location?.sector ?? null, lang);
  if (zone) return zone;
  const district = (l.location?.state ?? "").toUpperCase();
  return district ? districtName(district, lang) || l.location?.state || null : null;
};

/** Posted homes of the window: still available, with a photo and a monthly price. */
export async function loadTtHomes(db: TtDb, now = Date.now()): Promise<TtHome[]> {
  const rows = (await db.tikTokPost.findMany({
    where: { status: "POSTED", postedAt: { gte: windowStart(now), lte: new Date(now) }, listing: { lostAt: null, rentPeriod: "MONTHLY", priceMonth: { not: null } } },
    orderBy: { postedAt: "desc" },
    take: 80,
    select: {
      listingId: true,
      postedAt: true,
      listing: {
        select: {
          id: true,
          title: true,
          photoUrls: true,
          priceMonth: true,
          currency: true,
          bedrooms: true,
          lostAt: true,
          location: { select: { state: true, sector: true, neighbourhood: true } },
        },
      },
    },
  })) as PostRowT[];

  const seen = new Set<number>();
  const out: TtHome[] = [];
  for (const r of rows) {
    const l = r.listing;
    if (!l || !r.postedAt || seen.has(l.id) || l.lostAt || !l.photoUrls?.[0] || !l.priceMonth) continue;
    seen.add(l.id);
    out.push({
      id: l.id,
      ref: `K${l.id}`,
      title: l.title,
      photo: l.photoUrls[0],
      priceMonth: l.priceMonth,
      currency: l.currency ?? "RWF",
      bedrooms: l.bedrooms,
      place: { en: placeIn(l, "en"), ar: placeIn(l, "ar"), rw: placeIn(l, "rw") },
      postedAt: r.postedAt,
    });
    if (out.length >= TT_MAX_HOMES) break;
  }
  return out;
}
