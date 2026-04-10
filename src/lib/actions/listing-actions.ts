"use server";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { Amenity, Highlight, PropertyType, Prisma } from "@prisma/client";
import { sanitizeInput, sanitizeHtml } from "@/lib/sanitization";
import { logger } from "@/lib/logger";

const listingIdSchema = z.number().int().positive();

const listingFormDataSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(10000).optional(),
  pricePerNight: z.number().min(0).optional(),
  securityDeposit: z.number().min(0).optional(),
  applicationFee: z.number().min(0).optional(),
  bedrooms: z.number().int().min(0).optional(),
  bathrooms: z.number().min(0).optional(),
  squareFeet: z.number().int().min(0).optional(),
  guestCount: z.number().int().min(1).optional(),
  propertyType: z.nativeEnum(PropertyType).optional(),
  isPetsAllowed: z.boolean().optional(),
  isParkingIncluded: z.boolean().optional(),
  instantBook: z.boolean().optional(),
  amenities: z.array(z.nativeEnum(Amenity)).optional(),
  highlights: z.array(z.nativeEnum(Highlight)).optional(),
  photoUrls: z.array(z.string().url()).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(200).optional(),
  state: z.string().max(200).optional(),
  country: z.string().max(200).optional(),
  postalCode: z.string().max(20).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  draft: z.boolean().optional(),
  isPublished: z.boolean().optional(),
}).partial();

// ============================================
// TYPES
// ============================================

export type ListingFormData = {
  title?: string;
  description?: string;
  pricePerNight?: number;
  securityDeposit?: number;
  applicationFee?: number;
  bedrooms?: number;
  bathrooms?: number;
  squareFeet?: number;
  guestCount?: number;
  propertyType?: PropertyType;
  isPetsAllowed?: boolean;
  isParkingIncluded?: boolean;
  instantBook?: boolean;
  amenities?: Amenity[];
  highlights?: Highlight[];
  photoUrls?: string[];
  // Location data
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  // Draft/publish flags
  draft?: boolean;
  isPublished?: boolean;
};

export interface ListingFilters {
  location?: string;
  priceMin?: number;
  priceMax?: number;
  bedrooms?: number;
  bathrooms?: number;
  guestCount?: number;
  propertyType?: PropertyType;
  squareFeetMin?: number;
  squareFeetMax?: number;
  amenities?: Amenity[];
  instantBook?: boolean;
  coordinates?: [number, number]; // [longitude, latitude]
  favoriteIds?: number[];
  publishedOnly?: boolean;
  hostId?: string;
}

// ============================================
// CREATE
// ============================================

