'use server';

import { z } from 'zod';
import { auth, canOverride } from '@/lib/auth';
import { assertRateLimit, RateLimitError } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { BusAmenity, Prisma, SeatStatus, TransportBookingStatus } from '@prisma/client';
import { revalidatePath, updateTag, unstable_cache } from 'next/cache';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { startOfDay, endOfDay } from 'date-fns';

/**
 * Compute the [start, end) UTC bounds of a calendar day in Sudan's timezone.
 * Critical: a user searching "2026-04-25" expects Khartoum midnight, not
 * UTC midnight. `setHours(0,0,0,0)` runs in the server's local zone —
 * correct in dev (often Asia/Amman = UTC+3), broken on Vercel (UTC).
 */
const MARKET_TZ = 'Africa/Khartoum';
function dayWindow(input: Date | string): { gte: Date; lt: Date } {
  const zoned = toZonedTime(new Date(input), MARKET_TZ);
  const gte = fromZonedTime(startOfDay(zoned), MARKET_TZ);
  const lt = fromZonedTime(endOfDay(zoned), MARKET_TZ);
  return { gte, lt };
}
import {
  transportOfficeDraftSchema,
  transportOfficeSchema,
  busSchema,
  routeSchema,
  tripSchema,
  bookingSchema as transportBookingSchema,
  paymentSchema as transportPaymentSchema,
} from '@/lib/schemas/travel-schemas';
import type {
  TransportOfficeFormData,
  TransportOfficeDraftData,
  BusFormData,
  RouteFormData,
  TripFormData,
  BookingFormData,
  PaymentFormData,
} from '@/lib/schemas/travel-schemas';
import { sanitizeInput, sanitizeEmail, sanitizePhone } from "@/lib/sanitization";
import { logger } from "@/lib/logger";
import { getStripe } from "@/lib/stripe";
import { sendBookingConfirmationEmail } from "@/lib/mail";
import { createHmac, timingSafeEqual } from "crypto";

const idSchema = z.number().int().positive();

// ============================================
// TICKET SIGNING (HMAC-SHA256)
// ============================================
// QR payloads carry an HMAC so a gate agent's scan proves the ticket was
// issued by us — plain-JSON QRs could be typed up by anyone. The secret
// falls back to NEXTAUTH_SECRET so signing works without extra env setup.

function ticketSecret(): string {
  const secret = process.env.TICKET_QR_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('Ticket signing secret is not configured');
  return secret;
}

function ticketSignature(ref: string, seat: string): string {
  return createHmac('sha256', ticketSecret())
    .update(`MKAN-TKT|${ref}|${seat}`)
    .digest('base64url');
}

/** Signed QR payload for one booking (seat '' = whole-booking ticket). */
function buildSignedQrPayload(ref: string, seat = ''): string {
  return JSON.stringify({ v: 1, ref, ...(seat ? { seat } : {}), sig: ticketSignature(ref, seat) });
}

function verifyQrSignature(ref: string, seat: string, sig: string): boolean {
  try {
    const expected = Buffer.from(ticketSignature(ref, seat));
    const actual = Buffer.from(String(sig));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

// ============================================
// SEAT GRID GENERATION
// ============================================
// Bus.seatLayout (JSON, optional) drives the grid when present:
//   { "rows": 12, "columns": 4, "blocked": ["A1"] }
// Anything missing or malformed falls back to the classic 4-across layout.

type ParsedSeatLayout = { rows: number; columns: number; blocked: Set<string> };

function parseSeatLayout(seatLayout: unknown, capacity: number): ParsedSeatLayout {
  const fallback: ParsedSeatLayout = {
    rows: Math.ceil(capacity / 4),
    columns: 4,
    blocked: new Set<string>(),
  };
  if (!seatLayout || typeof seatLayout !== 'object') return fallback;
  const layout = seatLayout as { rows?: unknown; columns?: unknown; blocked?: unknown };
  const columns = Number(layout.columns);
  const rows = Number(layout.rows);
  if (!Number.isInteger(columns) || columns < 2 || columns > 6) return fallback;
  const effectiveRows =
    Number.isInteger(rows) && rows > 0 ? rows : Math.ceil(capacity / columns);
  const blocked = new Set<string>(
    Array.isArray(layout.blocked) ? layout.blocked.filter((b): b is string => typeof b === 'string') : [],
  );
  return { rows: effectiveRows, columns, blocked };
}

function buildSeatRows(tripId: number, capacity: number, seatLayout: unknown) {
  const { rows, columns, blocked } = parseSeatLayout(seatLayout, capacity);
  const seats: Array<{
    tripId: number;
    seatNumber: string;
    row: number;
    column: number;
    seatType: string;
    status: 'Available' | 'Blocked';
  }> = [];
  let available = 0;
  for (let row = 1; row <= rows && available < capacity; row++) {
    for (let col = 1; col <= columns && available < capacity; col++) {
      const seatNumber = `${String.fromCharCode(64 + row)}${col}`;
      const isBlocked = blocked.has(seatNumber);
      const seatType =
        col === 1 || col === columns ? 'window' : columns > 3 && col === 2 ? 'aisle' : 'middle';
      seats.push({
        tripId,
        seatNumber,
        row,
        column: col,
        seatType,
        status: isBlocked ? 'Blocked' : 'Available',
      });
      if (!isBlocked) available++;
    }
  }
  return seats;
}

// Cache tags for transport-wide reactive invalidation
const TAG_ASSEMBLY_POINTS = 'transport:assembly-points';
const TAG_CITIES = 'transport:cities';
const TAG_POPULAR_ROUTES = 'transport:popular-routes';
const TAG_TRIPS = 'transport:trips';

// ============================================
// ASSEMBLY POINT ACTIONS
// ============================================

export const getAssemblyPoints = unstable_cache(
  async (city?: string) => {
    try {
      const where = city ? { city, isActive: true } : { isActive: true };

      const assemblyPoints = await db.assemblyPoint.findMany({
        where,
        orderBy: { name: 'asc' },
      });

      return assemblyPoints;
    } catch (error) {
      logger.error('Failed to fetch assembly points', { error });
      return [];
    }
  },
  ['transport:getAssemblyPoints'],
  { tags: [TAG_ASSEMBLY_POINTS], revalidate: 3600 },
);

export const getCities = unstable_cache(
  async () => {
    const cities = await db.assemblyPoint.findMany({
      where: { isActive: true },
      select: { city: true },
      distinct: ['city'],
      orderBy: { city: 'asc' },
    });
    return cities.map((c) => c.city);
  },
  ['transport:getCities'],
  { tags: [TAG_CITIES], revalidate: 3600 },
);

// ============================================
// TRANSPORT OFFICE ACTIONS
// ============================================

export async function createTransportOffice(data: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await assertRateLimit('mutation', `travel-office-create:${session.user.id}`);

  const parsed = transportOfficeDraftSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Invalid office data');
  }

  const d = { ...parsed.data };

  // Sanitize inputs
  if (d.name) d.name = sanitizeInput(d.name);
  if (d.nameAr) d.nameAr = sanitizeInput(d.nameAr);
  if (d.description) d.description = sanitizeInput(d.description);
  if (d.descriptionAr) d.descriptionAr = sanitizeInput(d.descriptionAr);
  if (d.phone) d.phone = sanitizePhone(d.phone);
  if (d.email) d.email = sanitizeEmail(d.email);

  const office = await db.transportOffice.create({
    data: {
      name: d.name,
      nameAr: d.nameAr || null,
      description: d.description || null,
      descriptionAr: d.descriptionAr || null,
      phone: d.phone || '',
      email: d.email || '',
      licenseNumber: d.licenseNumber || null,
      assemblyPointId: d.assemblyPointId || null,
      logoUrl: d.logoUrl || null,
      ownerId: session.user.id,
      isActive: false,
    },
  });

  revalidatePath('/[lang]/travel-host');
  return { success: true, office };
}

export async function updateTransportOffice(
  id: unknown,
  data: unknown
) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await assertRateLimit('mutation', `travel-office-update:${session.user.id}`);

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error('Invalid office ID');
  }

  const parsed = transportOfficeSchema.partial().safeParse(data);
  if (!parsed.success) {
    throw new Error('Invalid office data');
  }

  // Verify ownership
  const existing = await db.transportOffice.findUnique({
    where: { id: parsedId.data },
    select: { ownerId: true },
  });

  if (!existing || !canOverride(session, existing.ownerId)) {
    throw new Error('Unauthorized');
  }

  const office = await db.transportOffice.update({
    where: { id: parsedId.data },
    data: parsed.data,
  });

  revalidatePath('/[lang]/travel-host');
  revalidatePath('/[lang]/(dashboard)/offices');
  return { success: true, office };
}

export async function getTransportOffice(id: number) {
  const office = await db.transportOffice.findUnique({
    where: { id },
    include: {
      assemblyPoint: true,
      buses: true,
      routes: {
        include: {
          origin: true,
          destination: true,
        },
      },
    },
  });

  return office;
}

