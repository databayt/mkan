import { describe, it, expect } from "vitest";

// Mock the constants module which defines enums
vi.mock("@/lib/constants", () => ({
  PropertyTypeEnum: {
    Rooms: "Rooms",
    Apartment: "Apartment",
    Villa: "Villa",
    Townhouse: "Townhouse",
    Cottage: "Cottage",
    Tinyhouse: "Tinyhouse",
  },
  AmenityEnum: {
    WiFi: "WiFi",
    Pool: "Pool",
    Parking: "Parking",
    Gym: "Gym",
  },
  HighlightEnum: {
    HighSpeedInternetAccess: "HighSpeedInternetAccess",
    QuietNeighborhood: "QuietNeighborhood",
  },
}));

import {
  listingSchema,
  applicationSchema,
  leaseSchema,
  paymentSchema,
  reviewSchema,
  bookingSchema,
  searchFiltersSchema,
  hostReplySchema,
} from "@/lib/schemas";

describe("listingSchema", () => {
  const validListing = {
    title: "Nice Apartment",
    description: "A lovely apartment in the city center with great views",
    pricePerNight: 100,
    photoUrls: ["https://example.com/photo.jpg"],
    bedrooms: 2,
    bathrooms: 1,
    propertyType: "Apartment",
    address: "123 Main St",
    city: "Khartoum",
    state: "Khartoum State",
    country: "Sudan",
    postalCode: "11111",
  };

  it("accepts valid listing data", () => {
    expect(listingSchema.safeParse(validListing).success).toBe(true);
  });

  it("requires title", () => {
    const result = listingSchema.safeParse({ ...validListing, title: "" });
    expect(result.success).toBe(false);
  });

  it("enforces title max length", () => {
    const result = listingSchema.safeParse({ ...validListing, title: "a".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("requires description minimum 10 chars", () => {
    const result = listingSchema.safeParse({ ...validListing, description: "short" });
    expect(result.success).toBe(false);
  });

  it("requires positive price", () => {
    const result = listingSchema.safeParse({ ...validListing, pricePerNight: 0 });
    expect(result.success).toBe(false);
  });

  it("requires at least one photo", () => {
    const result = listingSchema.safeParse({ ...validListing, photoUrls: [] });
    expect(result.success).toBe(false);
  });

  it("enforces bedroom max of 50", () => {
    const result = listingSchema.safeParse({ ...validListing, bedrooms: 51 });
    expect(result.success).toBe(false);
  });

  it("requires location fields", () => {
    const { address, ...noAddress } = validListing;
    expect(listingSchema.safeParse(noAddress).success).toBe(false);
  });
});

describe("applicationSchema", () => {
  it("accepts valid application", () => {
    const result = applicationSchema.safeParse({
      name: "John",
      email: "john@example.com",
      phoneNumber: "1234567890",
    });
    expect(result.success).toBe(true);
  });

  it("requires valid email", () => {
    const result = applicationSchema.safeParse({
      name: "John",
      email: "not-email",
      phoneNumber: "1234567890",
    });
    expect(result.success).toBe(false);
  });

  it("requires phone minimum 10 digits", () => {
    const result = applicationSchema.safeParse({
      name: "John",
      email: "john@example.com",
      phoneNumber: "123",
    });
    expect(result.success).toBe(false);
  });

  it("allows optional message up to 1000 chars", () => {
    const result = applicationSchema.safeParse({
      name: "John",
      email: "john@example.com",
      phoneNumber: "1234567890",
      message: "a".repeat(1001),
    });
    expect(result.success).toBe(false);
  });
});

describe("leaseSchema", () => {
  it("accepts valid lease", () => {
    const result = leaseSchema.safeParse({
      startDate: new Date("2025-01-01"),
      endDate: new Date("2025-12-31"),
      rent: 500,
      deposit: 1000,
      propertyId: 1,
      tenantId: "user-1",
    });
    expect(result.success).toBe(true);
  });

  it("requires end date after start date", () => {
    const result = leaseSchema.safeParse({
      startDate: new Date("2025-12-31"),
      endDate: new Date("2025-01-01"),
      rent: 500,
      deposit: 0,
      propertyId: 1,
      tenantId: "user-1",
    });
    expect(result.success).toBe(false);
  });

  it("requires positive rent", () => {
    const result = leaseSchema.safeParse({
      startDate: new Date("2025-01-01"),
      endDate: new Date("2025-12-31"),
      rent: -100,
      deposit: 0,
      propertyId: 1,
      tenantId: "user-1",
    });
    expect(result.success).toBe(false);
  });
});

describe("paymentSchema", () => {
  it("accepts valid payment", () => {
    const result = paymentSchema.safeParse({
      amountDue: 500,
      amountPaid: 250,
      dueDate: new Date(),
      paymentStatus: "Pending",
      leaseId: 1,
    });
    expect(result.success).toBe(true);
  });

  it("requires positive amount due", () => {
    const result = paymentSchema.safeParse({
      amountDue: 0,
      amountPaid: 0,
      dueDate: new Date(),
      paymentStatus: "Pending",
      leaseId: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative amount paid", () => {
    const result = paymentSchema.safeParse({
      amountDue: 500,
      amountPaid: -10,
      dueDate: new Date(),
      paymentStatus: "Paid",
      leaseId: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("reviewSchema", () => {
  it("accepts valid review", () => {
    const result = reviewSchema.safeParse({
      rating: 5,
      comment: "Great place to stay, loved it!",
      listingId: 1,
    });
    expect(result.success).toBe(true);
  });

  it("enforces rating range 1-5", () => {
    expect(reviewSchema.safeParse({ rating: 0, comment: "a".repeat(10), listingId: 1 }).success).toBe(false);
    expect(reviewSchema.safeParse({ rating: 6, comment: "a".repeat(10), listingId: 1 }).success).toBe(false);
  });

  it("requires comment minimum 10 chars", () => {
    const result = reviewSchema.safeParse({ rating: 5, comment: "short", listingId: 1 });
    expect(result.success).toBe(false);
  });

  it("enforces comment max 2000 chars", () => {
    const result = reviewSchema.safeParse({
      rating: 5,
      comment: "a".repeat(2001),
      listingId: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("hostReplySchema", () => {
  it("accepts valid reply", () => {
    const result = hostReplySchema.safeParse({
      reviewId: "review-1",
      hostReply: "Thank you for your kind review!",
    });
    expect(result.success).toBe(true);
  });

  it("requires minimum 10 char reply", () => {
    const result = hostReplySchema.safeParse({
      reviewId: "review-1",
      hostReply: "Thanks",
    });
    expect(result.success).toBe(false);
  });
});

describe("bookingSchema", () => {
  it("accepts valid booking", () => {
    const result = bookingSchema.safeParse({
      listingId: 1,
      checkIn: new Date("2025-06-01"),
      checkOut: new Date("2025-06-05"),
      guestCount: 2,
      totalPrice: 400,
    });
    expect(result.success).toBe(true);
  });

  it("requires checkout after checkin", () => {
    const result = bookingSchema.safeParse({
      listingId: 1,
      checkIn: new Date("2025-06-05"),
      checkOut: new Date("2025-06-01"),
      guestCount: 2,
      totalPrice: 400,
    });
    expect(result.success).toBe(false);
  });

  it("requires at least 1 guest", () => {
    const result = bookingSchema.safeParse({
      listingId: 1,
      checkIn: new Date("2025-06-01"),
      checkOut: new Date("2025-06-05"),
      guestCount: 0,
      totalPrice: 400,
    });
    expect(result.success).toBe(false);
  });
});

describe("searchFiltersSchema", () => {
  it("accepts empty filters", () => {
    expect(searchFiltersSchema.safeParse({}).success).toBe(true);
  });

  it("requires max price >= min price", () => {
    const result = searchFiltersSchema.safeParse({ priceMin: 500, priceMax: 100 });
    expect(result.success).toBe(false);
  });

  it("requires checkout after checkin", () => {
    const result = searchFiltersSchema.safeParse({
      checkIn: new Date("2025-06-05"),
      checkOut: new Date("2025-06-01"),
    });
    expect(result.success).toBe(false);
  });

  it("allows valid price range", () => {
    const result = searchFiltersSchema.safeParse({ priceMin: 100, priceMax: 500 });
    expect(result.success).toBe(true);
  });
});
