'use server';

import { z } from 'zod';
import { auth, canOverride } from '@/lib/auth';
import { db } from '@/lib/db';
import { BusAmenity, Prisma, TransportBookingStatus } from '@prisma/client';
import { revalidatePath, revalidateTag, unstable_cache } from 'next/cache';
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
} from '@/lib/schemas/transport-schemas';
import type {
  TransportOfficeFormData,
  TransportOfficeDraftData,
  BusFormData,
  RouteFormData,
  TripFormData,
  BookingFormData,
  PaymentFormData,
} from '@/lib/schemas/transport-schemas';
import { sanitizeInput, sanitizeEmail, sanitizePhone } from "@/lib/sanitization";
import { logger } from "@/lib/logger";

const idSchema = z.number().int().positive();

// Cache tags for transport-wide reactive invalidation
const TAG_ASSEMBLY_POINTS = 'transport:assembly-points';
const TAG_CITIES = 'transport:cities';
const TAG_POPULAR_ROUTES = 'transport:popular-routes';

// ============================================
// ASSEMBLY POINT ACTIONS
// ============================================

export async function getAssemblyPoints(city?: string) {
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
}

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

  revalidatePath('/[lang]/transport-host');
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

  revalidatePath('/[lang]/transport-host');
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

  const office = await db.transportOffice.update({
    where: { id, ownerId: session.user.id },
    data: { isActive: true },
  });

  revalidatePath('/[lang]/transport');
  revalidatePath('/[lang]/transport-host');
  return { success: true, office };
}

