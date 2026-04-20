import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    review: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    listing: {
      update: vi.fn(),
    },
    booking: {
      findUnique: vi.fn(),
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
  createReview,
  getListingReviews,
  addHostReply,
  deleteReview,
  getReviewSummary,
} from "@/lib/actions/review-actions";

const mockAuth = vi.mocked(auth);
const mockDb = vi.mocked(db);

const authenticatedSession = {
  user: { id: "user-1", name: "Test", email: "test@test.com", role: "USER" },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const hostSession = {
  user: { id: "host-1", name: "Host", email: "host@test.com", role: "USER" },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================
// createReview
// ============================================

describe("createReview", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(createReview({ listingId: 1, bookingId: 1, rating: 5 })).rejects.toThrow(
      "logged in"
    );
  });

  it("throws for invalid data", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);

    await expect(createReview({ rating: "abc" })).rejects.toThrow("Invalid review data");
  });

  it("throws for rating out of range", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);

    await expect(
      createReview({ listingId: 1, bookingId: 1, rating: 6 })
    ).rejects.toThrow("Invalid review data");

    await expect(
      createReview({ listingId: 1, bookingId: 1, rating: 0 })
    ).rejects.toThrow("Invalid review data");
  });

  it("throws when booking not found", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    mockDb.booking.findUnique.mockResolvedValue(null as never);

    await expect(
      createReview({ listingId: 1, bookingId: 999, rating: 4 })
    ).rejects.toThrow("Booking not found");
  });

  it("throws when booking belongs to another user", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    mockDb.booking.findUnique.mockResolvedValue({
      id: 1,
      listingId: 1,
      guestId: "other-user",
      status: "Completed",
    } as never);

    await expect(
      createReview({ listingId: 1, bookingId: 1, rating: 4 })
    ).rejects.toThrow("your own bookings");
  });

  it("throws when booking is not completed", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    mockDb.booking.findUnique.mockResolvedValue({
      id: 1,
      listingId: 1,
      guestId: "user-1",
      status: "Pending",
    } as never);

    await expect(
      createReview({ listingId: 1, bookingId: 1, rating: 4 })
    ).rejects.toThrow("completed bookings");
  });

  it("throws when booking does not belong to listing", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    mockDb.booking.findUnique.mockResolvedValue({
      id: 1,
      listingId: 99,
      guestId: "user-1",
      status: "Completed",
    } as never);

    await expect(
      createReview({ listingId: 1, bookingId: 1, rating: 4 })
    ).rejects.toThrow("does not belong to this listing");
  });

  it("throws when review already exists for booking", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    mockDb.booking.findUnique.mockResolvedValue({
      id: 1,
      listingId: 1,
      guestId: "user-1",
      status: "Completed",
    } as never);
    mockDb.review.findUnique.mockResolvedValue({ id: 10 } as never);

    await expect(
      createReview({ listingId: 1, bookingId: 1, rating: 4 })
    ).rejects.toThrow("already reviewed");
  });

  it("creates review and updates listing averageRating in transaction", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    mockDb.booking.findUnique.mockResolvedValue({
      id: 1,
      listingId: 1,
      guestId: "user-1",
      status: "Completed",
    } as never);
    mockDb.review.findUnique.mockResolvedValue(null as never);

    const createdReview = {
      id: 1,
      listingId: 1,
      bookingId: 1,
      reviewerId: "user-1",
      rating: 5,
      comment: "Great place!",
    };

    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => {
      const tx = {
        review: {
          create: vi.fn().mockResolvedValue(createdReview),
          aggregate: vi.fn().mockResolvedValue({
            _avg: { rating: 4.5 },
            _count: { rating: 2 },
          }),
        },
        listing: {
          update: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(tx as unknown as typeof db);
    });

    const result = await createReview({
      listingId: 1,
      bookingId: 1,
      rating: 5,
      comment: "Great place!",
    });

    expect(result.success).toBe(true);
    expect(result.review).toEqual(createdReview);
    expect(mockDb.$transaction).toHaveBeenCalledOnce();
  });
});

// ============================================
// getListingReviews
// ============================================

describe("getListingReviews", () => {
  it("throws for invalid listing ID", async () => {
    await expect(getListingReviews(-1)).rejects.toThrow("Invalid listing ID");
    await expect(getListingReviews("abc")).rejects.toThrow("Invalid listing ID");
  });

  it("returns paginated reviews with defaults", async () => {
    const mockReviews = [
      { id: 1, rating: 5, comment: "Excellent" },
      { id: 2, rating: 4, comment: "Good" },
    ];
    mockDb.review.findMany.mockResolvedValue(mockReviews as never);
    mockDb.review.count.mockResolvedValue(2 as never);

    const result = await getListingReviews(1);

    expect(result.reviews).toEqual(mockReviews);
    expect(result.total).toBe(2);
    expect(result.take).toBe(20);
    expect(result.skip).toBe(0);
    expect(mockDb.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { listingId: 1 },
        orderBy: { createdAt: "desc" },
        take: 20,
        skip: 0,
      })
    );
  });

  it("respects custom take and skip filters", async () => {
    mockDb.review.findMany.mockResolvedValue([] as never);
    mockDb.review.count.mockResolvedValue(0 as never);

    const result = await getListingReviews(1, { take: 5, skip: 10 });

    expect(result.take).toBe(5);
    expect(result.skip).toBe(10);
    expect(mockDb.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5, skip: 10 })
    );
  });

  it("does not require authentication (public endpoint)", async () => {
    mockDb.review.findMany.mockResolvedValue([] as never);
    mockDb.review.count.mockResolvedValue(0 as never);

    // No auth mock setup — should still work
    const result = await getListingReviews(1);
    expect(result.reviews).toEqual([]);
  });
});

