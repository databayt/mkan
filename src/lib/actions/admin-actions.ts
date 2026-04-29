"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";

import { auth, isAdminOrSuper, isSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

async function requireAdminSession() {
  const session = await auth();
  if (!session?.user?.id || !isAdminOrSuper(session)) {
    throw new Error("Unauthorized");
  }
  return session;
}

function audit(event: string, actorId: string, payload: Record<string, unknown>) {
  logger.info(`admin:${event}`, { actorId, ...payload });
}

export async function getPlatformMetrics() {
  await requireAdminSession();

  const [
    users,
    listings,
    publishedListings,
    offices,
    activeOffices,
    homeBookings,
    transportBookings,
    paymentSum,
    transportPaymentSum,
  ] = await Promise.all([
    db.user.count(),
    db.listing.count(),
    db.listing.count({ where: { isPublished: true, draft: false } }),
    db.transportOffice.count(),
    db.transportOffice.count({ where: { isActive: true } }),
    db.booking.count(),
    db.transportBooking.count(),
    db.payment.aggregate({ _sum: { amountPaid: true } }),
    db.transportPayment.aggregate({ _sum: { amount: true } }),
  ]);

  return {
    users,
    listings,
    publishedListings,
    offices,
    activeOffices,
    homeBookings,
    transportBookings,
    revenueHomes: Number(paymentSum._sum.amountPaid ?? 0),
    revenueTransport: Number(transportPaymentSum._sum.amount ?? 0),
  };
}

const listUsersSchema = z.object({
  q: z.string().trim().optional(),
  role: z.enum(UserRole).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export async function listAllUsers(input: unknown) {
  await requireAdminSession();
  const { q, role, page, pageSize } = listUsersSchema.parse(input ?? {});

  const where = {
    ...(role ? { role } : {}),
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" as const } },
            { username: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        username: true,
        image: true,
        role: true,
        isSuspended: true,
        suspendedAt: true,
        createdAt: true,
        lastLogin: true,
        _count: { select: { listings: true, transportOffices: true } },
      },
    }),
    db.user.count({ where }),
  ]);

  return { users, total, page, pageSize };
}

const updateRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(UserRole),
});

export async function updateUserRole(input: unknown) {
  const session = await requireAdminSession();
  const { userId, role } = updateRoleSchema.parse(input);

  // Only SUPER_ADMIN can grant SUPER_ADMIN or promote to ADMIN.
  if ((role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN) && !isSuperAdmin(session)) {
    throw new Error("Only a super admin can assign admin roles");
  }

  // Prevent demoting the last remaining SUPER_ADMIN.
  const target = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!target) throw new Error("User not found");

  if (target.role === UserRole.SUPER_ADMIN && role !== UserRole.SUPER_ADMIN) {
    const remaining = await db.user.count({
      where: { role: UserRole.SUPER_ADMIN, NOT: { id: userId } },
    });
    if (remaining === 0) {
      throw new Error("Cannot demote the last super admin");
    }
  }

  await db.user.update({ where: { id: userId }, data: { role } });
  audit("role.update", session.user!.id!, { userId, role });

  revalidatePath("/admin/users");
  return { success: true };
}

const suspendSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
});

export async function toggleUserSuspension(input: unknown) {
  const session = await requireAdminSession();
  const { userId, reason } = suspendSchema.parse(input);

  if (userId === session.user!.id) {
    throw new Error("You cannot suspend your own account");
  }

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { isSuspended: true, role: true },
  });
  if (!target) throw new Error("User not found");

  // A non-super admin cannot suspend a super admin.
  if (target.role === UserRole.SUPER_ADMIN && !isSuperAdmin(session)) {
    throw new Error("Only a super admin can suspend another super admin");
  }

  const nextSuspended = !target.isSuspended;
  await db.user.update({
    where: { id: userId },
    data: {
      isSuspended: nextSuspended,
      suspendedAt: nextSuspended ? new Date() : null,
      suspensionReason: nextSuspended ? (reason ?? null) : null,
    },
  });
  audit(nextSuspended ? "user.suspend" : "user.unsuspend", session.user!.id!, {
    userId,
    reason,
  });

  revalidatePath("/admin/users");
  return { success: true, suspended: nextSuspended };
}

