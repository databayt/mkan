"use server";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { ApplicationStatus } from "@prisma/client";
import { sanitizeInput, sanitizeEmail, sanitizePhone } from "@/lib/sanitization";
import { logger } from "@/lib/logger";

const createApplicationSchema = z.object({
  propertyId: z.number().int().positive(),
  name: z.string().min(1).max(200),
  email: z.string().email(),
  phoneNumber: z.string().min(1).max(30),
  message: z.string().max(1000).optional(),
});

const updateApplicationStatusSchema = z.object({
  applicationId: z.number().int().positive(),
  status: z.nativeEnum(ApplicationStatus),
});

// Get applications (filtered by user role from session, NOT client input)
export async function getApplications() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Unauthorized");
    }

    // Determine user type from session role, not from client input
    const userRole = session.user.role?.toLowerCase();
    const userId = session.user.id;

    let where: Record<string, unknown> = {};

    if (userRole === "manager" || userRole === "host") {
      // Get applications for properties managed by this host
      where.listing = {
        hostId: userId,
      };
    } else {
      // Default: get applications for this tenant
      where.tenantId = userId;
    }

    const applications = await db.application.findMany({
      where,
      include: {
        listing: {
          include: {
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
        tenant: {
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
        },
        lease: true,
      },
      orderBy: {
        applicationDate: 'desc',
      },
    });

    return applications;
  } catch (error) {
    logger.error("Error fetching applications:", error);
    throw new Error("Failed to fetch applications");
  }
}

// Create a new application
export async function createApplication(data: unknown) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Unauthorized");
    }

    const parsed = createApplicationSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error("Invalid input");
    }

    const validData = {
      ...parsed.data,
      name: sanitizeInput(parsed.data.name),
      email: sanitizeEmail(parsed.data.email),
      phoneNumber: sanitizePhone(parsed.data.phoneNumber),
      message: parsed.data.message ? sanitizeInput(parsed.data.message) : undefined,
    };

    // Ensure tenant profile exists
    let tenant = await db.tenant.findUnique({
      where: { userId: session.user.id },
    });

    if (!tenant) {
      tenant = await db.tenant.create({
        data: {
          userId: session.user.id,
          name: validData.name,
          email: validData.email,
          phoneNumber: validData.phoneNumber,
        },
      });
    }

    // Use transaction to prevent duplicate applications under concurrent requests
    const application = await db.$transaction(async (tx) => {
      // Check if application already exists for this property
      const existingApplication = await tx.application.findFirst({
        where: {
          propertyId: validData.propertyId,
          tenantId: session.user.id,
        },
      });

      if (existingApplication) {
        throw new Error("You have already applied for this property");
      }

      // Create the application
      return tx.application.create({
        data: {
          propertyId: validData.propertyId,
          tenantId: session.user.id,
          name: validData.name,
          email: validData.email,
          phoneNumber: validData.phoneNumber,
          message: validData.message,
          applicationDate: new Date(),
          status: ApplicationStatus.Pending,
        },
        include: {
          listing: {
            include: {
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
          tenant: {
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
          },
        },
      });
    });

    revalidatePath("/tenants/applications");
    revalidatePath("/managers/applications");
    return application;
  } catch (error) {
    logger.error("Error creating application:", error);
    throw new Error("Failed to create application");
  }
}

// Update application status (for managers)
export async function updateApplicationStatus(
  applicationId: unknown,
  status: unknown
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Unauthorized");
    }

    const parsed = updateApplicationStatusSchema.safeParse({ applicationId, status });
    if (!parsed.success) {
      throw new Error("Invalid input");
    }

    // Get the application to verify ownership
    const application = await db.application.findUnique({
      where: { id: parsed.data.applicationId },
      include: {
        listing: {
          select: {
            hostId: true,
          },
        },
      },
    });

    if (!application) {
      throw new Error("Application not found");
    }

    // Verify that the user is the host of this listing
    if (application.listing.hostId !== session.user.id) {
      throw new Error("Unauthorized: You don't manage this property");
    }

    // Use transaction for status update + lease creation
    const result = await db.$transaction(async (tx) => {
      // Update the application status
      const updatedApplication = await tx.application.update({
        where: { id: parsed.data.applicationId },
        data: { status: parsed.data.status },
        include: {
          listing: {
            include: {
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
          tenant: {
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
          },
        },
      });

      // If approved, create a lease
      let lease = null;
      if (parsed.data.status === ApplicationStatus.Approved) {
        const leaseStartDate = new Date();
        leaseStartDate.setDate(leaseStartDate.getDate() + 30);

        const leaseEndDate = new Date(leaseStartDate);
        leaseEndDate.setFullYear(leaseEndDate.getFullYear() + 1);

        lease = await tx.lease.create({
          data: {
            propertyId: application.propertyId,
            tenantId: application.tenantId,
            startDate: leaseStartDate,
            endDate: leaseEndDate,
            rent: updatedApplication.listing.pricePerNight ?? 0,
            deposit: updatedApplication.listing.securityDeposit ?? 0,
          },
          include: {
            listing: {
              include: {
                location: true,
              },
            },
            tenant: true,
          },
        });

        // Link the lease to the application
        await tx.application.update({
          where: { id: parsed.data.applicationId },
          data: { leaseId: lease.id },
        });
      }

      return { ...updatedApplication, lease };
    });

    revalidatePath("/tenants/applications");
    revalidatePath("/managers/applications");
    revalidatePath("/managers/properties");

    return result;
  } catch (error) {
    logger.error("Error updating application status:", error);
    throw new Error("Failed to update application status");
  }
} 