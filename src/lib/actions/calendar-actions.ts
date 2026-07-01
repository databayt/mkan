"use server";

import { z } from "zod";
import { auth, canOverride } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateTag } from "next/cache";
import { BookingStatus } from "@prisma/client";
import { logger } from "@/lib/logger";
import { assertRateLimit } from "@/lib/rate-limit";

// ============================================
// Multicalendar — the host availability + pricing grid (Airbnb /multicalendar).
// Rows are the host's listings, columns are nights. Each night derives its
// state from three sources, in priority order:
//   1. Booking (Confirmed/Pending) covering the night  → "reserved"
//   2. BlockedDate covering the night                   → "blocked"
//   3. otherwise                                        → "open"
// and its price from the most recent SeasonalPricing row covering the night,
// falling back to the listing's base pricePerNight.
// ============================================

// ---------- helpers ----------

/** Local midnight of a date, as a NEW Date (never mutate the input — see the
 *  date-mutation gotcha: Prisma filters reuse the object). */
function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

/** [aStart,aEnd) minus [bStart,bEnd) → up to two remainder intervals. Used to
 *  "punch a hole" in an existing blocked/priced range when the host edits a
 *  sub-range, so we never lose the untouched parts. */
function subtractRange(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): Array<{ startDate: Date; endDate: Date }> {
  const out: Array<{ startDate: Date; endDate: Date }> = [];
  if (aStart < bStart) out.push({ startDate: aStart, endDate: new Date(Math.min(+aEnd, +bStart)) });
  if (aEnd > bEnd) out.push({ startDate: new Date(Math.max(+aStart, +bEnd)), endDate: aEnd });
  return out.filter((r) => r.endDate > r.startDate);
}

// ---------- schemas ----------

const windowSchema = z.object({
  start: z.coerce.date(),
  end: z.coerce.date(),
  focusId: z.number().int().positive().optional(),
});

