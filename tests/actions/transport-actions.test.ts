import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- mocks (hoisted) ----------

vi.mock("@/lib/db", () => ({
  db: {
    assemblyPoint: {
      findMany: vi.fn(),
    },
    transportOffice: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    bus: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    route: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    trip: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    seat: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    transportBooking: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    transportPayment: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
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

vi.mock("@/lib/sanitization", () => ({
  sanitizeInput: vi.fn((s: string) => s.trim()),
  sanitizeEmail: vi.fn((s: string) => s.trim().toLowerCase()),
  sanitizePhone: vi.fn((s: string) => s.trim()),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------- imports (after mocks) ----------

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

import {
  getAssemblyPoints,
  getCities,
  createTransportOffice,
  updateTransportOffice,
  getTransportOffice,
  getMyOffices,
  publishOffice,
  getTransportOffices,
  deleteTransportOffice,
  createBus,
  updateBus,
  deleteBus,
  getBuses,
  createRoute,
  updateRoute,
  deleteRoute,
  getRoutes,
  searchRoutes,
  createTrip,
  updateTrip,
  cancelTrip,
  getTrips,
  getTripDetails,
  getTripSeats,
  deleteTrip,
  createBooking,
  confirmBooking,
  cancelBooking,
  getBooking,
  getMyBookings,
  getOfficeBookings,
  processPayment,
  verifyPayment,
  generateTicketData,
  validateTicket,
  getOfficeDashboardStats,
  updateBookingStatus,
} from "@/lib/actions/travel-actions";

const mockAuth = vi.mocked(auth);
const mockDb = vi.mocked(db);

const session = {
  user: { id: "user-1", name: "Test", email: "test@test.com", role: "USER" },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const otherSession = {
  user: { id: "user-other", name: "Other", email: "o@o.com", role: "USER" },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================
// ASSEMBLY POINT ACTIONS
// ============================================

describe("getAssemblyPoints", () => {
  it("returns active assembly points", async () => {
    const pts = [{ id: 1, name: "Central" }];
    mockDb.assemblyPoint.findMany.mockResolvedValue(pts as never);

    const result = await getAssemblyPoints();
    expect(result).toEqual(pts);
    expect(mockDb.assemblyPoint.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
  });

  it("filters by city when provided", async () => {
    mockDb.assemblyPoint.findMany.mockResolvedValue([] as never);

    await getAssemblyPoints("Khartoum");
    expect(mockDb.assemblyPoint.findMany).toHaveBeenCalledWith({
      where: { city: "Khartoum", isActive: true },
      orderBy: { name: "asc" },
    });
  });

  it("returns empty array on error", async () => {
    mockDb.assemblyPoint.findMany.mockRejectedValue(new Error("DB down"));

    const result = await getAssemblyPoints();
    expect(result).toEqual([]);
  });
});

describe("getCities", () => {
  it("returns distinct city names", async () => {
    mockDb.assemblyPoint.findMany.mockResolvedValue([
      { city: "Khartoum" },
      { city: "Omdurman" },
    ] as never);

    const result = await getCities();
    expect(result).toEqual(["Khartoum", "Omdurman"]);
  });
});

// ============================================
// TRANSPORT OFFICE ACTIONS
// ============================================

describe("createTransportOffice", () => {
  it("throws Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(createTransportOffice({ name: "X" })).rejects.toThrow(
      "Unauthorized"
    );
  });

  it("throws for invalid data (empty name)", async () => {
    mockAuth.mockResolvedValue(session as never);

    await expect(createTransportOffice({ name: "" })).rejects.toThrow(
      "Invalid office data"
    );
  });

  it("creates office with draft schema and returns success", async () => {
    mockAuth.mockResolvedValue(session as never);
    const office = { id: 1, name: "Test Office" };
    mockDb.transportOffice.create.mockResolvedValue(office as never);

    const result = await createTransportOffice({
      name: "Test Office",
      phone: "123456789",
      email: "office@test.com",
    });

    expect(result).toEqual({ success: true, office });
    expect(mockDb.transportOffice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Test Office",
          ownerId: "user-1",
          isActive: false,
        }),
      })
    );
  });
});

describe("updateTransportOffice", () => {
  it("throws Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(updateTransportOffice(1, { name: "X" })).rejects.toThrow(
      "Unauthorized"
    );
  });

  it("throws for invalid office ID (negative)", async () => {
    mockAuth.mockResolvedValue(session as never);

    await expect(updateTransportOffice(-1, { name: "X" })).rejects.toThrow(
      "Invalid office ID"
    );
  });

  it("throws Unauthorized when user does not own the office", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportOffice.findUnique.mockResolvedValue({
      ownerId: "someone-else",
    } as never);

    await expect(
      updateTransportOffice(1, { name: "Valid Name" })
    ).rejects.toThrow("Unauthorized");
  });

  it("updates office when owner is correct", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportOffice.findUnique.mockResolvedValue({
      ownerId: "user-1",
    } as never);
    mockDb.transportOffice.update.mockResolvedValue({
      id: 1,
      name: "Updated",
    } as never);

    const result = await updateTransportOffice(1, { name: "Updated Name" });

    expect(result).toEqual({
      success: true,
      office: { id: 1, name: "Updated" },
    });
  });
});

describe("getTransportOffice", () => {
  it("returns office with relations", async () => {
    const office = { id: 1, name: "Office", buses: [], routes: [] };
    mockDb.transportOffice.findUnique.mockResolvedValue(office as never);

    const result = await getTransportOffice(1);
    expect(result).toEqual(office);
    expect(mockDb.transportOffice.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } })
    );
  });
});

describe("getMyOffices", () => {
  it("throws Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(getMyOffices()).rejects.toThrow("Unauthorized");
  });

  it("returns offices owned by the user", async () => {
    mockAuth.mockResolvedValue(session as never);
    const offices = [{ id: 1, name: "My Office" }];
    mockDb.transportOffice.findMany.mockResolvedValue(offices as never);

    const result = await getMyOffices();
    expect(result).toEqual(offices);
    expect(mockDb.transportOffice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: "user-1" },
      })
    );
  });
});

