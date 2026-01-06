'use server';

import { auth } from '@/auth';
import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import type {
  TransportOfficeFormData,
  TransportOfficeDraftData,
  BusFormData,
  RouteFormData,
  TripFormData,
  BookingFormData,
  PaymentFormData,
} from '@/lib/schemas/transport-schemas';

// ============================================
// ASSEMBLY POINT ACTIONS
// ============================================

export async function getAssemblyPoints(city?: string) {
  const where = city ? { city, isActive: true } : { isActive: true };

  const assemblyPoints = await db.assemblyPoint.findMany({
    where,
    orderBy: { name: 'asc' },
  });

  return assemblyPoints;
}

export async function getCities() {
  const cities = await db.assemblyPoint.findMany({
    where: { isActive: true },
    select: { city: true },
    distinct: ['city'],
    orderBy: { city: 'asc' },
  });

  return cities.map((c) => c.city);
}

// ============================================
// TRANSPORT OFFICE ACTIONS
// ============================================

export async function createTransportOffice(data: TransportOfficeDraftData) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const office = await db.transportOffice.create({
    data: {
      name: data.name,
      nameAr: data.nameAr || null,
      description: data.description || null,
      descriptionAr: data.descriptionAr || null,
      phone: data.phone || '',
      email: data.email || '',
      licenseNumber: data.licenseNumber || null,
      assemblyPointId: data.assemblyPointId || null,
      logoUrl: data.logoUrl || null,
      ownerId: session.user.id,
      isActive: false,
    },
  });

  revalidatePath('/[lang]/transport-host');
  return { success: true, office };
}

