"use server"

import { z } from 'zod'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { Amenity, Highlight, PropertyType } from '@prisma/client'
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"

const listingIdSchema = z.number().int().positive()

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
}).partial()

export type ListingFormData = {
  title?: string
  description?: string
  pricePerNight?: number
  securityDeposit?: number
  applicationFee?: number
  bedrooms?: number
  bathrooms?: number
  squareFeet?: number
  guestCount?: number
  propertyType?: PropertyType
  isPetsAllowed?: boolean
  isParkingIncluded?: boolean
  instantBook?: boolean
  amenities?: Amenity[]
  highlights?: Highlight[]
  photoUrls?: string[]
  // Location data
  address?: string
  city?: string
  state?: string
  country?: string
  postalCode?: string
  latitude?: number
  longitude?: number
  // Draft/publish flags
  draft?: boolean
  isPublished?: boolean
}

// Types for filtering
interface ListingFilters {
  location?: string
  priceRange?: [number, number]
  bedrooms?: number
  bathrooms?: number
  guestCount?: number
  propertyType?: PropertyType
  squareFeet?: [number, number]
  amenities?: Amenity[]
  availableFrom?: string
  coordinates?: [number, number] // [longitude, latitude]
  favoriteIds?: number[]
  publishedOnly?: boolean
}