describe("publishOffice", () => {
  it("throws Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(publishOffice(1)).rejects.toThrow("Unauthorized");
  });

  it("sets isActive to true", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportOffice.update.mockResolvedValue({
      id: 1,
      isActive: true,
    } as never);

    const result = await publishOffice(1);
    expect(result.success).toBe(true);
    expect(mockDb.transportOffice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isActive: true },
      })
    );
  });
});

describe("getTransportOffices", () => {
  it("returns only active and verified offices", async () => {
    mockDb.transportOffice.findMany.mockResolvedValue([] as never);

    await getTransportOffices();
    expect(mockDb.transportOffice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, isVerified: true },
      })
    );
  });
});

describe("deleteTransportOffice", () => {
  it("throws Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(deleteTransportOffice(1)).rejects.toThrow("Unauthorized");
  });

  it("throws Unauthorized when user does not own office", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportOffice.findUnique.mockResolvedValue({
      ownerId: "someone-else",
    } as never);

    await expect(deleteTransportOffice(1)).rejects.toThrow("Unauthorized");
  });

  it("deletes office and returns success", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportOffice.findUnique.mockResolvedValue({
      ownerId: "user-1",
    } as never);
    mockDb.transportOffice.delete.mockResolvedValue({} as never);

    const result = await deleteTransportOffice(1);
    expect(result).toEqual({ success: true });
  });
});

// ============================================
// BUS ACTIONS
// ============================================

describe("createBus", () => {
  const busData = {
    plateNumber: "ABC-123",
    capacity: 40,
    amenities: [] as string[],
    photoUrls: [] as string[],
    officeId: 1,
  };

  it("throws Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(createBus(busData as never)).rejects.toThrow("Unauthorized");
  });

  it("throws Unauthorized when user does not own the office", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportOffice.findUnique.mockResolvedValue({
      ownerId: "someone-else",
    } as never);

    await expect(createBus(busData as never)).rejects.toThrow("Unauthorized");
  });

  it("creates bus when office ownership is verified", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportOffice.findUnique.mockResolvedValue({
      ownerId: "user-1",
    } as never);
    const bus = { id: 1, plateNumber: "ABC-123" };
    mockDb.bus.create.mockResolvedValue(bus as never);

    const result = await createBus(busData as never);
    expect(result).toEqual(bus);
    expect(mockDb.bus.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          plateNumber: "ABC-123",
          officeId: 1,
        }),
      })
    );
  });
});

describe("updateBus", () => {
  it("throws for invalid bus ID", async () => {
    mockAuth.mockResolvedValue(session as never);

    await expect(updateBus(-5, { plateNumber: "X" })).rejects.toThrow(
      "Invalid bus ID"
    );
  });

  it("throws Unauthorized when user does not own bus's office", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.bus.findUnique.mockResolvedValue({
      office: { ownerId: "someone-else" },
    } as never);

    await expect(updateBus(1, { plateNumber: "X" })).rejects.toThrow(
      "Unauthorized"
    );
  });

  it("updates bus when ownership verified", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.bus.findUnique.mockResolvedValue({
      office: { ownerId: "user-1" },
    } as never);
    mockDb.bus.update.mockResolvedValue({ id: 1, plateNumber: "NEW" } as never);

    const result = await updateBus(1, { plateNumber: "NEW" });
    expect(result).toEqual({ id: 1, plateNumber: "NEW" });
  });
});

describe("deleteBus", () => {
  it("throws for invalid bus ID (non-integer)", async () => {
    mockAuth.mockResolvedValue(session as never);

    await expect(deleteBus("abc")).rejects.toThrow("Invalid bus ID");
  });

  it("throws Unauthorized when user does not own bus's office", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.bus.findUnique.mockResolvedValue({
      office: { ownerId: "someone-else" },
    } as never);

    await expect(deleteBus(1)).rejects.toThrow("Unauthorized");
  });

  it("deletes bus and returns success", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.bus.findUnique.mockResolvedValue({
      office: { ownerId: "user-1" },
    } as never);
    mockDb.bus.delete.mockResolvedValue({} as never);

    const result = await deleteBus(1);
    expect(result).toEqual({ success: true });
  });
});

describe("getBuses", () => {
  it("returns active buses for an office", async () => {
    const buses = [{ id: 1 }];
    mockDb.bus.findMany.mockResolvedValue(buses as never);

    const result = await getBuses(1);
    expect(result).toEqual(buses);
    expect(mockDb.bus.findMany).toHaveBeenCalledWith({
      where: { officeId: 1, isActive: true },
      orderBy: { createdAt: "desc" },
    });
  });
});

// ============================================
// ROUTE ACTIONS
// ============================================

describe("createRoute", () => {
  const routeData = {
    originId: 1,
    destinationId: 2,
    basePrice: 100,
    duration: 120,
    officeId: 1,
  };

  it("throws Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(createRoute(routeData as never)).rejects.toThrow(
      "Unauthorized"
    );
  });

  it("throws Unauthorized when user does not own office", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportOffice.findUnique.mockResolvedValue({
      ownerId: "someone-else",
    } as never);

    await expect(createRoute(routeData as never)).rejects.toThrow(
      "Unauthorized"
    );
  });

  it("creates route with origin/destination includes", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportOffice.findUnique.mockResolvedValue({
      ownerId: "user-1",
    } as never);
    const route = { id: 1, originId: 1, destinationId: 2 };
    mockDb.route.create.mockResolvedValue(route as never);

    const result = await createRoute(routeData as never);
    expect(result).toEqual(route);
  });
});

