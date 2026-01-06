"use server";

import { auth } from "../../../auth";
import { db } from "../../lib/db";
import { revalidatePath } from "next/cache";
import { ApplicationStatus } from "@prisma/client";

export type ApplicationWithDetails = {
  id: number;
  name: string;
  email: string;
  phoneNumber: string;
  propertyId: number;
  tenantCognitoId: string; // Match the expected field name
  leaseId: number | null;
  applicationDate: Date;
  status: ApplicationStatus;
  message: string | null;
  property: {
    id: number;
    name: string;
    pricePerMonth: number;
    photoUrls: string[];
    location: {
      city: string;
      country: string;
      address: string;
    } | null;
  };
  tenant: {
    name: string;
    email: string;
    phoneNumber: string;
  };
  lease?: {
    id: number;
    startDate: Date;
    endDate: Date;
    nextPaymentDate?: Date;
  } | null;
};

/**
 * Get applications for a manager
 */
export async function getManagerApplications(): Promise<{
  success: boolean;
  data?: ApplicationWithDetails[];
  error?: string;
}> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Fetch applications for properties managed by this user
    const applications = await db.application.findMany({
      where: {
        listing: {
          hostId: session.user.id,
        },
      },
      include: {
        listing: {
          include: {
            location: true,
          },
        },
        tenant: true,
        lease: true,
      },
      orderBy: {
        applicationDate: "desc",
      },
    });

    function calculateNextPaymentDate(startDate: Date): Date {
      const today = new Date();
      const nextPaymentDate = new Date(startDate);
      while (nextPaymentDate <= today) {
        nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
      }
      return nextPaymentDate;
    }

    const formattedApplications: ApplicationWithDetails[] = applications.map((app) => ({
      id: app.id,
      name: app.name,
      email: app.email,
      phoneNumber: app.phoneNumber,
      propertyId: app.propertyId,
      tenantCognitoId: app.tenantId,
      leaseId: app.leaseId,
      applicationDate: app.applicationDate,
      status: app.status,
      message: app.message,
      property: {
        id: app.listing.id,
        name: app.listing.title ?? 'Untitled Property',
        pricePerMonth: app.listing.pricePerNight ?? 0,
        photoUrls: app.listing.photoUrls,
        location: app.listing.location ? {
          city: app.listing.location.city,
          country: app.listing.location.country,
          address: app.listing.location.address,
        } : null,
      },
      tenant: {
        name: app.tenant.name,
        email: app.tenant.email,
        phoneNumber: app.tenant.phoneNumber,
      },
      lease: app.lease
        ? {
            id: app.lease.id,
            startDate: app.lease.startDate,
            endDate: app.lease.endDate,
            nextPaymentDate: calculateNextPaymentDate(app.lease.startDate),
          }
        : null,
    }));

    return { success: true, data: formattedApplications };
  } catch (error) {
    console.error("Error fetching applications:", error);
    return { success: false, error: "Failed to fetch applications" };
  }
}

/**
 * Get applications for a tenant
 */
export async function getTenantApplications(): Promise<{
  success: boolean;
  data?: ApplicationWithDetails[];
  error?: string;
}> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized" };
    }

    // First get the tenant record
    const tenant = await db.tenant.findUnique({
      where: { userId: session.user.id },
    });

    if (!tenant) {
      return { success: false, error: "Tenant profile not found" };
    }

    const applications = await db.application.findMany({
      where: {
        tenantId: tenant.userId,
      },
      include: {
        listing: {
          include: {
            location: true,
            host: true,
          },
        },
        tenant: true,
        lease: true,
      },
      orderBy: {
        applicationDate: "desc",
      },
    });

    function calculateNextPaymentDate(startDate: Date): Date {
      const today = new Date();
      const nextPaymentDate = new Date(startDate);
      while (nextPaymentDate <= today) {
        nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
      }
      return nextPaymentDate;
    }

    const formattedApplications: ApplicationWithDetails[] = applications.map((app) => ({
      id: app.id,
      name: app.name,
      email: app.email,
      phoneNumber: app.phoneNumber,
      propertyId: app.propertyId,
      tenantCognitoId: app.tenantId,
      leaseId: app.leaseId,
      applicationDate: app.applicationDate,
      status: app.status,
      message: app.message,
      property: {
        id: app.listing.id,
        name: app.listing.title ?? 'Untitled Property',
        pricePerMonth: app.listing.pricePerNight ?? 0,
        photoUrls: app.listing.photoUrls,
        location: app.listing.location ? {
          city: app.listing.location.city,
          country: app.listing.location.country,
          address: app.listing.location.address,
        } : null,
      },
      tenant: {
        name: app.tenant.name,
        email: app.tenant.email,
        phoneNumber: app.tenant.phoneNumber,
      },
      lease: app.lease
        ? {
            id: app.lease.id,
            startDate: app.lease.startDate,
            endDate: app.lease.endDate,
            nextPaymentDate: calculateNextPaymentDate(app.lease.startDate),
          }
        : null,
    }));

    return { success: true, data: formattedApplications };
  } catch (error) {
    console.error("Error fetching applications:", error);
    return { success: false, error: "Failed to fetch applications" };
  }
}

/**
 * Update application status
 */