export async function getTransportOffices() {
  const offices = await db.transportOffice.findMany({
    where: { isActive: true },
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

  revalidatePath('/[lang]/transport-host');
  revalidatePath('/[lang]/(dashboard)/offices');
  return bus;
}

export async function updateBus(id: unknown, data: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

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

  revalidatePath('/[lang]/transport-host');
  revalidatePath('/[lang]/(dashboard)/offices');
  return bus;
}

export async function deleteBus(id: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

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

  revalidatePath('/[lang]/transport-host');
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

  revalidatePath('/[lang]/transport-host');
  revalidatePath('/[lang]/(dashboard)/offices');
  return route;
}

export async function updateRoute(id: unknown, data: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

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

  revalidatePath('/[lang]/transport-host');
  revalidatePath('/[lang]/(dashboard)/offices');
  return route;
}

export async function deleteRoute(id: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

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

  revalidatePath('/[lang]/transport-host');
  revalidatePath('/[lang]/(dashboard)/offices');
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
  date: z.coerce.date(),
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
  const { gte: dayStart, lt: dayEnd } = dayWindow(input.date);

  const routeFilter: Prisma.RouteWhereInput = { isActive: true };

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
    departureDate: { gte: dayStart, lt: dayEnd },
    route: routeFilter,
  };

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
  const where = buildTripWhere(data);
  const orderBy = buildOrderBy(data.sort);

  // Compute "facet where" by dropping price and amenity filters so sliders
  // and checkboxes show the full range of options for the current day/route.
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
}

export type SearchTripsResult = Awaited<ReturnType<typeof searchTrips>>;

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

  const where: Prisma.TransportOfficeWhereInput = { isActive: true };
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

// ============================================
// TRIP ACTIONS
// ============================================

export async function createTrip(data: TripFormData) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  // Verify both route and bus belong to an office the caller owns.
  // Prevents operator A from creating trips on operator B's fleet.
  const [bus, route] = await Promise.all([
    db.bus.findUnique({
      where: { id: data.busId },
      select: { capacity: true, officeId: true, office: { select: { ownerId: true } } },
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

  // Generate seats for the trip
  const rows = Math.ceil(bus.capacity / 4); // Assuming 4 seats per row
  const seats = [];

  for (let row = 1; row <= rows; row++) {
    for (let col = 1; col <= 4; col++) {
      const seatNumber = `${String.fromCharCode(64 + row)}${col}`;
      const seatType =
        col === 1 || col === 4 ? 'window' : col === 2 ? 'aisle' : 'middle';

      seats.push({
        tripId: trip.id,
        seatNumber,
        row,
        column: col,
        seatType,
        status: 'Available' as const,
      });
    }
  }

  await db.seat.createMany({
    data: seats.slice(0, bus.capacity),
  });

  revalidatePath('/[lang]/transport-host');
  revalidatePath('/[lang]/(dashboard)/offices');
  return trip;
}

export async function updateTrip(id: number, data: Partial<TripFormData>) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

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

  revalidatePath('/[lang]/transport-host');
  revalidatePath('/[lang]/(dashboard)/offices');
  return { success: true, trip };
}

export async function cancelTrip(id: number) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

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

  revalidatePath('/[lang]/transport');
  revalidatePath('/[lang]/(dashboard)/offices');
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

export async function getTripSeats(tripId: number) {
  const seats = await db.seat.findMany({
    where: { tripId },
    orderBy: [{ row: 'asc' }, { column: 'asc' }],
  });

  return seats;
}

// ============================================
// BOOKING ACTIONS
// ============================================

export async function createBooking(data: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
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

  const booking = await db.$transaction(async (tx) => {
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

    // Verify seats are available
    const seats = await tx.seat.findMany({
      where: {
        tripId: validData.tripId,
        seatNumber: { in: validData.seatNumbers },
        status: 'Available',
      },
    });

    if (seats.length !== validData.seatNumbers.length) {
      throw new Error('Some selected seats are no longer available');
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

  revalidatePath('/[lang]/transport');
  return { success: true, booking };
}

export async function confirmBooking(id: number) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

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

  revalidatePath('/[lang]/transport');
  return { success: true, booking };
}

/**
 * Cron-safe sweeper: any seat still in "Reserved" whose reservedUntil is
 * in the past is released back to Available. Called by
 * `/api/cron/release-seats` every 5 minutes. Also marks the associated
 * booking Cancelled so analytics/operator views match reality.
 *
 * Skips auth because the caller is the cron job, which authenticates via
 * the CRON_SECRET header on the route.
 */
export async function releaseExpiredSeatHolds() {
  const now = new Date();

  // Find bookings whose seats all point to a stale TTL. We cancel the
  // booking, release the seats, and bump the trip's availableSeats.
  const stale = await db.seat.findMany({
    where: {
      status: 'Reserved',
      reservedUntil: { lt: now },
      bookingId: { not: null },
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

  return { success: true, released: seatIds.length, bookingsCancelled: bookingIds.length };
}

export async function cancelBooking(id: number) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const booking = await db.transportBooking.findUnique({
    where: { id },
    include: {
      seats: true,
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

  // Release seats
  await db.seat.updateMany({
    where: { bookingId: id },
    data: {
      status: 'Available',
      bookingId: null,
    },
  });

  // Update booking status
  const updatedBooking = await db.transportBooking.update({
    where: { id },
    data: {
      status: 'Cancelled',
      cancelledAt: new Date(),
    },
  });

  // Update available seats count
  await db.trip.update({
    where: { id: booking.tripId },
    data: {
      availableSeats: {
        increment: booking.seats.length,
      },
    },
  });

  revalidatePath('/[lang]/transport');
  return { success: true, booking: updatedBooking };
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
        office: { select: { name: true, phone: true } },
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
                origin: { select: { name: true } },
                destination: { select: { name: true } },
              },
            },
            bus: { select: { plateNumber: true } },
          },
        },
        user: { select: { email: true, username: true } },
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

  // Create payment record
  const payment = await db.transportPayment.create({
    data: {
      bookingId,
      amount: booking.totalAmount,
      method: data.method,
      status: data.method === 'CashOnArrival' ? 'Pending' : 'Paid',
      paidAt: data.method === 'CashOnArrival' ? null : new Date(),
      transactionId:
        data.method === 'CashOnArrival'
          ? null
          : `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    },
  });

  // If payment is successful (not cash on arrival), confirm booking
  if (data.method !== 'CashOnArrival') {
    await confirmBooking(bookingId);
  }

  revalidatePath('/[lang]/transport');
  return { success: true, payment };
}

export async function verifyPayment(paymentId: number) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

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

  const payment = await db.transportPayment.update({
    where: { id: paymentId },
    data: {
      status: 'Paid',
      paidAt: new Date(),
    },
  });

  // Confirm the booking
  await confirmBooking(payment.bookingId);

  revalidatePath('/[lang]/transport');
  return { success: true, payment };
}

// ============================================
// TICKET ACTIONS
// ============================================

export async function generateTicketData(bookingId: number) {
  const booking = await getBooking(bookingId);

  if (!booking) {
    throw new Error('Booking not found');
  }

  // Generate QR code data (booking reference)
  const qrData = JSON.stringify({
    ref: booking.bookingReference,
    passenger: booking.passengerName,
    seats: booking.seats.map((s) => s.seatNumber),
    date: booking.trip.departureDate,
    time: booking.trip.departureTime,
  });

  // Update booking with QR code
  await db.transportBooking.update({
    where: { id: bookingId },
    data: { qrCode: qrData },
  });

  return {
    booking,
    qrData,
  };
}

export async function validateTicket(qrCode: string) {
  try {
    const data = JSON.parse(qrCode);
    const booking = await db.transportBooking.findUnique({
      where: { bookingReference: data.ref },
      include: {
        trip: true,
        seats: true,
      },
    });

    if (!booking) {
      return { valid: false, message: 'Booking not found' };
    }

    if (booking.status === 'Cancelled') {
      return { valid: false, message: 'Booking was cancelled' };
    }

    if (booking.status === 'Completed') {
      return { valid: false, message: 'Ticket already used' };
    }

    return {
      valid: true,
      booking,
      message: 'Valid ticket',
    };
  } catch {
    return { valid: false, message: 'Invalid QR code' };
  }
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

  // Update booking
  const updatedBooking = await db.transportBooking.update({
    where: { id: bookingId },
    data: {
      status,
      confirmedAt: status === 'Confirmed' ? new Date() : booking.confirmedAt,
      cancelledAt: status === 'Cancelled' ? new Date() : booking.cancelledAt,
    },
  });

  // Update seats based on status
  if (status === 'Cancelled') {
    await db.seat.updateMany({
      where: { bookingId },
      data: { status: 'Available', bookingId: null },
    });

    // Restore available seats count
    await db.trip.update({
      where: { id: booking.tripId },
      data: { availableSeats: { increment: booking.seats.length } },
    });
  } else if (status === 'Confirmed') {
    await db.seat.updateMany({
      where: { bookingId },
      data: { status: 'Booked' },
    });
  }

  revalidatePath('/[lang]/(dashboard)/offices');
  return { success: true, booking: updatedBooking };
}
