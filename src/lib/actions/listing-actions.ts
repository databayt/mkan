"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { Amenity, Highlight, PropertyType, Prisma } from "@prisma/client";

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

export async function createListing(data: Partial<ListingFormData> = {}) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to create a listing");
  }

  try {
    // Create location if provided
    let locationId = null;
    if (data.address && data.city && data.state && data.country) {
      const location = await db.location.create({
        data: {
          address: data.address,
          city: data.city,
          state: data.state,
          country: data.country,
          postalCode: data.postalCode || "",
          latitude: data.latitude || 0,
          longitude: data.longitude || 0,
        },
      });
      locationId = location.id;
    }

    // Create listing
    const listingData: Prisma.ListingCreateInput = {
      title: data.title,
      description: data.description,
      pricePerNight: data.pricePerNight,
      securityDeposit: data.securityDeposit,
      applicationFee: data.applicationFee,
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      squareFeet: data.squareFeet,
      guestCount: data.guestCount || 2,
      propertyType: data.propertyType,
      isPetsAllowed: data.isPetsAllowed || false,
      isParkingIncluded: data.isParkingIncluded || false,
      instantBook: data.instantBook || false,
      amenities: data.amenities || [],
      highlights: data.highlights || [],
      photoUrls: data.photoUrls || [],
      draft: data.draft ?? true,
      isPublished: data.isPublished ?? false,
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
    console.error("Error creating listing:", error);
    throw new Error(
      `Failed to create listing: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// READ
// ============================================

export async function getListing(id: number) {
  try {
    const listing = await db.listing.findUnique({
      where: { id },
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
        reviews: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!listing) {
      throw new Error("Listing not found");
    }

    return listing;
  } catch (error) {
    console.error("Error fetching listing:", error);
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
    console.error("Error fetching listings:", error);
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
            reviews: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return listings;
  } catch (error) {
    console.error("Error fetching host listings:", error);
    throw new Error(
      `Failed to fetch host listings: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// UPDATE
// ============================================

export async function updateListing(id: number, data: Partial<ListingFormData>) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to update a listing");
  }

  try {
    // Check if the listing belongs to the authenticated user
    const existingListing = await db.listing.findUnique({
      where: { id },
      select: { hostId: true, locationId: true },
    });

    if (!existingListing) {
      throw new Error("Listing not found");
    }

    if (existingListing.hostId !== session.user.id) {
      throw new Error("You can only update your own listings");
    }

    // Handle location update if provided
    let locationUpdate = {};
    if (data.address || data.city || data.state || data.country) {
      if (existingListing.locationId) {
        // Update existing location
        await db.location.update({
          where: { id: existingListing.locationId },
          data: {
            ...(data.address && { address: data.address }),
            ...(data.city && { city: data.city }),
            ...(data.state && { state: data.state }),
            ...(data.country && { country: data.country }),
            ...(data.postalCode && { postalCode: data.postalCode }),
            ...(data.latitude !== undefined && { latitude: data.latitude }),
            ...(data.longitude !== undefined && { longitude: data.longitude }),
          },
        });
      } else if (data.address && data.city && data.state && data.country) {
        // Create new location
        const location = await db.location.create({
          data: {
            address: data.address,
            city: data.city,
            state: data.state,
            country: data.country,
            postalCode: data.postalCode || "",
            latitude: data.latitude || 0,
            longitude: data.longitude || 0,
          },
        });
        locationUpdate = { location: { connect: { id: location.id } } };
      }
    }

    // Prepare listing update data
    const updateData: Prisma.ListingUpdateInput = {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.pricePerNight !== undefined && { pricePerNight: data.pricePerNight }),
      ...(data.securityDeposit !== undefined && { securityDeposit: data.securityDeposit }),
      ...(data.applicationFee !== undefined && { applicationFee: data.applicationFee }),
      ...(data.bedrooms !== undefined && { bedrooms: data.bedrooms }),
      ...(data.bathrooms !== undefined && { bathrooms: data.bathrooms }),
      ...(data.squareFeet !== undefined && { squareFeet: data.squareFeet }),
      ...(data.guestCount !== undefined && { guestCount: data.guestCount }),
      ...(data.propertyType !== undefined && { propertyType: data.propertyType }),
      ...(data.isPetsAllowed !== undefined && { isPetsAllowed: data.isPetsAllowed }),
      ...(data.isParkingIncluded !== undefined && { isParkingIncluded: data.isParkingIncluded }),
      ...(data.instantBook !== undefined && { instantBook: data.instantBook }),
      ...(data.amenities !== undefined && { amenities: data.amenities }),
      ...(data.highlights !== undefined && { highlights: data.highlights }),
      ...(data.photoUrls !== undefined && { photoUrls: data.photoUrls }),
      ...(data.draft !== undefined && { draft: data.draft }),
      ...(data.isPublished !== undefined && {
        isPublished: data.isPublished,
        ...(data.isPublished && { postedDate: new Date() }),
      }),
      ...locationUpdate,
    };

    const listing = await db.listing.update({
      where: { id },
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
    revalidatePath(`/hosting/listings/editor/${id}`);
    revalidatePath(`/listing/${id}`);
    revalidatePath("/search");

    return { success: true, listing };
  } catch (error) {
    console.error("Error updating listing:", error);
    throw new Error(
      `Failed to update listing: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// DELETE
// ============================================

export async function deleteListing(id: number) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to delete a listing");
  }

  try {
    // Check if the listing belongs to the authenticated user
    const existingListing = await db.listing.findUnique({
      where: { id },
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
      where: { id },
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
    console.error("Error deleting listing:", error);
    throw new Error(
      `Failed to delete listing: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// PUBLISH / UNPUBLISH
// ============================================

export async function publishListing(id: number) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to publish a listing");
  }

  try {
    // Check ownership
    const existingListing = await db.listing.findUnique({
      where: { id },
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
      where: { id },
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
    revalidatePath(`/listing/${id}`);
    revalidatePath("/search");

    return { success: true, listing: publishedListing };
  } catch (error) {
    console.error("Error publishing listing:", error);
    throw new Error(
      `Failed to publish listing: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function unpublishListing(id: number) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to unpublish a listing");
  }

  try {
    // Check ownership
    const existingListing = await db.listing.findUnique({
      where: { id },
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
      where: { id },
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
    revalidatePath(`/listing/${id}`);
    revalidatePath("/search");

    return { success: true, listing: unpublishedListing };
  } catch (error) {
    console.error("Error unpublishing listing:", error);
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
      where.OR = [
        { title: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
      ];
    }

    // Location search
    if (location) {
      where.location = {
        is: {
          OR: [
            { city: { contains: location, mode: "insensitive" } },
            { state: { contains: location, mode: "insensitive" } },
            { country: { contains: location, mode: "insensitive" } },
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
    console.error("Error searching listings:", error);
    throw new Error(
      `Failed to search listings: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
