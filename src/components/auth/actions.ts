"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";

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
          name: (user as { name?: string | null }).name || user.email,
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
              name: (user as { name?: string | null }).name || user.email || "Unknown User",
              email: user.email || "",
              phoneNumber: "",
            },
          });
        }
      }
    } catch (error) {
      console.error("Error fetching/creating user info:", error);
      // Create default user info if database operations fail
      userInfo = {
        id: user.id,
        name: (user as { name?: string | null }).name || user.email,
        email: user.email,
        phoneNumber: null,
      };
    }

    return {
      id: user.id,
      name: (user as { name?: string | null }).name ?? null,
      email: user.email ?? null,
      image: user.image ?? null,
      role: user.role ?? null,
      isTwoFactorEnabled: user.isTwoFactorEnabled ?? null,
      isOAuth: false, // You might want to determine this from account data
      userInfo: userInfo,
      userRole: userRole,
    };
  } catch (error) {
    console.error("Error in getAuthUser:", error);
    throw new Error("Failed to get authenticated user");
  }
}

// Get tenant profile
export async function getTenant(userId: string) {
  try {
    let tenant = await db.tenant.findUnique({
      where: { userId },
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
        where: { id: userId },
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
    console.error("Error fetching tenant:", error);
    throw new Error("Failed to fetch tenant profile");
  }
}

// Update tenant settings
export async function updateTenantSettings(
  userId: string,
  data: {
    name?: string;
    email?: string;
    phoneNumber?: string;
  }
) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.id !== userId) {
      throw new Error("Unauthorized");
    }

    const updatedTenant = await db.tenant.update({
      where: { userId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.email && { email: data.email }),
        ...(data.phoneNumber && { phoneNumber: data.phoneNumber }),
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
    console.error("Error updating tenant settings:", error);
    throw new Error("Failed to update tenant settings");
  }
}

// Update manager settings (updates User model directly since managers don't have separate profile)
export async function updateManagerSettings(
  userId: string,
  data: {
    name?: string;
    email?: string;
    username?: string;
  }
) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.id !== userId) {
      throw new Error("Unauthorized");
    }

    const updatedUser = await db.user.update({
      where: { id: userId },
      data: {
        ...(data.username && { username: data.username }),
        ...(data.email && { email: data.email }),
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
    console.error("Error updating manager settings:", error);
    throw new Error("Failed to update manager settings");
  }
}

// Get current residences for a tenant
export async function getCurrentResidences(userId: string) {
  try {
    const currentDate = new Date();

    const leases = await db.lease.findMany({
      where: {
        tenantId: userId,
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
    console.error("Error fetching current residences:", error);
    throw new Error("Failed to fetch current residences");
  }
}

// Add property to favorites
export async function addFavoriteProperty(userId: string, propertyId: number) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.id !== userId) {
      throw new Error("Unauthorized");
    }

    const tenant = await db.tenant.update({
      where: { userId },
      data: {
        favorites: {
          connect: { id: propertyId },
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
    console.error("Error adding favorite property:", error);
    throw new Error("Failed to add property to favorites");
  }
}

// Remove property from favorites
export async function removeFavoriteProperty(userId: string, propertyId: number) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.id !== userId) {
      throw new Error("Unauthorized");
    }

    const tenant = await db.tenant.update({
      where: { userId },
      data: {
        favorites: {
          disconnect: { id: propertyId },
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
    console.error("Error removing favorite property:", error);
    throw new Error("Failed to remove property from favorites");
  }
} 