const listingIdSchema = z.coerce.number().int().positive();

export async function forceUnpublishListing(listingId: unknown, reason?: string) {
  const session = await requireAdminSession();
  const id = listingIdSchema.parse(listingId);

  await db.listing.update({
    where: { id },
    data: { isPublished: false },
  });
  audit("listing.forceUnpublish", session.user!.id!, { listingId: id, reason });

  revalidatePath("/admin/homes");
  revalidatePath(`/admin/homes/${id}`);
  revalidatePath("/listings");
  revalidatePath("/search");
  return { success: true };
}

export async function adminDeleteListing(listingId: unknown) {
  const session = await requireAdminSession();
  const id = listingIdSchema.parse(listingId);

  await db.listing.delete({ where: { id } });
  audit("listing.delete", session.user!.id!, { listingId: id });

  revalidatePath("/admin/homes");
  revalidatePath("/listings");
  return { success: true };
}

const officeIdSchema = z.coerce.number().int().positive();

export async function forceUnpublishOffice(officeId: unknown, reason?: string) {
  const session = await requireAdminSession();
  const id = officeIdSchema.parse(officeId);

  await db.transportOffice.update({
    where: { id },
    data: { isActive: false },
  });
  audit("office.forceUnpublish", session.user!.id!, { officeId: id, reason });

  revalidatePath("/admin/transport");
  revalidatePath(`/admin/transport/${id}`);
  revalidatePath("/transport/offices");
  return { success: true };
}

export async function adminDeleteOffice(officeId: unknown) {
  const session = await requireAdminSession();
  const id = officeIdSchema.parse(officeId);

  await db.transportOffice.delete({ where: { id } });
  audit("office.delete", session.user!.id!, { officeId: id });

  revalidatePath("/admin/transport");
  revalidatePath("/transport/offices");
  return { success: true };
}

/**
 * Mark a transport office as verified. Admin-only. Verification is the
 * gating signal for public search — `searchTrips` filters by
 * `route.office.isVerified=true` so unverified operators stay invisible
 * even if they're active.
 */
export async function verifyOffice(officeId: unknown) {
  const session = await requireAdminSession();
  const id = officeIdSchema.parse(officeId);

  const office = await db.transportOffice.update({
    where: { id },
    data: { isVerified: true, isActive: true },
    select: { id: true, name: true, ownerId: true },
  });
  audit("office.verify", session.user!.id!, { officeId: id });

  revalidatePath("/admin/transport");
  revalidatePath(`/admin/transport/${id}`);
  revalidatePath("/transport/offices");
  revalidatePath("/transport/search");
  return { success: true, office };
}

export async function unverifyOffice(officeId: unknown, reason?: string) {
  const session = await requireAdminSession();
  const id = officeIdSchema.parse(officeId);

  await db.transportOffice.update({
    where: { id },
    data: { isVerified: false },
  });
  audit("office.unverify", session.user!.id!, { officeId: id, reason });

  revalidatePath("/admin/transport");
  revalidatePath(`/admin/transport/${id}`);
  revalidatePath("/transport/offices");
  revalidatePath("/transport/search");
  return { success: true };
}

// ============================================
// PLATFORM SETTINGS
// ============================================

const platformSettingsSchema = z.object({
  platformFeePct: z.number().min(0).max(1),
  defaultCancellationPolicy: z.enum([
    "Flexible",
    "Moderate",
    "Firm",
    "Strict",
    "NonRefundable",
  ]),
  supportedCurrencies: z.string().max(200),
  payoutScheduleDays: z.number().int().min(0).max(365),
  emailFrom: z.string().max(200),
  supportEmail: z.string().max(200),
});

/**
 * Read the singleton PlatformSetting row, lazily creating id=1 on first
 * call so the rest of the app can rely on it always existing.
 */
