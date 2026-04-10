"use server";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { sanitizeInput, sanitizeEmail, sanitizePhone } from "@/lib/sanitization";
import { logger } from "@/lib/logger";

const userIdSchema = z.string().min(1);
const propertyIdSchema = z.number().int().positive();

const tenantSettingsSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  phoneNumber: z.string().max(30).optional(),
});

const managerSettingsSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  username: z.string().min(1).max(100).optional(),
});

// Get current authenticated user with profile info
export async function getAuthUser() {
  try {
    const session = await auth();
    
    if (!session?.user) {
      throw new Error("No authenticated user found");
    }

    const user = session.user;
    const userRole = user.role?.toLowerCase() || "user";

    let userInfo;
    
    try {
      if (userRole === "manager") {
        // For managers, we don't have a separate manager table, just use the User data
        userInfo = {
          id: user.id,
          name: user.name || user.email,
          email: user.email,
          phoneNumber: null, // You might want to add this field to User model
        };
      } else {
        // Try to get tenant profile
        userInfo = await db.tenant.findUnique({
          where: { userId: user.id },
        });

        // If tenant doesn't exist, create one
        if (!userInfo) {
          userInfo = await db.tenant.create({
            data: {
              userId: user.id,
              name: user.name || user.email || "Unknown User",
              email: user.email || "",
              phoneNumber: "",
            },
          });
        }
      }
    } catch (error) {
      logger.error("Error fetching/creating user info:", error);
      // Create default user info if database operations fail
      userInfo = {
        id: user.id,
        name: user.name || user.email,
        email: user.email,
        phoneNumber: null,
      };
    }

    return {
      id: user.id,
      name: user.name ?? null,
      email: user.email ?? null,
      image: user.image ?? null,
      role: user.role ?? null,
      isTwoFactorEnabled: user.isTwoFactorEnabled ?? null,
      isOAuth: false, // You might want to determine this from account data
      userInfo: userInfo,
      userRole: userRole,
    };
  } catch (error) {
    logger.error("Error in getAuthUser:", error);
    throw new Error("Failed to get authenticated user");
  }
}

// Get tenant profile
export async function getTenant(userId: unknown) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const parsedId = userIdSchema.safeParse(userId);
  if (!parsedId.success) {
    throw new Error("Invalid user ID");
  }

  // Users can only view their own tenant profile
  if (parsedId.data !== session.user.id) {
    throw new Error("Unauthorized");
  }

  try {
    let tenant = await db.tenant.findUnique({
      where: { userId: parsedId.data },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            image: true,
          },
        },
        favorites: {
          select: {
            id: true,
            title: true,
            pricePerNight: true,
            photoUrls: true,
            location: true,
          },
        },
        applications: {
          select: {
            id: true,
            applicationDate: true,
            status: true,
            propertyId: true,
            listing: {
              select: {
                id: true,
                title: true,
                location: true,
              },
            },
          },
        },
        leases: {
          select: {
            id: true,
            startDate: true,
            endDate: true,
            rent: true,
            listing: {
              select: {
                id: true,
                title: true,
                location: true,
              },
            },
            payments: {
              select: {
                id: true,
                amountDue: true,
                amountPaid: true,
                dueDate: true,
                paymentStatus: true,
              },
            },
          },
        },
      },
    });

    if (!tenant) {
      // Get user info to create tenant profile
      const user = await db.user.findUnique({
        where: { id: parsedId.data },
        select: {
          id: true,
          email: true,
          username: true,
        },
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Create tenant profile
      tenant = await db.tenant.create({
        data: {
          userId: user.id,
          name: user.username || user.email || "Unknown User",
          email: user.email || "",
          phoneNumber: "",
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              image: true,
            },
          },
          favorites: {
            select: {
              id: true,
              title: true,
              pricePerNight: true,
              photoUrls: true,
              location: true,
            },
          },
          applications: {
            select: {
              id: true,
              applicationDate: true,
              status: true,
              propertyId: true,
              listing: {
                select: {
                  id: true,
                  title: true,
                  location: true,
                },
              },
            },
          },
          leases: {
            select: {
              id: true,
              startDate: true,
              endDate: true,
              rent: true,
              listing: {
                select: {
                  id: true,
                  title: true,
                  location: true,
                },
              },
              payments: {
                select: {
                  id: true,
                  amountDue: true,
                  amountPaid: true,
                  dueDate: true,
                  paymentStatus: true,
                },
              },
            },
          },
        },
      });
    }

    return tenant;
  } catch (error) {
    logger.error("Error fetching tenant:", error);
    throw new Error("Failed to fetch tenant profile");
  }
}

