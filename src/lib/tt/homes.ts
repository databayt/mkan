/**
 * The homes on /tt — the page the TikTok profile's link opens (2026-11-07). The homes of today's and the
 * last 3 days' TikTok posts, newest post first, one card per home.
 *
 * Two queries, the posts and then their homes: TikTokPost carries only `listingId`, no relation to
 * Listing, so a `listing` filter on the post query is refused by Prisma before it reaches the database.
 * Until 2026-11-08 that refusal was caught and every TikTok viewer saw "new homes are posted every day"
 * over 13 posted homes. Both argument objects are checked against Prisma's own types, so tsc refuses a
 * field the model does not have; the query takes the client so the tests can hand it a fake.
 */
import type { Prisma } from "@prisma/client";
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

/** The window's posts, newest first: only which home each one showed, and when. */
export const ttPostArgs = (now: number) =>
  ({
    where: { status: "POSTED", postedAt: { gte: windowStart(now), lte: new Date(now) } },
    orderBy: { postedAt: "desc" },
    take: 80,
    select: { listingId: true, postedAt: true },
  }) satisfies Prisma.TikTokPostFindManyArgs;

const TT_LISTING_SELECT = {
  id: true,
  title: true,
  photoUrls: true,
  priceMonth: true,
  currency: true,
  bedrooms: true,
  lostAt: true,
  // "Today on Mkan" shows the home's video poster (2026-11-15); /tt keeps reading photoUrls.
  videoUrl: true,
  videoPosterUrl: true,
  location: { select: { state: true, sector: true, neighbourhood: true } },
} satisfies Prisma.ListingSelect;

/** Those posts' homes that are still on the market, by the month, with a price. */
export const ttListingArgs = (ids: number[]) =>
  ({
    where: { id: { in: ids }, lostAt: null, rentPeriod: "MONTHLY", priceMonth: { not: null } },
    select: TT_LISTING_SELECT,
  }) satisfies Prisma.ListingFindManyArgs;

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
}

interface ListingRowT {
  id: number;
  title: string | null;
  photoUrls: string[];
  priceMonth: number | null;
  currency: string | null;
  bedrooms: number | null;
  lostAt: Date | null;
  videoUrl?: string | null;
  videoPosterUrl?: string | null;
  location: { state: string | null; sector: string | null; neighbourhood: string | null } | null;
}

/** The two reads the page needs; the arguments are Prisma's, so the real client and a test fake both fit. */
export interface TtDb {
  tikTokPost: { findMany(args: ReturnType<typeof ttPostArgs>): Promise<PostRowT[]> };
  listing: { findMany(args: ReturnType<typeof ttListingArgs>): Promise<ListingRowT[]> };
}

const placeIn = (l: ListingRowT, lang: "en" | "ar" | "rw"): string | null => {
  const zone = zoneLabel(l.location?.neighbourhood ?? l.location?.sector ?? null, lang);
  if (zone) return zone;
  const district = (l.location?.state ?? "").toUpperCase();
  return district ? districtName(district, lang) || l.location?.state || null : null;
};

/** Posted homes of the window: still available, with a photo and a monthly price. */
export async function loadTtHomes(db: TtDb, now = Date.now()): Promise<TtHome[]> {
  const posts = await db.tikTokPost.findMany(ttPostArgs(now));
  const ids = [...new Set(posts.map((p) => p.listingId))];
  if (ids.length === 0) return [];
  const homes = new Map((await db.listing.findMany(ttListingArgs(ids))).map((l) => [l.id, l]));

  const seen = new Set<number>();
  const out: TtHome[] = [];
  for (const p of posts) {
    const l = homes.get(p.listingId);
    if (!l || !p.postedAt || seen.has(l.id) || l.lostAt || !l.photoUrls?.[0] || !l.priceMonth) continue;
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
      postedAt: p.postedAt,
    });
    if (out.length >= TT_MAX_HOMES) break;
  }
  return out;
}

// ── Today on Mkan (2026-11-15) ───────────────────────────────────────────────
// The homes @mkan.rw posted on one Kigali day, in post order — the source of /today, the homepage strip,
// the day's note and the chatbots' "today". Same two queries as /tt (posts, then their homes), same
// rule: a home a broker said is taken (`lostAt`) drops out.

/** The Kigali day (YYYY-MM-DD) an instant falls on. */
export function kigaliDay(now: number): string {
  return new Date(now + KIGALI_MS).toISOString().slice(0, 10);
}

/** A well-formed YYYY-MM-DD that is a real calendar day. */
export function isDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

/** The instant a Kigali day starts (its midnight, UTC+2). */
export function dayStart(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) - KIGALI_MS);
}

/** The Kigali day `back` days before `day`. */
export function dayBefore(day: string, back = 1): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - back * DAY).toISOString().slice(0, 10);
}