export async function updateApplicationStatus(
  applicationId: number,
  status: ApplicationStatus
): Promise<{
  success: boolean;
  data?: ApplicationWithDetails;
  error?: string;
}> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Verify the user is the host of the listing for this application
    const application = await db.application.findUnique({
      where: { id: applicationId },
      include: {
        listing: true,
      },
    });

    if (!application) {
      return { success: false, error: "Application not found" };
    }

    if (application.listing.hostId !== session.user.id) {
      return { success: false, error: "Not authorized to update this application" };
    }

    // Update the application status
    const updatedApplication = await db.$transaction(async (prisma) => {
      // Update application status
      const updated = await prisma.application.update({
        where: { id: applicationId },
        data: { status },
        include: {
          listing: {
            include: {
              location: true,
            },
          },
          tenant: true,
          lease: true,
        },
      });

      // If approving and no lease exists, create one
      if (status === "Approved" && !updated.lease) {
        const lease = await prisma.lease.create({
          data: {
            startDate: new Date(),
            endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
            rent: updated.listing.pricePerNight ?? 0,
            deposit: updated.listing.securityDeposit ?? 0,
            propertyId: updated.propertyId,
            tenantId: updated.tenantId,
          },
        });

        // Link the lease to the application
        await prisma.application.update({
          where: { id: applicationId },
          data: { leaseId: lease.id },
        });

        // Fetch the updated application with lease
        return await prisma.application.findUnique({
          where: { id: applicationId },
          include: {
            listing: {
              include: {
                location: true,
              },
            },
            tenant: true,
            lease: true,
          },
        });
      }

      return updated;
    });

    if (!updatedApplication) {
      return { success: false, error: "Failed to update application" };
    }

    function calculateNextPaymentDate(startDate: Date): Date {
      const today = new Date();
      const nextPaymentDate = new Date(startDate);
      while (nextPaymentDate <= today) {
        nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
      }
      return nextPaymentDate;
    }

    const formattedApplication: ApplicationWithDetails = {
      id: updatedApplication.id,
      name: updatedApplication.name,
      email: updatedApplication.email,
      phoneNumber: updatedApplication.phoneNumber,
      propertyId: updatedApplication.propertyId,
      tenantCognitoId: updatedApplication.tenantId,
      leaseId: updatedApplication.leaseId,
      applicationDate: updatedApplication.applicationDate,
      status: updatedApplication.status,
      message: updatedApplication.message,
      property: {
        id: updatedApplication.listing.id,
        name: updatedApplication.listing.title ?? 'Untitled Property',
        pricePerMonth: updatedApplication.listing.pricePerNight ?? 0,
        photoUrls: updatedApplication.listing.photoUrls,
        location: updatedApplication.listing.location ? {
          city: updatedApplication.listing.location.city,
          country: updatedApplication.listing.location.country,
          address: updatedApplication.listing.location.address,
        } : null,
      },
      tenant: {
        name: updatedApplication.tenant.name,
        email: updatedApplication.tenant.email,
        phoneNumber: updatedApplication.tenant.phoneNumber,
      },
      lease: updatedApplication.lease
        ? {
            id: updatedApplication.lease.id,
            startDate: updatedApplication.lease.startDate,
            endDate: updatedApplication.lease.endDate,
            nextPaymentDate: calculateNextPaymentDate(updatedApplication.lease.startDate),
          }
        : null,
    };

    // Revalidate the applications page
    revalidatePath("/managers/applications");
    revalidatePath("/tenants/applications");

    return { success: true, data: formattedApplication };
  } catch (error) {
    console.error("Error updating application status:", error);
    return { success: false, error: "Failed to update application status" };
  }
}

/**
 * Create a new application
 */
export async function createApplication(data: {
  propertyId: number;
  name: string;
  email: string;
  phoneNumber: string;
  message?: string;
}): Promise<{
  success: boolean;
  data?: ApplicationWithDetails;
  error?: string;
}> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Get the tenant record
    const tenant = await db.tenant.findUnique({
      where: { userId: session.user.id },
    });

    if (!tenant) {
      return { success: false, error: "Tenant profile not found" };
    }

    // Check if property exists
    const listing = await db.listing.findUnique({
      where: { id: data.propertyId },
    });

    if (!listing) {
      return { success: false, error: "Property not found" };
    }

    // Check if user already has an application for this property
    const existingApplication = await db.application.findFirst({
      where: {
        propertyId: data.propertyId,
        tenantId: tenant.userId,
      },
    });

    if (existingApplication) {
      return { success: false, error: "You already have an application for this property" };
    }

    // Create the application
    const application = await db.application.create({
      data: {
        applicationDate: new Date(),
        status: "Pending",
        propertyId: data.propertyId,
        tenantId: tenant.userId,
        name: data.name,
        email: data.email,
        phoneNumber: data.phoneNumber,
        message: data.message,
      },
      include: {
        listing: {
          include: {
            location: true,
          },
        },
        tenant: true,
        lease: true,
      },
    });

    const formattedApplication: ApplicationWithDetails = {
      id: application.id,
      name: application.name,
      email: application.email,
      phoneNumber: application.phoneNumber,
      propertyId: application.propertyId,
      tenantCognitoId: application.tenantId,
      leaseId: application.leaseId,
      applicationDate: application.applicationDate,
      status: application.status,
      message: application.message,
      property: {
        id: application.listing.id,
        name: application.listing.title ?? 'Untitled Property',
        pricePerMonth: application.listing.pricePerNight ?? 0,
        photoUrls: application.listing.photoUrls,
        location: application.listing.location ? {
          city: application.listing.location.city,
          country: application.listing.location.country,
          address: application.listing.location.address,
        } : null,
      },
      tenant: {
        name: application.tenant.name,
        email: application.tenant.email,
        phoneNumber: application.tenant.phoneNumber,
      },
      lease: null,
    };

    // Revalidate relevant pages
    revalidatePath("/managers/applications");
    revalidatePath("/tenants/applications");
    revalidatePath(`/search/${data.propertyId}`);

    return { success: true, data: formattedApplication };
  } catch (error) {
    console.error("Error creating application:", error);
    return { success: false, error: "Failed to create application" };
  }
}