describe("updateRoute", () => {
  it("throws for invalid route ID", async () => {
    mockAuth.mockResolvedValue(session as never);

    await expect(updateRoute(0, { basePrice: 50 })).rejects.toThrow(
      "Invalid route ID"
    );
  });

  it("throws Unauthorized when user does not own route's office", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.route.findUnique.mockResolvedValue({
      office: { ownerId: "someone-else" },
    } as never);

    await expect(updateRoute(1, { basePrice: 50 })).rejects.toThrow(
      "Unauthorized"
    );
  });

  it("updates route when ownership verified", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.route.findUnique.mockResolvedValue({
      office: { ownerId: "user-1" },
    } as never);
    mockDb.route.update.mockResolvedValue({ id: 1, basePrice: 50 } as never);

    const result = await updateRoute(1, { basePrice: 50 });
    expect(result).toEqual({ id: 1, basePrice: 50 });
  });
});

describe("deleteRoute", () => {
  it("throws Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(deleteRoute(1)).rejects.toThrow("Unauthorized");
  });

  it("deletes route and returns success", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.route.findUnique.mockResolvedValue({
      office: { ownerId: "user-1" },
    } as never);
    mockDb.route.delete.mockResolvedValue({} as never);

    const result = await deleteRoute(1);
    expect(result).toEqual({ success: true });
  });
});

describe("getRoutes", () => {
  it("returns all active routes when no officeId given", async () => {
    mockDb.route.findMany.mockResolvedValue([] as never);

    await getRoutes();
    expect(mockDb.route.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } })
    );
  });

  it("filters by officeId when provided", async () => {
    mockDb.route.findMany.mockResolvedValue([] as never);

    await getRoutes(5);
    expect(mockDb.route.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { officeId: 5, isActive: true } })
    );
  });
});

// ============================================
// TRIP ACTIONS
// ============================================

describe("createTrip", () => {
  const tripData = {
    routeId: 1,
    busId: 1,
    departureDate: new Date("2026-05-01"),
    departureTime: "08:00",
    price: 100,
  };

  it("throws Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(createTrip(tripData as never)).rejects.toThrow(
      "Unauthorized"
    );
  });

  it("throws when bus not found", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.bus.findUnique.mockResolvedValue(null as never);

    await expect(createTrip(tripData as never)).rejects.toThrow(
      "Bus not found"
    );
  });

  it("creates trip and generates seats based on bus capacity", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.bus.findUnique.mockResolvedValue({ capacity: 12 } as never);
    const trip = { id: 1, routeId: 1, busId: 1, availableSeats: 12 };
    mockDb.trip.create.mockResolvedValue(trip as never);
    mockDb.seat.createMany.mockResolvedValue({ count: 12 } as never);

    const result = await createTrip(tripData as never);
    expect(result).toEqual(trip);
    expect(mockDb.seat.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          tripId: 1,
          seatNumber: "A1",
          row: 1,
          column: 1,
          seatType: "window",
          status: "Available",
        }),
      ]),
    });
  });

  it("limits generated seats to bus capacity", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.bus.findUnique.mockResolvedValue({ capacity: 10 } as never);
    mockDb.trip.create.mockResolvedValue({ id: 1 } as never);
    mockDb.seat.createMany.mockResolvedValue({ count: 10 } as never);

    await createTrip(tripData as never);
    const createManyCall = mockDb.seat.createMany.mock.calls[0][0] as {
      data: unknown[];
    };
    expect(createManyCall.data).toHaveLength(10);
  });
});

describe("updateTrip", () => {
  it("throws Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(updateTrip(1, { price: 200 })).rejects.toThrow(
      "Unauthorized"
    );
  });

  it("updates trip and returns success", async () => {
    mockAuth.mockResolvedValue(session as never);
    const trip = { id: 1, price: 200 };
    // Owner-scope check fetches existing trip first.
    mockDb.trip.findUnique.mockResolvedValue({
      route: { office: { ownerId: "user-1" } },
    } as never);
    mockDb.trip.update.mockResolvedValue(trip as never);

    const result = await updateTrip(1, { price: 200 });
    expect(result).toEqual({ success: true, trip });
  });
});

describe("cancelTrip", () => {
  it("throws Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(cancelTrip(1)).rejects.toThrow("Unauthorized");
  });

  it("sets isCancelled to true and notifies booked passengers", async () => {
    mockAuth.mockResolvedValue(session as never);
    const trip = { id: 1, isCancelled: true };
    mockDb.trip.findUnique.mockResolvedValue({
      route: { office: { ownerId: "user-1" } },
    } as never);
    mockDb.trip.update.mockResolvedValue(trip as never);
    mockDb.transportBooking.findMany.mockResolvedValue([] as never);
    mockDb.transportBooking.updateMany.mockResolvedValue({ count: 0 } as never);

    const result = await cancelTrip(1);
    expect(result).toEqual({ success: true, trip, notified: 0 });
    expect(mockDb.trip.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { isCancelled: true },
    });
    expect(mockDb.transportBooking.updateMany).toHaveBeenCalledWith({
      where: { tripId: 1, status: { in: ["Pending", "Confirmed"] } },
      data: expect.objectContaining({ status: "Cancelled" }),
    });
  });
});

describe("getTrips", () => {
  it("returns active, non-cancelled trips", async () => {
    mockDb.trip.findMany.mockResolvedValue([] as never);

    await getTrips();
    expect(mockDb.trip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, isCancelled: false },
      })
    );
  });

  it("filters by routeId when provided", async () => {
    mockDb.trip.findMany.mockResolvedValue([] as never);

    await getTrips(5);
    expect(mockDb.trip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ routeId: 5 }),
      })
    );
  });
});

describe("getTripDetails", () => {
  it("returns trip with full relations", async () => {
    const trip = { id: 1, seats: [] };
    mockDb.trip.findUnique.mockResolvedValue(trip as never);

    const result = await getTripDetails(1);
    expect(result).toEqual(trip);
  });
});

