"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { ApplicationStatus } from "@prisma/client";

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
    console.error("Error fetching applications:", error);
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

    // Check if application already exists for this property
    const existingApplication = await db.application.findFirst({
      where: {
        propertyId: data.propertyId,
        tenantId: session.user.id,
      },
    });

    if (existingApplication) {
      throw new Error("You have already applied for this property");
    }

    // Create the application
    const application = await db.application.create({
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

    revalidatePath("/tenants/applications");
    revalidatePath("/managers/applications");
    return application;
  } catch (error) {
    console.error("Error creating application:", error);
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

    // Update the application status
    const updatedApplication = await db.application.update({
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

    // If approved, create a lease (basic implementation)
    let lease = null;
    if (status === ApplicationStatus.Approved) {
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
          where: { id: applicationId },
          data: { leaseId: lease.id },
        });
      } catch (leaseError) {
        console.error("Error creating lease:", leaseError);
        // Don't throw here, the application status was still updated
      }
    }

    revalidatePath("/tenants/applications");
    revalidatePath("/managers/applications");
    revalidatePath("/managers/properties");

    return { ...updatedApplication, lease };
  } catch (error) {
    console.error("Error updating application status:", error);
    throw new Error("Failed to update application status");
  }
} 