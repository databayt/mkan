"use server";

import { z } from "zod";
import { auth, canOverride } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { sanitizeInput, sanitizeHtml } from "@/lib/sanitization";
import { logger } from "@/lib/logger";
import { assertRateLimit } from "@/lib/rate-limit";
import { localize } from "@/components/translation/localize";
import { getDisplayLang } from "@/components/translation/locale";
import type { Lang } from "@/components/translation/types";

// ============================================
// SCHEMAS
// ============================================

const createReviewSchema = z.object({
  listingId: z.number().int().positive(),
  bookingId: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(5000).optional(),
  cleanliness: z.number().min(1).max(5).optional(),
  accuracy: z.number().min(1).max(5).optional(),
  checkIn: z.number().min(1).max(5).optional(),
  communication: z.number().min(1).max(5).optional(),
  location: z.number().min(1).max(5).optional(),
  value: z.number().min(1).max(5).optional(),
});

const reviewIdSchema = z.number().int().positive();
const listingIdSchema = z.number().int().positive();

const hostReplySchema = z.object({
  reviewId: z.number().int().positive(),
  reply: z.string().min(1).max(2000),
});

const listingReviewsFilterSchema = z.object({
  listingId: z.number().int().positive(),
  take: z.number().int().min(1).max(100).optional().default(20),
  skip: z.number().int().min(0).optional().default(0),
});

const langSchema = z.enum(["en", "ar"]);

// ============================================
// TYPES
// ============================================

export interface CreateReviewData {
  listingId: number;
  bookingId: number;
  rating: number;
  comment?: string;
  cleanliness?: number;
  accuracy?: number;
  checkIn?: number;
  communication?: number;
  location?: number;
  value?: number;
}

export interface ReviewFilters {
  take?: number;
  skip?: number;
}

export interface RatingDistribution {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
}

export interface ReviewSummary {
  averageRating: number;
  totalReviews: number;
  ratingDistribution: RatingDistribution;
}

// ============================================
// CREATE REVIEW
// ============================================

