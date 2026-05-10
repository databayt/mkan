import { describe, it, expect, vi, beforeEach } from "vitest";

// Autocomplete actions now use `db.$queryRaw` for SQL-side aggregation
// (groupBy in the database, not JS). Mock that as a generic vi.fn() —
// each test sets the resolved value directly.
vi.mock("@/lib/db", () => ({
  db: {
    location: {
      findMany: vi.fn(),
    },
    listing: {
      findMany: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    $queryRaw: vi.fn(),
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: vi.fn(
    (fn: (...args: unknown[]) => unknown) =>
      (...args: unknown[]) =>
        fn(...args)
  ),
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
import {
  getLocationSuggestions,
  getPopularLocations,
  searchListings,
} from "@/lib/actions/search-actions";

const mockDb = vi.mocked(db);

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================
// getLocationSuggestions
// ============================================

describe("getLocationSuggestions", () => {
  it("returns empty array for empty query", async () => {
    const result = await getLocationSuggestions("");
    expect(result).toEqual([]);
  });

  it("returns location suggestions matching query", async () => {
    // The SQL aggregation already groups + sums in the DB, so the mock
    // returns one pre-grouped row per (city, state, country).
    mockDb.$queryRaw.mockResolvedValue([
      { city: "Riyadh", state: "Riyadh", country: "SA", n: 8n },
    ] as never);

    const result = await getLocationSuggestions("Riyadh");

    expect(result).toHaveLength(1);
    expect(result[0].listingCount).toBe(8);
    expect(result[0].city).toBe("Riyadh");
  });

  it("returns empty array when no rows match", async () => {
    // SQL GROUP BY only returns rows for cities with ≥1 listing match;
    // the join + WHERE filter zero-row case maps to an empty result.
    mockDb.$queryRaw.mockResolvedValue([] as never);

    const result = await getLocationSuggestions("Ghost");

    expect(result).toHaveLength(0);
  });

  it("preserves listing-count ordering from the database", async () => {
    // ORDER BY n DESC happens in SQL, so the mock returns the rows
    // in the order Postgres would have produced them. We just verify
    // the mapping is order-preserving.
    mockDb.$queryRaw.mockResolvedValue([
      { city: "B", state: "S2", country: "C2", n: 10n },
      { city: "A", state: "S1", country: "C1", n: 2n },
    ] as never);

    const result = await getLocationSuggestions("test");

    expect(result[0].city).toBe("B");
    expect(result[1].city).toBe("A");
  });

  it("returns empty array on database error", async () => {
    mockDb.$queryRaw.mockRejectedValue(new Error("DB down"));

    const result = await getLocationSuggestions("test");

    expect(result).toEqual([]);
  });
});

// ============================================
// getPopularLocations
// ============================================

describe("getPopularLocations", () => {
  it("returns popular locations in the order the database produced", async () => {
    // ORDER BY n DESC is applied in SQL; mock just returns pre-sorted.
    mockDb.$queryRaw.mockResolvedValue([
      { city: "Riyadh", state: "Riyadh", country: "SA", n: 50n },
      { city: "Jeddah", state: "Makkah", country: "SA", n: 20n },
    ] as never);

    const result = await getPopularLocations();

    expect(result[0].city).toBe("Riyadh");
    expect(result[1].city).toBe("Jeddah");
  });

  it("returns empty array on error", async () => {
    mockDb.$queryRaw.mockRejectedValue(new Error("DB down"));

    const result = await getPopularLocations();

    expect(result).toEqual([]);
  });

  it("builds displayName from city and state", async () => {
    mockDb.$queryRaw.mockResolvedValue([
      { city: "Dammam", state: "Eastern", country: "SA", n: 5n },
    ] as never);

    const result = await getPopularLocations();

    expect(result[0].displayName).toBe("Dammam, Eastern");
  });
});

// ============================================
// searchListings
// ============================================

describe("searchListings", () => {
  it("returns validation error for invalid filters", async () => {
    const result = await searchListings({ guests: 999 });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.data).toEqual([]);
  });

  it("returns listings with no filters", async () => {
    const listings = [{ id: 1, title: "A" }, { id: 2, title: "B" }];
    mockDb.listing.findMany.mockResolvedValue(listings as never);
    mockDb.listing.count.mockResolvedValue(2 as never);

    const result = await searchListings({});

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.count).toBe(2);
    expect(result.total).toBe(2);
  });

  it("applies location filter", async () => {
    mockDb.listing.findMany.mockResolvedValue([] as never);

    await searchListings({ location: "Riyadh" });

    const where = mockDb.listing.findMany.mock.calls[0][0]?.where;
    expect(where).toHaveProperty("location");
  });

  it("applies guest capacity filter", async () => {
    mockDb.listing.findMany.mockResolvedValue([] as never);

    await searchListings({ guests: 4 });

    const where = mockDb.listing.findMany.mock.calls[0][0]?.where;
    expect(where?.guestCount).toEqual({ gte: 4 });
  });

  it("sums adults and children for capacity filter", async () => {
    mockDb.listing.findMany.mockResolvedValue([] as never);

    await searchListings({ adults: 2, children: 1 });

    const where = mockDb.listing.findMany.mock.calls[0][0]?.where;
    expect(where?.guestCount).toEqual({ gte: 3 });
  });

  it("always filters to published non-draft listings", async () => {
    mockDb.listing.findMany.mockResolvedValue([] as never);

    await searchListings({});

    const where = mockDb.listing.findMany.mock.calls[0][0]?.where;
    expect(where).toHaveProperty("isPublished", true);
    expect(where).toHaveProperty("draft", false);
  });

  it("returns error result on database failure", async () => {
    mockDb.listing.findMany.mockRejectedValue(new Error("DB down"));

    const result = await searchListings({});

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to search");
    expect(result.data).toEqual([]);
  });
});