const setAvailabilitySchema = z
  .object({
    listingId: z.number().int().positive(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    blocked: z.boolean(),
  })
  .refine((d) => d.endDate > d.startDate, { message: "endDate must be after startDate" });

const setPriceSchema = z
  .object({
    listingId: z.number().int().positive(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    price: z.number().min(0).max(1_000_000),
  })
  .refine((d) => d.endDate > d.startDate, { message: "endDate must be after startDate" });

// ---------- types ----------

export interface CalendarBooking {
  id: number;
  checkIn: string;
  checkOut: string;
  status: string;
  guestName: string;
  guestImage: string | null;
  guestCount: number;
  nights: number;
  totalPrice: number;
}

export interface CalendarListing {
  id: number;
  title: string;
  photo: string | null;
  basePrice: number;
  minStay: number;
  isPublished: boolean;
  bookings: CalendarBooking[];
  blocked: Array<{ id: number; startDate: string; endDate: string }>;
  pricing: Array<{ startDate: string; endDate: string; price: number }>;
}

export interface MulticalendarData {
  listings: CalendarListing[];
  focusId: number | null;
}

// ---------- read ----------

export async function getMulticalendar(input: unknown): Promise<MulticalendarData> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("You must be logged in to view the calendar");

  const parsed = windowSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid calendar window");

  const start = startOfDay(parsed.data.start);
  const end = startOfDay(parsed.data.end);

  // Always scoped to the signed-in host's own listings (session-tenant binding).
  const listings = await db.listing.findMany({
    where: { hostId: session.user.id },
    select: {
      id: true,
      title: true,
      photoUrls: true,
      pricePerNight: true,
      minStay: true,
      isPublished: true,
      bookings: {
        where: {
          status: { in: [BookingStatus.Confirmed, BookingStatus.Pending] },
          checkIn: { lt: end },
          checkOut: { gt: start },
        },
        select: {
          id: true,
          checkIn: true,
          checkOut: true,
          status: true,
          guestCount: true,
          nightsCount: true,
          totalPrice: true,
          guest: { select: { username: true, image: true } },
        },
        orderBy: { checkIn: "asc" },
      },
      blockedDates: {
        where: { startDate: { lt: end }, endDate: { gt: start } },
        select: { id: true, startDate: true, endDate: true },
      },
      seasonalPricing: {
        where: { startDate: { lt: end }, endDate: { gt: start } },
        select: { startDate: true, endDate: true, pricePerNight: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  return {
    focusId: parsed.data.focusId ?? null,
    listings: listings.map((l) => ({
      id: l.id,
      title: l.title ?? "Untitled",
      photo: l.photoUrls?.[0] ?? null,
      basePrice: l.pricePerNight ?? 0,
      minStay: l.minStay ?? 1,
      isPublished: l.isPublished,
      bookings: l.bookings.map((b) => ({
        id: b.id,
        checkIn: b.checkIn.toISOString(),
        checkOut: b.checkOut.toISOString(),
        status: b.status,
        guestName: b.guest.username ?? "Guest",
        guestImage: b.guest.image ?? null,
        guestCount: b.guestCount,
        nights: b.nightsCount,
        totalPrice: b.totalPrice,
      })),
      blocked: l.blockedDates.map((d) => ({
        id: d.id,
        startDate: d.startDate.toISOString(),
        endDate: d.endDate.toISOString(),
      })),
      pricing: l.seasonalPricing.map((p) => ({
        startDate: p.startDate.toISOString(),
        endDate: p.endDate.toISOString(),
        price: p.pricePerNight,
      })),
    })),
  };
}

// ---------- write: availability (block / open a night range) ----------

type WriteResult = { ok: true } | { ok: false; error: string };

async function assertOwnsListing(
  session: Parameters<typeof canOverride>[0],
  listingId: number,
): Promise<WriteResult> {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { hostId: true },
  });
  if (!listing) return { ok: false, error: "Listing not found" };
  if (!canOverride(session, listing.hostId)) return { ok: false, error: "Only the host can edit this calendar" };
  return { ok: true };
}

export async function setAvailability(input: unknown): Promise<WriteResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Unauthenticated" };

  const parsed = setAvailabilitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid availability data" };

  const { listingId, blocked } = parsed.data;
  const start = startOfDay(parsed.data.startDate);
  const end = startOfDay(parsed.data.endDate);

  await assertRateLimit("mutation", `calendar:${session.user.id}`);
  const owns = await assertOwnsListing(session, listingId);
  if (!owns.ok) return owns;

  try {
    if (blocked) {
      // Reserved nights can't be blocked — overlap guard mirrors createBooking.
      const conflict = await db.booking.findFirst({
        where: {
          listingId,
          status: { in: [BookingStatus.Confirmed, BookingStatus.Pending] },
          AND: [{ checkIn: { lt: end } }, { checkOut: { gt: start } }],
        },
        select: { id: true },
      });
      if (conflict) return { ok: false, error: "Those nights are reserved" };

      await db.blockedDate.create({ data: { listingId, startDate: start, endDate: end } });
    } else {
      // Open: punch [start,end) out of every overlapping blocked range.
      const overlapping = await db.blockedDate.findMany({
        where: { listingId, startDate: { lt: end }, endDate: { gt: start } },
        select: { id: true, startDate: true, endDate: true, reason: true },
      });
      await db.$transaction([
        db.blockedDate.deleteMany({ where: { id: { in: overlapping.map((o) => o.id) } } }),
        ...overlapping.flatMap((o) =>
          subtractRange(o.startDate, o.endDate, start, end).map((r) =>
            db.blockedDate.create({
              data: { listingId, startDate: r.startDate, endDate: r.endDate, reason: o.reason },
            }),
          ),
        ),
      ]);
    }

    updateTag("listings");
    return { ok: true };
  } catch (error) {
    logger.error("setAvailability failed", { listingId, error: String(error) });
    return { ok: false, error: "Could not update availability" };
  }
}

// ---------- write: price (set nightly price for a night range) ----------

export async function setPrice(input: unknown): Promise<WriteResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Unauthenticated" };

  const parsed = setPriceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid price data" };

  const { listingId, price } = parsed.data;
  const start = startOfDay(parsed.data.startDate);
  const end = startOfDay(parsed.data.endDate);

  await assertRateLimit("mutation", `calendar:${session.user.id}`);
  const owns = await assertOwnsListing(session, listingId);
  if (!owns.ok) return owns;

  try {
    // Punch the existing seasonal-pricing ranges so the new one is authoritative
    // for [start,end), preserving the untouched remainders.
    const overlapping = await db.seasonalPricing.findMany({
      where: { listingId, startDate: { lt: end }, endDate: { gt: start } },
      select: { id: true, startDate: true, endDate: true, name: true, pricePerNight: true, minStay: true },
    });
    await db.$transaction([
      db.seasonalPricing.deleteMany({ where: { id: { in: overlapping.map((o) => o.id) } } }),
      ...overlapping.flatMap((o) =>
        subtractRange(o.startDate, o.endDate, start, end).map((r) =>
          db.seasonalPricing.create({
            data: {
              listingId,
              startDate: r.startDate,
              endDate: r.endDate,
              pricePerNight: o.pricePerNight,
              name: o.name,
              minStay: o.minStay,
            },
          }),
        ),
      ),
      db.seasonalPricing.create({
        data: { listingId, startDate: start, endDate: end, pricePerNight: price },
      }),
    ]);

    updateTag("listings");
    return { ok: true };
  } catch (error) {
    logger.error("setPrice failed", { listingId, error: String(error) });
    return { ok: false, error: "Could not update price" };
  }
}
