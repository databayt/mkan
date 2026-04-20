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
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    transportPayment: {
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
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
} from "@/lib/actions/transport-actions";

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
  it("returns only active offices", async () => {
    mockDb.transportOffice.findMany.mockResolvedValue([] as never);

    await getTransportOffices();
    expect(mockDb.transportOffice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
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

  it("sets isCancelled to true", async () => {
    mockAuth.mockResolvedValue(session as never);
    const trip = { id: 1, isCancelled: true };
    mockDb.trip.update.mockResolvedValue(trip as never);

    const result = await cancelTrip(1);
    expect(result).toEqual({ success: true, trip });
    expect(mockDb.trip.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { isCancelled: true },
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

    await expect(createBooking(bookingInput)).rejects.toThrow(
      "Some selected seats are no longer available"
    );
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
    mockDb.transportBooking.update.mockResolvedValue(booking as never);
    mockDb.seat.updateMany.mockResolvedValue({ count: 2 } as never);

    const result = await confirmBooking(1);
    expect(result).toEqual({ success: true, booking });
    expect(mockDb.seat.updateMany).toHaveBeenCalledWith({
      where: { bookingId: 1 },
      data: { status: "Booked" },
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

  it("releases seats and increments available seats count", async () => {
    mockAuth.mockResolvedValue(session as never);
    const booking = { id: 1, tripId: 5, seats: [{ id: 10 }, { id: 11 }] };
    mockDb.transportBooking.findUnique.mockResolvedValue(booking as never);
    mockDb.seat.updateMany.mockResolvedValue({ count: 2 } as never);
    mockDb.transportBooking.update.mockResolvedValue({
      id: 1,
      status: "Cancelled",
    } as never);
    mockDb.trip.update.mockResolvedValue({} as never);

    const result = await cancelBooking(1);
    expect(result.success).toBe(true);
    expect(mockDb.seat.updateMany).toHaveBeenCalledWith({
      where: { bookingId: 1 },
      data: { status: "Available", bookingId: null },
    });
    expect(mockDb.trip.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { availableSeats: { increment: 2 } },
    });
  });
});

describe("getBooking", () => {
  it("returns booking with all relations", async () => {
    const booking = { id: 1, trip: {}, seats: [], payments: [] };
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
      totalAmount: 200,
    } as never);
    const payment = { id: 1, status: "Pending" };
    mockDb.transportPayment.create.mockResolvedValue(payment as never);

    const result = await processPayment(1, {
      method: "CashOnArrival",
    } as never);
    expect(result).toEqual({ success: true, payment });
    // Should NOT call confirmBooking flow
    expect(mockDb.transportBooking.update).not.toHaveBeenCalled();
  });

  it("creates Paid payment for CreditCard and confirms booking", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportBooking.findUnique.mockResolvedValue({
      id: 1,
      totalAmount: 200,
    } as never);
    const payment = { id: 1, status: "Paid" };
    mockDb.transportPayment.create.mockResolvedValue(payment as never);
    // confirmBooking will call these:
    mockDb.transportBooking.update.mockResolvedValue({
      id: 1,
      status: "Confirmed",
    } as never);
    mockDb.seat.updateMany.mockResolvedValue({ count: 2 } as never);

    const result = await processPayment(1, {
      method: "CreditCard",
    } as never);
    expect(result).toEqual({ success: true, payment });
    // confirmBooking should have been called
    expect(mockDb.transportBooking.update).toHaveBeenCalled();
  });
});

describe("verifyPayment", () => {
  it("throws Unauthorized when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(verifyPayment(1)).rejects.toThrow("Unauthorized");
  });

  it("sets payment to Paid and confirms the booking", async () => {
    mockAuth.mockResolvedValue(session as never);
    mockDb.transportPayment.update.mockResolvedValue({
      id: 1,
      bookingId: 5,
    } as never);
    // confirmBooking mocks
    mockDb.transportBooking.update.mockResolvedValue({} as never);
    mockDb.seat.updateMany.mockResolvedValue({} as never);

    const result = await verifyPayment(1);
    expect(result.success).toBe(true);
  });
});

// ============================================
// TICKET ACTIONS
// ============================================

describe("validateTicket", () => {
  it("returns invalid for malformed QR code", async () => {
    const result = await validateTicket("not json");
    expect(result).toEqual({ valid: false, message: "Invalid QR code" });
  });

  it("returns invalid when booking not found", async () => {
    mockDb.transportBooking.findUnique.mockResolvedValue(null as never);

    const result = await validateTicket(JSON.stringify({ ref: "BK-999" }));
    expect(result).toEqual({ valid: false, message: "Booking not found" });
  });

  it("returns invalid for cancelled booking", async () => {
    mockDb.transportBooking.findUnique.mockResolvedValue({
      status: "Cancelled",
    } as never);

    const result = await validateTicket(JSON.stringify({ ref: "BK-1" }));
    expect(result).toEqual({ valid: false, message: "Booking was cancelled" });
  });

  it("returns invalid for completed (already used) booking", async () => {
    mockDb.transportBooking.findUnique.mockResolvedValue({
      status: "Completed",
    } as never);

    const result = await validateTicket(JSON.stringify({ ref: "BK-1" }));
    expect(result).toEqual({ valid: false, message: "Ticket already used" });
  });

  it("returns valid for confirmed booking", async () => {
    const booking = { status: "Confirmed", bookingReference: "BK-1" };
    mockDb.transportBooking.findUnique.mockResolvedValue(booking as never);

    const result = await validateTicket(JSON.stringify({ ref: "BK-1" }));
    expect(result.valid).toBe(true);
    expect(result.message).toBe("Valid ticket");
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
      .mockResolvedValueOnce(5 as never); // confirmed
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
      totalRevenue: 5000,
      upcomingTrips: 2,
      totalBuses: 4,
      totalRoutes: 3,
    });
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
      data: { status: "Available", bookingId: null },
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
      data: { status: "Booked" },
    });
  });
});