describe("deleteTrip", () => {
  it("throws Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(deleteTrip(1)).rejects.toThrow("Unauthorized");
  });

  it("throws when trip not found", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.trip.findUnique.mockResolvedValue(null as never);

    await expect(deleteTrip(1)).rejects.toThrow("Trip not found");
  });

  it("throws when user does not own trip's office", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.trip.findUnique.mockResolvedValue({
      _count: { bookings: 0 },
      route: { office: { ownerId: "someone-else" } },
    } as never);

    await expect(deleteTrip(1)).rejects.toThrow("Unauthorized");
  });

  it("throws when trip has existing bookings", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.trip.findUnique.mockResolvedValue({
      _count: { bookings: 3 },
      route: { office: { ownerId: "user-1" } },
    } as never);

    await expect(deleteTrip(1)).rejects.toThrow(
      "Cannot delete trip with existing bookings"
    );
  });

  it("deletes seats then trip when no bookings", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.trip.findUnique.mockResolvedValue({
      _count: { bookings: 0 },
      route: { office: { ownerId: "user-1" } },
    } as never);
    mockDb.seat.deleteMany.mockResolvedValue({ count: 0 } as never);
    mockDb.trip.delete.mockResolvedValue({} as never);

    const result = await deleteTrip(1);
    expect(result).toEqual({ success: true });
    expect(mockDb.seat.deleteMany).toHaveBeenCalledWith({
      where: { tripId: 1 },
    });
  });
});

// ============================================
// BOOKING ACTIONS
// ============================================

describe("createBooking", () => {
  const bookingInput = {
    tripId: 1,
    seatNumbers: ["A1", "A2"],
    passengerName: "John Doe",
    passengerPhone: "123456789",
    passengerEmail: "john@test.com",
  };

  it("throws Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(createBooking(bookingInput)).rejects.toThrow("Unauthorized");
  });

  it("throws for invalid booking data", async () => {
    mockAuth.mockResolvedValue(session as never);

    await expect(
      createBooking({ tripId: -1, seatNumbers: [], passengerName: "" })
    ).rejects.toThrow("Invalid booking data");
  });

  it("creates booking inside transaction, reserves seats, decrements available", async () => {
    mockAuth.mockResolvedValue(session as never);

    const newBooking = {
      id: 1,
      bookingReference: "BK-123-ABC",
      totalAmount: 200,
    };

    mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        trip: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            price: 100,
            route: { office: { id: 10 } },
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        seat: {
          findMany: vi.fn().mockResolvedValue([{ seatNumber: "A1" }, { seatNumber: "A2" }]),
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
        transportBooking: {
          create: vi.fn().mockResolvedValue(newBooking),
        },
      };
      return fn(tx);
    });

    const result = await createBooking(bookingInput);
    expect(result).toEqual({ success: true, booking: newBooking });
  });

  it("throws when some seats are unavailable", async () => {
    mockAuth.mockResolvedValue(session as never);

    mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        trip: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            price: 100,
            route: { office: { id: 10 } },
          }),
        },
        seat: {
          findMany: vi.fn().mockResolvedValue([{ seatNumber: "A1" }]),
        },
        transportBooking: { create: vi.fn() },
      };
      return fn(tx);
    });

    // No longer a throw: losing a seat race is an ordinary outcome, not an
    // exception, so the action names the seats that went and lets the picker
    // highlight them instead of dumping the whole selection on an error page.
    const result = await createBooking(bookingInput);
    expect(result).toEqual({
      success: false,
      error: "SEATS_UNAVAILABLE",
      unavailableSeats: ["A2"],
    });
  });

  it("throws when trip not found in transaction", async () => {
    mockAuth.mockResolvedValue(session as never);

    mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        trip: { findUnique: vi.fn().mockResolvedValue(null) },
        seat: { findMany: vi.fn() },
        transportBooking: { create: vi.fn() },
      };
      return fn(tx);
    });

    await expect(createBooking(bookingInput)).rejects.toThrow("Trip not found");
  });
});

describe("confirmBooking", () => {
  it("throws Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(confirmBooking(1)).rejects.toThrow("Unauthorized");
  });

  it("sets status to Confirmed and updates seats to Booked", async () => {
    mockAuth.mockResolvedValue(session as never);
    const booking = { id: 1, status: "Confirmed" };
    // Owner-scope check looks up the booking first.
    mockDb.transportBooking.findUnique.mockResolvedValue({
      userId: "user-1",
      trip: { route: { office: { ownerId: "user-1" } } },
    } as never);
    mockDb.transportBooking.update.mockResolvedValue(booking as never);
    mockDb.seat.updateMany.mockResolvedValue({ count: 2 } as never);

    const result = await confirmBooking(1);
    expect(result).toEqual({ success: true, booking });
    expect(mockDb.seat.updateMany).toHaveBeenCalledWith({
      where: { bookingId: 1 },
      // reservedUntil is cleared on confirm so the seat-TTL sweeper
      // doesn't later try to release a genuinely-booked seat.
      data: { status: "Booked", reservedUntil: null },
    });
  });
});

