"use server";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath, updateTag } from "next/cache";
import { BookingStatus } from "@prisma/client";
import { logger } from "@/lib/logger";
import { assertRateLimit } from "@/lib/rate-limit";

// ============================================
// SCHEMAS
// ============================================

const bookingIdSchema = z.number().int().positive();
const listingIdSchema = z.number().int().positive();

const createBookingSchema = z
  .object({
    listingId: z.number().int().positive(),
    checkIn: z.coerce.date(),
    checkOut: z.coerce.date(),
    guestCount: z.number().int().min(1),
    specialRequests: z.string().max(2000).optional(),
  })
  .refine((data) => data.checkOut > data.checkIn, {
    message: "Check-out must be after check-in",
  });

const bookingFiltersSchema = z.object({
  status: z.nativeEnum(BookingStatus).optional(),
  take: z.number().int().min(1).max(100).default(50),
  skip: z.number().int().min(0).default(0),
});

const addBlockedDatesSchema = z.object({
  listingId: z.number().int().positive(),
  dates: z.array(
    z.object({
      startDate: z.coerce.date(),
      endDate: z.coerce.date(),
      reason: z.string().max(500).optional(),
    })
  ).min(1),
});

const removeBlockedDatesSchema = z.object({
  listingId: z.number().int().positive(),
  dateIds: z.array(z.number().int().positive()).min(1),
});

const checkAvailabilitySchema = z
  .object({
    listingId: z.number().int().positive(),
    checkIn: z.coerce.date(),
    checkOut: z.coerce.date(),
  })
  .refine((data) => data.checkOut > data.checkIn, {
    message: "Check-out must be after check-in",
  });

// ============================================
// TYPES
// ============================================

export interface CreateBookingData {
  listingId: number;
  checkIn: Date;
  checkOut: Date;
  guestCount: number;
  specialRequests?: string;
}

export interface BookingFilters {
  status?: BookingStatus;
  take?: number;
  skip?: number;
}

export interface AddBlockedDatesData {
  listingId: number;
  dates: Array<{
    startDate: Date;
    endDate: Date;
    reason?: string;
  }>;
}

export interface RemoveBlockedDatesData {
  listingId: number;
  dateIds: number[];
}

// ============================================
// HELPERS
// ============================================

