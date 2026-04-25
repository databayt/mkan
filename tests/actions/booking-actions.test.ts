import { describe, it, expect, vi, beforeEach } from "vitest";

// BookingStatus enum mirror (hoisted mocks cannot import from @prisma/client)
const BookingStatus = {
  Pending: "Pending",
  Confirmed: "Confirmed",
  Cancelled: "Cancelled",
  Completed: "Completed",
  Declined: "Declined",
} as const;

vi.mock("@prisma/client", () => ({
  BookingStatus: {
    Pending: "Pending",
    Confirmed: "Confirmed",
    Cancelled: "Cancelled",
    Completed: "Completed",
    Declined: "Declined",
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    booking: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    listing: {
      findUnique: vi.fn(),
    },
    blockedDate: {
      findFirst: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  canOverride: (session: { user?: { id?: string; role?: string } } | null | undefined, ownerId: string | null | undefined) =>
    (!!session?.user?.id && session.user.id === ownerId) ||
    session?.user?.role === "ADMIN" ||
    session?.user?.role === "SUPER_ADMIN",
  isAdminOrSuper: (session: { user?: { role?: string } } | null | undefined) =>
    session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN",
  isSuperAdmin: (session: { user?: { role?: string } } | null | undefined) =>
    session?.user?.role === "SUPER_ADMIN",
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  createBooking,
  getBooking,
  getGuestBookings,
  getHostBookings,
  confirmBooking,
  cancelBooking,
  checkAvailability,
  addBlockedDates,
  removeBlockedDates,
} from "@/lib/actions/booking-actions";

const mockAuth = vi.mocked(auth);
const mockDb = vi.mocked(db);

const guestSession = {
  user: { id: "guest-1", name: "Guest", email: "guest@test.com", role: "USER" },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const hostSession = {
  user: { id: "host-1", name: "Host", email: "host@test.com", role: "USER" },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const publishedListing = {
  id: 1,
  isPublished: true,
  draft: false,
  pricePerNight: 100,
  cleaningFee: 30,
  weeklyDiscount: 10,
  monthlyDiscount: 20,
  guestCount: 4,
  hostId: "host-1",
};

const checkIn = new Date("2026-06-01");
const checkOut = new Date("2026-06-04");

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================
// createBooking
// ============================================

describe("createBooking", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(
      createBooking({ listingId: 1, checkIn, checkOut, guestCount: 2 })
    ).rejects.toThrow("logged in");
  });

  it("throws for invalid data (checkOut before checkIn)", async () => {
    mockAuth.mockResolvedValue(guestSession as never);

    await expect(
      createBooking({
        listingId: 1,
        checkIn: new Date("2026-06-05"),
        checkOut: new Date("2026-06-01"),
        guestCount: 2,
      })
    ).rejects.toThrow("Invalid booking data");
  });

  it("throws when listing not found", async () => {
    mockAuth.mockResolvedValue(guestSession as never);
    mockDb.listing.findUnique.mockResolvedValue(null as never);

    await expect(
      createBooking({ listingId: 999, checkIn, checkOut, guestCount: 2 })
    ).rejects.toThrow("Listing not found");
  });

  it("throws when listing is not published", async () => {
    mockAuth.mockResolvedValue(guestSession as never);
    mockDb.listing.findUnique.mockResolvedValue({
      ...publishedListing,
      isPublished: false,
    } as never);

    await expect(
      createBooking({ listingId: 1, checkIn, checkOut, guestCount: 2 })
    ).rejects.toThrow("not available for booking");
  });

  it("throws when guest count exceeds capacity", async () => {
    mockAuth.mockResolvedValue(guestSession as never);
    mockDb.listing.findUnique.mockResolvedValue(publishedListing as never);

    await expect(
      createBooking({ listingId: 1, checkIn, checkOut, guestCount: 10 })
    ).rejects.toThrow("exceeds listing capacity");
  });

  it("throws when overlapping booking exists", async () => {
    mockAuth.mockResolvedValue(guestSession as never);
    mockDb.listing.findUnique.mockResolvedValue(publishedListing as never);
    mockDb.booking.findFirst.mockResolvedValue({ id: 99 } as never);

    await expect(
      createBooking({ listingId: 1, checkIn, checkOut, guestCount: 2 })
    ).rejects.toThrow("overlapping booking");
  });

  it("throws when blocked dates overlap", async () => {
    mockAuth.mockResolvedValue(guestSession as never);
    mockDb.listing.findUnique.mockResolvedValue(publishedListing as never);
    mockDb.booking.findFirst.mockResolvedValue(null as never);
    mockDb.blockedDate.findFirst.mockResolvedValue({ id: 5 } as never);

    await expect(
      createBooking({ listingId: 1, checkIn, checkOut, guestCount: 2 })
    ).rejects.toThrow("blocked by the host");
  });

  it("creates booking with correct pricing for a 3-night stay", async () => {
    mockAuth.mockResolvedValue(guestSession as never);
    mockDb.listing.findUnique.mockResolvedValue(publishedListing as never);
    mockDb.booking.findFirst.mockResolvedValue(null as never);
    mockDb.blockedDate.findFirst.mockResolvedValue(null as never);
    mockDb.booking.create.mockResolvedValue({ id: 1, totalPrice: 366 } as never);

    const result = await createBooking({
      listingId: 1,
      checkIn,
      checkOut,
      guestCount: 2,
    });

    expect(mockDb.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          listingId: 1,
          guestId: "guest-1",
          nightsCount: 3,
          nightlyRate: 100,
          subtotal: 300,
          cleaningFee: 30,
          status: BookingStatus.Pending,
        }),
      })
    );
    expect(result).toHaveProperty("success", true);
  });

  it("applies weekly discount for 7+ night stays", async () => {
    mockAuth.mockResolvedValue(guestSession as never);
    mockDb.listing.findUnique.mockResolvedValue(publishedListing as never);
    mockDb.booking.findFirst.mockResolvedValue(null as never);
    mockDb.blockedDate.findFirst.mockResolvedValue(null as never);
    mockDb.booking.create.mockResolvedValue({ id: 2 } as never);

    await createBooking({
      listingId: 1,
      checkIn: new Date("2026-06-01"),
      checkOut: new Date("2026-06-08"),
      guestCount: 2,
    });

    expect(mockDb.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nightsCount: 7,
          weeklyDiscount: 70, // 700 * 10%
        }),
      })
    );
  });
});