describe("cancelBooking", () => {
  it("throws Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(cancelBooking(1)).rejects.toThrow("Unauthorized");
  });

  it("throws when booking not found", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportBooking.findUnique.mockResolvedValue(null as never);

    await expect(cancelBooking(1)).rejects.toThrow("Booking not found");
  });

  const cancellableBooking = {
    id: 1,
    tripId: 5,
    userId: "user-1",
    status: "Confirmed",
    seats: [{ id: 10 }, { id: 11 }],
    payments: [],
    trip: { route: { office: { ownerId: "user-1" } } },
  };

  /**
   * Stand in for the cancellation transaction. `claimedCount` is what the
   * compare-and-swap `updateMany` reports back: 1 = this caller won the race
   * and owns the release, 0 = someone else already cancelled it.
   */
  const mockCancelTx = (claimedCount: number) => {
    const tx = {
      transportBooking: {
        updateMany: vi.fn().mockResolvedValue({ count: claimedCount }),
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ id: 1, status: "Cancelled" }),
      },
      seat: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
      trip: { update: vi.fn().mockResolvedValue({}) },
      transportPayment: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    mockDb.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) =>
      fn(tx),
    );
    return tx;
  };

  it("releases seats and increments available seats count", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportBooking.findUnique.mockResolvedValue(
      cancellableBooking as never,
    );
    const tx = mockCancelTx(1);

    const result = await cancelBooking(1);
    expect(result.success).toBe(true);
    // The status flip is a compare-and-swap, not a blind update — only a
    // booking that is still un-cancelled may be claimed.
    expect(tx.transportBooking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, status: { not: "Cancelled" } },
      }),
    );
    expect(tx.seat.updateMany).toHaveBeenCalledWith({
      where: { bookingId: 1 },
      // `reservedUntil` clears too — a released seat must not keep a stale hold.
      data: { status: "Available", bookingId: null, reservedUntil: null },
    });
    expect(tx.trip.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { availableSeats: { increment: 2 } },
    });
    // A claim that never cleared must not outlive the booking in the
    // operator's verification queue.
    expect(tx.transportPayment.updateMany).toHaveBeenCalledWith({
      where: { bookingId: 1, status: "Pending" },
      data: { status: "Failed" },
    });
  });

  it("a cancel that loses the race releases nothing and refunds nothing", async () => {
    // Both callers read the booking as Confirmed — that is exactly the window
    // a read-then-write guard cannot close. The loser's CAS matches 0 rows,
    // so it must not release the seats a second time, must not increment
    // availableSeats a second time, and must not fire a second Stripe refund.
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportBooking.findUnique.mockResolvedValue({
      ...cancellableBooking,
      payments: [
        { status: "Paid", amount: 500, transactionId: "pi_test_123" },
      ],
    } as never);
    const tx = mockCancelTx(0);

    const result = await cancelBooking(1);

    expect(result.success).toBe(true);
    expect(result.refundAmount).toBe(0);
    expect(tx.seat.updateMany).not.toHaveBeenCalled();
    expect(tx.trip.update).not.toHaveBeenCalled();
  });
});

describe("getBooking", () => {
  it("returns booking with all relations", async () => {
    mockAuth.mockResolvedValue(session as never);
    const booking = {
      id: 1,
      userId: "user-1",
      trip: { route: { office: { ownerId: "user-1" } } },
      seats: [],
      payments: [],
    };
    mockDb.transportBooking.findUnique.mockResolvedValue(booking as never);

    const result = await getBooking(1);
    expect(result).toEqual(booking);
  });
});

describe("getMyBookings", () => {
  it("throws Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(getMyBookings()).rejects.toThrow("Unauthorized");
  });

  it("returns paginated bookings with defaults", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportBooking.findMany.mockResolvedValue([] as never);
    mockDb.transportBooking.count.mockResolvedValue(0 as never);

    const result = await getMyBookings();
    expect(result.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    });
  });

  it("respects page and limit params", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportBooking.findMany.mockResolvedValue([] as never);
    mockDb.transportBooking.count.mockResolvedValue(50 as never);

    const result = await getMyBookings({ page: 2, limit: 10 });
    expect(result.pagination.page).toBe(2);
    expect(result.pagination.limit).toBe(10);
    expect(result.pagination.totalPages).toBe(5);
    expect(result.pagination.hasNext).toBe(true);
    expect(result.pagination.hasPrev).toBe(true);
  });
});

// ============================================
// PAYMENT ACTIONS
// ============================================

describe("processPayment", () => {
  it("throws Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(
      processPayment(1, { method: "CreditCard" } as never)
    ).rejects.toThrow("Unauthorized");
  });

  it("throws when booking not found", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportBooking.findUnique.mockResolvedValue(null as never);

    await expect(
      processPayment(1, { method: "CreditCard" } as never)
    ).rejects.toThrow("Booking not found");
  });

  it("creates Pending payment for CashOnArrival without confirming booking", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportBooking.findUnique.mockResolvedValue({
      id: 1,
      userId: "user-1",
      totalAmount: 200,
      trip: { route: { office: { ownerId: "user-1" } } },
    } as never);
    const payment = { id: 1, status: "Pending" };
    mockDb.transportPayment.create.mockResolvedValue(payment as never);
    mockDb.seat.updateMany.mockResolvedValue({ count: 1 } as never);

    const result = await processPayment(1, {
      method: "CashOnArrival",
    } as never);
    expect(result).toEqual({ success: true, payment, pendingVerification: false });
    // Should NOT call confirmBooking flow
    expect(mockDb.transportBooking.update).not.toHaveBeenCalled();
  });

  it("holds a cash seat until 6h before departure, not the 30-minute checkout TTL", async () => {
    // A cash booking used to keep the abandoned-checkout hold, so a rider who
    // booked a bus leaving days later had their seats swept and the booking
    // auto-cancelled half an hour after checkout — while the confirmation page
    // showed them a reference and a ticket link.
    mockAuth.mockResolvedValue(session as never);
    const departureDate = new Date("2026-12-20T00:00:00.000Z");
    mockDb.transportBooking.findUnique.mockResolvedValue({
      id: 1,
      userId: "user-1",
      totalAmount: 200,
      trip: {
        departureDate,
        departureTime: "06:00",
        route: { office: { ownerId: "user-1" } },
      },
    } as never);
    mockDb.transportPayment.create.mockResolvedValue({ id: 9, status: "Pending" } as never);
    mockDb.seat.updateMany.mockResolvedValue({ count: 1 } as never);

    await processPayment(1, { method: "CashOnArrival" } as never);

    expect(mockDb.seat.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { bookingId: 1, status: "Reserved" } }),
    );
    const call = mockDb.seat.updateMany.mock.calls.at(-1)?.[0] as {
      data: { reservedUntil: Date };
    };
    const held = call.data.reservedUntil;
    // Months away, so far beyond any checkout window — and short of departure.
    expect(held.getTime()).toBeGreaterThan(Date.now() + 24 * 60 * 60 * 1000);
    expect(held.getTime()).toBeLessThan(departureDate.getTime() + 24 * 60 * 60 * 1000);
  });

  it("floors the cash hold at the checkout window for a last-minute booking", async () => {
    // Departure already inside the 6h cutoff — the rider still gets a normal
    // checkout window rather than a hold that expired before it was set.
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportBooking.findUnique.mockResolvedValue({
      id: 1,
      userId: "user-1",
      totalAmount: 200,
      trip: {
        departureDate: new Date(Date.now() + 60 * 60 * 1000),
        departureTime: "06:00",
        route: { office: { ownerId: "user-1" } },
      },
    } as never);
    mockDb.transportPayment.create.mockResolvedValue({ id: 10, status: "Pending" } as never);
    mockDb.seat.updateMany.mockResolvedValue({ count: 1 } as never);

    await processPayment(1, { method: "CashOnArrival" } as never);

    const call = mockDb.seat.updateMany.mock.calls.at(-1)?.[0] as {
      data: { reservedUntil: Date };
    };
    expect(call.data.reservedUntil.getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects card methods — those must use the Stripe intent flow", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportBooking.findUnique.mockResolvedValue({
      id: 1,
      userId: "user-1",
      totalAmount: 200,
      trip: { route: { office: { ownerId: "user-1" } } },
    } as never);

    await expect(
      processPayment(1, { method: "CreditCard" } as never)
    ).rejects.toThrow("card checkout");
    expect(mockDb.transportPayment.create).not.toHaveBeenCalled();
  });

  it("records a Pending bank-transfer claim with the user reference, never Paid", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportBooking.findUnique.mockResolvedValue({
      id: 1,
      userId: "user-1",
      totalAmount: 200,
      trip: { route: { office: { ownerId: "user-1" } } },
    } as never);
    const payment = { id: 2, status: "Pending" };
    mockDb.transportPayment.create.mockResolvedValue(payment as never);
    mockDb.seat.updateMany.mockResolvedValue({ count: 2 } as never);

    const result = await processPayment(1, {
      method: "BankTransfer",
      bankReference: "BOK-123456",
    } as never);

    expect(result).toEqual({ success: true, payment, pendingVerification: true });
    expect(mockDb.transportPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "Pending",
          transactionId: "BOK-123456",
        }),
      })
    );
    // No fake TXN, no auto-confirm.
    expect(mockDb.transportBooking.update).not.toHaveBeenCalled();
    // Seat hold extended past the 30-minute checkout TTL.
    expect(mockDb.seat.updateMany).toHaveBeenCalled();
  });

  it("requires a transfer reference for bank transfers", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportBooking.findUnique.mockResolvedValue({
      id: 1,
      userId: "user-1",
      totalAmount: 200,
      trip: { route: { office: { ownerId: "user-1" } } },
    } as never);

    await expect(
      processPayment(1, { method: "BankTransfer" } as never)
    ).rejects.toThrow("reference");
  });
});