/** One Kigali day's posts, in the order they went up. */
export const dayPostArgs = (day: string) =>
  ({
    where: { status: "POSTED", postedAt: { gte: dayStart(day), lt: new Date(dayStart(day).getTime() + DAY) } },
    orderBy: { postedAt: "asc" },
    take: 40,
    select: { listingId: true, postedAt: true },
  }) satisfies Prisma.TikTokPostFindManyArgs;

/** The last 7 days' posting times, for the archive's list of days that have homes. */
export const postedDaysArgs = (now: number) =>
  ({
    where: { status: "POSTED", postedAt: { gte: windowStart(now, 6), lte: new Date(now) } },
    orderBy: { postedAt: "desc" },
    take: 200,
    select: { listingId: true, postedAt: true },
  }) satisfies Prisma.TikTokPostFindManyArgs;

export interface TodayHome {
  id: number;
  /** The code a tenant sends: K<id>. */
  ref: string;
  title: string | null;
  priceMonth: number;
  currency: string;
  bedrooms: number | null;
  place: { en: string | null; ar: string | null; rw: string | null };
  photo: string | null;
  videoUrl: string | null;
  videoPosterUrl: string | null;
  postedAt: Date;
}

export interface TodayDb {
  tikTokPost: { findMany(args: Prisma.TikTokPostFindManyArgs): Promise<PostRowT[]> };
  listing: { findMany(args: ReturnType<typeof ttListingArgs>): Promise<ListingRowT[]> };
}

function toTodayHome(l: ListingRowT, postedAt: Date): TodayHome {
  return {
    id: l.id,
    ref: `K${l.id}`,
    title: l.title,
    priceMonth: l.priceMonth!,
    currency: l.currency ?? "RWF",
    bedrooms: l.bedrooms,
    place: { en: placeIn(l, "en"), ar: placeIn(l, "ar"), rw: placeIn(l, "rw") },
    photo: l.photoUrls?.[0] ?? null,
    videoUrl: l.videoUrl ?? null,
    videoPosterUrl: l.videoPosterUrl ?? null,
    postedAt,
  };
}

/** Posts → homes in post order, once per home, those still on the market with a monthly price and something to show. */
function homesOf(posts: PostRowT[], listings: ListingRowT[]): TodayHome[] {
  const byId = new Map(listings.map((l) => [l.id, l]));
  const seen = new Set<number>();
  const out: TodayHome[] = [];
  for (const p of posts) {
    const l = byId.get(p.listingId);
    if (!l || !p.postedAt || seen.has(l.id) || l.lostAt || !l.priceMonth) continue;
    if (!l.videoPosterUrl && !l.videoUrl && !l.photoUrls?.[0]) continue;
    seen.add(l.id);
    out.push(toTodayHome(l, p.postedAt));
  }
  return out;
}

/** The homes posted on one Kigali day, in post order. */
export async function todayPosts(db: TodayDb, day: string): Promise<TodayHome[]> {
  const posts = await db.tikTokPost.findMany(dayPostArgs(day));
  const ids = [...new Set(posts.map((p) => p.listingId))];
  if (ids.length === 0) return [];
  return homesOf(posts, await db.listing.findMany(ttListingArgs(ids)));
}

export interface LatestDay {
  day: string;
  /** True when `day` is the Kigali day of `now`: the caller says "yesterday's" / "from {date}" when it is not. */
  isToday: boolean;
  homes: TodayHome[];
}

/**
 * The most recent day in the /tt window (today and the 3 days before) that still has a home to show —
 * today's when it has any, else the latest before it. Two queries, like /tt, whatever the days.
 */
export async function latestDay(db: TodayDb, now = Date.now()): Promise<LatestDay | null> {
  const posts = (await db.tikTokPost.findMany(ttPostArgs(now))).filter((p) => p.postedAt);
  const ids = [...new Set(posts.map((p) => p.listingId))];
  if (ids.length === 0) return null;
  const listings = await db.listing.findMany(ttListingArgs(ids));
  const days = [...new Set(posts.map((p) => kigaliDay(p.postedAt!.getTime())))].sort().reverse();
  for (const day of days) {
    const of = posts.filter((p) => kigaliDay(p.postedAt!.getTime()) === day).sort((a, b) => a.postedAt!.getTime() - b.postedAt!.getTime());
    const homes = homesOf(of, listings);
    if (homes.length > 0) return { day, isToday: day === kigaliDay(now), homes };
  }
  return null;
}

/** The Kigali days of the last week that have a posted home, newest first (the archive's list). */
export async function postedDays(db: TodayDb, now = Date.now()): Promise<string[]> {
  const posts = (await db.tikTokPost.findMany(postedDaysArgs(now))).filter((p) => p.postedAt);
  return [...new Set(posts.map((p) => kigaliDay(p.postedAt!.getTime())))].sort().reverse();
}

/** Whether a day is inside the archive: today and the 6 days before. */
export function inArchive(day: string, now = Date.now()): boolean {
  return isDay(day) && day <= kigaliDay(now) && day >= dayBefore(kigaliDay(now), 6);
}