// ============================================
// getBooking
// ============================================

describe("getBooking", () => {
  it("throws for invalid ID", async () => {
    mockAuth.mockResolvedValue(guestSession as never);
    await expect(getBooking("abc")).rejects.toThrow("Invalid booking ID");
  });

  it("throws when booking not found", async () => {
    mockAuth.mockResolvedValue(guestSession as never);
    mockDb.booking.findUnique.mockResolvedValue(null as never);

    await expect(getBooking(999)).rejects.toThrow("Booking not found");
  });

  it("returns booking with listing and guest", async () => {
    mockAuth.mockResolvedValue(guestSession as never);
    const mockBooking = {
      id: 1,
      guestId: "guest-1",
      listing: { id: 1, hostId: "host-1", location: { city: "Khartoum" } },
      guest: { id: "guest-1", email: "g@t.com" },
    };
    mockDb.booking.findUnique.mockResolvedValue(mockBooking as never);

    const result = await getBooking(1);

    expect(result).toEqual(mockBooking);
    expect(mockDb.booking.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        include: expect.objectContaining({
          listing: expect.objectContaining({
            include: { location: true },
          }),
          guest: expect.any(Object),
        }),
      })
    );
  });
});

// ============================================
// getGuestBookings
// ============================================

describe("getGuestBookings", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(getGuestBookings()).rejects.toThrow("logged in");
  });

  it("returns paginated bookings with defaults", async () => {
    mockAuth.mockResolvedValue(guestSession as never);
    mockDb.booking.findMany.mockResolvedValue([{ id: 1 }] as never);
    mockDb.booking.count.mockResolvedValue(1 as never);

    const result = await getGuestBookings();

    expect(result).toEqual({ bookings: [{ id: 1 }], total: 1 });
    expect(mockDb.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { guestId: "guest-1" },
        take: 50,
        skip: 0,
      })
    );
  });

  it("applies status filter", async () => {
    mockAuth.mockResolvedValue(guestSession as never);
    mockDb.booking.findMany.mockResolvedValue([] as never);
    mockDb.booking.count.mockResolvedValue(0 as never);

    await getGuestBookings({ status: BookingStatus.Confirmed });

    expect(mockDb.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { guestId: "guest-1", status: BookingStatus.Confirmed },
      })
    );
  });
});

// ============================================
// getHostBookings
// ============================================