describe("verifyPayment", () => {
  it("throws Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(verifyPayment(1)).rejects.toThrow("Unauthorized");
  });

  it("sets payment to Paid and confirms the booking", async () => {
    mockAuth.mockResolvedValue(session as never);
    // Owner-scope lookup chained through booking → trip → route → office.
    mockDb.transportPayment.findUnique = vi.fn().mockResolvedValue({
      id: 1,
      bookingId: 5,
      booking: {
        trip: { route: { office: { ownerId: "user-1" } } },
      },
    } as never) as never;
    mockDb.transportPayment.update.mockResolvedValue({
      id: 1,
      bookingId: 5,
    } as never);
    // confirmBooking uses this lookup and the nested office.
    mockDb.transportBooking.findUnique.mockResolvedValue({
      userId: "user-1",
      trip: { route: { office: { ownerId: "user-1" } } },
    } as never);
    mockDb.transportBooking.update.mockResolvedValue({} as never);
    mockDb.seat.updateMany.mockResolvedValue({} as never);

    const result = await verifyPayment(1);
    expect(result.success).toBe(true);
  });

  it("sets payment to Failed and cancels the booking when rejected", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportPayment.findUnique = vi.fn().mockResolvedValue({
      id: 1,
      bookingId: 5,
      booking: {
        trip: { route: { office: { ownerId: "user-1" } } },
      },
    } as never) as never;
    mockDb.transportPayment.update.mockResolvedValue({
      id: 1,
      bookingId: 5,
    } as never);
    mockDb.transportBooking.findUnique.mockResolvedValue({
      id: 5,
      tripId: 10,
      seats: [{}, {}],
      userId: "user-1",
      trip: { route: { office: { ownerId: "user-1" } } },
    } as never);
    mockDb.transportBooking.update.mockResolvedValue({} as never);
    mockDb.seat.updateMany.mockResolvedValue({} as never);
    mockDb.trip.update.mockResolvedValue({} as never);

    const result = await verifyPayment(1, false);
    expect(result.success).toBe(true);
    expect(mockDb.transportPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: { status: "Failed" },
      })
    );
    expect(mockDb.transportBooking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5 },
        data: expect.objectContaining({ status: "Cancelled" }),
      })
    );
  });
});

// ============================================
// TICKET ACTIONS
// ============================================