export async function getMyOffices() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const offices = await db.transportOffice.findMany({
    where: { ownerId: session.user.id },
    include: {
      assemblyPoint: true,
      _count: {
        select: {
          buses: true,
          routes: true,
          bookings: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return offices;
}

export async function publishOffice(id: number) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await assertRateLimit('mutation', `travel-office-publish:${session.user.id}`);

  const office = await db.transportOffice.update({
    where: { id, ownerId: session.user.id },
    data: { isActive: true },
  });

  revalidatePath('/[lang]/travel');
  revalidatePath('/[lang]/travel-host');
  updateTag(TAG_TRIPS);
  return { success: true, office };
}

export async function getTransportOffices() {
  const offices = await db.transportOffice.findMany({
    where: { isActive: true, isVerified: true },
    include: {
      assemblyPoint: {
        select: { name: true, city: true },
      },
      _count: {
        select: { buses: true, routes: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  return offices;
}

export async function getOfficeTrips(officeId: number, startDate: Date, endDate: Date) {
  const trips = await db.trip.findMany({
    where: {
      route: { officeId },
      departureDate: {
        gte: startDate,
        lte: endDate,
      },
      isActive: true,
      isCancelled: false,
    },
    include: {
      route: {
        include: {
          origin: { select: { city: true } },
          destination: { select: { city: true } },
        },
      },
    },
    orderBy: [{ departureDate: 'asc' }, { departureTime: 'asc' }],
  });

  return trips;
}

// ============================================
// BUS ACTIONS
// ============================================

export async function createBus(data: BusFormData & { officeId: number }) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await assertRateLimit('mutation', `travel-bus-create:${session.user.id}`);

  const { officeId, ...busData } = data;

  // Verify office ownership
  const office = await db.transportOffice.findUnique({
    where: { id: officeId },
    select: { ownerId: true },
  });

  if (!office || !canOverride(session, office.ownerId)) {
    throw new Error('Unauthorized');
  }

  const bus = await db.bus.create({
    data: {
      ...busData,
      officeId,
    },
  });

  revalidatePath('/[lang]/travel-host');
  revalidatePath('/[lang]/(dashboard)/offices');
  return bus;
}

export async function updateBus(id: unknown, data: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await assertRateLimit('mutation', `travel-bus-update:${session.user.id}`);

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error('Invalid bus ID');
  }

  const parsed = busSchema.partial().safeParse(data);
  if (!parsed.success) {
    throw new Error('Invalid bus data');
  }

  // Verify ownership via office
  const existingBus = await db.bus.findUnique({
    where: { id: parsedId.data },
    include: { office: { select: { ownerId: true } } },
  });

  if (!existingBus || !canOverride(session, existingBus.office.ownerId)) {
    throw new Error('Unauthorized');
  }

  const bus = await db.bus.update({
    where: { id: parsedId.data },
    data: parsed.data,
  });

  revalidatePath('/[lang]/travel-host');
  revalidatePath('/[lang]/(dashboard)/offices');
  return bus;
}

export async function deleteBus(id: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await assertRateLimit('mutation', `travel-bus-delete:${session.user.id}`);

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error('Invalid bus ID');
  }

  // Verify ownership via office
  const existingBus = await db.bus.findUnique({
    where: { id: parsedId.data },
    include: { office: { select: { ownerId: true } } },
  });

  if (!existingBus || !canOverride(session, existingBus.office.ownerId)) {
    throw new Error('Unauthorized');
  }

  await db.bus.delete({
    where: { id: parsedId.data },
  });

  revalidatePath('/[lang]/travel-host');
  revalidatePath('/[lang]/(dashboard)/offices');
  return { success: true };
}

export async function getBuses(officeId: number) {
  const buses = await db.bus.findMany({
    where: { officeId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  return buses;
}

// ============================================
// ROUTE ACTIONS
// ============================================

export async function createRoute(data: RouteFormData & { officeId: number }) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await assertRateLimit('mutation', `travel-route-create:${session.user.id}`);

  const { officeId, ...routeData } = data;

  // Verify office ownership
  const office = await db.transportOffice.findUnique({
    where: { id: officeId },
    select: { ownerId: true },
  });

  if (!office || !canOverride(session, office.ownerId)) {
    throw new Error('Unauthorized');
  }

  const route = await db.route.create({
    data: {
      ...routeData,
      officeId,
    },
    include: {
      origin: true,
      destination: true,
    },
  });

  revalidatePath('/[lang]/travel-host');
  revalidatePath('/[lang]/(dashboard)/offices');
  updateTag(TAG_TRIPS);
  updateTag(TAG_POPULAR_ROUTES);
  return route;
}

export async function updateRoute(id: unknown, data: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await assertRateLimit('mutation', `travel-route-update:${session.user.id}`);

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error('Invalid route ID');
  }

  const parsed = routeSchema.partial().safeParse(data);
  if (!parsed.success) {
    throw new Error('Invalid route data');
  }

  // Verify ownership via office
  const existingRoute = await db.route.findUnique({
    where: { id: parsedId.data },
    include: { office: { select: { ownerId: true } } },
  });

  if (!existingRoute || !canOverride(session, existingRoute.office.ownerId)) {
    throw new Error('Unauthorized');
  }

  const route = await db.route.update({
    where: { id: parsedId.data },
    data: parsed.data,
    include: {
      origin: true,
      destination: true,
    },
  });

  revalidatePath('/[lang]/travel-host');
  revalidatePath('/[lang]/(dashboard)/offices');
  updateTag(TAG_TRIPS);
  updateTag(TAG_POPULAR_ROUTES);
  return route;
}

export async function deleteRoute(id: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await assertRateLimit('mutation', `travel-route-delete:${session.user.id}`);

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error('Invalid route ID');
  }

  // Verify ownership via office
  const existingRoute = await db.route.findUnique({
    where: { id: parsedId.data },
    include: { office: { select: { ownerId: true } } },
  });

  if (!existingRoute || !canOverride(session, existingRoute.office.ownerId)) {
    throw new Error('Unauthorized');
  }

  await db.route.delete({
    where: { id: parsedId.data },
  });

  revalidatePath('/[lang]/travel-host');
  revalidatePath('/[lang]/(dashboard)/offices');
  updateTag(TAG_TRIPS);
  updateTag(TAG_POPULAR_ROUTES);
  return { success: true };
}

export async function getRoutes(officeId?: number) {
  const where = officeId ? { officeId, isActive: true } : { isActive: true };

  const routes = await db.route.findMany({
    where,
    include: {
      origin: true,
      destination: true,
      office: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return routes;
}

// ─── Search ──────────────────────────────────────────────────────────────────

const searchTripsInput = z.object({
  originId: z.coerce.number().int().positive().optional(),
  destinationId: z.coerce.number().int().positive().optional(),
  origin: z.string().trim().min(1).optional(),
  destination: z.string().trim().min(1).optional(),
  date: z.coerce.date().optional(),
  when: z.enum(['morning', 'afternoon', 'evening', 'night']).optional(),
  priceMin: z.coerce.number().nonnegative().optional(),
  priceMax: z.coerce.number().nonnegative().optional(),
  amenities: z.array(z.enum(BusAmenity)).optional(),
  officeId: z.coerce.number().int().positive().optional(),
  officeIds: z.array(z.coerce.number().int().positive()).optional(),
  minSeats: z.coerce.number().int().min(1).max(20).optional(),
  sort: z
    .enum(['price-asc', 'price-desc', 'departure-asc', 'duration-asc'])
    .default('departure-asc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type SearchTripsInput = z.infer<typeof searchTripsInput>;

function whenClause(
  when: 'morning' | 'afternoon' | 'evening' | 'night',
): Prisma.TripWhereInput {
  // departureTime is String "HH:MM" — zero-padded, lex compare == clock order
  switch (when) {
    case 'morning':
      return { departureTime: { gte: '04:00', lt: '12:00' } };
    case 'afternoon':
      return { departureTime: { gte: '12:00', lt: '17:00' } };
    case 'evening':
      return { departureTime: { gte: '17:00', lt: '21:00' } };
    case 'night':
      return {
        OR: [{ departureTime: { gte: '21:00' } }, { departureTime: { lt: '04:00' } }],
      };
  }
}

function buildTripWhere(input: SearchTripsInput): Prisma.TripWhereInput {
  // Public search must hide unverified operators. Admin can still browse
  // them via /admin/travel, but a guest never sees their trips.
  const routeFilter: Prisma.RouteWhereInput = {
    isActive: true,
    office: { isVerified: true, isActive: true },
  };

  if (input.officeId || (input.officeIds && input.officeIds.length > 0)) {
    routeFilter.officeId = input.officeIds?.length
      ? { in: input.officeIds }
      : input.officeId;
  }

  if (input.originId) {
    routeFilter.originId = input.originId;
  } else if (input.origin) {
    routeFilter.origin = {
      OR: [
        { city: { contains: input.origin, mode: 'insensitive' } },
        { name: { contains: input.origin, mode: 'insensitive' } },
        { nameAr: { contains: input.origin, mode: 'insensitive' } },
      ],
    };
  }

  if (input.destinationId) {
    routeFilter.destinationId = input.destinationId;
  } else if (input.destination) {
    routeFilter.destination = {
      OR: [
        { city: { contains: input.destination, mode: 'insensitive' } },
        { name: { contains: input.destination, mode: 'insensitive' } },
        { nameAr: { contains: input.destination, mode: 'insensitive' } },
      ],
    };
  }

  const where: Prisma.TripWhereInput = {
    isActive: true,
    isCancelled: false,
    route: routeFilter,
  };

  if (input.date) {
    const { gte: dayStart, lt: dayEnd } = dayWindow(input.date);
    where.departureDate = { gte: dayStart, lt: dayEnd };
  } else {
    // If no date is provided, show upcoming trips (today onwards)
    const { gte: dayStart } = dayWindow(new Date());
    where.departureDate = { gte: dayStart };
  }

  if (input.priceMin != null || input.priceMax != null) {
    where.price = {
      ...(input.priceMin != null ? { gte: input.priceMin } : {}),
      ...(input.priceMax != null ? { lte: input.priceMax } : {}),
    };
  }

  if (input.minSeats) {
    where.availableSeats = { gte: input.minSeats };
  }

  if (input.when) {
    Object.assign(where, whenClause(input.when));
  }

  if (input.amenities && input.amenities.length > 0) {
    where.bus = { amenities: { hasEvery: input.amenities } };
  }

  return where;
}

function buildOrderBy(
  sort: SearchTripsInput['sort'],
): Prisma.TripOrderByWithRelationInput[] {
  switch (sort) {
    case 'price-asc':
      return [{ price: 'asc' }, { departureTime: 'asc' }];
    case 'price-desc':
      return [{ price: 'desc' }, { departureTime: 'asc' }];
    case 'duration-asc':
      return [{ route: { duration: 'asc' } }, { departureTime: 'asc' }];
    default:
      return [{ departureTime: 'asc' }, { price: 'asc' }];
  }
}

const getCachedTrips = unstable_cache(
  async (serializedData: string) => {
    const data = JSON.parse(serializedData) as SearchTripsInput;
    const where = buildTripWhere(data);
    const orderBy = buildOrderBy(data.sort);

    const facetWhere = buildTripWhere({
      ...data,
      priceMin: undefined,
      priceMax: undefined,
      amenities: undefined,
      officeId: undefined,
      officeIds: undefined,
    });

    const [total, rows, priceAgg, officeRows] = await Promise.all([
      db.trip.count({ where }),
      db.trip.findMany({
        where,
        orderBy,
        take: data.limit,
        skip: (data.page - 1) * data.limit,
        include: {
          route: {
            include: {
              origin: true,
              destination: true,
              office: { include: { assemblyPoint: true } },
            },
          },
          bus: {
            select: {
              id: true,
              plateNumber: true,
              model: true,
              manufacturer: true,
              year: true,
              capacity: true,
              photoUrls: true,
              amenities: true,
            },
          },
        },
      }),
      db.trip.aggregate({
        where: facetWhere,
        _min: { price: true },
        _max: { price: true },
      }),
      db.trip.findMany({
        where: facetWhere,
        distinct: ['routeId'],
        select: {
          route: {
            select: {
              officeId: true,
              office: { select: { id: true, name: true, nameAr: true } },
            },
          },
        },
        take: 50,
      }),
    ]);

    return {
      total,
      rows,
      priceAgg: {
        _min: { price: priceAgg._min.price },
        _max: { price: priceAgg._max.price }
      },
      officeRows,
    };
  },
  ['transport:searchTrips'],
  { tags: [TAG_TRIPS], revalidate: 300 }
);

/**
 * Unified transport search. Returns trips (not routes) so price/time/amenity
 * filters apply at the trip level. Facets expose price bounds and operators
 * present in the current day so UI can render a dynamic filters panel.
 */
export async function searchTrips(input: unknown) {
  const parsed = searchTripsInput.safeParse(input);
  if (!parsed.success) {
    logger.error('Invalid searchTrips input', { errors: z.flattenError(parsed.error) });
    return {
      trips: [],
      total: 0,
      page: 1,
      pageCount: 0,
      limit: 20,
      facets: { priceMin: 0, priceMax: 0, offices: [] as { id: number; name: string; nameAr: string | null }[] },
    };
  }
  const data = parsed.data;

  try {
    const pageKey = JSON.stringify(data);
    const { total, rows, priceAgg, officeRows } = await getCachedTrips(pageKey);

    const seen = new Set<number>();
    const offices: { id: number; name: string; nameAr: string | null }[] = [];
    for (const row of officeRows) {
      const o = row.route?.office;
      if (o && !seen.has(o.id)) {
        seen.add(o.id);
        offices.push({ id: o.id, name: o.name, nameAr: o.nameAr });
      }
    }
    offices.sort((a, b) => a.name.localeCompare(b.name));

    return {
      trips: rows,
      total,
      page: data.page,
      pageCount: Math.max(1, Math.ceil(total / data.limit)),
      limit: data.limit,
      facets: {
        priceMin: priceAgg._min.price ?? 0,
        priceMax: priceAgg._max.price ?? 0,
        offices,
      },
    };
  } catch (error) {
    logger.error('Failed to search trips', { error, input });
    return {
      trips: [],
      total: 0,
      page: data.page,
      pageCount: 0,
      limit: data.limit,
      facets: { priceMin: 0, priceMax: 0, offices: [] },
    };
  }
}

export type SearchTripsResult = Awaited<ReturnType<typeof searchTrips>>;

/**
 * Browse ALL upcoming trips (no origin/destination) for the /travel/listings
 * grid — the homes-/listings equivalent for buses. Public read; only verified,
 * active operators surface. Same `include` shape as searchTrips so `TripCard`
 * renders the rows unchanged. Paginated for the infinite-scroll client.
 */
/**
 * Exactly the columns TripCard renders. The previous `include` pulled every
 * column of trip + route + origin + destination + office + assemblyPoint +
 * bus, so each of the 20 cards carried coordinates, addresses, plate numbers
 * and photo arrays that nothing displays — all of it serialized into the RSC
 * payload and into every infinite-scroll response.
 */
const BROWSE_TRIP_SELECT = {
  id: true,
  departureDate: true,
  departureTime: true,
  arrivalTime: true,
  price: true,
  availableSeats: true,
  route: {
    select: {
      duration: true,
      origin: { select: { name: true, nameAr: true, city: true } },
      destination: { select: { name: true, nameAr: true, city: true } },
      office: {
        select: {
          name: true,
          nameAr: true,
          rating: true,
          isVerified: true,
          logoUrl: true,
        },
      },
    },
  },
  bus: { select: { model: true, amenities: true } },
} satisfies Prisma.TripSelect;

const browseTripsCached = unstable_cache(
  async (page: number, limit: number) => {
    // Start-of-today (Khartoum) onward — today's not-yet-departed trips still show.
    const { gte } = dayWindow(new Date());

    const where: Prisma.TripWhereInput = {
      isActive: true,
      isCancelled: false,
      departureDate: { gte },
      route: { isActive: true, office: { isVerified: true, isActive: true } },
    };

    const [total, trips] = await Promise.all([
      db.trip.count({ where }),
      db.trip.findMany({
        where,
        // `id` is the stable tiebreaker: many trips share a departureDate +
        // departureTime, and without it Postgres returns ties in an arbitrary
        // order that shifts between the page-1 and page-2 queries — overlapping
        // pages (and silently skipping trips) under infinite scroll.
        orderBy: [{ departureDate: 'asc' }, { departureTime: 'asc' }, { id: 'asc' }],
        take: limit,
        skip: (page - 1) * limit,
        select: BROWSE_TRIP_SELECT,
      }),
    ]);

    return {
      trips,
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / limit)),
      limit,
    };
  },
  ['transport:browseTrips'],
  { tags: [TAG_TRIPS], revalidate: 300 },
);

/**
 * Kept as a plain exported action (not the cached fn itself) so the
 * 'use server' boundary stays a normal async function — infinite scroll calls
 * this straight from the client.
 */
export async function browseTrips(input: { page?: number; limit?: number } = {}) {
  const page = Math.max(1, input.page ?? 1);
  const limit = Math.min(50, Math.max(1, input.limit ?? 20));
  return browseTripsCached(page, limit);
}

export type BrowseTripsResult = Awaited<ReturnType<typeof browseTrips>>;
export type BrowseTripRow = BrowseTripsResult['trips'][number];

/**
 * Legacy signature retained for backwards-compat with existing callers.
 * Returns the old shape (routes → trips tree) for any code that hasn't
 * migrated to searchTrips yet.
 */
export async function searchRoutes(
  origin: string,
  destination: string,
  date: Date,
) {
  const { gte: dayStart, lt: dayEnd } = dayWindow(date);

  const routes = await db.route.findMany({
    where: {
      isActive: true,
      origin: {
        OR: [
          { city: { contains: origin, mode: 'insensitive' } },
          { name: { contains: origin, mode: 'insensitive' } },
          { nameAr: { contains: origin, mode: 'insensitive' } },
        ],
      },
      destination: {
        OR: [
          { city: { contains: destination, mode: 'insensitive' } },
          { name: { contains: destination, mode: 'insensitive' } },
          { nameAr: { contains: destination, mode: 'insensitive' } },
        ],
      },
      trips: {
        some: {
          departureDate: { gte: dayStart, lt: dayEnd },
          isActive: true,
          isCancelled: false,
        },
      },
    },
    include: {
      origin: true,
      destination: true,
      office: { include: { assemblyPoint: true } },
      trips: {
        where: {
          departureDate: { gte: dayStart, lt: dayEnd },
          isActive: true,
          isCancelled: false,
        },
        include: { bus: true },
      },
    },
  });

  return routes;
}

// ─── Office directory ───────────────────────────────────────────────────────

const searchOfficesInput = z.object({
  q: z.string().trim().optional(),
  city: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function searchOffices(input: unknown) {
  const parsed = searchOfficesInput.safeParse(input);
  if (!parsed.success) {
    return { offices: [], total: 0, page: 1, pageCount: 0 };
  }
  const { q, city, page, limit } = parsed.data;

  const where: Prisma.TransportOfficeWhereInput = { isActive: true, isVerified: true };
  const and: Prisma.TransportOfficeWhereInput[] = [];

  if (q) {
    and.push({
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { nameAr: { contains: q, mode: 'insensitive' } },
        { assemblyPoint: { city: { contains: q, mode: 'insensitive' } } },
      ],
    });
  }
  if (city) {
    and.push({ assemblyPoint: { city } });
  }
  if (and.length > 0) where.AND = and;

  const [total, offices] = await Promise.all([
    db.transportOffice.count({ where }),
    db.transportOffice.findMany({
      where,
      include: {
        assemblyPoint: true,
        _count: { select: { buses: true, routes: true } },
      },
      orderBy: [{ isVerified: 'desc' }, { rating: 'desc' }, { name: 'asc' }],
      take: limit,
      skip: (page - 1) * limit,
    }),
  ]);

  return {
    offices,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / limit)),
  };
}

// ─── Popular routes for landing page ────────────────────────────────────────

export const getPopularRoutes = unstable_cache(
  async () => {
    const thirtyDaysOut = new Date();
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

    const routes = await db.route.findMany({
      where: {
        isActive: true,
        trips: {
          some: {
            departureDate: { gte: new Date(), lt: thirtyDaysOut },
            isActive: true,
            isCancelled: false,
          },
        },
      },
      include: {
        origin: true,
        destination: true,
        _count: { select: { trips: true } },
      },
      orderBy: { trips: { _count: 'desc' } },
      take: 8,
    });

    return routes;
  },
  ['transport:getPopularRoutes'],
  { tags: [TAG_POPULAR_ROUTES], revalidate: 3600 },
);

export const getPopularRoutesByOrigin = unstable_cache(
  async (originCity: string) => {
    const thirtyDaysOut = new Date();
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

    const routes = await db.route.findMany({
      where: {
        isActive: true,
        origin: { city: originCity },
        trips: {
          some: {
            departureDate: { gte: new Date(), lt: thirtyDaysOut },
            isActive: true,
            isCancelled: false,
          },
        },
      },
      include: {
        origin: true,
        destination: true,
      },
    });

    return routes;
  },
  ['transport:getPopularRoutesByOrigin'],
  { tags: [TAG_POPULAR_ROUTES], revalidate: 3600 },
);

// ============================================
// TRIP ACTIONS
// ============================================

export async function createTrip(data: TripFormData) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await assertRateLimit('mutation', `travel-trip-create:${session.user.id}`);

  // Verify both route and bus belong to an office the caller owns.
  // Prevents operator A from creating trips on operator B's fleet.
  const [bus, route] = await Promise.all([
    db.bus.findUnique({
      where: { id: data.busId },
      select: { capacity: true, officeId: true, seatLayout: true, office: { select: { ownerId: true } } },
    }),
    db.route.findUnique({
      where: { id: data.routeId },
      select: { officeId: true, office: { select: { ownerId: true } } },
    }),
  ]);

  if (!bus) {
    throw new Error('Bus not found');
  }
  if (!route) {
    throw new Error('Route not found');
  }
  if (bus.officeId !== route.officeId) {
    throw new Error('Bus and route must belong to the same office');
  }
  if (!canOverride(session, route.office.ownerId)) {
    throw new Error('Not authorized to create trips for this office');
  }

  const trip = await db.trip.create({
    data: {
      routeId: data.routeId,
      busId: data.busId,
      departureDate: data.departureDate,
      departureTime: data.departureTime,
      arrivalTime: data.arrivalTime || null,
      price: data.price ?? 0,
      availableSeats: bus.capacity,
    },
    include: {
      route: {
        include: {
          origin: true,
          destination: true,
        },
      },
      bus: true,
    },
  });

  // Seat grid honours Bus.seatLayout (columns/rows/blocked) when configured.
  const seats = buildSeatRows(trip.id, bus.capacity, bus.seatLayout);
  await db.seat.createMany({ data: seats });

  // Blocked layout seats never sell — keep the trip counter honest.
  const sellable = seats.filter((s) => s.status === 'Available').length;
  if (sellable !== bus.capacity) {
    await db.trip.update({ where: { id: trip.id }, data: { availableSeats: sellable } });
  }

  revalidatePath('/[lang]/travel-host');
  revalidatePath('/[lang]/(dashboard)/offices');
  updateTag(TAG_TRIPS);
  updateTag(TAG_POPULAR_ROUTES);
  return trip;
}

const bulkTripsSchema = z.object({
  routeId: z.number().int().positive(),
  busId: z.number().int().positive(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  departureTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  price: z.number().positive(),
  bothDirections: z.boolean().optional(),
  returnTime: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .optional(),
});

// Guardrail: one bulk call covers at most ~2 months of daily departures.
const MAX_BULK_TRIPS = 62;

/**
 * Recurring scheduler (T-FL.2/3): create a daily departure for every date in
 * [startDate, endDate], optionally mirrored on the office's opposite route
 * ("both directions"). Skips date+time slots that already have a trip on the
 * same route so re-running is idempotent, and reports what happened so the
 * UI can tell the operator.
 */
export async function createTripsBulk(data: unknown) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await assertRateLimit('mutation', `travel-trip-bulk:${session.user.id}`);

  const parsed = bulkTripsSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Invalid schedule data');
  }
  const input = parsed.data;

  const [bus, route] = await Promise.all([
    db.bus.findUnique({
      where: { id: input.busId },
      select: { capacity: true, officeId: true, seatLayout: true, office: { select: { ownerId: true } } },
    }),
    db.route.findUnique({
      where: { id: input.routeId },
      select: {
        officeId: true,
        duration: true,
        originId: true,
        destinationId: true,
        office: { select: { ownerId: true } },
      },
    }),
  ]);
  if (!bus) throw new Error('Bus not found');
  if (!route) throw new Error('Route not found');
  if (bus.officeId !== route.officeId) {
    throw new Error('Bus and route must belong to the same office');
  }
  if (!canOverride(session, route.office.ownerId)) {
    throw new Error('Not authorized to create trips for this office');
  }

  // Expand the date range in the market timezone.
  const dates: Date[] = [];
  {
    const start = dayWindow(input.startDate).gte;
    const end = dayWindow(input.endDate).gte;
    if (end < start) throw new Error('End date must be after the start date');
    for (
      let cursor = new Date(start);
      cursor <= end && dates.length < MAX_BULK_TRIPS;
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
    ) {
      dates.push(new Date(cursor));
    }
  }

  // "Both directions" mirrors the schedule on the same office's opposite
  // route when one exists — operators almost always run A→B and B→A.
  let reverseRoute: { id: number; duration: number } | null = null;
  if (input.bothDirections) {
    reverseRoute = await db.route.findFirst({
      where: {
        officeId: route.officeId,
        originId: route.destinationId,
        destinationId: route.originId,
        isActive: true,
      },
      select: { id: true, duration: true },
    });
  }

  const addMinutes = (time: string, minutes: number) => {
    const [hh = 0, mm = 0] = time.split(':').map(Number);
    const total = hh * 60 + mm + minutes;
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const plans: Array<{ routeId: number; date: Date; time: string; duration: number }> = [];
  for (const date of dates) {
    plans.push({ routeId: input.routeId, date, time: input.departureTime, duration: route.duration });
    if (reverseRoute) {
      plans.push({
        routeId: reverseRoute.id,
        date,
        time: input.returnTime || input.departureTime,
        duration: reverseRoute.duration,
      });
    }
  }

  // Idempotency: skip slots that already carry a trip for the route+date+time.
  const existing = await db.trip.findMany({
    where: {
      routeId: { in: [input.routeId, ...(reverseRoute ? [reverseRoute.id] : [])] },
      departureDate: { gte: plans[0]!.date, lte: plans[plans.length - 1]!.date },
    },
    select: { routeId: true, departureDate: true, departureTime: true },
  });
  const taken = new Set(
    existing.map((t) => `${t.routeId}|${t.departureDate.toISOString().slice(0, 10)}|${t.departureTime}`),
  );

  let created = 0;
  let skipped = 0;
  for (const plan of plans) {
    const key = `${plan.routeId}|${plan.date.toISOString().slice(0, 10)}|${plan.time}`;
    if (taken.has(key)) {
      skipped++;
      continue;
    }
    const trip = await db.trip.create({
      data: {
        routeId: plan.routeId,
        busId: input.busId,
        departureDate: plan.date,
        departureTime: plan.time,
        arrivalTime: addMinutes(plan.time, plan.duration),
        price: input.price,
        availableSeats: bus.capacity,
      },
    });
    const seats = buildSeatRows(trip.id, bus.capacity, bus.seatLayout);
    await db.seat.createMany({ data: seats });
    const sellable = seats.filter((s) => s.status === 'Available').length;
    if (sellable !== bus.capacity) {
      await db.trip.update({ where: { id: trip.id }, data: { availableSeats: sellable } });
    }
    created++;
  }

  revalidatePath('/[lang]/travel-host');
  updateTag(TAG_TRIPS);
  updateTag(TAG_POPULAR_ROUTES);
  return {
    success: true,
    created,
    skipped,
    reverseRouteMissing: Boolean(input.bothDirections && !reverseRoute),
  };
}

export async function updateTrip(id: number, data: Partial<TripFormData>) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await assertRateLimit('mutation', `travel-trip-update:${session.user.id}`);

  // Ownership: trip belongs to a route belongs to an office; verify caller owns the office.
  const existing = await db.trip.findUnique({
    where: { id },
    select: { route: { select: { office: { select: { ownerId: true } } } } },
  });
  if (!existing) {
    throw new Error('Trip not found');
  }
  if (!canOverride(session, existing.route.office.ownerId)) {
    throw new Error('Not authorized to update this trip');
  }

  // If the caller tries to swap busId/routeId, re-verify scope of the target.
  if (data.busId || data.routeId) {
    const [newBus, newRoute] = await Promise.all([
      data.busId
        ? db.bus.findUnique({
            where: { id: data.busId },
            select: { office: { select: { ownerId: true } } },
          })
        : null,
      data.routeId
        ? db.route.findUnique({
            where: { id: data.routeId },
            select: { office: { select: { ownerId: true } } },
          })
        : null,
    ]);
    if (newBus && !canOverride(session, newBus.office.ownerId)) {
      throw new Error('Not authorized to assign that bus');
    }
    if (newRoute && !canOverride(session, newRoute.office.ownerId)) {
      throw new Error('Not authorized to assign that route');
    }
  }

  const trip = await db.trip.update({
    where: { id },
    data,
  });

  revalidatePath('/[lang]/travel-host');
  revalidatePath('/[lang]/(dashboard)/offices');
  updateTag(TAG_TRIPS);
  updateTag(TAG_POPULAR_ROUTES);
  return { success: true, trip };
}

export async function cancelTrip(id: number) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await assertRateLimit('mutation', `travel-trip-cancel:${session.user.id}`);

  const existing = await db.trip.findUnique({
    where: { id },
    select: { route: { select: { office: { select: { ownerId: true } } } } },
  });
  if (!existing) {
    throw new Error('Trip not found');
  }
  if (!canOverride(session, existing.route.office.ownerId)) {
    throw new Error('Not authorized to cancel this trip');
  }

  const trip = await db.trip.update({
    where: { id },
    data: { isCancelled: true },
  });

  // Notify every passenger with a confirmed/pending booking on this trip.
  // Best-effort: a single failed email must not roll back the cancellation.
  const affectedBookings = await db.transportBooking.findMany({
    where: { tripId: id, status: { in: ["Pending", "Confirmed"] } },
    include: {
      user: { select: { email: true } },
      trip: {
        include: {
          route: {
            include: {
              origin: { select: { city: true } },
              destination: { select: { city: true } },
              office: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  await db.transportBooking.updateMany({
    where: { tripId: id, status: { in: ["Pending", "Confirmed"] } },
    data: { status: "Cancelled", cancelledAt: new Date() },
  });

  const { sendTripCancelledEmail } = await import("@/lib/mail");
  await Promise.all(
    affectedBookings
      .filter((b) => b.user?.email)
      .map((b) =>
        sendTripCancelledEmail(b.user!.email!, {
          bookingReference: b.bookingReference,
          origin: b.trip.route.origin.city,
          destination: b.trip.route.destination.city,
          departureDate: b.trip.departureDate.toISOString().slice(0, 10),
          operatorName: b.trip.route.office.name,
        }).catch((err) => console.error("trip_cancel_email_failed", err)),
      ),
  );

  revalidatePath('/[lang]/travel');
  revalidatePath('/[lang]/(dashboard)/offices');
  updateTag(TAG_TRIPS);
  updateTag(TAG_POPULAR_ROUTES);
  return { success: true, trip, notified: affectedBookings.length };
}

export async function getTrips(routeId?: number, date?: Date) {
  const where: Record<string, unknown> = { isActive: true, isCancelled: false };

  if (routeId) where.routeId = routeId;
  if (date) {
    where.departureDate = dayWindow(date);
  }

  const trips = await db.trip.findMany({
    where,
    include: {
      route: {
        include: {
          origin: true,
          destination: true,
          office: true,
        },
      },
      bus: true,
    },
    orderBy: { departureDate: 'asc' },
  });

  return trips;
}

export async function getTripDetails(id: number) {
  // Same inline healing as getTripSeats — this powers the booking page's
  // seat map, where a stale hold directly blocks a sale.
  try {
    await releaseExpiredSeatHolds(id);
  } catch (error) {
    logger.warn('Inline seat-hold healing failed', { tripId: id, error });
  }

  const trip = await db.trip.findUnique({
    where: { id },
    include: {
      route: {
        include: {
          origin: true,
          destination: true,
          office: {
            include: {
              assemblyPoint: true,
            },
          },
        },
      },
      bus: true,
      seats: {
        orderBy: [{ row: 'asc' }, { column: 'asc' }],
      },
    },
  });

  return trip;
}

/** Public shape of a seat — everything the map draws, nothing more. */
export type PublicSeat = {
  id: number;
  seatNumber: string;
  row: number;
  column: number;
  seatType: string | null;
  status: SeatStatus;
};

/**
 * Seat map for a trip, safe to hand to the browser. Powers the booking
 * page's live-availability refresh, so it deliberately omits `bookingId`
 * and `reservedUntil` — a rider only needs to know a seat is gone, not who
 * holds it or until when.
 */
export async function getTripSeats(tripId: number): Promise<PublicSeat[]> {
  if (!Number.isInteger(tripId)) return [];

  // Heal expired checkout holds inline so the seat map reflects sellable
  // inventory immediately (the cron sweep only runs daily on hobby plan).
  try {
    await releaseExpiredSeatHolds(tripId);
  } catch (error) {
    logger.warn('Inline seat-hold healing failed', { tripId, error });
  }

  return db.seat.findMany({
    where: { tripId },
    select: {
      id: true,
      seatNumber: true,
      row: true,
      column: true,
      seatType: true,
      status: true,
    },
    orderBy: [{ row: 'asc' }, { column: 'asc' }],
  });
}

// ============================================
// BOOKING ACTIONS
// ============================================

/**
 * Raised inside the booking transaction when the rider's seats went to
 * someone else between page load and submit. Carried out of the tx as a
 * typed failure rather than a thrown error: Next redacts Server Action
 * error messages in production, so a `throw` would reach the rider as an
 * untranslatable "an error occurred".
 */
class SeatsUnavailableError extends Error {
  constructor(readonly seats: string[]) {
    super('SEATS_UNAVAILABLE');
    this.name = 'SeatsUnavailableError';
  }
}

export async function createBooking(data: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  // Seat holds last 30 minutes, so an unthrottled booking loop is a
  // denial-of-inventory: a script could park every seat on every trip and
  // release nothing. Returned as a typed failure rather than thrown because
  // Next redacts Server Action error messages in production — the same reason
  // SEATS_UNAVAILABLE is a result and not an exception.
  try {
    await assertRateLimit('mutation', `travel-booking:${session.user.id}`);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return {
        success: false as const,
        error: 'RATE_LIMITED' as const,
        retryAfter: error.retryAfter,
      };
    }
    throw error;
  }

  const parsed = transportBookingSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Invalid booking data');
  }

  const validData = {
    ...parsed.data,
    passengerName: sanitizeInput(parsed.data.passengerName),
    passengerPhone: sanitizePhone(parsed.data.passengerPhone),
    passengerEmail: parsed.data.passengerEmail ? sanitizeEmail(parsed.data.passengerEmail) : undefined,
  };

  // Release any lapsed checkout holds on this trip first — otherwise a seat
  // abandoned 31 minutes ago still reads Reserved and the sale fails until
  // the daily cron sweep.
  try {
    await releaseExpiredSeatHolds(validData.tripId);
  } catch (error) {
    logger.warn('Inline seat-hold healing failed', { tripId: validData.tripId, error });
  }

  const runBooking = () => db.$transaction(async (tx) => {
    // Get trip details
    const trip = await tx.trip.findUnique({
      where: { id: validData.tripId },
      include: {
        route: {
          include: {
            office: true,
          },
        },
      },
    });

    if (!trip) {
      throw new Error('Trip not found');
    }

    // Verify seats are available, acquiring a pessimistic lock (FOR UPDATE)
    // on the target seats in the database to prevent double bookings.
    let seats: Array<{ seatNumber: string }> = [];
    if (typeof tx.$queryRaw === 'function') {
      seats = await tx.$queryRaw<Array<{ seatNumber: string }>>`
        SELECT "seatNumber" FROM "Seat"
        WHERE "tripId" = ${validData.tripId}
          AND "seatNumber" IN (${Prisma.join(validData.seatNumbers)})
          AND "status" = 'Available'
        FOR UPDATE
      `;
    } else {
      seats = await tx.seat.findMany({
        where: {
          tripId: validData.tripId,
          seatNumber: { in: validData.seatNumbers },
          status: 'Available',
        },
        select: { seatNumber: true },
      });
    }

    if (seats.length !== validData.seatNumbers.length) {
      // Name the seats that went, so the booking page can strike exactly
      // those off the rider's selection instead of clearing everything.
      const stillFree = new Set(seats.map((s) => s.seatNumber));
      throw new SeatsUnavailableError(
        validData.seatNumbers.filter((seatNumber) => !stillFree.has(seatNumber)),
      );
    }

    const totalAmount = trip.price * validData.seatNumbers.length;

    // Create booking
    const newBooking = await tx.transportBooking.create({
      data: {
        bookingReference: `BK-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        userId: session.user.id,
        tripId: validData.tripId,
        officeId: trip.route.office.id,
        passengerName: validData.passengerName,
        passengerPhone: validData.passengerPhone,
        passengerEmail: validData.passengerEmail || null,
        totalAmount,
        status: 'Pending',
      },
    });

    // One Passenger row per seat when the group form supplied them; a
    // missing array (legacy client) keeps the booking-level identity only.
    if (validData.passengers?.length) {
      await tx.passenger.createMany({
        data: validData.passengers.map((p) => ({
          bookingId: newBooking.id,
          name: sanitizeInput(p.name),
          phone: p.phone ? sanitizePhone(p.phone) : null,
          idCard: p.idCard ? sanitizeInput(p.idCard) : null,
          seatNumber: p.seatNumber,
        })),
      });
    }

    // Reserve seats with a 30-minute TTL. `/api/cron/release-seats` sweeps
    // stale reservations back to Available, so abandoned checkouts don't
    // permanently lock inventory. confirmBooking clears this TTL.
    const reservedUntil = new Date(Date.now() + 30 * 60 * 1000);
    await tx.seat.updateMany({
      where: {
        tripId: validData.tripId,
        seatNumber: { in: validData.seatNumbers },
      },
      data: {
        status: 'Reserved',
        bookingId: newBooking.id,
        reservedUntil,
      },
    });

    // Update available seats count
    await tx.trip.update({
      where: { id: validData.tripId },
      data: {
        availableSeats: {
          decrement: validData.seatNumbers.length,
        },
      },
    });

    return newBooking;
  });

  let booking: Awaited<ReturnType<typeof runBooking>>;
  try {
    booking = await runBooking();
  } catch (error) {
    if (error instanceof SeatsUnavailableError) {
      return {
        success: false as const,
        error: 'SEATS_UNAVAILABLE' as const,
        unavailableSeats: error.seats,
      };
    }
    throw error;
  }

  revalidatePath('/[lang]/travel');
  updateTag(TAG_TRIPS);
  return { success: true as const, booking };
}

/**
 * Best-effort ticket email after a booking is confirmed. Never throws —
 * email is a courtesy on top of the in-app ticket, and RESEND_API_KEY may
 * be absent in some environments (mail.ts no-ops without it).
 */
async function sendTravelConfirmationEmailSafe(bookingId: number) {
  try {
    const booking = await db.transportBooking.findUnique({
      where: { id: bookingId },
      select: {
        bookingReference: true,
        passengerEmail: true,
        totalAmount: true,
        seats: { select: { seatNumber: true } },
        trip: {
          select: {
            departureDate: true,
            departureTime: true,
            route: {
              select: {
                origin: { select: { city: true } },
                destination: { select: { city: true } },
              },
            },
          },
        },
      },
    });
    if (!booking?.passengerEmail) return;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
    await sendBookingConfirmationEmail(booking.passengerEmail, {
      bookingReference: booking.bookingReference,
      origin: booking.trip.route.origin.city,
      destination: booking.trip.route.destination.city,
      departureDate: booking.trip.departureDate.toISOString().slice(0, 10),
      departureTime: booking.trip.departureTime,
      seats: booking.seats.map((s) => s.seatNumber),
      totalAmount: booking.totalAmount,
      ticketUrl: `${appUrl}/ar/travel/booking/${bookingId}/ticket`,
    });
  } catch (error) {
    logger.warn('Booking confirmation email failed', { bookingId, error });
  }
}

export async function confirmBooking(id: number) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await assertRateLimit('mutation', `travel-confirm:${session.user.id}`);

  // Ownership: booking owner, office owner, or admin may confirm.
  const existing = await db.transportBooking.findUnique({
    where: { id },
    include: { trip: { include: { route: { include: { office: true } } } } },
  });
  if (!existing) throw new Error('Booking not found');
  const isOwner = existing.userId === session.user.id;
  const isOperatorOrAdmin = canOverride(session, existing.trip.route.office.ownerId);
  if (!isOwner && !isOperatorOrAdmin) {
    throw new Error('Not authorized to confirm this booking');
  }

  const booking = await db.transportBooking.update({
    where: { id },
    data: {
      status: 'Confirmed',
      confirmedAt: new Date(),
    },
  });

  // Update seats to Booked. Clear the reservedUntil TTL — the booking is
  // now permanently held by the customer, not a checkout hold.
  await db.seat.updateMany({
    where: { bookingId: id },
    data: { status: 'Booked', reservedUntil: null },
  });

  // Ticket by email the moment payment clears (T-TK.2).
  await sendTravelConfirmationEmailSafe(id);

  revalidatePath('/[lang]/travel');
  updateTag(TAG_TRIPS);
  return { success: true, booking };
}

/**
 * Cron-safe sweeper: any seat still in "Reserved" whose reservedUntil is
 * in the past is released back to Available. Called with a tripId inline by
 * getTripDetails / getTripSeats / createBooking (that is what actually
 * enforces the 30-minute TTL), and without one by the daily
 * `/api/cron/release-seats` backstop. Also marks the associated booking
 * Cancelled so analytics/operator views match reality.
 *
 * Skips auth because the caller is the cron job, which authenticates via
 * the CRON_SECRET header on the route.
 */
export async function releaseExpiredSeatHolds(tripId?: number) {
  const now = new Date();

  // Find bookings whose seats all point to a stale TTL. We cancel the
  // booking, release the seats, and bump the trip's availableSeats.
  // Vercel hobby crons fire only daily, so reads (getTripSeats) and
  // createBooking call this with a tripId to heal inline — abandoned
  // holds must not block sales until 3am.
  const stale = await db.seat.findMany({
    where: {
      status: 'Reserved',
      reservedUntil: { lt: now },
      bookingId: { not: null },
      ...(tripId ? { tripId } : {}),
    },
    select: { id: true, bookingId: true, tripId: true },
  });
  if (stale.length === 0) {
    return { success: true, released: 0, bookingsCancelled: 0 };
  }

  const bookingIds = Array.from(new Set(stale.map((s) => s.bookingId!).filter(Boolean)));
  const seatIds = stale.map((s) => s.id);

  // Count per-trip increments before we null out bookingIds.
  const perTrip = new Map<number, number>();
  for (const s of stale) perTrip.set(s.tripId, (perTrip.get(s.tripId) ?? 0) + 1);

  await db.$transaction([
    db.seat.updateMany({
      where: { id: { in: seatIds } },
      data: { status: 'Available', bookingId: null, reservedUntil: null },
    }),
    db.transportBooking.updateMany({
      where: { id: { in: bookingIds }, status: 'Pending' },
      data: { status: 'Cancelled', cancelledAt: now },
    }),
    ...Array.from(perTrip.entries()).map(([tripId, delta]) =>
      db.trip.update({
        where: { id: tripId },
        data: { availableSeats: { increment: delta } },
      })
    ),
  ]);

  updateTag(TAG_TRIPS);
  return { success: true, released: seatIds.length, bookingsCancelled: bookingIds.length };
}

/**
 * Transport refund policy: full refund 24h+ before departure, 50% between
 * 24h and 6h, nothing within 6 hours. Pure so it's testable with a fixed
 * clock.
 */
export async function computeTransportRefund(totalPaid: number, hoursBeforeDeparture: number) {
  if (totalPaid <= 0 || hoursBeforeDeparture < 6) return 0;
  if (hoursBeforeDeparture >= 24) return totalPaid;
  return Math.round(totalPaid * 0.5 * 100) / 100;
}

export async function cancelBooking(id: number) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await assertRateLimit('mutation', `travel-cancel:${session.user.id}`);

  const booking = await db.transportBooking.findUnique({
    where: { id },
    include: {
      seats: true,
      payments: true,
      trip: { include: { route: { include: { office: true } } } },
    },
  });

  if (!booking) {
    throw new Error('Booking not found');
  }

  // Ownership: booking owner, office owner, or admin may cancel.
  const isOwner = booking.userId === session.user.id;
  const isOperatorOrAdmin = canOverride(session, booking.trip.route.office.ownerId);
  if (!isOwner && !isOperatorOrAdmin) {
    throw new Error('Not authorized to cancel this booking');
  }

  if (booking.status === 'Completed') {
    throw new Error('Completed bookings cannot be cancelled');
  }

  // Idempotency is a compare-and-swap, not a read-then-write: claim the
  // cancellation by flipping the status only if it is still un-cancelled, and
  // let the row count decide who won. A plain `if (status === 'Cancelled')`
  // guard above the writes lets two concurrent cancels of the same booking
  // both pass the read — and each one then releases the seats, increments
  // availableSeats, and fires its own Stripe refund. Doing the release inside
  // the same transaction means the loser touches nothing.
  const claimed = await db.$transaction(async (tx) => {
    const { count } = await tx.transportBooking.updateMany({
      where: { id, status: { not: 'Cancelled' } },
      data: { status: 'Cancelled', cancelledAt: new Date() },
    });
    if (count === 0) return null;

    await tx.seat.updateMany({
      where: { bookingId: id },
      data: {
        status: 'Available',
        bookingId: null,
        reservedUntil: null,
      },
    });

    await tx.trip.update({
      where: { id: booking.tripId },
      data: {
        availableSeats: {
          increment: booking.seats.length,
        },
      },
    });

    return tx.transportBooking.findUniqueOrThrow({ where: { id } });
  });

  // Someone else cancelled it first — their call owns the seat release and
  // the refund. Report success (the booking IS cancelled) and refund nothing.
  if (!claimed) {
    return { success: true, booking, refundAmount: 0 };
  }
  const updatedBooking = claimed;

  // Refund what actually cleared, per the transport policy (full 24h+
  // before departure, 50% 24–6h, none <6h). Card payments carry a Stripe
  // intent id in transactionId — those refund automatically and the
  // charge.refunded webhook flips the TransportPayment row. Cash/transfer
  // payments are settled manually by the operator.
  const paidCard = booking.payments.find(
    (p) => p.status === 'Paid' && p.transactionId?.startsWith('pi_'),
  );
  let refundAmount = 0;
  if (paidCard?.transactionId) {
    const departureZoned = toZonedTime(new Date(booking.trip.departureDate), MARKET_TZ);
    const [h, m] = (booking.trip.departureTime ?? '00:00').split(':').map(Number);
    departureZoned.setHours(h || 0, m || 0, 0, 0);
    const departure = fromZonedTime(departureZoned, MARKET_TZ);
    const hoursBeforeDeparture = (departure.getTime() - Date.now()) / (1000 * 60 * 60);
    refundAmount = await computeTransportRefund(paidCard.amount, hoursBeforeDeparture);

    if (refundAmount > 0) {
      try {
        await getStripe().refunds.create({
          payment_intent: paidCard.transactionId,
          amount: Math.round(refundAmount * 100),
          reason: 'requested_by_customer',
        });
      } catch (err) {
        logger.error('transport_cancel_refund_failed', {
          bookingId: id,
          intentId: paidCard.transactionId,
          error: String(err),
        });
        refundAmount = 0;
      }
    }
  }

  revalidatePath('/[lang]/travel');
  updateTag(TAG_TRIPS);
  return { success: true, booking: updatedBooking, refundAmount };
}

/**
 * Partial cancellation (T-MP.4): release specific seats from a group booking
 * while the rest of the party keeps travelling. Cancelling every remaining
 * seat delegates to cancelBooking so status/refund logic stays in one place.
 * Money already collected for manual payments is settled by the operator
 * off-platform — this recalculates what the booking is worth, it does not
 * move funds.
 */
export async function cancelBookingSeats(bookingId: number, seatNumbers: string[]) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await assertRateLimit('mutation', `travel-cancel-seats:${session.user.id}`);
  if (!Array.isArray(seatNumbers) || seatNumbers.length === 0) {
    throw new Error('Select at least one seat to cancel');
  }

  const booking = await db.transportBooking.findUnique({
    where: { id: bookingId },
    include: {
      seats: true,
      passengers: true,
      trip: { include: { route: { include: { office: true } } } },
    },
  });
  if (!booking) throw new Error('Booking not found');

  const isOwner = booking.userId === session.user.id;
  const isOperatorOrAdmin = canOverride(session, booking.trip.route.office.ownerId);
  if (!isOwner && !isOperatorOrAdmin) {
    throw new Error('Not authorized to modify this booking');
  }
  if (booking.status === 'Cancelled' || booking.status === 'Completed') {
    throw new Error('This booking can no longer be modified');
  }

  const bookedSeatNumbers = new Set(booking.seats.map((s) => s.seatNumber));
  const targets = [...new Set(seatNumbers)].filter((s) => bookedSeatNumbers.has(s));
  if (targets.length === 0) {
    throw new Error('Those seats are not part of this booking');
  }

  // Releasing everything is a full cancellation.
  if (targets.length >= booking.seats.length) {
    return cancelBooking(bookingId);
  }

  const remainingCount = booking.seats.length - targets.length;
  const newTotal = booking.trip.price * remainingCount;
  const cancelledPassengers = booking.passengers.filter((p) =>
    targets.includes(p.seatNumber),
  );

  await db.$transaction([
    db.seat.updateMany({
      where: { bookingId, seatNumber: { in: targets } },
      data: { status: 'Available', bookingId: null, reservedUntil: null },
    }),
    db.trip.update({
      where: { id: booking.tripId },
      data: { availableSeats: { increment: targets.length } },
    }),
    db.transportBooking.update({
      where: { id: bookingId },
      data: { totalAmount: newTotal },
    }),
    ...(cancelledPassengers.length
      ? [db.passenger.deleteMany({ where: { id: { in: cancelledPassengers.map((p) => p.id) } } })]
      : []),
  ]);

  revalidatePath('/[lang]/travel');
  updateTag(TAG_TRIPS);
  return {
    success: true,
    cancelledSeats: targets,
    remainingSeats: remainingCount,
    newTotal,
  };
}

export async function getBooking(id: number) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const booking = await db.transportBooking.findUnique({
    where: { id },
    include: {
      trip: {
        include: {
          route: {
            include: {
              origin: true,
              destination: true,
              office: {
                include: {
                  assemblyPoint: true,
                },
              },
            },
          },
          bus: true,
        },
      },
      seats: true,
      payments: true,
      passengers: { orderBy: { id: 'asc' } },
      user: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
    },
  });

  if (!booking) return null;

  // Only the traveler who booked, the office owner, or an admin may read.
  const isOwner = booking.userId === session.user.id;
  const isOperatorOrAdmin = canOverride(session, booking.trip.route.office.ownerId);
  if (!isOwner && !isOperatorOrAdmin) {
    throw new Error('Not authorized to view this booking');
  }

  return booking;
}

export async function getMyBookings(params?: { page?: number; limit?: number; status?: string }) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const page = Math.max(1, params?.page ?? 1);
  const limit = Math.min(100, Math.max(1, params?.limit ?? 20));
  const skip = (page - 1) * limit;

  const where = {
    userId: session.user.id,
    ...(params?.status && { status: params.status as TransportBookingStatus }),
  };

  const [bookings, total] = await Promise.all([
    db.transportBooking.findMany({
      where,
      select: {
        id: true,
        bookingReference: true,
        passengerName: true,
        passengerPhone: true,
        totalAmount: true,
        status: true,
        bookedAt: true,
        confirmedAt: true,
        trip: {
          select: {
            id: true,
            departureDate: true,
            departureTime: true,
            arrivalTime: true,
            route: {
              select: {
                origin: { select: { name: true, city: true } },
                destination: { select: { name: true, city: true } },
              },
            },
            bus: { select: { plateNumber: true, capacity: true } },
          },
        },
        _count: { select: { seats: true } },
        office: { select: { name: true, nameAr: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.transportBooking.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    bookings,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

export async function getOfficeBookings(
  officeId: number,
  params?: { page?: number; limit?: number; status?: string }
) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const office = await db.transportOffice.findUnique({
    where: { id: officeId },
    select: { ownerId: true },
  });
  if (!office) {
    throw new Error('Office not found');
  }
  if (!canOverride(session, office.ownerId)) {
    throw new Error('Not authorized to view this office');
  }

  const page = Math.max(1, params?.page ?? 1);
  const limit = Math.min(100, Math.max(1, params?.limit ?? 20));
  const skip = (page - 1) * limit;

  const where = {
    officeId,
    ...(params?.status && { status: params.status as TransportBookingStatus }),
  };

  const [bookings, total] = await Promise.all([
    db.transportBooking.findMany({
      where,
      select: {
        id: true,
        bookingReference: true,
        passengerName: true,
        passengerPhone: true,
        passengerEmail: true,
        totalAmount: true,
        status: true,
        bookedAt: true,
        trip: {
          select: {
            departureDate: true,
            departureTime: true,
            route: {
              select: {
                origin: { select: { name: true, city: true } },
                destination: { select: { name: true, city: true } },
              },
            },
            bus: { select: { plateNumber: true } },
          },
        },
        user: { select: { email: true, username: true } },
        seats: { select: { seatNumber: true, status: true } },
        passengers: { select: { name: true, seatNumber: true, checkedInAt: true } },
        _count: { select: { seats: true, payments: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.transportBooking.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    bookings,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

// ============================================
// PAYMENT ACTIONS
// ============================================

export async function processPayment(bookingId: number, data: PaymentFormData) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await assertRateLimit('payment', `travel-pay:${session.user.id}`);

  const booking = await db.transportBooking.findUnique({
    where: { id: bookingId },
    include: { trip: { include: { route: { include: { office: true } } } } },
  });

  if (!booking) {
    throw new Error('Booking not found');
  }

  // Only the traveler who booked, the office owner, or an admin may pay.
  // Without this, any authenticated user could mark someone else's booking
  // as paid and force-confirm it.
  const isOwner = booking.userId === session.user.id;
  const isOperatorOrAdmin = canOverride(session, booking.trip.route.office.ownerId);
  if (!isOwner && !isOperatorOrAdmin) {
    throw new Error('Not authorized to process payment for this booking');
  }

  // Card payments go through Stripe (createTransportPaymentIntent +
  // webhook confirmation) — never through this manual path.
  if (data.method === 'CreditCard' || data.method === 'DebitCard') {
    throw new Error('Card payments must use the card checkout');
  }

  // No money moves through this action. MobileMoney and BankTransfer record
  // the payer's claim (their transfer/wallet reference) and wait for the
  // operator to verify it via verifyPayment; CashOnArrival waits for the
  // passenger at the office. Nothing is marked Paid and nothing is
  // auto-confirmed here — that was the honor-system hole that fabricated
  // TXN-{ts}-{rand} ids and confirmed unpaid bookings.
  const reference =
    data.method === 'MobileMoney'
      ? (data.bankReference || data.mobileMoneyNumber || null)
      : data.method === 'BankTransfer'
        ? data.bankReference || null
        : null;

  if (data.method === 'BankTransfer' && !reference) {
    throw new Error('A transfer reference is required for bank transfer payments');
  }
  if (data.method === 'MobileMoney' && !reference) {
    throw new Error('A mobile money number or transaction reference is required');
  }

  const payment = await db.transportPayment.create({
    data: {
      bookingId,
      amount: booking.totalAmount,
      method: data.method,
      status: 'Pending',
      transactionId: reference,
    },
  });

  // A submitted payment claim earns a longer seat hold than the 30-minute
  // checkout TTL, so the sweeper doesn't release seats the passenger
  // already paid for while the operator verifies the reference. Cash
  // bookings keep the short hold — the copy tells passengers to arrive
  // early and pay at the office.
  if (data.method !== 'CashOnArrival') {
    await db.seat.updateMany({
      where: { bookingId, status: 'Reserved' },
      data: { reservedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });
  }

  revalidatePath('/[lang]/travel');
  return { success: true, payment, pendingVerification: data.method !== 'CashOnArrival' };
}

export async function verifyPayment(paymentId: number, approve: boolean = true) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await assertRateLimit('mutation', `travel-verify-pay:${session.user.id}`);

  // Only the office owner or an admin may mark a payment as verified.
  const existing = await db.transportPayment.findUnique({
    where: { id: paymentId },
    include: {
      booking: {
        include: { trip: { include: { route: { include: { office: true } } } } },
      },
    },
  });
  if (!existing) {
    throw new Error('Payment not found');
  }
  if (!canOverride(session, existing.booking.trip.route.office.ownerId)) {
    throw new Error('Not authorized to verify this payment');
  }

  if (approve) {
    const payment = await db.transportPayment.update({
      where: { id: paymentId },
      data: {
        status: 'Paid',
        paidAt: new Date(),
      },
    });

    // Confirm the booking
    await confirmBooking(payment.bookingId);

    revalidatePath('/[lang]/travel');
    return { success: true, payment };
  } else {
    const payment = await db.transportPayment.update({
      where: { id: paymentId },
      data: {
        status: 'Failed',
      },
    });

    // Cancel the booking
    await db.transportBooking.update({
      where: { id: payment.bookingId },
      data: {
        status: 'Cancelled',
        cancelledAt: new Date(),
      },
    });

    // Release seats immediately back to Available
    const booking = await db.transportBooking.findUnique({
      where: { id: payment.bookingId },
      include: { seats: true },
    });

    if (booking) {
      await db.seat.updateMany({
        where: { bookingId: booking.id },
        data: { status: 'Available', bookingId: null, reservedUntil: null },
      });

      // Increment available seats count
      await db.trip.update({
        where: { id: booking.tripId },
        data: {
          availableSeats: {
            increment: booking.seats.length,
          },
        },
      });
    }

    revalidatePath('/[lang]/travel');
    return { success: true, payment };
  }
}

// ============================================
// TICKET ACTIONS
// ============================================

export async function generateTicketData(bookingId: number) {
  const booking = await getBooking(bookingId);

  if (!booking) {
    throw new Error('Booking not found');
  }

  // Booking-level signed QR (T-TK.3) — the stored copy also authenticates
  // legacy unsigned scans via exact-match fallback in validateTicket.
  const qrData = buildSignedQrPayload(booking.bookingReference);

  // Per-passenger signed QRs: each seat gets its own boarding document so a
  // group of 4 can arrive (and board) separately.
  const passengerTickets = booking.passengers.map((p) => ({
    passenger: p,
    qrData: buildSignedQrPayload(booking.bookingReference, p.seatNumber),
  }));

  // Update booking with QR code
  await db.transportBooking.update({
    where: { id: bookingId },
    data: { qrCode: qrData },
  });

  return {
    booking,
    qrData,
    passengerTickets,
  };
}

/**
 * Gate-side scan validation. Operator-only: accepts a signed QR payload or
 * a plain booking reference typed by the agent (camera-less fallback).
 * Seat-scoped QRs report that passenger's check-in state so each member of
 * a group boards exactly once.
 */
export async function validateTicket(qrCode: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { valid: false as const, message: 'auth' };
  }

  // A gate agent scans in bursts, so this rides the generous mutation bucket
  // rather than a scan-specific one — it exists to stop a scripted loop
  // hammering the reference lookup, not to pace a real queue. Returned, not
  // thrown, because every other failure here is a typed result the scanner UI
  // already knows how to render.
  try {
    await assertRateLimit('mutation', `travel-validate:${session.user.id}`);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { valid: false as const, message: 'rateLimited' };
    }
    throw error;
  }

  let ref = '';
  let seat = '';
  let sig = '';
  let isSigned = false;
  let isManualEntry = false;

  const raw = qrCode.trim();
  try {
    const data = JSON.parse(raw) as { ref?: unknown; seat?: unknown; sig?: unknown };
    ref = typeof data.ref === 'string' ? data.ref : '';
    seat = typeof data.seat === 'string' ? data.seat : '';
    sig = typeof data.sig === 'string' ? data.sig : '';
    isSigned = Boolean(sig);
  } catch {
    isManualEntry = true;
    // Not JSON — treat the input as a manually entered booking reference.
    ref = raw.toUpperCase();
  }

  if (!ref) {
    return { valid: false as const, message: 'invalid' };
  }

  const booking = await db.transportBooking.findUnique({
    where: { bookingReference: ref },
    include: {
      trip: { include: { route: { include: { origin: true, destination: true, office: true } } } },
      seats: true,
      passengers: true,
    },
  });

  if (!booking) {
    return { valid: false as const, message: 'notFound' };
  }

  // Only the operator whose trip this is (or an admin) can validate scans —
  // gate agents authenticate as the office owner.
  if (!canOverride(session, booking.trip.route.office.ownerId)) {
    return { valid: false as const, message: 'auth' };
  }

  // Forgery check: signed payloads must verify; unsigned JSON payloads are
  // only trusted when they byte-match the QR we stored for this booking
  // (i.e. a ticket issued before signing shipped).
  if (isSigned) {
    if (!verifyQrSignature(ref, seat, sig)) {
      return { valid: false as const, message: 'forged' };
    }
  } else if (!isManualEntry && booking.qrCode !== raw) {
    // Was `raw !== ref`, which defeated the `toUpperCase()` two lines up: an
    // agent typing "bk-1" made raw ≠ ref, fell into the QR byte-match, and got
    // 'forged' — so the camera-less fallback only worked in exact uppercase.
    // Manual entry is trusted on the operator auth check above, not on bytes.
    return { valid: false as const, message: 'forged' };
  }

  if (booking.status === 'Cancelled') {
    return { valid: false as const, message: 'cancelled' };
  }
  if (booking.status === 'Completed') {
    return { valid: false as const, message: 'used' };
  }
  if (booking.status === 'Pending') {
    return { valid: false as const, message: 'unpaid' };
  }

  const passenger = seat
    ? booking.passengers.find((p) => p.seatNumber === seat) ?? null
    : null;
  if (seat && passenger?.checkedInAt) {
    return { valid: false as const, message: 'used' };
  }

  return {
    valid: true as const,
    message: 'valid',
    ticket: {
      bookingId: booking.id,
      reference: booking.bookingReference,
      status: booking.status,
      passengerName: passenger?.name ?? booking.passengerName,
      seat: seat || booking.seats.map((s) => s.seatNumber).join(', '),
      seatScoped: Boolean(seat),
      origin: booking.trip.route.origin.city,
      destination: booking.trip.route.destination.city,
      departureDate: booking.trip.departureDate.toISOString(),
      departureTime: booking.trip.departureTime,
      passengers: booking.passengers.map((p) => ({
        name: p.name,
        seatNumber: p.seatNumber,
        checkedIn: Boolean(p.checkedInAt),
      })),
    },
  };
}

/**
 * Board a scanned passenger. Seat-scoped tickets check in one Passenger row;
 * booking-level tickets (legacy / single traveller) complete the whole
 * booking. When the last passenger of a group boards, the booking flips to
 * Completed so a re-scan of any of its tickets reads "already used".
 */
export async function checkInTicket(bookingId: number, seatNumber?: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await assertRateLimit('mutation', `travel-checkin:${session.user.id}`);

  const booking = await db.transportBooking.findUnique({
    where: { id: bookingId },
    include: {
      trip: { include: { route: { include: { office: true } } } },
      passengers: true,
    },
  });
  if (!booking) throw new Error('Booking not found');
  if (!canOverride(session, booking.trip.route.office.ownerId)) {
    throw new Error('Not authorized to check in this booking');
  }
  if (booking.status !== 'Confirmed') {
    throw new Error('Only confirmed bookings can be checked in');
  }

  const now = new Date();

  if (seatNumber && booking.passengers.length > 0) {
    const passenger = booking.passengers.find((p) => p.seatNumber === seatNumber);
    if (!passenger) throw new Error('No passenger on that seat');
    if (passenger.checkedInAt) throw new Error('Passenger already checked in');

    await db.passenger.update({
      where: { id: passenger.id },
      data: { checkedInAt: now },
    });

    const remaining = booking.passengers.filter(
      (p) => p.id !== passenger.id && !p.checkedInAt,
    ).length;
    if (remaining === 0) {
      await db.transportBooking.update({
        where: { id: bookingId },
        data: { status: 'Completed' },
      });
    }
    return { success: true, boarded: passenger.name, remaining };
  }

  // Booking-level check-in: everyone boards at once.
  await db.$transaction([
    db.passenger.updateMany({
      where: { bookingId, checkedInAt: null },
      data: { checkedInAt: now },
    }),
    db.transportBooking.update({
      where: { id: bookingId },
      data: { status: 'Completed' },
    }),
  ]);
  return { success: true, boarded: booking.passengerName, remaining: 0 };
}

// ============================================
// ADDITIONAL DASHBOARD ACTIONS
// ============================================

export async function getMyTransportOffices() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const offices = await db.transportOffice.findMany({
    where: { ownerId: session.user.id },
    include: {
      assemblyPoint: true,
      _count: {
        select: {
          buses: true,
          routes: true,
          bookings: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return offices;
}

export async function publishTransportOffice(id: number) {
  return publishOffice(id);
}

export async function deleteTransportOffice(id: number) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  // Verify ownership
  const office = await db.transportOffice.findUnique({
    where: { id },
    select: { ownerId: true },
  });

  if (!office || !canOverride(session, office.ownerId)) {
    throw new Error('Unauthorized');
  }

  // Delete office (this will cascade delete buses, routes, trips, etc.)
  await db.transportOffice.delete({
    where: { id },
  });

  revalidatePath('/[lang]/(dashboard)/offices');
  updateTag(TAG_TRIPS);
  return { success: true };
}

export async function getOfficeDashboardStats(officeId: number) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const office = await db.transportOffice.findUnique({
    where: { id: officeId },
    select: { ownerId: true },
  });
  if (!office) {
    throw new Error('Office not found');
  }
  if (!canOverride(session, office.ownerId)) {
    throw new Error('Not authorized to view this office');
  }

  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    totalBookings,
    pendingBookings,
    confirmedBookings,
    revenueData,
    upcomingTrips,
    totalBuses,
    totalRoutes,
  ] = await Promise.all([
    db.transportBooking.count({ where: { officeId } }),
    db.transportBooking.count({ where: { officeId, status: 'Pending' } }),
    db.transportBooking.count({ where: { officeId, status: 'Confirmed' } }),
    db.transportBooking.aggregate({
      where: { officeId, status: { in: ['Confirmed', 'Completed'] } },
      _sum: { totalAmount: true },
    }),
    db.trip.count({
      where: {
        route: { officeId },
        departureDate: { gte: now, lte: sevenDaysFromNow },
        isActive: true,
        isCancelled: false,
      },
    }),
    db.bus.count({ where: { officeId, isActive: true } }),
    db.route.count({ where: { officeId, isActive: true } }),
  ]);

  return {
    totalBookings,
    pendingBookings,
    confirmedBookings,
    totalRevenue: revenueData._sum.totalAmount || 0,
    upcomingTrips,
    totalBuses,
    totalRoutes,
  };
}

export async function getBusesByOffice(officeId: number) {
  const buses = await db.bus.findMany({
    where: { officeId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  return buses;
}

export async function getRoutesByOffice(officeId: number) {
  const routes = await db.route.findMany({
    where: { officeId, isActive: true },
    include: {
      origin: true,
      destination: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return routes;
}

export async function getTripsByOffice(officeId: number) {
  const trips = await db.trip.findMany({
    where: {
      route: { officeId },
      isActive: true,
    },
    include: {
      route: {
        include: {
          origin: true,
          destination: true,
        },
      },
      bus: true,
      _count: {
        select: {
          bookings: true,
        },
      },
    },
    orderBy: { departureDate: 'asc' },
  });

  return trips;
}

export async function deleteTrip(id: number) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  // Check if trip has any bookings
  const trip = await db.trip.findUnique({
    where: { id },
    include: {
      _count: { select: { bookings: true } },
      route: { select: { office: { select: { ownerId: true } } } },
    },
  });

  if (!trip) {
    throw new Error('Trip not found');
  }

  if (!canOverride(session, trip.route.office.ownerId)) {
    throw new Error('Unauthorized');
  }

  if (trip._count.bookings > 0) {
    throw new Error('Cannot delete trip with existing bookings');
  }

  // Delete seats first
  await db.seat.deleteMany({ where: { tripId: id } });

  // Delete trip
  await db.trip.delete({ where: { id } });

  revalidatePath('/[lang]/(dashboard)/offices');
  updateTag(TAG_TRIPS);
  updateTag(TAG_POPULAR_ROUTES);
  return { success: true };
}

export async function updateBookingStatus(
  bookingId: number,
  status: 'Pending' | 'Confirmed' | 'Cancelled' | 'Completed' | 'NoShow'
) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const booking = await db.transportBooking.findUnique({
    where: { id: bookingId },
    include: {
      office: { select: { ownerId: true } },
      seats: true,
    },
  });

  if (!booking) {
    throw new Error('Booking not found');
  }

  if (!canOverride(session, booking.office.ownerId)) {
    throw new Error('Unauthorized');
  }

  await assertRateLimit('mutation', `travel-booking-status:${session.user.id}`);

  // Update booking
  const updatedBooking = await db.transportBooking.update({
    where: { id: bookingId },
    data: {
      status,
      confirmedAt: status === 'Confirmed' ? new Date() : booking.confirmedAt,
      cancelledAt: status === 'Cancelled' ? new Date() : booking.cancelledAt,
    },
  });

  // Update seats based on status. reservedUntil clears in both directions —
  // a Booked seat must never look like a sweepable checkout hold, and a
  // released seat must not carry a stale TTL into its next reservation.
  if (status === 'Cancelled') {
    await db.seat.updateMany({
      where: { bookingId },
      data: { status: 'Available', bookingId: null, reservedUntil: null },
    });

    // Restore available seats count
    await db.trip.update({
      where: { id: booking.tripId },
      data: { availableSeats: { increment: booking.seats.length } },
    });
  } else if (status === 'Confirmed') {
    await db.seat.updateMany({
      where: { bookingId },
      data: { status: 'Booked', reservedUntil: null },
    });
    await sendTravelConfirmationEmailSafe(bookingId);
  }

  // Settle the manual-payment claim in the same breath as the status change.
  //
  // A rider paying by Bankak / mobile money / cash files a Pending
  // TransportPayment claim; the operator whose wallet received the money is
  // the one who confirms it. That confirmation arrives through THIS action —
  // the Confirm button on the operator's bookings page — but it used to touch
  // only the booking and the seats. The claim stayed Pending forever: the
  // passenger travelled on a confirmed ticket while the admin reconciliation
  // queue kept a payment that would never clear, burying the claims that
  // genuinely hadn't been paid. (The admin path is fine — verifyPayment marks
  // the row Paid before it confirms.)
  if (status === 'Confirmed') {
    await db.transportPayment.updateMany({
      where: { bookingId, status: 'Pending' },
      data: { status: 'Paid', paidAt: new Date() },
    });
  } else if (status === 'Cancelled') {
    await db.transportPayment.updateMany({
      where: { bookingId, status: 'Pending' },
      data: { status: 'Failed' },
    });
  }

  revalidatePath('/[lang]/(dashboard)/offices');
  updateTag(TAG_TRIPS);
  return { success: true, booking: updatedBooking };
}
