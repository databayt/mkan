import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    listing: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    location: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
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
  sanitizeHtml: vi.fn((s: string) => s),
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
  createListing,
  getListing,
  getListings,
  getHostListings,
  updateListing,
  deleteListing,
  publishListing,
  unpublishListing,
  searchListings,
} from "@/lib/actions/listing-actions";

const mockAuth = vi.mocked(auth);
const mockDb = vi.mocked(db);

const authenticatedSession = {
  user: { id: "user-1", name: "Test", email: "test@test.com", role: "USER" },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createListing", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(createListing({})).rejects.toThrow("logged in");
  });

  it("throws for invalid data", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);

    await expect(createListing({ pricePerNight: "not a number" })).rejects.toThrow(
      "Invalid listing data"
    );
  });

  it("creates listing with location when all location fields provided", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    mockDb.location.create.mockResolvedValue({ id: 10 } as never);
    mockDb.listing.create.mockResolvedValue({ id: 1, title: "Test" } as never);

    const result = await createListing({
      title: "Test Listing",
      address: "123 St",
      city: "Khartoum",
      state: "Khartoum",
      country: "Sudan",
    });

    expect(mockDb.location.create).toHaveBeenCalled();
    expect(mockDb.listing.create).toHaveBeenCalled();
    expect(result).toHaveProperty("success", true);
  });

  it("creates listing without location when partial location", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    mockDb.listing.create.mockResolvedValue({ id: 1 } as never);

    await createListing({ title: "Test" });

    expect(mockDb.location.create).not.toHaveBeenCalled();
    expect(mockDb.listing.create).toHaveBeenCalled();
  });

  it("connects listing to authenticated user", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    mockDb.listing.create.mockResolvedValue({ id: 1 } as never);

    await createListing({ title: "Test" });

    const createCall = mockDb.listing.create.mock.calls[0][0];
    expect(createCall.data).toHaveProperty("host", { connect: { id: "user-1" } });
  });
});

describe("getListing", () => {
  it("throws for invalid ID", async () => {
    await expect(getListing("abc")).rejects.toThrow("Invalid listing ID");
    await expect(getListing(-1)).rejects.toThrow("Invalid listing ID");
    await expect(getListing(0)).rejects.toThrow("Invalid listing ID");
  });

  it("throws when listing not found", async () => {
    mockDb.listing.findUnique.mockResolvedValue(null);

    await expect(getListing(1)).rejects.toThrow("not found");
  });

  it("returns listing with location and host", async () => {
    const listing = { id: 1, title: "Test", location: {}, host: {} };
    mockDb.listing.findUnique.mockResolvedValue(listing as never);

    const result = await getListing(1);

    expect(result).toEqual(listing);
    expect(mockDb.listing.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        include: expect.objectContaining({ location: true }),
      })
    );
  });
});

describe("getListings", () => {
  it("returns all listings when no filters", async () => {
    mockDb.listing.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }] as never);

    const result = await getListings();

    expect(result).toHaveLength(2);
  });

  it("filters by published only", async () => {
    mockDb.listing.findMany.mockResolvedValue([] as never);

    await getListings({ publishedOnly: true });

    const where = mockDb.listing.findMany.mock.calls[0][0]?.where;
    expect(where).toHaveProperty("isPublished", true);
    expect(where).toHaveProperty("draft", false);
  });

  it("filters by location", async () => {
    mockDb.listing.findMany.mockResolvedValue([] as never);

    await getListings({ location: "Khartoum" });

    const where = mockDb.listing.findMany.mock.calls[0][0]?.where;
    expect(where).toHaveProperty("location");
  });

  it("filters by price range", async () => {
    mockDb.listing.findMany.mockResolvedValue([] as never);

    await getListings({ priceMin: 100, priceMax: 500 });

    const where = mockDb.listing.findMany.mock.calls[0][0]?.where;
    expect(where?.pricePerNight).toEqual({ gte: 100, lte: 500 });
  });

  it("filters by amenities", async () => {
    mockDb.listing.findMany.mockResolvedValue([] as never);

    await getListings({ amenities: ["WiFi" as never, "Pool" as never] });

    const where = mockDb.listing.findMany.mock.calls[0][0]?.where;
    expect(where?.amenities).toEqual({ hasEvery: ["WiFi", "Pool"] });
  });
});

describe("getHostListings", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(getHostListings()).rejects.toThrow("User ID is required");
  });

  it("uses session user ID when no hostId provided", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    mockDb.listing.findMany.mockResolvedValue([] as never);

    await getHostListings();

    const where = mockDb.listing.findMany.mock.calls[0][0]?.where;
    expect(where?.hostId).toBe("user-1");
  });

  it("uses provided hostId", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    mockDb.listing.findMany.mockResolvedValue([] as never);

    await getHostListings("other-user");

    const where = mockDb.listing.findMany.mock.calls[0][0]?.where;
    expect(where?.hostId).toBe("other-user");
  });
});