describe("validateTicket", () => {
  // Gate scanning gained an operator auth check, forgery detection and i18n
  // message codes in the phase-1 hardening pass. `message` is now a key the
  // scanner UI translates ('notFound', 'cancelled', …), not an English string.
  const OWNER = "user-1"; // matches `session.user.id`, so canOverride passes

  // The action reads deep through trip → route → office/origin/destination, so
  // a bare `{ status }` stub throws before it reaches any of the assertions.
  const bookingFor = (over: Record<string, unknown> = {}) => ({
    id: 1,
    bookingReference: "BK-1",
    status: "Confirmed",
    passengerName: "Test Passenger",
    // Unsigned payloads are only trusted when they byte-match the QR we
    // issued, so the default stub carries the exact payload the tests scan.
    qrCode: JSON.stringify({ ref: "BK-1" }),
    seats: [{ seatNumber: "A1" }],
    passengers: [],
    trip: {
      departureDate: new Date("2026-08-01T06:00:00.000Z"),
      departureTime: "06:00",
      route: {
        office: { ownerId: OWNER },
        origin: { city: "Khartoum" },
        destination: { city: "Port Sudan" },
      },
    },
    ...over,
  });

  beforeEach(() => {
    mockAuth.mockResolvedValue(session as never);
  });

  it("refuses an unauthenticated scan before touching the database", async () => {
    mockAuth.mockResolvedValue(null as never);

    const result = await validateTicket(JSON.stringify({ ref: "BK-1" }));
    expect(result).toEqual({ valid: false, message: "auth" });
    expect(mockDb.transportBooking.findUnique).not.toHaveBeenCalled();
  });

  it("refuses an operator scanning another office's ticket", async () => {
    // A gate agent authenticates as the office owner; anyone else scanning
    // this booking is reading a stranger's passenger manifest.
    mockDb.transportBooking.findUnique.mockResolvedValue(
      bookingFor({ trip: { ...bookingFor().trip, route: { ...bookingFor().trip.route, office: { ownerId: "someone-else" } } } }) as never
    );

    const result = await validateTicket(JSON.stringify({ ref: "BK-1" }));
    expect(result).toEqual({ valid: false, message: "auth" });
  });

  it("treats a non-JSON scan as a manually typed booking reference", async () => {
    // Camera-less fallback: the agent types the ref, which is upper-cased.
    mockDb.transportBooking.findUnique.mockResolvedValue(bookingFor() as never);

    const result = await validateTicket("bk-1");
    expect(mockDb.transportBooking.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { bookingReference: "BK-1" } })
    );
    expect(result.valid).toBe(true);
  });

  it("accepts a manually typed reference in any case", async () => {
    // Regression: the forgery check compared the raw input, not the
    // upper-cased ref, so "bk-1" normalised to "BK-1" for the lookup and was
    // then rejected as 'forged'. The camera-less fallback only worked if the
    // agent happened to type in uppercase.
    mockDb.transportBooking.findUnique.mockResolvedValue(bookingFor() as never);

    for (const typed of ["bk-1", "BK-1", "Bk-1", " bk-1 "]) {
      const result = await validateTicket(typed);
      expect(result.valid, `typing "${typed}" should board`).toBe(true);
    }
  });

  it("returns invalid for an empty reference", async () => {
    const result = await validateTicket(JSON.stringify({ ref: "" }));
    expect(result).toEqual({ valid: false, message: "invalid" });
  });

  it("returns notFound when the booking does not exist", async () => {
    mockDb.transportBooking.findUnique.mockResolvedValue(null as never);

    const result = await validateTicket(JSON.stringify({ ref: "BK-999" }));
    expect(result).toEqual({ valid: false, message: "notFound" });
  });

  it("rejects an unsigned JSON payload that does not match the stored QR", async () => {
    // Forgery guard: unsigned payloads are only trusted when they byte-match
    // the QR we issued, so a hand-crafted {"ref":"BK-1"} cannot board.
    mockDb.transportBooking.findUnique.mockResolvedValue(
      bookingFor({ qrCode: JSON.stringify({ ref: "BK-1", seat: "A1" }) }) as never
    );

    const result = await validateTicket(JSON.stringify({ ref: "BK-1" }));
    expect(result).toEqual({ valid: false, message: "forged" });
  });

  it("returns cancelled for a cancelled booking", async () => {
    mockDb.transportBooking.findUnique.mockResolvedValue(
      bookingFor({ status: "Cancelled" }) as never
    );

    const result = await validateTicket(JSON.stringify({ ref: "BK-1" }));
    expect(result).toEqual({ valid: false, message: "cancelled" });
  });

  it("returns used for a completed (already boarded) booking", async () => {
    mockDb.transportBooking.findUnique.mockResolvedValue(
      bookingFor({ status: "Completed" }) as never
    );

    const result = await validateTicket(JSON.stringify({ ref: "BK-1" }));
    expect(result).toEqual({ valid: false, message: "used" });
  });

  it("returns unpaid rather than boarding a pending booking", async () => {
    mockDb.transportBooking.findUnique.mockResolvedValue(
      bookingFor({ status: "Pending" }) as never
    );

    const result = await validateTicket(JSON.stringify({ ref: "BK-1" }));
    expect(result).toEqual({ valid: false, message: "unpaid" });
  });

  it("returns the ticket for a confirmed booking", async () => {
    mockDb.transportBooking.findUnique.mockResolvedValue(bookingFor() as never);

    const result = await validateTicket(JSON.stringify({ ref: "BK-1" }));
    expect(result.valid).toBe(true);
    expect(result.message).toBe("valid");
    expect(result.ticket).toMatchObject({
      reference: "BK-1",
      origin: "Khartoum",
      destination: "Port Sudan",
      seat: "A1",
      seatScoped: false,
    });
  });

  it("will not board the same group member twice", async () => {
    // Seat-scoped QRs report that passenger's own check-in state, so each
    // member of a group boards exactly once.
    mockDb.transportBooking.findUnique.mockResolvedValue(
      bookingFor({
        qrCode: JSON.stringify({ ref: "BK-1", seat: "A1" }),
        passengers: [{ name: "Amna", seatNumber: "A1", checkedInAt: new Date() }],
      }) as never
    );

    const result = await validateTicket(JSON.stringify({ ref: "BK-1", seat: "A1" }));
    expect(result).toEqual({ valid: false, message: "used" });
  });
});

// ============================================
// DASHBOARD & STATUS ACTIONS
// ============================================