// Update tenant settings
export async function updateTenantSettings(
  userId: unknown,
  data: unknown
) {
  try {
    const session = await auth();
    const parsedUserId = userIdSchema.safeParse(userId);
    if (!parsedUserId.success) {
      throw new Error("Invalid user ID");
    }
    if (!session?.user?.id || session.user.id !== parsedUserId.data) {
      throw new Error("Unauthorized");
    }

    const parsed = tenantSettingsSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error("Invalid settings data");
    }

    const validData = { ...parsed.data };

    // Sanitize inputs
    if (validData.name) validData.name = sanitizeInput(validData.name);
    if (validData.email) validData.email = sanitizeEmail(validData.email);
    if (validData.phoneNumber) validData.phoneNumber = sanitizePhone(validData.phoneNumber);

    const updatedTenant = await db.tenant.update({
      where: { userId: parsedUserId.data },
      data: {
        ...(validData.name && { name: validData.name }),
        ...(validData.email && { email: validData.email }),
        ...(validData.phoneNumber && { phoneNumber: validData.phoneNumber }),
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            image: true,
          },
        },
      },
    });

    revalidatePath("/tenants/settings");
    return updatedTenant;
  } catch (error) {
    logger.error("Error updating tenant settings:", error);
    throw new Error("Failed to update tenant settings");
  }
}

// Update manager settings (updates User model directly since managers don't have separate profile)
export async function updateManagerSettings(
  userId: unknown,
  data: unknown
) {
  try {
    const session = await auth();
    const parsedUserId = userIdSchema.safeParse(userId);
    if (!parsedUserId.success) {
      throw new Error("Invalid user ID");
    }
    if (!session?.user?.id || session.user.id !== parsedUserId.data) {
      throw new Error("Unauthorized");
    }

    const parsed = managerSettingsSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error("Invalid settings data");
    }

    const validData = { ...parsed.data };

    // Sanitize inputs
    if (validData.name) validData.name = sanitizeInput(validData.name);
    if (validData.email) validData.email = sanitizeEmail(validData.email);
    if (validData.username) validData.username = sanitizeInput(validData.username);

    const updatedUser = await db.user.update({
      where: { id: parsedUserId.data },
      data: {
        ...(validData.username && { username: validData.username }),
        ...(validData.email && { email: validData.email }),
      },
      select: {
        id: true,
        email: true,
        username: true,
        image: true,
        role: true,
      },
    });

    revalidatePath("/managers/settings");
    return updatedUser;
  } catch (error) {
    logger.error("Error updating manager settings:", error);
    throw new Error("Failed to update manager settings");
  }
}

// Get current residences for a tenant
export async function getCurrentResidences(userId: unknown) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const parsedId = userIdSchema.safeParse(userId);
  if (!parsedId.success) {
    throw new Error("Invalid user ID");
  }

  // Users can only view their own residences
  if (parsedId.data !== session.user.id) {
    throw new Error("Unauthorized");
  }

  try {
    const currentDate = new Date();

    const leases = await db.lease.findMany({
      where: {
        tenantId: parsedId.data,
        startDate: { lte: currentDate },
        endDate: { gte: currentDate },
      },
      select: {
        listing: {
          select: {
            id: true,
            title: true,
            description: true,
            pricePerNight: true,
            photoUrls: true,
            bedrooms: true,
            bathrooms: true,
            location: true,
            host: {
              select: {
                id: true,
                email: true,
                username: true,
              },
            },
          },
        },
      },
    });

    return leases.map(lease => lease.listing);
  } catch (error) {
    logger.error("Error fetching current residences:", error);
    throw new Error("Failed to fetch current residences");
  }
}

// Add property to favorites
export async function addFavoriteProperty(userId: unknown, propertyId: unknown) {
  const parsedUserId = userIdSchema.safeParse(userId);
  const parsedPropertyId = propertyIdSchema.safeParse(propertyId);
  if (!parsedUserId.success || !parsedPropertyId.success) {
    throw new Error("Invalid input");
  }

  try {
    const session = await auth();
    if (!session?.user?.id || session.user.id !== parsedUserId.data) {
      throw new Error("Unauthorized");
    }

    const tenant = await db.tenant.update({
      where: { userId: parsedUserId.data },
      data: {
        favorites: {
          connect: { id: parsedPropertyId.data },
        },
      },
      select: {
        id: true,
        favorites: {
          select: {
            id: true,
            title: true,
            pricePerNight: true,
            photoUrls: true,
            location: true,
          },
        },
      },
    });

    revalidatePath("/tenants/favorites");
    revalidatePath("/search");
    return tenant;
  } catch (error) {
    logger.error("Error adding favorite property:", error);
    throw new Error("Failed to add property to favorites");
  }
}

// Remove property from favorites
export async function removeFavoriteProperty(userId: unknown, propertyId: unknown) {
  const parsedUserId = userIdSchema.safeParse(userId);
  const parsedPropertyId = propertyIdSchema.safeParse(propertyId);
  if (!parsedUserId.success || !parsedPropertyId.success) {
    throw new Error("Invalid input");
  }

  try {
    const session = await auth();
    if (!session?.user?.id || session.user.id !== parsedUserId.data) {
      throw new Error("Unauthorized");
    }

    const tenant = await db.tenant.update({
      where: { userId: parsedUserId.data },
      data: {
        favorites: {
          disconnect: { id: parsedPropertyId.data },
        },
      },
      select: {
        id: true,
        favorites: {
          select: {
            id: true,
            title: true,
            pricePerNight: true,
            photoUrls: true,
            location: true,
          },
        },
      },
    });

    revalidatePath("/tenants/favorites");
    revalidatePath("/search");
    return tenant;
  } catch (error) {
    logger.error("Error removing favorite property:", error);
    throw new Error("Failed to remove property from favorites");
  }
} 