"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { ApplicationStatus } from "@prisma/client";
import { sanitizeInput, sanitizeEmail, sanitizePhone } from "@/lib/sanitization";
import { logger } from "@/lib/logger";

// Get applications (filtered by user and role)
export async function getApplications(params?: {
  userId?: string;
  userType?: string;
}) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Unauthorized");
    }

    let where: any = {};

    if (params?.userType === "tenant" && params?.userId) {
      // Get applications for a specific tenant
      where.tenantId = params.userId;
    } else if (params?.userType === "manager" && params?.userId) {
      // Get applications for properties managed by this manager (host)
      where.listing = {
        hostId: params.userId,
      };
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
export async function createApplication(data: {
  propertyId: number;
  name: string;
  email: string;
  phoneNumber: string;
  message?: string;
}) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Unauthorized");
    }

    // Sanitize inputs
    data.name = sanitizeInput(data.name);
    data.email = sanitizeEmail(data.email);
    data.phoneNumber = sanitizePhone(data.phoneNumber);
    if (data.message) data.message = sanitizeInput(data.message);

    // Ensure tenant profile exists
    let tenant = await db.tenant.findUnique({
      where: { userId: session.user.id },
    });

    if (!tenant) {
      tenant = await db.tenant.create({
        data: {
          userId: session.user.id,
          name: data.name,
          email: data.email,
          phoneNumber: data.phoneNumber,
        },
      });
    }

    // Use transaction to prevent duplicate applications under concurrent requests
    const application = await db.$transaction(async (tx) => {
      // Check if application already exists for this property
      const existingApplication = await tx.application.findFirst({
        where: {
          propertyId: data.propertyId,
          tenantId: session.user.id,
        },
      });

      if (existingApplication) {
        throw new Error("You have already applied for this property");
      }

      // Create the application
      return tx.application.create({
        data: {
          propertyId: data.propertyId,
          tenantId: session.user.id,
          name: data.name,
          email: data.email,
          phoneNumber: data.phoneNumber,
          message: data.message,
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
  applicationId: number,
  status: ApplicationStatus
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Unauthorized");
    }

    // Get the application to verify ownership
    const application = await db.application.findUnique({
      where: { id: applicationId },
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
        where: { id: applicationId },
        data: { status },
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
      if (status === ApplicationStatus.Approved) {
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
          where: { id: applicationId },
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