describe("getOfficeDashboardStats", () => {
  it("throws Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(getOfficeDashboardStats(1)).rejects.toThrow("Unauthorized");
  });

  it("returns aggregated stats", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportBooking.count
      .mockResolvedValueOnce(10 as never) // total
      .mockResolvedValueOnce(3 as never) // pending
      .mockResolvedValueOnce(5 as never) // confirmed
      .mockResolvedValueOnce(7 as never); // earning revenue (Confirmed + Completed)
    mockDb.transportBooking.aggregate.mockResolvedValue({
      _sum: { totalAmount: 5000 },
    } as never);
    mockDb.trip.count.mockResolvedValue(2 as never);
    mockDb.bus.count.mockResolvedValue(4 as never);
    mockDb.route.count.mockResolvedValue(3 as never);

    const result = await getOfficeDashboardStats(1);
    expect(result).toEqual({
      totalBookings: 10,
      pendingBookings: 3,
      confirmedBookings: 5,
      revenueBookings: 7,
      totalRevenue: 5000,
      upcomingTrips: 2,
      totalBuses: 4,
      totalRoutes: 3,
    });
  });

  it("counts revenue bookings on the same filter the revenue sum uses", async () => {
    // The earnings page prints this count directly under the revenue figure.
    // While it used the literal Confirmed count, an office whose only booking
    // had completed read "SDG 161,837 from 0 confirmed bookings" — and every
    // operator's count would fall back toward zero as their buses arrived.
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportBooking.count.mockResolvedValue(0 as never);
    mockDb.transportBooking.aggregate.mockResolvedValue({
      _sum: { totalAmount: 161837 },
    } as never);
    mockDb.trip.count.mockResolvedValue(0 as never);
    mockDb.bus.count.mockResolvedValue(0 as never);
    mockDb.route.count.mockResolvedValue(0 as never);

    await getOfficeDashboardStats(1);

    const countCalls = mockDb.transportBooking.count.mock.calls.map(
      (c) => (c[0] as { where?: Record<string, unknown> })?.where,
    );
    const aggregateWhere = (
      mockDb.transportBooking.aggregate.mock.calls.at(-1)?.[0] as {
        where?: Record<string, unknown>;
      }
    )?.where;

    // One of the counts must carry exactly the aggregate's status filter.
    expect(countCalls).toContainEqual(
      expect.objectContaining({ status: aggregateWhere?.status }),
    );
  });
});

describe("updateBookingStatus", () => {
  it("throws Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(updateBookingStatus(1, "Confirmed")).rejects.toThrow(
      "Unauthorized"
    );
  });

  it("throws when booking not found", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportBooking.findUnique.mockResolvedValue(null as never);

    await expect(updateBookingStatus(1, "Confirmed")).rejects.toThrow(
      "Booking not found"
    );
  });

  it("throws Unauthorized when user does not own booking's office", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportBooking.findUnique.mockResolvedValue({
      office: { ownerId: "someone-else" },
      seats: [],
    } as never);

    await expect(updateBookingStatus(1, "Confirmed")).rejects.toThrow(
      "Unauthorized"
    );
  });

  it("restores seats on cancellation", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportBooking.findUnique.mockResolvedValue({
      id: 1,
      tripId: 5,
      office: { ownerId: "user-1" },
      seats: [{ id: 10 }, { id: 11 }],
      confirmedAt: null,
      cancelledAt: null,
    } as never);
    mockDb.transportBooking.update.mockResolvedValue({
      id: 1,
      status: "Cancelled",
    } as never);
    mockDb.seat.updateMany.mockResolvedValue({ count: 2 } as never);
    mockDb.trip.update.mockResolvedValue({} as never);

    const result = await updateBookingStatus(1, "Cancelled");
    expect(result.success).toBe(true);
    expect(mockDb.seat.updateMany).toHaveBeenCalledWith({
      where: { bookingId: 1 },
      // `reservedUntil` clears too — a released seat must not keep a stale hold.
      data: { status: "Available", bookingId: null, reservedUntil: null },
    });
    expect(mockDb.trip.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { availableSeats: { increment: 2 } },
    });
  });

  it("updates seats to Booked on confirmation", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportBooking.findUnique.mockResolvedValue({
      id: 1,
      tripId: 5,
      office: { ownerId: "user-1" },
      seats: [{ id: 10 }],
      confirmedAt: null,
      cancelledAt: null,
    } as never);
    mockDb.transportBooking.update.mockResolvedValue({
      id: 1,
      status: "Confirmed",
    } as never);
    mockDb.seat.updateMany.mockResolvedValue({ count: 1 } as never);

    const result = await updateBookingStatus(1, "Confirmed");
    expect(result.success).toBe(true);
    expect(mockDb.seat.updateMany).toHaveBeenCalledWith({
      where: { bookingId: 1 },
      // A confirmed seat is owned outright, so the temporary hold is dropped —
      // leaving `reservedUntil` set would let the lock sweeper reclaim a paid seat.
      data: { status: "Booked", reservedUntil: null },
    });
  });

  it("settles the pending manual-payment claim on confirmation", async () => {
    // The operator's Confirm button IS the manual-payment verification: the
    // money landed in their wallet and they are saying so. Leaving the claim
    // Pending stranded it in the admin reconciliation queue forever, behind a
    // passenger who had already travelled.
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportBooking.findUnique.mockResolvedValue({
      id: 1,
      tripId: 5,
      office: { ownerId: "user-1" },
      seats: [{ id: 10 }],
      confirmedAt: null,
      cancelledAt: null,
    } as never);
    mockDb.transportBooking.update.mockResolvedValue({
      id: 1,
      status: "Confirmed",
    } as never);
    mockDb.seat.updateMany.mockResolvedValue({ count: 1 } as never);

    await updateBookingStatus(1, "Confirmed");

    expect(mockDb.transportPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bookingId: 1, status: "Pending" },
        data: expect.objectContaining({ status: "Paid" }),
      }),
    );
  });

  it("fails the pending manual-payment claim on cancellation", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportBooking.findUnique.mockResolvedValue({
      id: 1,
      tripId: 5,
      office: { ownerId: "user-1" },
      seats: [{ id: 10 }, { id: 11 }],
      confirmedAt: null,
      cancelledAt: null,
    } as never);
    mockDb.transportBooking.update.mockResolvedValue({
      id: 1,
      status: "Cancelled",
    } as never);
    mockDb.seat.updateMany.mockResolvedValue({ count: 2 } as never);
    mockDb.trip.update.mockResolvedValue({} as never);

    await updateBookingStatus(1, "Cancelled");

    expect(mockDb.transportPayment.updateMany).toHaveBeenCalledWith({
      where: { bookingId: 1, status: "Pending" },
      data: { status: "Failed" },
    });
  });
});