export async function getPlatformSettings() {
  await requireAdminSession();
  const existing = await db.platformSetting.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return db.platformSetting.create({ data: { id: 1 } });
}

export async function updatePlatformSettings(input: unknown) {
  const session = await requireAdminSession();
  const parsed = platformSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "invalid", issues: parsed.error.issues };
  }

  const updated = await db.platformSetting.upsert({
    where: { id: 1 },
    create: { id: 1, ...parsed.data },
    update: parsed.data,
  });
  audit("platform.settings.update", session.user!.id!, parsed.data);

  revalidatePath("/admin/settings");
  return { ok: true as const, settings: updated };
}

export async function listAllListingsAdmin({
  q,
  page = 1,
  pageSize = 25,
}: {
  q?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  await requireAdminSession();

  const where = q
    ? {
        OR: [
          { title: { contains: q, mode: "insensitive" as const } },
          { host: { email: { contains: q, mode: "insensitive" as const } } },
        ],
      }
    : {};

  const [listings, total] = await Promise.all([
    db.listing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        isPublished: true,
        draft: true,
        pricePerNight: true,
        averageRating: true,
        createdAt: true,
        host: { select: { id: true, email: true, username: true } },
        location: { select: { city: true, country: true } },
        _count: { select: { bookings: true, reviews: true } },
      },
    }),
    db.listing.count({ where }),
  ]);

  return { listings, total, page, pageSize };
}

export async function listAllOfficesAdmin({
  q,
  page = 1,
  pageSize = 25,
}: {
  q?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  await requireAdminSession();

  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { owner: { email: { contains: q, mode: "insensitive" as const } } },
        ],
      }
    : {};

  const [offices, total] = await Promise.all([
    db.transportOffice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        isActive: true,
        isVerified: true,
        phone: true,
        email: true,
        createdAt: true,
        owner: { select: { id: true, email: true, username: true } },
        _count: { select: { buses: true, routes: true, bookings: true } },
      },
    }),
    db.transportOffice.count({ where }),
  ]);

  return { offices, total, page, pageSize };
}

export async function listAllHomeBookingsAdmin({
  page = 1,
  pageSize = 25,
}: { page?: number; pageSize?: number } = {}) {
  await requireAdminSession();
  const [bookings, total] = await Promise.all([
    db.booking.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        guest: { select: { id: true, email: true, username: true } },
        listing: { select: { id: true, title: true } },
      },
    }),
    db.booking.count(),
  ]);
  return { bookings, total, page, pageSize };
}

export async function listAllTransportBookingsAdmin({
  page = 1,
  pageSize = 25,
}: { page?: number; pageSize?: number } = {}) {
  await requireAdminSession();
  const [bookings, total] = await Promise.all([
    db.transportBooking.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { id: true, email: true, username: true } },
        office: { select: { id: true, name: true } },
      },
    }),
    db.transportBooking.count(),
  ]);
  return { bookings, total, page, pageSize };
}

export async function listAllHomePaymentsAdmin({
  page = 1,
  pageSize = 25,
}: { page?: number; pageSize?: number } = {}) {
  await requireAdminSession();
  const [payments, total] = await Promise.all([
    db.payment.findMany({
      orderBy: { dueDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        lease: {
          select: {
            id: true,
            tenant: { select: { userId: true, name: true } },
            listing: { select: { id: true, title: true } },
          },
        },
      },
    }),
    db.payment.count(),
  ]);
  return { payments, total, page, pageSize };
}

export async function listAllTransportPaymentsAdmin({
  page = 1,
  pageSize = 25,
}: { page?: number; pageSize?: number } = {}) {
  await requireAdminSession();
  const [payments, total] = await Promise.all([
    db.transportPayment.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        booking: {
          select: {
            id: true,
            user: { select: { id: true, email: true } },
            office: { select: { id: true, name: true } },
          },
        },
      },
    }),
    db.transportPayment.count(),
  ]);
  return { payments, total, page, pageSize };
}