describe("getHostBookings", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(getHostBookings()).rejects.toThrow("logged in");
  });

  it("returns bookings for host's listings", async () => {
    mockAuth.mockResolvedValue(hostSession as never);
    mockDb.booking.findMany.mockResolvedValue([{ id: 1 }] as never);
    mockDb.booking.count.mockResolvedValue(1 as never);

    const result = await getHostBookings();

    expect(result).toEqual({ bookings: [{ id: 1 }], total: 1 });
    expect(mockDb.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { listing: { hostId: "host-1" } },
      })
    );
  });

  it("supports custom pagination", async () => {
    mockAuth.mockResolvedValue(hostSession as never);
    mockDb.booking.findMany.mockResolvedValue([] as never);
    mockDb.booking.count.mockResolvedValue(0 as never);

    await getHostBookings({ take: 10, skip: 20 });

    expect(mockDb.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10, skip: 20 })
    );
  });
});

// ============================================
// confirmBooking
// ============================================

describe("confirmBooking", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(confirmBooking(1)).rejects.toThrow("logged in");
  });

  it("throws when booking not found", async () => {
    mockAuth.mockResolvedValue(hostSession as never);
    mockDb.booking.findUnique.mockResolvedValue(null as never);

    await expect(confirmBooking(1)).rejects.toThrow("Booking not found");
  });

  it("throws when user is not the host", async () => {
    mockAuth.mockResolvedValue(guestSession as never);
    mockDb.booking.findUnique.mockResolvedValue({
      id: 1,
      status: BookingStatus.Pending,
      listing: { hostId: "host-1" },
    } as never);

    await expect(confirmBooking(1)).rejects.toThrow("Only the host");
  });

  it("throws when booking is not pending", async () => {
    mockAuth.mockResolvedValue(hostSession as never);
    mockDb.booking.findUnique.mockResolvedValue({
      id: 1,
      status: BookingStatus.Confirmed,
      listing: { hostId: "host-1" },
    } as never);

    await expect(confirmBooking(1)).rejects.toThrow("Only pending bookings");
  });

  it("confirms a pending booking", async () => {
    mockAuth.mockResolvedValue(hostSession as never);
    mockDb.booking.findUnique.mockResolvedValue({
      id: 1,
      status: BookingStatus.Pending,
      listing: { hostId: "host-1" },
    } as never);
    mockDb.booking.update.mockResolvedValue({ id: 1, status: BookingStatus.Confirmed } as never);

    const result = await confirmBooking(1);

    expect(result).toHaveProperty("success", true);
    expect(mockDb.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: BookingStatus.Confirmed }),
      })
    );
  });
});

// ============================================
// cancelBooking
// ============================================

describe("cancelBooking", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(cancelBooking(1)).rejects.toThrow("logged in");
  });

  it("throws when user is neither guest nor host", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "stranger", name: "X", email: "x@t.com", role: "USER" },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as never);
    mockDb.booking.findUnique.mockResolvedValue({
      id: 1,
      guestId: "guest-1",
      status: BookingStatus.Pending,
      listing: { hostId: "host-1" },
    } as never);

    await expect(cancelBooking(1)).rejects.toThrow("permission");
  });

  it("throws when booking is already cancelled", async () => {
    mockAuth.mockResolvedValue(guestSession as never);
    mockDb.booking.findUnique.mockResolvedValue({
      id: 1,
      guestId: "guest-1",
      status: BookingStatus.Cancelled,
      listing: { hostId: "host-1" },
    } as never);

    await expect(cancelBooking(1)).rejects.toThrow("already cancelled");
  });

  it("throws when booking is completed", async () => {
    mockAuth.mockResolvedValue(guestSession as never);
    mockDb.booking.findUnique.mockResolvedValue({
      id: 1,
      guestId: "guest-1",
      status: BookingStatus.Completed,
      listing: { hostId: "host-1" },
    } as never);

    await expect(cancelBooking(1)).rejects.toThrow("Completed bookings");
  });

  it("allows guest to cancel", async () => {
    mockAuth.mockResolvedValue(guestSession as never);
    mockDb.booking.findUnique.mockResolvedValue({
      id: 1,
      guestId: "guest-1",
      status: BookingStatus.Confirmed,
      listing: { hostId: "host-1" },
    } as never);
    mockDb.booking.update.mockResolvedValue({ id: 1, status: BookingStatus.Cancelled } as never);

    const result = await cancelBooking(1);

    expect(result).toHaveProperty("success", true);
    expect(mockDb.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: BookingStatus.Cancelled }),
      })
    );
  });

  it("allows host to cancel", async () => {
    mockAuth.mockResolvedValue(hostSession as never);
    mockDb.booking.findUnique.mockResolvedValue({
      id: 1,
      guestId: "guest-1",
      status: BookingStatus.Pending,
      listing: { hostId: "host-1" },
    } as never);
    mockDb.booking.update.mockResolvedValue({ id: 1, status: BookingStatus.Cancelled } as never);

    const result = await cancelBooking(1);

    expect(result).toHaveProperty("success", true);
  });
});

