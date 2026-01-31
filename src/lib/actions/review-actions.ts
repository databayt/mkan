"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

// ============================================
// TYPES
// ============================================

export interface CreateReviewData {
  listingId: number;
  rating: number;
  comment: string;
}

export interface HostReplyData {
  reviewId: string;
  hostReply: string;
}

// ============================================
// CREATE REVIEW
// ============================================

export async function createReview(data: CreateReviewData) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to create a review");
  }

  const { listingId, rating, comment } = data;

  // Validate rating
  if (rating < 1 || rating > 5) {
    throw new Error("Rating must be between 1 and 5");
  }

  // Validate comment
  if (!comment || comment.length < 10) {
    throw new Error("Review must be at least 10 characters");
  }

  try {
    // Check if listing exists
    const listing = await db.listing.findUnique({
      where: { id: listingId },
      select: { id: true, hostId: true },
    });

    if (!listing) {
      throw new Error("Listing not found");
    }

    // Prevent host from reviewing their own listing
    if (listing.hostId === session.user.id) {
      throw new Error("You cannot review your own listing");
    }

    // Check if user has already reviewed this listing
    const existingReview = await db.review.findFirst({
      where: {
        listingId,
        userId: session.user.id,
      },
    });

    if (existingReview) {
      throw new Error("You have already reviewed this listing");
    }

    // Create the review
    const review = await db.review.create({
      data: {
        listingId,
        userId: session.user.id,
        rating,
        comment,
      },
    });

    // Update listing's average rating and review count
    await updateListingRating(listingId);

    revalidatePath(`/listing/${listingId}`);

    return { success: true, review };
  } catch (error) {
    console.error("Error creating review:", error);
    throw new Error(
      `Failed to create review: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// GET REVIEWS
// ============================================

export async function getListingReviews(
  listingId: number,
  options?: { page?: number; limit?: number }
) {
  const page = options?.page || 1;
  const limit = options?.limit || 10;

  try {
    const [reviews, total] = await Promise.all([
      db.review.findMany({
        where: { listingId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.review.count({ where: { listingId } }),
    ]);

    // Get user info for reviews (we don't have a direct relation, so fetch separately)
    const userIds = [...new Set(reviews.map((r) => r.userId))];
    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        username: true,
        image: true,
      },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    const reviewsWithUsers = reviews.map((review) => ({
      ...review,
      user: userMap.get(review.userId) || null,
    }));

    return {
      reviews: reviewsWithUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    console.error("Error fetching reviews:", error);
    throw new Error(
      `Failed to fetch reviews: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function getReview(reviewId: string) {
  try {
    const review = await db.review.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      throw new Error("Review not found");
    }

    // Get user info
    const user = await db.user.findUnique({
      where: { id: review.userId },
      select: {
        id: true,
        username: true,
        image: true,
      },
    });

    return { ...review, user };
  } catch (error) {
    console.error("Error fetching review:", error);
    throw new Error(
      `Failed to fetch review: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// UPDATE REVIEW
// ============================================

export async function updateReview(
  reviewId: string,
  data: { rating?: number; comment?: string }
) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to update a review");
  }

  try {
    // Check if review exists and belongs to user
    const existingReview = await db.review.findUnique({
      where: { id: reviewId },
      select: { userId: true, listingId: true },
    });

    if (!existingReview) {
      throw new Error("Review not found");
    }

    if (existingReview.userId !== session.user.id) {
      throw new Error("You can only update your own reviews");
    }

    // Validate rating if provided
    if (data.rating !== undefined && (data.rating < 1 || data.rating > 5)) {
      throw new Error("Rating must be between 1 and 5");
    }

    // Validate comment if provided
    if (data.comment !== undefined && data.comment.length < 10) {
      throw new Error("Review must be at least 10 characters");
    }

    const review = await db.review.update({
      where: { id: reviewId },
      data: {
        ...(data.rating !== undefined && { rating: data.rating }),
        ...(data.comment !== undefined && { comment: data.comment }),
      },
    });

    // Update listing's average rating
    await updateListingRating(existingReview.listingId);

    revalidatePath(`/listing/${existingReview.listingId}`);

    return { success: true, review };
  } catch (error) {
    console.error("Error updating review:", error);
    throw new Error(
      `Failed to update review: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// DELETE REVIEW
// ============================================

export async function deleteReview(reviewId: string) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to delete a review");
  }

  try {
    // Check if review exists and belongs to user
    const existingReview = await db.review.findUnique({
      where: { id: reviewId },
      select: { userId: true, listingId: true },
    });

    if (!existingReview) {
      throw new Error("Review not found");
    }

    // Allow deletion by review author or admin
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (existingReview.userId !== session.user.id && user?.role !== "ADMIN") {
      throw new Error("You can only delete your own reviews");
    }

    await db.review.delete({
      where: { id: reviewId },
    });

    // Update listing's average rating
    await updateListingRating(existingReview.listingId);

    revalidatePath(`/listing/${existingReview.listingId}`);

    return { success: true };
  } catch (error) {
    console.error("Error deleting review:", error);
    throw new Error(
      `Failed to delete review: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// HOST REPLY
// ============================================

export async function addHostReply(data: HostReplyData) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to reply to a review");
  }

  const { reviewId, hostReply } = data;

  if (!hostReply || hostReply.length < 10) {
    throw new Error("Reply must be at least 10 characters");
  }

  try {
    // Get the review and check if user is the host
    const review = await db.review.findUnique({
      where: { id: reviewId },
      include: {
        listing: {
          select: { hostId: true, id: true },
        },
      },
    });

    if (!review) {
      throw new Error("Review not found");
    }

    if (review.listing.hostId !== session.user.id) {
      throw new Error("Only the host can reply to reviews");
    }

    if (review.hostReply) {
      throw new Error("You have already replied to this review");
    }

    const updatedReview = await db.review.update({
      where: { id: reviewId },
      data: {
        hostReply,
        hostReplyAt: new Date(),
      },
    });

    revalidatePath(`/listing/${review.listing.id}`);

    return { success: true, review: updatedReview };
  } catch (error) {
    console.error("Error adding host reply:", error);
    throw new Error(
      `Failed to add reply: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function updateHostReply(reviewId: string, hostReply: string) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to update a reply");
  }

  if (!hostReply || hostReply.length < 10) {
    throw new Error("Reply must be at least 10 characters");
  }

  try {
    // Get the review and check if user is the host
    const review = await db.review.findUnique({
      where: { id: reviewId },
      include: {
        listing: {
          select: { hostId: true, id: true },
        },
      },
    });

    if (!review) {
      throw new Error("Review not found");
    }

    if (review.listing.hostId !== session.user.id) {
      throw new Error("Only the host can update replies");
    }

    const updatedReview = await db.review.update({
      where: { id: reviewId },
      data: {
        hostReply,
        hostReplyAt: new Date(),
      },
    });

    revalidatePath(`/listing/${review.listing.id}`);

    return { success: true, review: updatedReview };
  } catch (error) {
    console.error("Error updating host reply:", error);
    throw new Error(
      `Failed to update reply: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// RATING AGGREGATION
// ============================================

async function updateListingRating(listingId: number) {
  try {
    const aggregation = await db.review.aggregate({
      where: { listingId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await db.listing.update({
      where: { id: listingId },
      data: {
        averageRating: aggregation._avg.rating || 0,
        numberOfReviews: aggregation._count.rating,
      },
    });
  } catch (error) {
    console.error("Error updating listing rating:", error);
    // Don't throw - this is a side effect
  }
}

// ============================================
// GET USER REVIEWS
// ============================================

export async function getUserReviews(userId?: string) {
  const session = await auth();
  const targetUserId = userId || session?.user?.id;

  if (!targetUserId) {
    throw new Error("User ID is required");
  }

  try {
    const reviews = await db.review.findMany({
      where: { userId: targetUserId },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            photoUrls: true,
            location: {
              select: {
                city: true,
                state: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return reviews;
  } catch (error) {
    console.error("Error fetching user reviews:", error);
    throw new Error(
      `Failed to fetch user reviews: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// GET REVIEW STATS
// ============================================

export async function getListingReviewStats(listingId: number) {
  try {
    const [aggregation, distribution] = await Promise.all([
      db.review.aggregate({
        where: { listingId },
        _avg: { rating: true },
        _count: { rating: true },
      }),
      db.review.groupBy({
        by: ["rating"],
        where: { listingId },
        _count: { rating: true },
      }),
    ]);

    // Create distribution map
    const ratingDistribution: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    distribution.forEach((item) => {
      ratingDistribution[item.rating] = item._count.rating;
    });

    return {
      averageRating: aggregation._avg.rating || 0,
      totalReviews: aggregation._count.rating,
      distribution: ratingDistribution,
    };
  } catch (error) {
    console.error("Error fetching review stats:", error);
    throw new Error(
      `Failed to fetch review stats: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
