"use server";

import { Prisma, BookingStatus, VisitOutcome } from "@prisma/client";

import { auth, isAdminOrSuper } from "@/lib/auth";
import { db } from "@/lib/db";
import { ANALYTICS_EPOCH, clampToEpoch } from "@/lib/analytics/epoch";
import {
  type Period,
  type RangeKey,
  addDays,
  previousPeriod,
  percentChange,
  resolvePeriod,
} from "@/lib/analytics/period";
import {
  type Diagnosis,
  type FunnelCounts,
  type FunnelRates,
  computeRates,
  diagnose,
} from "@/lib/analytics/diagnose";
import { PHASE1 } from "@/config/phase-flags";

/**
 * Read side of the marketplace funnel.
 *
 * Everything here is admin-only and read-only. Aggregation happens in Postgres
 * rather than in JS: the event table is one row per visitor-day, so the counts
 * the dashboard needs are FILTER-ed aggregates over an indexed date column, and
 * pulling rows into the app to count them would scale with traffic instead of
 * with the number of buckets displayed.
 *
 * Note on "area": until zones exist (they are derived from coordinates, because
 * `Location.address` turned out to be a copy of the city name) this groups by
 * `Location.city` / `ListingEvent.cityKey`. That is honest but coarse — 66% of
 * inventory sits in one Khartoum bucket, so the area table will look lopsided
 * until zones land.
 */

async function requireAdminSession() {
  const session = await auth();
  if (!session?.user?.id || !isAdminOrSuper(session)) {
    throw new Error("Unauthorized");
  }
  return session;
}

// ── Row shapes returned by the raw aggregates ───────────────────────────────

// Postgres count()/sum() come back as bigint through the driver; the fallback
// row uses plain numbers, so both are accepted and normalised by n().
interface EventTotalsRow {
  view_visitor_days: bigint | number;
  raw_views: bigint | number;
  unique_visitors: bigint | number;
  inquiries: bigint | number;
}

interface AreaRow {
  area: string | null;
  views: bigint;
  inquiries: bigint;
}

interface DayRow {
  bucket: Date;
  views: bigint;
  inquiries: bigint;
}

interface ListingPerfRow {
  listingId: number;
  title: string | null;
  city: string | null;
  views: bigint;
  inquiries: bigint;
}

const n = (v: bigint | number | null | undefined): number => Number(v ?? 0);

// ── Public types ────────────────────────────────────────────────────────────

export interface AreaBreakdown {
  area: string;
  listings: number;
  views: number;
  inquiries: number;
  rentals: number;
}

export interface TrendPoint {
  /** ISO date (UTC) at the start of the bucket. */
  date: string;
  views: number;
  inquiries: number;
  visits: number;
  rentals: number;
}

export interface ListingPerformance {
  listingId: number;
  title: string | null;
  city: string | null;
  views: number;
  inquiries: number;
}

export interface MarketplaceAnalytics {
  period: { from: string; to: string; days: number; clamped: boolean; rangeKey: RangeKey };
  epoch: string;
  supply: {
    activeListings: number;
    newListings: number;
    staleListings: number;
    unclaimedImported: number;
    byPropertyType: { type: string; count: number }[];
  };
  demand: {
    views: number;
    rawViews: number;
    uniqueVisitors: number;
    inquiries: number;
  };
  counts: FunnelCounts;
  rates: FunnelRates;
  previousCounts: FunnelCounts;
  changes: {
    views: number | null;
    inquiries: number | null;
    visits: number | null;
    rentals: number | null;
  };
  transactions: {
    rentals: number;
    fromBookings: number;
    fromLeases: number;
    byListing: ListingPerformance[];
  };
  areas: AreaBreakdown[];
  trend: TrendPoint[];
  topListings: ListingPerformance[];
  zeroInquiryListings: ListingPerformance[];
  diagnosis: Diagnosis;
}

// ── Aggregates ──────────────────────────────────────────────────────────────

async function eventTotals(p: Period): Promise<EventTotalsRow> {
  const rows = await db.$queryRaw<EventTotalsRow[]>`
    SELECT
      count(*) FILTER (WHERE type = 'VIEW')                         AS view_visitor_days,
      coalesce(sum(hits) FILTER (WHERE type = 'VIEW'), 0)           AS raw_views,
      count(DISTINCT "visitorHash") FILTER (WHERE type = 'VIEW')    AS unique_visitors,
      -- ListingEventType is a Postgres enum, so it must be cast before LIKE.
      count(*) FILTER (WHERE type::text LIKE 'CONTACT%')            AS inquiries
    FROM "ListingEvent"
    WHERE day >= ${p.from} AND day < ${p.to}`;
  return rows[0] ?? { view_visitor_days: 0, raw_views: 0, unique_visitors: 0, inquiries: 0 };
}

