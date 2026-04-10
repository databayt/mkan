"use server";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { ApplicationStatus } from "@prisma/client";

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
  } catch {
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

    const validData = parsed.data;

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

    // Check if application already exists for this property
    const existingApplication = await db.application.findFirst({
      where: {
        propertyId: validData.propertyId,
        tenantId: session.user.id,
      },
    });

    if (existingApplication) {
      throw new Error("You have already applied for this property");
    }

    // Create the application
    const application = await db.application.create({
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

    revalidatePath("/tenants/applications");
    revalidatePath("/managers/applications");
    return application;
  } catch {
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

    // Update the application status
    const updatedApplication = await db.application.update({
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

    // If approved, create a lease (basic implementation)
    let lease = null;
    if (parsed.data.status === ApplicationStatus.Approved) {
      try {
        // Create a lease with default values (you might want to make this more sophisticated)
        const leaseStartDate = new Date();
        leaseStartDate.setDate(leaseStartDate.getDate() + 30); // Start 30 days from now

        const leaseEndDate = new Date(leaseStartDate);
        leaseEndDate.setFullYear(leaseEndDate.getFullYear() + 1); // 1 year lease

        lease = await db.lease.create({
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
        await db.application.update({
          where: { id: parsed.data.applicationId },
          data: { leaseId: lease.id },
        });
      } catch {
        // Don't throw here, the application status was still updated
      }
    }

    revalidatePath("/tenants/applications");
    revalidatePath("/managers/applications");
    revalidatePath("/managers/properties");

    return { ...updatedApplication, lease };
  } catch {
    throw new Error("Failed to update application status");
  }
}