describe("updateListing", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(updateListing(1, { title: "New" })).rejects.toThrow("logged in");
  });

  it("throws for invalid ID", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);

    await expect(updateListing("abc", {})).rejects.toThrow("Invalid listing ID");
  });

  it("throws when listing not found", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    mockDb.listing.findUnique.mockResolvedValue(null);

    await expect(updateListing(1, { title: "x" })).rejects.toThrow("not found");
  });

  it("throws when user is not the owner", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    mockDb.listing.findUnique.mockResolvedValueOnce({ hostId: "other-user" } as never);

    await expect(updateListing(1, { title: "x" })).rejects.toThrow("your own");
  });

  it("updates listing when owner", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    mockDb.listing.findUnique
      .mockResolvedValueOnce({ hostId: "user-1" } as never) // ownership check
      .mockResolvedValueOnce({ id: 1, location: null } as never); // location check
    mockDb.listing.update.mockResolvedValue({ id: 1, title: "Updated" } as never);

    const result = await updateListing(1, { title: "Updated" });

    expect(result).toHaveProperty("success", true);
  });
});

describe("deleteListing", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(deleteListing(1)).rejects.toThrow("logged in");
  });

  it("throws when user is not the owner", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    mockDb.listing.findUnique.mockResolvedValue({ hostId: "other-user" } as never);

    await expect(deleteListing(1)).rejects.toThrow("your own");
  });

  it("deletes listing when owner", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    mockDb.listing.findUnique.mockResolvedValue({ hostId: "user-1" } as never);
    mockDb.listing.delete.mockResolvedValue({} as never);

    const result = await deleteListing(1);

    expect(result).toHaveProperty("success", true);
    expect(mockDb.listing.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });
});

describe("publishListing", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(publishListing(1)).rejects.toThrow("logged in");
  });

  it("throws when listing is missing required fields", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    // Single findUnique with include: { location: true } — checks ownership + completeness
    mockDb.listing.findUnique.mockResolvedValueOnce({
      id: 1,
      hostId: "user-1",
      title: "Test",
      description: null,
      pricePerNight: null,
      location: { id: 1 },
      photoUrls: ["photo.jpg"],
    } as never);

    await expect(publishListing(1)).rejects.toThrow("Missing required fields");
  });

  it("throws when listing has no location", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    mockDb.listing.findUnique.mockResolvedValueOnce({
      id: 1,
      hostId: "user-1",
      title: "Test",
      description: "Desc",
      pricePerNight: 100,
      propertyType: "Apartment",
      bedrooms: 2,
      bathrooms: 1,
      location: null,
      photoUrls: ["photo.jpg"],
    } as never);

    await expect(publishListing(1)).rejects.toThrow("Location is required");
  });

  it("throws when listing has no photos", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    mockDb.listing.findUnique.mockResolvedValueOnce({
      id: 1,
      hostId: "user-1",
      title: "Test",
      description: "Desc",
      pricePerNight: 100,
      propertyType: "Apartment",
      bedrooms: 2,
      bathrooms: 1,
      location: { id: 1 },
      photoUrls: [],
    } as never);

    await expect(publishListing(1)).rejects.toThrow("photo is required");
  });

  it("publishes valid listing", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    mockDb.listing.findUnique.mockResolvedValueOnce({
      id: 1,
      hostId: "user-1",
      title: "Test",
      description: "Description here",
      pricePerNight: 100,
      propertyType: "Apartment",
      bedrooms: 2,
      bathrooms: 1,
      location: { id: 1 },
      photoUrls: ["photo.jpg"],
    } as never);
    mockDb.listing.update.mockResolvedValue({ id: 1, isPublished: true } as never);

    const result = await publishListing(1);

    expect(result).toHaveProperty("success", true);
    const updateData = mockDb.listing.update.mock.calls[0][0].data;
    expect(updateData).toHaveProperty("isPublished", true);
    expect(updateData).toHaveProperty("draft", false);
  });
});

describe("unpublishListing", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(unpublishListing(1)).rejects.toThrow("logged in");
  });

  it("throws when listing not found", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    mockDb.listing.findUnique.mockResolvedValue(null);

    await expect(unpublishListing(999)).rejects.toThrow("not found");
  });

  it("throws when user is not the owner", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    mockDb.listing.findUnique.mockResolvedValue({
      hostId: "other-user",
    } as never);

    await expect(unpublishListing(1)).rejects.toThrow("your own");
  });

  it("unpublishes listing when owner", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    mockDb.listing.findUnique.mockResolvedValue({ hostId: "user-1" } as never);
    mockDb.listing.update.mockResolvedValue({ id: 1, isPublished: false } as never);

    const result = await unpublishListing(1);

    expect(result).toHaveProperty("success", true);
    const updateData = mockDb.listing.update.mock.calls[0][0].data;
    expect(updateData).toHaveProperty("isPublished", false);
  });

  it("throws for invalid ID", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);

    await expect(unpublishListing(-1)).rejects.toThrow();
  });
});