// ============================================
// addHostReply
// ============================================

describe("addHostReply", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(addHostReply({ reviewId: 1, reply: "Thanks!" })).rejects.toThrow("logged in");
  });

  it("throws for invalid reply data", async () => {
    mockAuth.mockResolvedValue(hostSession as never);

    await expect(addHostReply({ reviewId: 1, reply: "" })).rejects.toThrow("Invalid reply data");
    await expect(addHostReply({ reviewId: "abc" })).rejects.toThrow("Invalid reply data");
  });

  it("throws when review not found", async () => {
    mockAuth.mockResolvedValue(hostSession as never);
    mockDb.review.findUnique.mockResolvedValue(null as never);

    await expect(addHostReply({ reviewId: 999, reply: "Thanks!" })).rejects.toThrow(
      "Review not found"
    );
  });

  it("throws when user is not the listing host", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    mockDb.review.findUnique.mockResolvedValue({
      id: 1,
      listingId: 1,
      listing: { hostId: "host-1" },
    } as never);

    await expect(addHostReply({ reviewId: 1, reply: "Thanks!" })).rejects.toThrow(
      "Only the host"
    );
  });

  it("adds host reply successfully", async () => {
    mockAuth.mockResolvedValue(hostSession as never);
    mockDb.review.findUnique.mockResolvedValue({
      id: 1,
      listingId: 1,
      listing: { hostId: "host-1" },
    } as never);

    const updatedReview = {
      id: 1,
      hostReply: "Thanks for staying!",
      hostRepliedAt: new Date(),
    };
    mockDb.review.update.mockResolvedValue(updatedReview as never);

    const result = await addHostReply({ reviewId: 1, reply: "Thanks for staying!" });

    expect(result.success).toBe(true);
    expect(result.review).toEqual(updatedReview);
    expect(mockDb.review.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          hostReply: "Thanks for staying!",
        }),
      })
    );
  });
});

// ============================================
// deleteReview
// ============================================

describe("deleteReview", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(deleteReview(1)).rejects.toThrow("logged in");
  });

  it("throws for invalid review ID", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);

    await expect(deleteReview(-1)).rejects.toThrow("Invalid review ID");
    await expect(deleteReview("abc")).rejects.toThrow("Invalid review ID");
  });

  it("throws when review not found", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    mockDb.review.findUnique.mockResolvedValue(null as never);

    await expect(deleteReview(999)).rejects.toThrow("Review not found");
  });

  it("throws when user is not the review author", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    mockDb.review.findUnique.mockResolvedValue({
      id: 1,
      listingId: 1,
      reviewerId: "other-user",
    } as never);

    await expect(deleteReview(1)).rejects.toThrow("your own reviews");
  });

  it("deletes review and recalculates listing averageRating in transaction", async () => {
    mockAuth.mockResolvedValue(authenticatedSession as never);
    mockDb.review.findUnique.mockResolvedValue({
      id: 1,
      listingId: 1,
      reviewerId: "user-1",
    } as never);

    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) => {
      const tx = {
        review: {
          delete: vi.fn().mockResolvedValue({}),
          aggregate: vi.fn().mockResolvedValue({
            _avg: { rating: 3.5 },
            _count: { rating: 4 },
          }),
        },
        listing: {
          update: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(tx as unknown as typeof db);
    });

    const result = await deleteReview(1);

    expect(result.success).toBe(true);
    expect(mockDb.$transaction).toHaveBeenCalledOnce();
  });
});

// ============================================
// getReviewSummary
// ============================================

describe("getReviewSummary", () => {
  it("throws for invalid listing ID", async () => {
    await expect(getReviewSummary(-1)).rejects.toThrow("Invalid listing ID");
    await expect(getReviewSummary("abc")).rejects.toThrow("Invalid listing ID");
  });

  it("returns summary with rating distribution", async () => {
    mockDb.review.aggregate.mockResolvedValue({
      _avg: { rating: 4.2 },
      _count: { rating: 5 },
    } as never);
    mockDb.review.findMany.mockResolvedValue([
      { rating: 5 },
      { rating: 5 },
      { rating: 4 },
      { rating: 3 },
      { rating: 4 },
    ] as never);

    const result = await getReviewSummary(1);

    expect(result.averageRating).toBe(4.2);
    expect(result.totalReviews).toBe(5);
    expect(result.ratingDistribution).toEqual({
      1: 0,
      2: 0,
      3: 1,
      4: 2,
      5: 2,
    });
  });

  it("returns zeroes for listing with no reviews", async () => {
    mockDb.review.aggregate.mockResolvedValue({
      _avg: { rating: null },
      _count: { rating: 0 },
    } as never);
    mockDb.review.findMany.mockResolvedValue([] as never);

    const result = await getReviewSummary(1);

    expect(result.averageRating).toBe(0);
    expect(result.totalReviews).toBe(0);
    expect(result.ratingDistribution).toEqual({
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    });
  });

  it("does not require authentication (public endpoint)", async () => {
    mockDb.review.aggregate.mockResolvedValue({
      _avg: { rating: 4.0 },
      _count: { rating: 3 },
    } as never);
    mockDb.review.findMany.mockResolvedValue([
      { rating: 4 },
      { rating: 4 },
      { rating: 4 },
    ] as never);

    const result = await getReviewSummary(1);
    expect(result.totalReviews).toBe(3);
  });
});