async function completedVisits(p: Period): Promise<number> {
  // A funnel "visit" is one that actually happened, not one that was pencilled in.
  return db.listingVisit.count({
    where: { outcome: VisitOutcome.Completed, occurredAt: { gte: p.from, lt: p.to } },
  });
}

async function completedRentals(p: Period): Promise<{ total: number; bookings: number; leases: number }> {
  // Epoch-clamped: everything before instrumentation went live is seed data.
  const floor = p.from > ANALYTICS_EPOCH ? p.from : ANALYTICS_EPOCH;

  const [bookings, leases] = await Promise.all([
    db.booking.count({
      where: { status: BookingStatus.Completed, checkedOutAt: { gte: floor, lt: p.to } },
    }),
    db.lease.count({ where: { createdAt: { gte: floor, lt: p.to } } }),
  ]);

  return { total: bookings + leases, bookings, leases };
}

async function funnelCounts(p: Period, activeListings: number): Promise<FunnelCounts> {
  const [totals, visits, rentals] = await Promise.all([
    eventTotals(p),
    completedVisits(p),
    completedRentals(p),
  ]);

  return {
    listings: activeListings,
    views: n(totals.view_visitor_days),
    inquiries: n(totals.inquiries),
    visits,
    rentals: rentals.total,
  };
}

async function areaRows(p: Period): Promise<AreaRow[]> {
  return db.$queryRaw<AreaRow[]>`
    SELECT
      "cityKey"                                          AS area,
      count(*) FILTER (WHERE type = 'VIEW')              AS views,
      count(*) FILTER (WHERE type::text LIKE 'CONTACT%') AS inquiries
    FROM "ListingEvent"
    WHERE day >= ${p.from} AND day < ${p.to}
    GROUP BY "cityKey"`;
}

async function listingsByArea(): Promise<{ area: string | null; listings: bigint }[]> {
  return db.$queryRaw<{ area: string | null; listings: bigint }[]>`
    SELECT l.city AS area, count(li.id) AS listings
    FROM "Listing" li
    JOIN "Location" l ON l.id = li."locationId"
    WHERE li."isPublished" AND NOT li.draft
    GROUP BY l.city`;
}

async function rentalsByArea(p: Period): Promise<{ area: string | null; rentals: bigint }[]> {
  const floor = p.from > ANALYTICS_EPOCH ? p.from : ANALYTICS_EPOCH;
  return db.$queryRaw<{ area: string | null; rentals: bigint }[]>`
    SELECT l.city AS area, count(b.id) AS rentals
    FROM "Booking" b
    JOIN "Listing" li ON li.id = b."listingId"
    JOIN "Location" l ON l.id = li."locationId"
    WHERE b.status = 'Completed'
      AND b."checkedOutAt" >= ${floor} AND b."checkedOutAt" < ${p.to}
    GROUP BY l.city`;
}

async function dailySeries(p: Period): Promise<DayRow[]> {
  return db.$queryRaw<DayRow[]>`
    SELECT
      day                                                AS bucket,
      count(*) FILTER (WHERE type = 'VIEW')              AS views,
      count(*) FILTER (WHERE type::text LIKE 'CONTACT%') AS inquiries
    FROM "ListingEvent"
    WHERE day >= ${p.from} AND day < ${p.to}
    GROUP BY day
    ORDER BY day`;
}

async function listingPerformance(p: Period): Promise<ListingPerfRow[]> {
  return db.$queryRaw<ListingPerfRow[]>`
    SELECT
      e."listingId"                                        AS "listingId",
      li.title                                             AS title,
      l.city                                               AS city,
      count(*) FILTER (WHERE e.type = 'VIEW')              AS views,
      count(*) FILTER (WHERE e.type::text LIKE 'CONTACT%') AS inquiries
    FROM "ListingEvent" e
    JOIN "Listing" li ON li.id = e."listingId"
    LEFT JOIN "Location" l ON l.id = li."locationId"
    WHERE e.day >= ${p.from} AND e.day < ${p.to}
    GROUP BY e."listingId", li.title, l.city
    ORDER BY views DESC`;
}

/** Fills gaps so the chart shows a flat line on quiet days rather than skipping them. */
function buildTrend(rows: DayRow[], p: Period): TrendPoint[] {
  const byDate = new Map<string, DayRow>();
  for (const r of rows) byDate.set(new Date(r.bucket).toISOString().slice(0, 10), r);

  const out: TrendPoint[] = [];
  for (let d = new Date(p.from); d < p.to; d = addDays(d, 1)) {
    const key = d.toISOString().slice(0, 10);
    const row = byDate.get(key);
    out.push({
      date: key,
      views: n(row?.views),
      inquiries: n(row?.inquiries),
      // Visits and rentals are low-volume by nature; they are shown as period
      // totals rather than a daily series that would be all zeros.
      visits: 0,
      rentals: 0,
    });
  }
  return out;
}