// ---------- searchListings ----------

describe("searchListings", () => {
  it("returns listings with pagination defaults", async () => {
    mockDb.listing.findMany.mockResolvedValue([
      { id: 1, title: "Beach House" },
    ] as never);
    mockDb.listing.count.mockResolvedValue(1);

    const result = await searchListings({});

    expect(result.listings).toHaveLength(1);
    expect(result.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it("applies text query filter", async () => {
    mockDb.listing.findMany.mockResolvedValue([] as never);
    mockDb.listing.count.mockResolvedValue(0);

    await searchListings({ query: "beach" });

    const where = mockDb.listing.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeDefined();
    expect(where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: expect.objectContaining({ contains: "beach" }),
        }),
        expect.objectContaining({
          description: expect.objectContaining({ contains: "beach" }),
        }),
      ])
    );
  });

  it("applies location filter", async () => {
    mockDb.listing.findMany.mockResolvedValue([] as never);
    mockDb.listing.count.mockResolvedValue(0);

    await searchListings({ location: "Dubai" });

    const where = mockDb.listing.findMany.mock.calls[0][0].where;
    expect(where.location).toBeDefined();
    expect(where.location.is.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          city: expect.objectContaining({ contains: "Dubai" }),
        }),
      ])
    );
  });

  it("applies guest count filter", async () => {
    mockDb.listing.findMany.mockResolvedValue([] as never);
    mockDb.listing.count.mockResolvedValue(0);

    await searchListings({ guests: 4 });

    const where = mockDb.listing.findMany.mock.calls[0][0].where;
    expect(where.guestCount).toEqual({ gte: 4 });
  });

  it("applies price range filter", async () => {
    mockDb.listing.findMany.mockResolvedValue([] as never);
    mockDb.listing.count.mockResolvedValue(0);

    await searchListings({ priceMin: 100, priceMax: 500 });

    const where = mockDb.listing.findMany.mock.calls[0][0].where;
    expect(where.pricePerNight).toEqual({ gte: 100, lte: 500 });
  });

  it("applies property type filter", async () => {
    mockDb.listing.findMany.mockResolvedValue([] as never);
    mockDb.listing.count.mockResolvedValue(0);

    await searchListings({ propertyType: "Apartment" as never });

    const where = mockDb.listing.findMany.mock.calls[0][0].where;
    expect(where.propertyType).toBe("Apartment");
  });

  it("applies amenities filter", async () => {
    mockDb.listing.findMany.mockResolvedValue([] as never);
    mockDb.listing.count.mockResolvedValue(0);

    await searchListings({ amenities: ["Pool", "Wifi"] as never });

    const where = mockDb.listing.findMany.mock.calls[0][0].where;
    expect(where.amenities).toEqual({ hasEvery: ["Pool", "Wifi"] });
  });

  it("applies instant book filter", async () => {
    mockDb.listing.findMany.mockResolvedValue([] as never);
    mockDb.listing.count.mockResolvedValue(0);

    await searchListings({ instantBook: true });

    const where = mockDb.listing.findMany.mock.calls[0][0].where;
    expect(where.instantBook).toBe(true);
  });

  it("paginates correctly", async () => {
    mockDb.listing.findMany.mockResolvedValue([] as never);
    mockDb.listing.count.mockResolvedValue(50);

    const result = await searchListings({ page: 3, limit: 10 });

    expect(result.pagination).toEqual({
      page: 3,
      limit: 10,
      total: 50,
      totalPages: 5,
    });
    const call = mockDb.listing.findMany.mock.calls[0][0];
    expect(call.skip).toBe(20);
    expect(call.take).toBe(10);
  });

  it("always filters for published, non-draft listings", async () => {
    mockDb.listing.findMany.mockResolvedValue([] as never);
    mockDb.listing.count.mockResolvedValue(0);

    await searchListings({});

    const where = mockDb.listing.findMany.mock.calls[0][0].where;
    expect(where.isPublished).toBe(true);
    expect(where.draft).toBe(false);
  });

  it("wraps database errors", async () => {
    mockDb.listing.findMany.mockRejectedValue(new Error("DB down"));

    await expect(searchListings({})).rejects.toThrow("Failed to search");
  });
});