export async function updateTransportOffice(
  id: number,
  data: Partial<TransportOfficeFormData>
) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  // Verify ownership
  const existing = await db.transportOffice.findUnique({
    where: { id },
    select: { ownerId: true },
  });

  if (!existing || existing.ownerId !== session.user.id) {
    throw new Error('Unauthorized');
  }

  const office = await db.transportOffice.update({
    where: { id },
    data,
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

  if (!office || office.ownerId !== session.user.id) {
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

export async function updateBus(id: number, data: Partial<BusFormData>) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const bus = await db.bus.update({
    where: { id },
    data,
  });

  revalidatePath('/[lang]/transport-host');
  revalidatePath('/[lang]/(dashboard)/offices');
  return bus;
}

export async function deleteBus(id: number) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await db.bus.delete({
    where: { id },
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

  if (!office || office.ownerId !== session.user.id) {
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

export async function updateRoute(id: number, data: Partial<RouteFormData>) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const route = await db.route.update({
    where: { id },
    data,
    include: {
      origin: true,
      destination: true,
    },
  });

  revalidatePath('/[lang]/transport-host');
  revalidatePath('/[lang]/(dashboard)/offices');
  return route;
}

export async function deleteRoute(id: number) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await db.route.delete({
    where: { id },
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

export async function searchRoutes(
  origin: string,
  destination: string,
  date: Date
) {
  const routes = await db.route.findMany({
    where: {
      isActive: true,
      origin: {
        OR: [
          { city: { contains: origin, mode: 'insensitive' } },
          { name: { contains: origin, mode: 'insensitive' } },
        ],
      },
      destination: {
        OR: [
          { city: { contains: destination, mode: 'insensitive' } },
          { name: { contains: destination, mode: 'insensitive' } },
        ],
      },
      trips: {
        some: {
          departureDate: {
            gte: new Date(date.setHours(0, 0, 0, 0)),
            lt: new Date(date.setHours(23, 59, 59, 999)),
          },
          isActive: true,
          isCancelled: false,
        },
      },
    },
    include: {
      origin: true,
      destination: true,
      office: {
        include: {
          assemblyPoint: true,
        },
      },
      trips: {
        where: {
          departureDate: {
            gte: new Date(date.setHours(0, 0, 0, 0)),
            lt: new Date(date.setHours(23, 59, 59, 999)),
          },
          isActive: true,
          isCancelled: false,
        },
        include: {
          bus: true,
        },
      },
    },
  });

  return routes;
}

// ============================================
// TRIP ACTIONS
// ============================================

export async function createTrip(data: TripFormData) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  // Get bus capacity for available seats
  const bus = await db.bus.findUnique({
    where: { id: data.busId },
    select: { capacity: true },
  });

  if (!bus) {
    throw new Error('Bus not found');
  }

  const trip = await db.trip.create({
    data: {
      routeId: data.routeId,
      busId: data.busId,
      departureDate: data.departureDate,
      departureTime: data.departureTime,
      arrivalTime: data.arrivalTime || null,
      price: data.price ?? 0,
      availableSeats: data.availableSeats ?? bus.capacity,
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

  const trip = await db.trip.update({
    where: { id },
    data: { isCancelled: true },
  });

  // TODO: Send notifications to booked passengers

  revalidatePath('/[lang]/transport');
  revalidatePath('/[lang]/(dashboard)/offices');
  return { success: true, trip };
}

export async function getTrips(routeId?: number, date?: Date) {
  const where: Record<string, unknown> = { isActive: true, isCancelled: false };

  if (routeId) where.routeId = routeId;
  if (date) {
    where.departureDate = {
      gte: new Date(date.setHours(0, 0, 0, 0)),
      lt: new Date(date.setHours(23, 59, 59, 999)),
    };
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

export async function createBooking(data: BookingFormData) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  // Get trip details
  const trip = await db.trip.findUnique({
    where: { id: data.tripId },
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
  const seats = await db.seat.findMany({
    where: {
      tripId: data.tripId,
      seatNumber: { in: data.seatNumbers },
      status: 'Available',
    },
  });

  if (seats.length !== data.seatNumbers.length) {
    throw new Error('Some selected seats are no longer available');
  }

  const totalAmount = trip.price * data.seatNumbers.length;

  // Create booking
  const booking = await db.transportBooking.create({
    data: {
      userId: session.user.id,
      tripId: data.tripId,
      officeId: trip.route.office.id,
      passengerName: data.passengerName,
      passengerPhone: data.passengerPhone,
      passengerEmail: data.passengerEmail || null,
      totalAmount,
      status: 'Pending',
    },
  });

  // Reserve seats
  await db.seat.updateMany({
    where: {
      tripId: data.tripId,
      seatNumber: { in: data.seatNumbers },
    },
    data: {
      status: 'Reserved',
      bookingId: booking.id,
    },
  });

  // Update available seats count
  await db.trip.update({
    where: { id: data.tripId },
    data: {
      availableSeats: {
        decrement: data.seatNumbers.length,
      },
    },
  });

  revalidatePath('/[lang]/transport');
  return { success: true, booking };
}

export async function confirmBooking(id: number) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const booking = await db.transportBooking.update({
    where: { id },
    data: {
      status: 'Confirmed',
      confirmedAt: new Date(),
    },
  });

  // Update seats to Booked
  await db.seat.updateMany({
    where: { bookingId: id },
    data: { status: 'Booked' },
  });

  revalidatePath('/[lang]/transport');
  return { success: true, booking };
}

export async function cancelBooking(id: number) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const booking = await db.transportBooking.findUnique({
    where: { id },
    include: { seats: true },
  });

  if (!booking) {
    throw new Error('Booking not found');
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
    ...(params?.status && { status: params.status as any }),
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

  const page = Math.max(1, params?.page ?? 1);
  const limit = Math.min(100, Math.max(1, params?.limit ?? 20));
  const skip = (page - 1) * limit;

  const where = {
    officeId,
    ...(params?.status && { status: params.status as any }),
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
  });

  if (!booking) {
    throw new Error('Booking not found');
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

  if (!office || office.ownerId !== session.user.id) {
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

  if (trip.route.office.ownerId !== session.user.id) {
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

  if (booking.office.ownerId !== session.user.id) {
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