export async function createListing(data: unknown = {}) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to create a listing");
  }

  const parsed = listingFormDataSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Invalid listing data");
  }

  const validData = { ...parsed.data };

  // Sanitize string inputs
  if (validData.title) validData.title = sanitizeInput(validData.title);
  if (validData.description) validData.description = sanitizeHtml(validData.description);
  if (validData.address) validData.address = sanitizeInput(validData.address);
  if (validData.city) validData.city = sanitizeInput(validData.city);
  if (validData.state) validData.state = sanitizeInput(validData.state);
  if (validData.country) validData.country = sanitizeInput(validData.country);
  if (validData.postalCode) validData.postalCode = sanitizeInput(validData.postalCode);

  try {
    // Create location if provided
    let locationId = null;
    if (validData.address && validData.city && validData.state && validData.country) {
      const location = await db.location.create({
        data: {
          address: validData.address,
          city: validData.city,
          state: validData.state,
          country: validData.country,
          postalCode: validData.postalCode || "",
          latitude: validData.latitude || 0,
          longitude: validData.longitude || 0,
        },
      });
      locationId = location.id;
    }

    // Create listing
    const listingData: Prisma.ListingCreateInput = {
      title: validData.title,
      description: validData.description,
      pricePerNight: validData.pricePerNight,
      securityDeposit: validData.securityDeposit,
      applicationFee: validData.applicationFee,
      bedrooms: validData.bedrooms,
      bathrooms: validData.bathrooms,
      squareFeet: validData.squareFeet,
      guestCount: validData.guestCount || 2,
      propertyType: validData.propertyType,
      isPetsAllowed: validData.isPetsAllowed || false,
      isParkingIncluded: validData.isParkingIncluded || false,
      instantBook: validData.instantBook || false,
      amenities: validData.amenities || [],
      highlights: validData.highlights || [],
      photoUrls: validData.photoUrls || [],
      draft: validData.draft ?? true,
      isPublished: validData.isPublished ?? false,
      host: { connect: { id: session.user.id } },
      ...(locationId && { location: { connect: { id: locationId } } }),
    };

    const listing = await db.listing.create({
      data: listingData,
      include: {
        location: true,
        host: {
          select: {
            id: true,
            email: true,
            username: true,
            image: true,
          },
        },
      },
    });

    revalidatePath("/hosting/listings");
    revalidatePath("/search");

    return { success: true, listing };
  } catch (error) {
    logger.error("Error creating listing:", error);
    throw new Error(
      `Failed to create listing: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// READ
// ============================================

export async function getListing(id: unknown) {
  const parsedId = listingIdSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error("Invalid listing ID");
  }

  try {
    const listing = await db.listing.findUnique({
      where: { id: parsedId.data },
      include: {
        location: true,
        host: {
          select: {
            id: true,
            email: true,
            username: true,
            image: true,
          },
        },
      },
    });

    if (!listing) {
      throw new Error("Listing not found");
    }

    return listing;
  } catch (error) {
    logger.error("Error fetching listing:", error);
    throw new Error(
      `Failed to fetch listing: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function getListings(filters?: ListingFilters) {
  try {
    const where: Prisma.ListingWhereInput = {};

    if (filters) {
      // Published filter
      if (filters.publishedOnly) {
        where.isPublished = true;
        where.draft = false;
      }

      // Host filter
      if (filters.hostId) {
        where.hostId = filters.hostId;
      }

      // Location filtering
      if (filters.location) {
        where.location = {
          is: {
            OR: [
              { city: { contains: filters.location, mode: "insensitive" } },
              { state: { contains: filters.location, mode: "insensitive" } },
              { country: { contains: filters.location, mode: "insensitive" } },
              { address: { contains: filters.location, mode: "insensitive" } },
            ],
          },
        };
      }

      // Price range
      if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
        where.pricePerNight = {
          ...(filters.priceMin !== undefined && { gte: filters.priceMin }),
          ...(filters.priceMax !== undefined && { lte: filters.priceMax }),
        };
      }

      // Bedrooms, bathrooms, guest count
      if (filters.bedrooms) where.bedrooms = { gte: filters.bedrooms };
      if (filters.bathrooms) where.bathrooms = { gte: filters.bathrooms };
      if (filters.guestCount) where.guestCount = { gte: filters.guestCount };

      // Property type
      if (filters.propertyType) where.propertyType = filters.propertyType;

      // Square feet
      if (filters.squareFeetMin !== undefined || filters.squareFeetMax !== undefined) {
        where.squareFeet = {
          ...(filters.squareFeetMin !== undefined && { gte: filters.squareFeetMin }),
          ...(filters.squareFeetMax !== undefined && { lte: filters.squareFeetMax }),
        };
      }

      // Amenities
      if (filters.amenities && filters.amenities.length > 0) {
        where.amenities = {
          hasEvery: filters.amenities,
        };
      }

      // Instant book
      if (filters.instantBook !== undefined) {
        where.instantBook = filters.instantBook;
      }

      // Coordinate-based filtering (within radius)
      if (filters.coordinates) {
        const [longitude, latitude] = filters.coordinates;
        const radius = 0.1; // ~11km radius
        where.location = {
          latitude: {
            gte: latitude - radius,
            lte: latitude + radius,
          },
          longitude: {
            gte: longitude - radius,
            lte: longitude + radius,
          },
        };
      }

      // Filter by favorites
      if (filters.favoriteIds && filters.favoriteIds.length > 0) {
        where.id = { in: filters.favoriteIds };
      }
    }

    const listings = await db.listing.findMany({
      where,
      include: {
        location: true,
        host: {
          select: {
            id: true,
            email: true,
            username: true,
            image: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return listings;
  } catch (error) {
    logger.error("Error fetching listings:", error);
    throw new Error(
      `Failed to fetch listings: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function getHostListings(hostId?: string) {
  const session = await auth();

  const userId = hostId || session?.user?.id;

  if (!userId) {
    throw new Error("User ID is required");
  }

  try {
    const listings = await db.listing.findMany({
      where: {
        hostId: userId,
      },
      include: {
        location: true,
        host: {
          select: {
            id: true,
            email: true,
            username: true,
            image: true,
          },
        },
        _count: {
          select: {
            applications: true,
            leases: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return listings;
  } catch (error) {
    logger.error("Error fetching host listings:", error);
    throw new Error(
      `Failed to fetch host listings: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// UPDATE
// ============================================

export async function updateListing(id: unknown, data: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to update a listing");
  }

  const parsedId = listingIdSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error("Invalid listing ID");
  }

  const parsed = listingFormDataSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Invalid listing data");
  }

  try {
    // Check if the listing belongs to the authenticated user
    const existingListing = await db.listing.findUnique({
      where: { id: parsedId.data },
      select: { hostId: true, locationId: true },
    });

    if (!existingListing) {
      throw new Error("Listing not found");
    }

    if (existingListing.hostId !== session.user.id) {
      throw new Error("You can only update your own listings");
    }

    const d = parsed.data;

    // Sanitize string inputs
    if (d.title) d.title = sanitizeInput(d.title);
    if (d.description) d.description = sanitizeHtml(d.description);
    if (d.address) d.address = sanitizeInput(d.address);
    if (d.city) d.city = sanitizeInput(d.city);
    if (d.state) d.state = sanitizeInput(d.state);
    if (d.country) d.country = sanitizeInput(d.country);
    if (d.postalCode) d.postalCode = sanitizeInput(d.postalCode);

    // Handle location update if provided
    let locationUpdate = {};
    if (d.address || d.city || d.state || d.country) {
      if (existingListing.locationId) {
        // Update existing location
        await db.location.update({
          where: { id: existingListing.locationId },
          data: {
            ...(d.address && { address: d.address }),
            ...(d.city && { city: d.city }),
            ...(d.state && { state: d.state }),
            ...(d.country && { country: d.country }),
            ...(d.postalCode && { postalCode: d.postalCode }),
            ...(d.latitude !== undefined && { latitude: d.latitude }),
            ...(d.longitude !== undefined && { longitude: d.longitude }),
          },
        });
      } else if (d.address && d.city && d.state && d.country) {
        // Create new location
        const location = await db.location.create({
          data: {
            address: d.address,
            city: d.city,
            state: d.state,
            country: d.country,
            postalCode: d.postalCode || "",
            latitude: d.latitude || 0,
            longitude: d.longitude || 0,
          },
        });
        locationUpdate = { location: { connect: { id: location.id } } };
      }
    }

    // Prepare listing update data
    const updateData: Prisma.ListingUpdateInput = {
      ...(d.title !== undefined && { title: d.title }),
      ...(d.description !== undefined && { description: d.description }),
      ...(d.pricePerNight !== undefined && { pricePerNight: d.pricePerNight }),
      ...(d.securityDeposit !== undefined && { securityDeposit: d.securityDeposit }),
      ...(d.applicationFee !== undefined && { applicationFee: d.applicationFee }),
      ...(d.bedrooms !== undefined && { bedrooms: d.bedrooms }),
      ...(d.bathrooms !== undefined && { bathrooms: d.bathrooms }),
      ...(d.squareFeet !== undefined && { squareFeet: d.squareFeet }),
      ...(d.guestCount !== undefined && { guestCount: d.guestCount }),
      ...(d.propertyType !== undefined && { propertyType: d.propertyType }),
      ...(d.isPetsAllowed !== undefined && { isPetsAllowed: d.isPetsAllowed }),
      ...(d.isParkingIncluded !== undefined && { isParkingIncluded: d.isParkingIncluded }),
      ...(d.instantBook !== undefined && { instantBook: d.instantBook }),
      ...(d.amenities !== undefined && { amenities: d.amenities }),
      ...(d.highlights !== undefined && { highlights: d.highlights }),
      ...(d.photoUrls !== undefined && { photoUrls: d.photoUrls }),
      ...(d.draft !== undefined && { draft: d.draft }),
      ...(d.isPublished !== undefined && {
        isPublished: d.isPublished,
        ...(d.isPublished && { postedDate: new Date() }),
      }),
      ...locationUpdate,
    };

    const listing = await db.listing.update({
      where: { id: parsedId.data },
      data: updateData,
      include: {
        location: true,
        host: {
          select: {
            id: true,
            email: true,
            username: true,
            image: true,
          },
        },
      },
    });

    revalidatePath("/hosting/listings");
    revalidatePath(`/hosting/listings/editor/${parsedId.data}`);
    revalidatePath(`/listing/${parsedId.data}`);
    revalidatePath("/search");

    return { success: true, listing };
  } catch (error) {
    logger.error("Error updating listing:", error);
    throw new Error(
      `Failed to update listing: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// DELETE
// ============================================

export async function deleteListing(id: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to delete a listing");
  }

  const parsedId = listingIdSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error("Invalid listing ID");
  }

  try {
    // Check if the listing belongs to the authenticated user
    const existingListing = await db.listing.findUnique({
      where: { id: parsedId.data },
      select: { hostId: true, locationId: true },
    });

    if (!existingListing) {
      throw new Error("Listing not found");
    }

    if (existingListing.hostId !== session.user.id) {
      throw new Error("You can only delete your own listings");
    }

    // Delete the listing (cascades will handle related records)
    await db.listing.delete({
      where: { id: parsedId.data },
    });

    // Optionally delete orphaned location
    if (existingListing.locationId) {
      const locationUsed = await db.listing.count({
        where: { locationId: existingListing.locationId },
      });
      if (locationUsed === 0) {
        await db.location.delete({
          where: { id: existingListing.locationId },
        });
      }
    }

    revalidatePath("/hosting/listings");
    revalidatePath("/search");

    return { success: true };
  } catch (error) {
    logger.error("Error deleting listing:", error);
    throw new Error(
      `Failed to delete listing: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// PUBLISH / UNPUBLISH
// ============================================

export async function publishListing(id: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to publish a listing");
  }

  const parsedId = listingIdSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error("Invalid listing ID");
  }

  try {
    // Check ownership
    const existingListing = await db.listing.findUnique({
      where: { id: parsedId.data },
      include: { location: true },
    });

    if (!existingListing) {
      throw new Error("Listing not found");
    }

    if (existingListing.hostId !== session.user.id) {
      throw new Error("You can only publish your own listings");
    }

    // Validate listing completeness
    const requiredFields = ["title", "description", "pricePerNight", "propertyType", "bedrooms", "bathrooms"];
    const missingFields = requiredFields.filter(
      (field) => !existingListing[field as keyof typeof existingListing]
    );

    if (missingFields.length > 0) {
      throw new Error(`Cannot publish listing. Missing required fields: ${missingFields.join(", ")}`);
    }

    if (!existingListing.location) {
      throw new Error("Cannot publish listing. Location is required");
    }

    if (!existingListing.photoUrls || existingListing.photoUrls.length === 0) {
      throw new Error("Cannot publish listing. At least one photo is required");
    }

    // Publish the listing
    const publishedListing = await db.listing.update({
      where: { id: parsedId.data },
      data: {
        draft: false,
        isPublished: true,
        postedDate: new Date(),
      },
      include: {
        location: true,
        host: {
          select: {
            id: true,
            email: true,
            username: true,
            image: true,
          },
        },
      },
    });

    revalidatePath("/hosting/listings");
    revalidatePath(`/listing/${parsedId.data}`);
    revalidatePath("/search");

    return { success: true, listing: publishedListing };
  } catch (error) {
    logger.error("Error publishing listing:", error);
    throw new Error(
      `Failed to publish listing: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function unpublishListing(id: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to unpublish a listing");
  }

  const parsedId = listingIdSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error("Invalid listing ID");
  }

  try {
    // Check ownership
    const existingListing = await db.listing.findUnique({
      where: { id: parsedId.data },
      select: { hostId: true },
    });

    if (!existingListing) {
      throw new Error("Listing not found");
    }

    if (existingListing.hostId !== session.user.id) {
      throw new Error("You can only unpublish your own listings");
    }

    // Unpublish the listing
    const unpublishedListing = await db.listing.update({
      where: { id: parsedId.data },
      data: {
        isPublished: false,
      },
      include: {
        location: true,
        host: {
          select: {
            id: true,
            email: true,
            username: true,
            image: true,
          },
        },
      },
    });

    revalidatePath("/hosting/listings");
    revalidatePath(`/listing/${parsedId.data}`);
    revalidatePath("/search");

    return { success: true, listing: unpublishedListing };
  } catch (error) {
    logger.error("Error unpublishing listing:", error);
    throw new Error(
      `Failed to unpublish listing: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// SEARCH
// ============================================

export async function searchListings(params: {
  query?: string;
  location?: string;
  checkIn?: Date;
  checkOut?: Date;
  guests?: number;
  priceMin?: number;
  priceMax?: number;
  propertyType?: PropertyType;
  amenities?: Amenity[];
  instantBook?: boolean;
  page?: number;
  limit?: number;
}) {
  const {
    query,
    location,
    guests,
    priceMin,
    priceMax,
    propertyType,
    amenities,
    instantBook,
    page = 1,
    limit = 20,
  } = params;

  try {
    const where: Prisma.ListingWhereInput = {
      isPublished: true,
      draft: false,
    };

    // Text search
    if (query) {
      const sanitizedQuery = sanitizeInput(query);
      where.OR = [
        { title: { contains: sanitizedQuery, mode: "insensitive" } },
        { description: { contains: sanitizedQuery, mode: "insensitive" } },
      ];
    }

    // Location search
    if (location) {
      const sanitizedLocation = sanitizeInput(location);
      where.location = {
        is: {
          OR: [
            { city: { contains: sanitizedLocation, mode: "insensitive" } },
            { state: { contains: sanitizedLocation, mode: "insensitive" } },
            { country: { contains: sanitizedLocation, mode: "insensitive" } },
          ],
        },
      };
    }

    // Guest count
    if (guests) {
      where.guestCount = { gte: guests };
    }

    // Price range
    if (priceMin !== undefined || priceMax !== undefined) {
      where.pricePerNight = {
        ...(priceMin !== undefined && { gte: priceMin }),
        ...(priceMax !== undefined && { lte: priceMax }),
      };
    }

    // Property type
    if (propertyType) {
      where.propertyType = propertyType;
    }

    // Amenities
    if (amenities && amenities.length > 0) {
      where.amenities = { hasEvery: amenities };
    }

    // Instant book
    if (instantBook !== undefined) {
      where.instantBook = instantBook;
    }

    const [listings, total] = await Promise.all([
      db.listing.findMany({
        where,
        include: {
          location: true,
          host: {
            select: {
              id: true,
              email: true,
              username: true,
              image: true,
            },
          },
        },
        orderBy: [
          { averageRating: "desc" },
          { numberOfReviews: "desc" },
          { createdAt: "desc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.listing.count({ where }),
    ]);

    return {
      listings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    logger.error("Error searching listings:", error);
    throw new Error(
      `Failed to search listings: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