function calculateNights(checkIn: Date, checkOut: Date): number {
  const diffMs = checkOut.getTime() - checkIn.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// ============================================
// CREATE BOOKING
// ============================================

export async function createBooking(data: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to create a booking");
  }

  await assertRateLimit("mutation", `booking:${session.user.id}`);

  const parsed = createBookingSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Invalid booking data");
  }

  const { listingId, checkIn, checkOut, guestCount, specialRequests } = parsed.data;

  try {
    // Verify listing exists and is published
    const listing = await db.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        isPublished: true,
        draft: true,
        pricePerNight: true,
        cleaningFee: true,
        weeklyDiscount: true,
        monthlyDiscount: true,
        guestCount: true,
        hostId: true,
      },
    });

    if (!listing) {
      throw new Error("Listing not found");
    }

    if (!listing.isPublished || listing.draft) {
      throw new Error("Listing is not available for booking");
    }

    if (guestCount > listing.guestCount) {
      throw new Error("Guest count exceeds listing capacity");
    }

    // Check for overlapping confirmed bookings
    const overlapping = await db.booking.findFirst({
      where: {
        listingId,
        status: { in: [BookingStatus.Confirmed, BookingStatus.Pending] },
        AND: [
          { checkIn: { lt: checkOut } },
          { checkOut: { gt: checkIn } },
        ],
      },
    });

    if (overlapping) {
      throw new Error("Dates are not available — overlapping booking exists");
    }

    // Check for blocked dates in range
    const blocked = await db.blockedDate.findFirst({
      where: {
        listingId,
        AND: [
          { startDate: { lt: checkOut } },
          { endDate: { gt: checkIn } },
        ],
      },
    });

    if (blocked) {
      throw new Error("Some dates in the range are blocked by the host");
    }

    // Calculate pricing
    const nights = calculateNights(checkIn, checkOut);
    const nightlyRate = listing.pricePerNight ?? 0;
    const subtotal = nights * nightlyRate;
    const cleaningFee = listing.cleaningFee ?? 0;
    const serviceFee = Math.round(subtotal * 0.12 * 100) / 100; // 12% service fee

    let weeklyDiscount = 0;
    let monthlyDiscount = 0;
    if (nights >= 28 && listing.monthlyDiscount) {
      monthlyDiscount = Math.round(subtotal * (listing.monthlyDiscount / 100) * 100) / 100;
    } else if (nights >= 7 && listing.weeklyDiscount) {
      weeklyDiscount = Math.round(subtotal * (listing.weeklyDiscount / 100) * 100) / 100;
    }

    const totalPrice = subtotal + cleaningFee + serviceFee - weeklyDiscount - monthlyDiscount;

    const booking = await db.booking.create({
      data: {
        listingId,
        guestId: session.user.id,
        checkIn,
        checkOut,
        guestCount,
        nightlyRate,
        nightsCount: nights,
        subtotal,
        cleaningFee,
        serviceFee,
        weeklyDiscount,
        monthlyDiscount,
        totalPrice,
        status: BookingStatus.Pending,
        specialRequests: specialRequests ?? null,
      },
      include: {
        listing: {
          select: { id: true, title: true },
        },
      },
    });

    revalidatePath("/bookings");
    revalidatePath(`/listings/${listingId}`);
    // Bust the searchListings cache — a new booking changes the availability
    // subquery result for date-filtered searches covering this listing.
    updateTag("listings");

    return { success: true, booking };
  } catch (error) {
    logger.error("Error creating booking:", error);
    throw new Error(
      `Failed to create booking: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// GET BOOKING
// ============================================

export async function getBooking(id: unknown) {
  const parsedId = bookingIdSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error("Invalid booking ID");
  }

  try {
    const booking = await db.booking.findUnique({
      where: { id: parsedId.data },
      include: {
        listing: {
          include: {
            location: true,
          },
        },
        guest: {
          select: {
            id: true,
            email: true,
            username: true,
            image: true,
          },
        },
      },
    });

    if (!booking) {
      throw new Error("Booking not found");
    }

    return booking;
  } catch (error) {
    logger.error("Error fetching booking:", error);
    throw new Error(
      `Failed to fetch booking: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// GET GUEST BOOKINGS
// ============================================

export async function getGuestBookings(filters?: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to view your bookings");
  }

  const parsed = bookingFiltersSchema.safeParse(filters ?? {});
  if (!parsed.success) {
    throw new Error("Invalid filter parameters");
  }

  const { status, take, skip } = parsed.data;

  try {
    const where = {
      guestId: session.user.id,
      ...(status && { status }),
    };

    const [bookings, total] = await Promise.all([
      db.booking.findMany({
        where,
        include: {
          listing: {
            select: {
              id: true,
              title: true,
              photoUrls: true,
              pricePerNight: true,
            },
          },
        },
        orderBy: { createdAt: "desc" as const },
        take,
        skip,
      }),
      db.booking.count({ where }),
    ]);

    return { bookings, total };
  } catch (error) {
    logger.error("Error fetching guest bookings:", error);
    throw new Error(
      `Failed to fetch bookings: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// GET HOST BOOKINGS
// ============================================

export async function getHostBookings(filters?: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to view host bookings");
  }

  const parsed = bookingFiltersSchema.safeParse(filters ?? {});
  if (!parsed.success) {
    throw new Error("Invalid filter parameters");
  }

  const { status, take, skip } = parsed.data;

  try {
    const where = {
      listing: { hostId: session.user.id },
      ...(status && { status }),
    };

    const [bookings, total] = await Promise.all([
      db.booking.findMany({
        where,
        include: {
          listing: {
            select: {
              id: true,
              title: true,
              photoUrls: true,
            },
          },
          guest: {
            select: {
              id: true,
              email: true,
              username: true,
              image: true,
            },
          },
        },
        orderBy: { createdAt: "desc" as const },
        take,
        skip,
      }),
      db.booking.count({ where }),
    ]);

    return { bookings, total };
  } catch (error) {
    logger.error("Error fetching host bookings:", error);
    throw new Error(
      `Failed to fetch host bookings: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// CONFIRM BOOKING
// ============================================

export async function confirmBooking(id: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to confirm a booking");
  }

  const parsedId = bookingIdSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error("Invalid booking ID");
  }

  try {
    const booking = await db.booking.findUnique({
      where: { id: parsedId.data },
      include: {
        listing: {
          select: { hostId: true },
        },
      },
    });

    if (!booking) {
      throw new Error("Booking not found");
    }

    if (booking.listing.hostId !== session.user.id) {
      throw new Error("Only the host can confirm this booking");
    }

    if (booking.status !== BookingStatus.Pending) {
      throw new Error("Only pending bookings can be confirmed");
    }

    const updated = await db.booking.update({
      where: { id: parsedId.data },
      data: {
        status: BookingStatus.Confirmed,
        confirmedAt: new Date(),
      },
    });

    revalidatePath("/bookings");
    revalidatePath("/hosting/bookings");

    return { success: true, booking: updated };
  } catch (error) {
    logger.error("Error confirming booking:", error);
    throw new Error(
      `Failed to confirm booking: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// CANCEL BOOKING
// ============================================

export async function cancelBooking(id: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to cancel a booking");
  }

  const parsedId = bookingIdSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error("Invalid booking ID");
  }

  try {
    const booking = await db.booking.findUnique({
      where: { id: parsedId.data },
      include: {
        listing: {
          select: { hostId: true },
        },
      },
    });

    if (!booking) {
      throw new Error("Booking not found");
    }

    // Allow either the guest or the host to cancel
    if (booking.guestId !== session.user.id && booking.listing.hostId !== session.user.id) {
      throw new Error("You don't have permission to cancel this booking");
    }

    if (booking.status === BookingStatus.Cancelled) {
      throw new Error("Booking is already cancelled");
    }

    if (booking.status === BookingStatus.Completed) {
      throw new Error("Completed bookings cannot be cancelled");
    }

    const updated = await db.booking.update({
      where: { id: parsedId.data },
      data: {
        status: BookingStatus.Cancelled,
        cancelledAt: new Date(),
      },
    });

    revalidatePath("/bookings");
    revalidatePath("/hosting/bookings");

    return { success: true, booking: updated };
  } catch (error) {
    logger.error("Error cancelling booking:", error);
    throw new Error(
      `Failed to cancel booking: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// CHECK AVAILABILITY
// ============================================

export async function checkAvailability(data: unknown) {
  const parsed = checkAvailabilitySchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Invalid availability check data");
  }

  const { listingId, checkIn, checkOut } = parsed.data;

  try {
    // Check overlapping bookings
    const overlapping = await db.booking.findFirst({
      where: {
        listingId,
        status: { in: [BookingStatus.Confirmed, BookingStatus.Pending] },
        AND: [
          { checkIn: { lt: checkOut } },
          { checkOut: { gt: checkIn } },
        ],
      },
    });

    if (overlapping) {
      return { available: false, reason: "Dates overlap with an existing booking" };
    }

    // Check blocked dates
    const blocked = await db.blockedDate.findFirst({
      where: {
        listingId,
        AND: [
          { startDate: { lt: checkOut } },
          { endDate: { gt: checkIn } },
        ],
      },
    });

    if (blocked) {
      return { available: false, reason: "Some dates are blocked by the host" };
    }

    return { available: true };
  } catch (error) {
    logger.error("Error checking availability:", error);
    throw new Error(
      `Failed to check availability: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// ADD BLOCKED DATES
// ============================================

export async function addBlockedDates(data: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to manage blocked dates");
  }

  const parsed = addBlockedDatesSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Invalid blocked dates data");
  }

  const { listingId, dates } = parsed.data;

  try {
    // Verify host owns the listing
    const listing = await db.listing.findUnique({
      where: { id: listingId },
      select: { hostId: true },
    });

    if (!listing) {
      throw new Error("Listing not found");
    }

    if (listing.hostId !== session.user.id) {
      throw new Error("Only the host can manage blocked dates");
    }

    const created = await db.blockedDate.createMany({
      data: dates.map((d) => ({
        listingId,
        startDate: d.startDate,
        endDate: d.endDate,
        reason: d.reason ?? null,
      })),
    });

    revalidatePath(`/listings/${listingId}`);
    revalidatePath("/hosting/calendar");

    return { success: true, count: created.count };
  } catch (error) {
    logger.error("Error adding blocked dates:", error);
    throw new Error(
      `Failed to add blocked dates: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// REMOVE BLOCKED DATES
// ============================================

export async function removeBlockedDates(data: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to manage blocked dates");
  }

  const parsed = removeBlockedDatesSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Invalid blocked dates data");
  }

  const { listingId, dateIds } = parsed.data;

  try {
    // Verify host owns the listing
    const listing = await db.listing.findUnique({
      where: { id: listingId },
      select: { hostId: true },
    });

    if (!listing) {
      throw new Error("Listing not found");
    }

    if (listing.hostId !== session.user.id) {
      throw new Error("Only the host can manage blocked dates");
    }

    const deleted = await db.blockedDate.deleteMany({
      where: {
        id: { in: dateIds },
        listingId,
      },
    });

    revalidatePath(`/listings/${listingId}`);
    revalidatePath("/hosting/calendar");

    return { success: true, count: deleted.count };
  } catch (error) {
    logger.error("Error removing blocked dates:", error);
    throw new Error(
      `Failed to remove blocked dates: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
