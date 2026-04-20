import { describe, it, expect } from "vitest";
import {
  SEARCH_CONFIG,
  searchFormSchema,
  locationQuerySchema,
} from "@/lib/schemas/search-schema";

// ---------- SEARCH_CONFIG ----------
describe("SEARCH_CONFIG", () => {
  it("has expected default values", () => {
    expect(SEARCH_CONFIG.MIN_NIGHTS).toBe(1);
    expect(SEARCH_CONFIG.DEFAULT_MAX_NIGHTS).toBe(365);
    expect(SEARCH_CONFIG.MAX_GUESTS).toBe(16);
    expect(SEARCH_CONFIG.MAX_ADULTS).toBe(16);
    expect(SEARCH_CONFIG.MAX_CHILDREN).toBe(10);
    expect(SEARCH_CONFIG.MAX_INFANTS).toBe(5);
    expect(SEARCH_CONFIG.MAX_LOCATION_RESULTS).toBe(10);
  });
});

// ---------- searchFormSchema ----------
describe("searchFormSchema", () => {
  it("accepts empty input", () => {
    const result = searchFormSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts valid search data", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    const result = searchFormSchema.safeParse({
      location: "Dubai",
      checkIn: tomorrow.toISOString(),
      checkOut: nextWeek.toISOString(),
      guests: 4,
      adults: 2,
      children: 1,
      infants: 1,
    });
    expect(result.success).toBe(true);
  });

  it("rejects past check-in date", () => {
    const pastDate = new Date("2020-01-01");
    const result = searchFormSchema.safeParse({
      checkIn: pastDate.toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it("allows undefined check-in (no date restriction)", () => {
    const result = searchFormSchema.safeParse({ location: "Cairo" });
    expect(result.success).toBe(true);
  });

  it("rejects checkout before checkin", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 5);
    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 1);

    const result = searchFormSchema.safeParse({
      checkIn: tomorrow.toISOString(),
      checkOut: dayAfter.toISOString(),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const checkOutErrors = result.error.issues.filter(
        (i) => i.path.includes("checkOut")
      );
      expect(checkOutErrors.length).toBeGreaterThan(0);
    }
  });

  it("enforces minimum stay of 1 night", () => {
    const today = new Date();
    today.setDate(today.getDate() + 2);
    // Same day = 0 nights
    const result = searchFormSchema.safeParse({
      checkIn: today.toISOString(),
      checkOut: today.toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it("enforces maximum stay of 365 nights", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const wayLater = new Date();
    wayLater.setDate(wayLater.getDate() + 400);

    const result = searchFormSchema.safeParse({
      checkIn: tomorrow.toISOString(),
      checkOut: wayLater.toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it("accepts exactly 365 nights", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yearLater = new Date(tomorrow);
    yearLater.setDate(yearLater.getDate() + 365);

    const result = searchFormSchema.safeParse({
      checkIn: tomorrow.toISOString(),
      checkOut: yearLater.toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects guests exceeding maximum", () => {
    const result = searchFormSchema.safeParse({ guests: 17 });
    expect(result.success).toBe(false);
  });

  it("rejects negative guest counts", () => {
    const result = searchFormSchema.safeParse({ adults: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects children exceeding maximum", () => {
    const result = searchFormSchema.safeParse({ children: 11 });
    expect(result.success).toBe(false);
  });

  it("rejects infants exceeding maximum", () => {
    const result = searchFormSchema.safeParse({ infants: 6 });
    expect(result.success).toBe(false);
  });
});

// ---------- locationQuerySchema ----------
describe("locationQuerySchema", () => {
  it("accepts valid query with default limit", () => {
    const result = locationQuerySchema.safeParse({ query: "Dubai" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(SEARCH_CONFIG.MAX_LOCATION_RESULTS);
    }
  });

  it("accepts custom limit", () => {
    const result = locationQuerySchema.safeParse({
      query: "Cairo",
      limit: 5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(5);
    }
  });

  it("rejects empty query", () => {
    const result = locationQuerySchema.safeParse({ query: "" });
    expect(result.success).toBe(false);
  });

  it("rejects query exceeding 100 chars", () => {
    const result = locationQuerySchema.safeParse({
      query: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("rejects limit below 1", () => {
    const result = locationQuerySchema.safeParse({
      query: "test",
      limit: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects limit above 20", () => {
    const result = locationQuerySchema.safeParse({
      query: "test",
      limit: 21,
    });
    expect(result.success).toBe(false);
  });
});