export async function createListing(data: unknown = {}) {
  const session = await auth()

  if (!session?.user?.id) {
    throw new Error('You must be logged in to create a listing')
  }

  const parsed = listingFormDataSchema.safeParse(data)
  if (!parsed.success) {
    throw new Error('Invalid listing data')
  }

  const d = parsed.data

  try {
    // Create location if provided
    let locationId = null
    if (d.address && d.city && d.state && d.country) {
      const location = await db.location.create({
        data: {
          address: d.address,
          city: d.city,
          state: d.state,
          country: d.country,
          postalCode: d.postalCode || '',
          latitude: d.latitude || 0,
          longitude: d.longitude || 0,
        }
      })
      locationId = location.id
    }

    // Create listing
    const listingData: Prisma.ListingCreateInput = {
      title: d.title,
      description: d.description,
      pricePerNight: d.pricePerNight,
      securityDeposit: d.securityDeposit,
      applicationFee: d.applicationFee,
      bedrooms: d.bedrooms,
      bathrooms: d.bathrooms,
      squareFeet: d.squareFeet,
      guestCount: d.guestCount || 2,
      propertyType: d.propertyType,
      isPetsAllowed: d.isPetsAllowed || false,
      isParkingIncluded: d.isParkingIncluded || false,
      instantBook: d.instantBook || false,
      amenities: d.amenities || [],
      highlights: d.highlights || [],
      photoUrls: d.photoUrls || [],
      draft: d.draft ?? true,
      isPublished: d.isPublished ?? false,
      host: { connect: { id: session.user.id } },
      ...(locationId && { location: { connect: { id: locationId } } })
    }
    
    const listing = await db.listing.create({
      data: listingData,
      include: {
        location: true,
        host: {
          select: {
            id: true,
            email: true,
            username: true,
          }
        },
      }
    })

    revalidatePath('/host')
    revalidatePath('/search')

    return { success: true, listing }
  } catch (error) {
    throw new Error(`Failed to create listing: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function updateListing(id: unknown, data: unknown) {
  const session = await auth()

  if (!session?.user?.id) {
    throw new Error('You must be logged in to update a listing')
  }

  const parsedId = listingIdSchema.safeParse(id)
  if (!parsedId.success) {
    throw new Error('Invalid listing ID')
  }

  const parsed = listingFormDataSchema.safeParse(data)
  if (!parsed.success) {
    throw new Error('Invalid listing data')
  }

  const d = parsed.data

  try {
    // Check if the listing belongs to the authenticated user
    const existingListing = await db.listing.findUnique({
      where: { id: parsedId.data },
      select: { hostId: true }
    })

    if (!existingListing) {
      throw new Error('Listing not found')
    }

    if (existingListing.hostId !== session.user.id) {
      throw new Error('You can only update your own listings')
    }
    // Handle location update if provided
    let locationUpdate = {}
    if (d.address || d.city || d.state || d.country) {
      const listing = await db.listing.findUnique({
        where: { id: parsedId.data },
        include: { location: true }
      })

      if (!listing) {
        throw new Error('Listing not found')
      }

      if (listing.location) {
        // Update existing location
        await db.location.update({
          where: { id: listing.locationId! },
          data: {
            ...(d.address && { address: d.address }),
            ...(d.city && { city: d.city }),
            ...(d.state && { state: d.state }),
            ...(d.country && { country: d.country }),
            ...(d.postalCode && { postalCode: d.postalCode }),
            ...(d.latitude && { latitude: d.latitude }),
            ...(d.longitude && { longitude: d.longitude }),
          }
        })
      } else if (d.address && d.city && d.state && d.country) {
        // Create new location
        const location = await db.location.create({
          data: {
            address: d.address,
            city: d.city,
            state: d.state,
            country: d.country,
            postalCode: d.postalCode || '',
            latitude: d.latitude || 0,
            longitude: d.longitude || 0,
          }
        })
        locationUpdate = { location: { connect: { id: location.id } } }
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
        ...(d.isPublished && { postedDate: new Date() })
      }),
      ...locationUpdate
    }

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
          }
        },
      }
    })

    revalidatePath('/host')
    revalidatePath(`/host/${parsedId.data}`)
    revalidatePath('/search')

    return { success: true, listing }
  } catch (error) {
    throw new Error(`Failed to update listing: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function getListing(id: unknown) {
  const parsedId = listingIdSchema.safeParse(id)
  if (!parsedId.success) {
    throw new Error('Invalid listing ID')
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
          }
        },
      }
    })

    if (!listing) {
      throw new Error('Listing not found')
    }

    return listing
  } catch (error) {
    throw new Error(`Failed to fetch listing: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function getListings(filters?: ListingFilters) {
  try {
    const where: Prisma.ListingWhereInput = {}

    if (filters) {
      // Published filter
      if (filters.publishedOnly) {
        where.isPublished = true
        where.draft = false
      }

      // Location filtering
      if (filters.location) {
        where.location = {
          is: {
            OR: [
              { city: { contains: filters.location, mode: 'insensitive' } },
              { state: { contains: filters.location, mode: 'insensitive' } },
              { address: { contains: filters.location, mode: 'insensitive' } },
            ]
          }
        }
      }

      // Price range
      if (filters.priceRange) {
        where.pricePerNight = {
          gte: filters.priceRange[0],
          lte: filters.priceRange[1],
        }
      }

      // Bedrooms, bathrooms, guest count
      if (filters.bedrooms) where.bedrooms = { gte: filters.bedrooms }
      if (filters.bathrooms) where.bathrooms = { gte: filters.bathrooms }
      if (filters.guestCount) where.guestCount = { gte: filters.guestCount }

      // Property type
      if (filters.propertyType) where.propertyType = filters.propertyType

      // Square feet
      if (filters.squareFeet) {
        where.squareFeet = {
          gte: filters.squareFeet[0],
          lte: filters.squareFeet[1],
        }
      }

      // Amenities
      if (filters.amenities && filters.amenities.length > 0) {
        where.amenities = {
          hasEvery: filters.amenities
        }
      }

      // Coordinate-based filtering (within radius)
      if (filters.coordinates) {
        const [longitude, latitude] = filters.coordinates
        const radius = 0.1 // Adjust radius as needed
        // If we already have a location filter, merge with AND
        if (where.location) {
          where.location = {
            is: {
              AND: [
                ...(where.location.is && 'OR' in where.location.is ? [{ OR: where.location.is.OR }] : []),
                {
                  latitude: {
                    gte: latitude - radius,
                    lte: latitude + radius,
                  },
                  longitude: {
                    gte: longitude - radius,
                    lte: longitude + radius,
                  },
                }
              ]
            }
          }
        } else {
          where.location = {
            is: {
              latitude: {
                gte: latitude - radius,
                lte: latitude + radius,
              },
              longitude: {
                gte: longitude - radius,
                lte: longitude + radius,
              },
            }
          }
        }
      }

      // Filter by favorites
      if (filters.favoriteIds && filters.favoriteIds.length > 0) {
        where.id = { in: filters.favoriteIds }
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
          }
        }
      },
      orderBy: {
        postedDate: 'desc'
      }
    })

    return listings
  } catch (error) {
    throw new Error(`Failed to fetch listings: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function getHostListings(hostId?: string) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      throw new Error('You must be logged in to view host listings')
    }

    const userId = hostId || session.user.id;

    const listings = await db.listing.findMany({
      where: {
        hostId: userId
      },
      include: {
        location: true,
        host: {
          select: {
            id: true,
            email: true,
            username: true,
          }
        }
      },
      orderBy: {
        postedDate: 'desc'
      }
    })

    return listings
  } catch (error) {
    throw new Error(`Failed to fetch host listings: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function deleteListing(id: unknown) {
  const session = await auth()

  if (!session?.user?.id) {
    throw new Error('You must be logged in to delete a listing')
  }

  const parsedId = listingIdSchema.safeParse(id)
  if (!parsedId.success) {
    throw new Error('Invalid listing ID')
  }

  try {
    // Check if the listing belongs to the authenticated user
    const existingListing = await db.listing.findUnique({
      where: { id: parsedId.data },
      select: { hostId: true }
    })

    if (!existingListing) {
      throw new Error('Listing not found')
    }

    if (existingListing.hostId !== session.user.id) {
      throw new Error('You can only delete your own listings')
    }

    await db.listing.delete({
      where: { id: parsedId.data }
    })

    revalidatePath('/host')
    revalidatePath('/search')

    return { success: true }
  } catch (error) {
    throw new Error(`Failed to delete listing: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function publishListing(id: unknown) {
  const session = await auth()

  if (!session?.user?.id) {
    throw new Error('You must be logged in to publish a listing')
  }

  const parsedId = listingIdSchema.safeParse(id)
  if (!parsedId.success) {
    throw new Error('Invalid listing ID')
  }

  try {
    // Check if the listing belongs to the authenticated user
    const existingListing = await db.listing.findUnique({
      where: { id: parsedId.data },
      select: { hostId: true }
    })

    if (!existingListing) {
      throw new Error('Listing not found')
    }

    if (existingListing.hostId !== session.user.id) {
      throw new Error('You can only publish your own listings')
    }

    // Validate listing completeness
    const listing = await db.listing.findUnique({
      where: { id: parsedId.data },
      include: { location: true }
    })

    if (!listing) {
      throw new Error('Listing not found')
    }

    // Check required fields for publishing
    const requiredFields = ['title', 'description', 'pricePerNight', 'propertyType', 'bedrooms', 'bathrooms']
    const missingFields = requiredFields.filter(field => !listing[field as keyof typeof listing])
    
    if (missingFields.length > 0) {
      throw new Error(`Cannot publish listing. Missing required fields: ${missingFields.join(', ')}`)
    }

    if (!listing.location) {
      throw new Error('Cannot publish listing. Location is required')
    }

    if (!listing.photoUrls || listing.photoUrls.length === 0) {
      throw new Error('Cannot publish listing. At least one photo is required')
    }

    // Publish the listing
    const publishedListing = await db.listing.update({
      where: { id: parsedId.data },
      data: {
        draft: false,
        isPublished: true,
        postedDate: new Date()
      },
      include: {
        location: true,
        host: {
          select: {
            id: true,
            email: true,
            username: true,
          }
        },
      }
    })

    revalidatePath('/host')
    revalidatePath(`/host/${parsedId.data}`)
    revalidatePath('/search')

    return { success: true, listing: publishedListing }
  } catch (error) {
    throw new Error(`Failed to publish listing: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