// ── Entry point ─────────────────────────────────────────────────────────────

export async function getMarketplaceAnalytics(input: {
  range?: string;
  from?: string;
  to?: string;
}): Promise<MarketplaceAnalytics> {
  await requireAdminSession();

  const { period: requested, rangeKey } = resolvePeriod(input ?? {});
  const { from, clamped } = clampToEpoch(requested.from);
  // Only transaction metrics are clamped; views and supply keep the full window.
  const period: Period = requested;
  const prev = previousPeriod(period);

  const staleBefore = addDays(new Date(), -PHASE1.availabilityReminderDays);
  const livePredicate = { isPublished: true, draft: false } as const;

  const [
    activeListings,
    newListings,
    staleListings,
    unclaimedImported,
    byType,
    totals,
    perf,
    areas,
    listingsPerArea,
    rentalsPerArea,
    series,
    rentals,
  ] = await Promise.all([
    db.listing.count({ where: livePredicate }),
    db.listing.count({ where: { ...livePredicate, createdAt: { gte: period.from, lt: period.to } } }),
    db.listing.count({
      where: {
        ...livePredicate,
        OR: [{ lastAvailabilityConfirmedAt: null }, { lastAvailabilityConfirmedAt: { lt: staleBefore } }],
      },
    }),
    db.listing.count({ where: { ...livePredicate, source: { not: null }, claimedAt: null } }),
    db.listing.groupBy({ by: ["propertyType"], where: livePredicate, _count: { _all: true } }),
    eventTotals(period),
    listingPerformance(period),
    areaRows(period),
    listingsByArea(),
    rentalsByArea(period),
    dailySeries(period),
    completedRentals(period),
  ]);

  const [counts, previousCounts] = await Promise.all([
    funnelCounts(period, activeListings),
    funnelCounts(prev, activeListings),
  ]);

  // Merge the three per-area sources into one table.
  const areaMap = new Map<string, AreaBreakdown>();
  const ensure = (key: string | null): AreaBreakdown => {
    const area = key?.trim() || "—";
    if (!areaMap.has(area)) areaMap.set(area, { area, listings: 0, views: 0, inquiries: 0, rentals: 0 });
    return areaMap.get(area)!;
  };
  for (const r of listingsPerArea) ensure(r.area).listings = n(r.listings);
  for (const r of areas) {
    const row = ensure(r.area);
    row.views = n(r.views);
    row.inquiries = n(r.inquiries);
  }
  for (const r of rentalsPerArea) ensure(r.area).rentals = n(r.rentals);

  const perfRows: ListingPerformance[] = perf.map((r) => ({
    listingId: r.listingId,
    title: r.title,
    city: r.city,
    views: n(r.views),
    inquiries: n(r.inquiries),
  }));

  return {
    period: {
      from: period.from.toISOString(),
      to: period.to.toISOString(),
      days: period.days,
      clamped,
      rangeKey,
    },
    epoch: ANALYTICS_EPOCH.toISOString(),
    supply: {
      activeListings,
      newListings,
      staleListings,
      unclaimedImported,
      byPropertyType: byType
        .map((t) => ({ type: t.propertyType ?? "Unknown", count: t._count._all }))
        .sort((a, b) => b.count - a.count),
    },
    demand: {
      views: n(totals.view_visitor_days),
      rawViews: n(totals.raw_views),
      uniqueVisitors: n(totals.unique_visitors),
      inquiries: n(totals.inquiries),
    },
    counts,
    rates: computeRates(counts),
    previousCounts,
    changes: {
      views: percentChange(counts.views, previousCounts.views),
      inquiries: percentChange(counts.inquiries, previousCounts.inquiries),
      visits: percentChange(counts.visits, previousCounts.visits),
      rentals: percentChange(counts.rentals, previousCounts.rentals),
    },
    transactions: {
      rentals: rentals.total,
      fromBookings: rentals.bookings,
      fromLeases: rentals.leases,
      byListing: perfRows.slice(0, 10),
    },
    areas: [...areaMap.values()].sort((a, b) => b.views - a.views || b.listings - a.listings),
    trend: buildTrend(series, period),
    topListings: perfRows.slice(0, 10),
    // The "many eyes, no contact" list — the single most actionable table on
    // the page, because each row is one listing a human can go fix today.
    zeroInquiryListings: perfRows.filter((r) => r.inquiries === 0 && r.views > 0).slice(0, 10),
    diagnosis: diagnose(counts),
  };
}