// ============================================
// checkAvailability
// ============================================

describe("checkAvailability", () => {
  it("throws for invalid data", async () => {
    await expect(checkAvailability({ listingId: "abc" })).rejects.toThrow("Invalid");
  });

  it("returns unavailable when overlapping booking exists", async () => {
    mockDb.booking.findFirst.mockResolvedValue({ id: 1 } as never);

    const result = await checkAvailability({
      listingId: 1,
      checkIn,
      checkOut,
    });

    expect(result).toEqual({ available: false, reason: expect.stringContaining("existing booking") });
  });

  it("returns unavailable when dates are blocked", async () => {
    mockDb.booking.findFirst.mockResolvedValue(null as never);
    mockDb.blockedDate.findFirst.mockResolvedValue({ id: 5 } as never);

    const result = await checkAvailability({
      listingId: 1,
      checkIn,
      checkOut,
    });

    expect(result).toEqual({ available: false, reason: expect.stringContaining("blocked") });
  });

  it("returns available when no conflicts", async () => {
    mockDb.booking.findFirst.mockResolvedValue(null as never);
    mockDb.blockedDate.findFirst.mockResolvedValue(null as never);

    const result = await checkAvailability({
      listingId: 1,
      checkIn,
      checkOut,
    });

    expect(result).toEqual({ available: true });
  });
});

// ============================================
// addBlockedDates
// ============================================

describe("addBlockedDates", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(
      addBlockedDates({ listingId: 1, dates: [{ startDate: checkIn, endDate: checkOut }] })
    ).rejects.toThrow("logged in");
  });

  it("throws when listing not found", async () => {
    mockAuth.mockResolvedValue(hostSession as never);
    mockDb.listing.findUnique.mockResolvedValue(null as never);

    await expect(
      addBlockedDates({ listingId: 999, dates: [{ startDate: checkIn, endDate: checkOut }] })
    ).rejects.toThrow("Listing not found");
  });

  it("throws when user is not the host", async () => {
    mockAuth.mockResolvedValue(guestSession as never);
    mockDb.listing.findUnique.mockResolvedValue({ hostId: "host-1" } as never);

    await expect(
      addBlockedDates({ listingId: 1, dates: [{ startDate: checkIn, endDate: checkOut }] })
    ).rejects.toThrow("Only the host");
  });

  it("creates blocked dates for the listing", async () => {
    mockAuth.mockResolvedValue(hostSession as never);
    mockDb.listing.findUnique.mockResolvedValue({ hostId: "host-1" } as never);
    mockDb.blockedDate.createMany.mockResolvedValue({ count: 2 } as never);

    const result = await addBlockedDates({
      listingId: 1,
      dates: [
        { startDate: checkIn, endDate: checkOut, reason: "Maintenance" },
        { startDate: new Date("2026-07-01"), endDate: new Date("2026-07-05") },
      ],
    });

    expect(result).toEqual({ success: true, count: 2 });
    expect(mockDb.blockedDate.createMany).toHaveBeenCalled();
  });
});

// ============================================
// removeBlockedDates
// ============================================

describe("removeBlockedDates", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(
      removeBlockedDates({ listingId: 1, dateIds: [1, 2] })
    ).rejects.toThrow("logged in");
  });

  it("throws when user is not the host", async () => {
    mockAuth.mockResolvedValue(guestSession as never);
    mockDb.listing.findUnique.mockResolvedValue({ hostId: "host-1" } as never);

    await expect(
      removeBlockedDates({ listingId: 1, dateIds: [1] })
    ).rejects.toThrow("Only the host");
  });

  it("deletes blocked dates", async () => {
    mockAuth.mockResolvedValue(hostSession as never);
    mockDb.listing.findUnique.mockResolvedValue({ hostId: "host-1" } as never);
    mockDb.blockedDate.deleteMany.mockResolvedValue({ count: 2 } as never);

    const result = await removeBlockedDates({ listingId: 1, dateIds: [1, 2] });

    expect(result).toEqual({ success: true, count: 2 });
    expect(mockDb.blockedDate.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [1, 2] }, listingId: 1 },
      })
    );
  });
});