export async function createReview(data: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to create a review");
  }

  await assertRateLimit("mutation", `review:${session.user.id}`);

  const parsed = createReviewSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Invalid review data");
  }

  const { listingId, bookingId, rating, comment, ...subRatings } = parsed.data;

  // Sanitize comment if provided
  const sanitizedComment = comment ? sanitizeHtml(comment) : undefined;

  try {
    // Verify booking exists, belongs to user, and is completed
    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        listingId: true,
        guestId: true,
        status: true,
      },
    });

    if (!booking) {
      throw new Error("Booking not found");
    }

    if (booking.guestId !== session.user.id) {
      throw new Error("You can only review your own bookings");
    }

    if (booking.status !== "Completed") {
      throw new Error("You can only review completed bookings");
    }

    if (booking.listingId !== listingId) {
      throw new Error("Booking does not belong to this listing");
    }

    // Check for existing review on this booking
    const existingReview = await db.review.findUnique({
      where: { bookingId },
    });

    if (existingReview) {
      throw new Error("You have already reviewed this booking");
    }

    // Create review and update listing averageRating in a transaction
    const result = await db.$transaction(async (tx) => {
      const review = await tx.review.create({
        data: {
          listingId,
          bookingId,
          reviewerId: session.user!.id,
          rating,
          comment: sanitizedComment,
          cleanliness: subRatings.cleanliness,
          accuracy: subRatings.accuracy,
          checkIn: subRatings.checkIn,
          communication: subRatings.communication,
          location: subRatings.location,
          value: subRatings.value,
        },
      });

      // Recalculate listing average rating
      const aggregate = await tx.review.aggregate({
        where: { listingId },
        _avg: { rating: true },
        _count: { rating: true },
      });

      await tx.listing.update({
        where: { id: listingId },
        data: {
          averageRating: aggregate._avg.rating ?? 0,
          numberOfReviews: aggregate._count.rating,
        },
      });

      return review;
    });

    revalidatePath(`/listings/${listingId}`);

    return { success: true, review: result };
  } catch (error) {
    logger.error("Error creating review:", error);
    throw new Error(
      `Failed to create review: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// GET LISTING REVIEWS
// ============================================

export async function getListingReviews(listingId: unknown, filters?: unknown, lang?: unknown) {
  const parsedId = listingIdSchema.safeParse(listingId);
  if (!parsedId.success) {
    throw new Error("Invalid listing ID");
  }

  const parsedFilters = listingReviewsFilterSchema.safeParse({
    listingId: parsedId.data,
    ...(typeof filters === "object" && filters !== null ? filters : {}),
  });

  if (!parsedFilters.success) {
    throw new Error("Invalid filter parameters");
  }

  const { take, skip } = parsedFilters.data;

  // Viewer display language: explicit `lang` from route-aware callers, else the
  // NEXT_LOCALE cookie (client-triggered re-queries without a route param).
  const parsedLang = langSchema.safeParse(lang);
  const displayLang: Lang = parsedLang.success ? parsedLang.data : await getDisplayLang();

  try {
    const [reviews, total] = await Promise.all([
      db.review.findMany({
        where: { listingId: parsedId.data },
        include: {
          reviewer: {
            select: {
              id: true,
              username: true,
              image: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      db.review.count({
        where: { listingId: parsedId.data },
      }),
    ]);

    // Guest comments / host replies are stored in whichever language they were
    // written — localize for the viewer (cache-first; falls back to source).
    // Reviewer names are intentionally NOT translated.
    const localizedReviews = await localize(reviews, ["comment", "hostReply"], displayLang);

    return { reviews: localizedReviews, total, take, skip };
  } catch (error) {
    logger.error("Error fetching listing reviews:", error);
    throw new Error(
      `Failed to fetch reviews: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// HOST REVIEWS ELSEWHERE (empty-state helper)
// ============================================

/**
 * Count reviews the listing's host has earned on their *other* places, and
 * return their id + display name. Powers the "No reviews (yet)" empty state,
 * which links guests to the rest of the host's reviewed listings — mirroring
 * Airbnb's REVIEWS_EMPTY_DEFAULT block. Returns a zeroed shape on any error.
 */
export async function getHostOtherReviewCount(
  listingId: unknown
): Promise<{ count: number; hostId: string | null; hostName: string | null }> {
  const parsedId = listingIdSchema.safeParse(listingId);
  if (!parsedId.success) {
    return { count: 0, hostId: null, hostName: null };
  }

  try {
    const listing = await db.listing.findUnique({
      where: { id: parsedId.data },
      select: { hostId: true, host: { select: { username: true } } },
    });
    if (!listing?.hostId) {
      return { count: 0, hostId: null, hostName: null };
    }

    const count = await db.review.count({
      where: {
        listingId: { not: parsedId.data },
        listing: { hostId: listing.hostId },
      },
    });

    return { count, hostId: listing.hostId, hostName: listing.host?.username ?? null };
  } catch (error) {
    logger.error("Error counting host reviews:", error);
    return { count: 0, hostId: null, hostName: null };
  }
}

// ============================================
// ADD HOST REPLY
// ============================================

export async function addHostReply(data: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to reply to a review");
  }

  const parsed = hostReplySchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Invalid reply data");
  }

  const { reviewId, reply } = parsed.data;
  const sanitizedReply = sanitizeInput(reply);

  try {
    // Find the review and verify host ownership
    const review = await db.review.findUnique({
      where: { id: reviewId },
      include: {
        listing: {
          select: { hostId: true },
        },
      },
    });

    if (!review) {
      throw new Error("Review not found");
    }

    if (!canOverride(session, review.listing.hostId)) {
      throw new Error("Only the host can reply to reviews on their listing");
    }

    const updated = await db.review.update({
      where: { id: reviewId },
      data: {
        hostReply: sanitizedReply,
        hostRepliedAt: new Date(),
      },
    });

    revalidatePath(`/listings/${review.listingId}`);

    return { success: true, review: updated };
  } catch (error) {
    logger.error("Error adding host reply:", error);
    throw new Error(
      `Failed to add host reply: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// DELETE REVIEW
// ============================================

export async function deleteReview(reviewId: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to delete a review");
  }

  const parsedId = reviewIdSchema.safeParse(reviewId);
  if (!parsedId.success) {
    throw new Error("Invalid review ID");
  }

  try {
    // Find the review and verify authorship
    const review = await db.review.findUnique({
      where: { id: parsedId.data },
      select: {
        id: true,
        listingId: true,
        reviewerId: true,
      },
    });

    if (!review) {
      throw new Error("Review not found");
    }

    if (review.reviewerId !== session.user.id) {
      throw new Error("You can only delete your own reviews");
    }

    const listingId = review.listingId;

    // Delete review and recalculate listing averageRating in a transaction
    await db.$transaction(async (tx) => {
      await tx.review.delete({
        where: { id: parsedId.data },
      });

      // Recalculate listing average rating
      const aggregate = await tx.review.aggregate({
        where: { listingId },
        _avg: { rating: true },
        _count: { rating: true },
      });

      await tx.listing.update({
        where: { id: listingId },
        data: {
          averageRating: aggregate._avg.rating ?? 0,
          numberOfReviews: aggregate._count.rating,
        },
      });
    });

    revalidatePath(`/listings/${listingId}`);

    return { success: true };
  } catch (error) {
    logger.error("Error deleting review:", error);
    throw new Error(
      `Failed to delete review: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// GET REVIEW SUMMARY
// ============================================

export async function getReviewSummary(listingId: unknown) {
  const parsedId = listingIdSchema.safeParse(listingId);
  if (!parsedId.success) {
    throw new Error("Invalid listing ID");
  }

  try {
    // One indexed aggregate instead of hauling every review row over the
    // wire just to bucket-count it — average derives from the same groups.
    const grouped = await db.review.groupBy({
      by: ["rating"],
      where: { listingId: parsedId.data },
      _count: { rating: true },
    });

    const ratingDistribution: RatingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalReviews = 0;
    let ratingSum = 0;
    for (const group of grouped) {
      const r = group.rating as 1 | 2 | 3 | 4 | 5;
      ratingDistribution[r] = group._count.rating;
      totalReviews += group._count.rating;
      ratingSum += group.rating * group._count.rating;
    }

    return {
      averageRating: totalReviews > 0 ? ratingSum / totalReviews : 0,
      totalReviews,
      ratingDistribution,
    } satisfies ReviewSummary;
  } catch (error) {
    logger.error("Error fetching review summary:", error);
    throw new Error(
      `Failed to fetch review summary: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
