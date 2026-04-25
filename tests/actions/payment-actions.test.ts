import { describe, it, expect, vi, beforeEach } from "vitest";

// PaymentStatus enum mirror (hoisted mocks cannot import from @prisma/client)
const PaymentStatus = {
  Pending: "Pending",
  Paid: "Paid",
  PartiallyPaid: "PartiallyPaid",
  Overdue: "Overdue",
} as const;

vi.mock("@prisma/client", () => ({
  PaymentStatus: {
    Pending: "Pending",
    Paid: "Paid",
    PartiallyPaid: "PartiallyPaid",
    Overdue: "Overdue",
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    payment: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    lease: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  canOverride: (session: { user?: { id?: string; role?: string } } | null | undefined, ownerId: string | null | undefined) =>
    (!!session?.user?.id && session.user.id === ownerId) ||
    session?.user?.role === "ADMIN" ||
    session?.user?.role === "SUPER_ADMIN",
  isAdminOrSuper: (session: { user?: { role?: string } } | null | undefined) =>
    session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN",
  isSuperAdmin: (session: { user?: { role?: string } } | null | undefined) =>
    session?.user?.role === "SUPER_ADMIN",
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  createPayment,
  getPayment,
  getLeasePayments,
  getUserPayments,
  processPayment,
  updatePaymentStatus,
  markOverduePayments,
  getPaymentSummary,
  generateMonthlyPayments,
  generateInvoice,
  createStripePaymentIntent,
  handleStripeWebhook,
  processRefund,
} from "@/lib/actions/payment-actions";

const mockAuth = vi.mocked(auth);
const mockDb = vi.mocked(db);

const hostSession = {
  user: { id: "host-1", name: "Host", email: "host@test.com", role: "USER" },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const tenantSession = {
  user: { id: "tenant-1", name: "Tenant", email: "tenant@test.com", role: "USER" },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const adminSession = {
  user: { id: "admin-1", name: "Admin", email: "admin@test.com", role: "ADMIN" },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================
// createPayment
// ============================================

describe("createPayment", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(createPayment({ leaseId: 1, amountDue: 100, dueDate: new Date() })).rejects.toThrow(
      "logged in"
    );
  });

  it("throws for invalid data", async () => {
    mockAuth.mockResolvedValue(hostSession as never);

    await expect(createPayment({ leaseId: -1 })).rejects.toThrow("Invalid payment data");
  });

  it("throws when lease not found", async () => {
    mockAuth.mockResolvedValue(hostSession as never);
    mockDb.lease.findUnique.mockResolvedValue(null);

    await expect(
      createPayment({ leaseId: 1, amountDue: 500, dueDate: new Date() })
    ).rejects.toThrow("Lease not found");
  });

  it("throws when user has no permission (not host or tenant)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "stranger" } } as never);
    mockDb.lease.findUnique.mockResolvedValue({
      id: 1,
      tenantId: "tenant-1",
      listing: { hostId: "host-1" },
    } as never);

    await expect(
      createPayment({ leaseId: 1, amountDue: 500, dueDate: new Date() })
    ).rejects.toThrow("permission");
  });

  it("creates payment when host", async () => {
    mockAuth.mockResolvedValue(hostSession as never);
    mockDb.lease.findUnique.mockResolvedValue({
      id: 1,
      tenantId: "tenant-1",
      listing: { hostId: "host-1" },
    } as never);
    mockDb.payment.create.mockResolvedValue({ id: 10, leaseId: 1, amountDue: 500 } as never);

    const result = await createPayment({ leaseId: 1, amountDue: 500, dueDate: new Date() });

    expect(result).toHaveProperty("success", true);
    expect(result.payment).toHaveProperty("id", 10);
  });

  it("creates payment when tenant", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    mockDb.lease.findUnique.mockResolvedValue({
      id: 1,
      tenantId: "tenant-1",
      listing: { hostId: "host-1" },
    } as never);
    mockDb.payment.create.mockResolvedValue({ id: 11 } as never);

    const result = await createPayment({ leaseId: 1, amountDue: 300, dueDate: new Date() });

    expect(result).toHaveProperty("success", true);
  });

  it("sets initial status to Pending with amountPaid 0", async () => {
    mockAuth.mockResolvedValue(hostSession as never);
    mockDb.lease.findUnique.mockResolvedValue({
      id: 1,
      tenantId: "tenant-1",
      listing: { hostId: "host-1" },
    } as never);
    mockDb.payment.create.mockResolvedValue({ id: 12 } as never);

    await createPayment({ leaseId: 1, amountDue: 200, dueDate: new Date() });

    const createCall = mockDb.payment.create.mock.calls[0][0];
    expect(createCall.data).toHaveProperty("amountPaid", 0);
    expect(createCall.data).toHaveProperty("paymentStatus", PaymentStatus.Pending);
  });
});

// ============================================
// getPayment
// ============================================

describe("getPayment", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(getPayment(1)).rejects.toThrow("logged in");
  });

  it("throws for invalid payment ID", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);

    await expect(getPayment(-1)).rejects.toThrow("Invalid payment ID");
    await expect(getPayment("abc")).rejects.toThrow("Invalid payment ID");
  });

  it("throws when payment not found", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    mockDb.payment.findUnique.mockResolvedValue(null);

    await expect(getPayment(999)).rejects.toThrow("Payment not found");
  });

  it("throws when user has no permission", async () => {
    mockAuth.mockResolvedValue({ user: { id: "stranger" } } as never);
    mockDb.payment.findUnique.mockResolvedValue({
      id: 1,
      lease: {
        tenantId: "tenant-1",
        listing: { hostId: "host-1" },
      },
    } as never);

    await expect(getPayment(1)).rejects.toThrow("permission");
  });

  it("returns payment when user is tenant", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    const payment = {
      id: 1,
      amountDue: 500,
      lease: { tenantId: "tenant-1", listing: { hostId: "host-1" } },
    };
    mockDb.payment.findUnique.mockResolvedValue(payment as never);

    const result = await getPayment(1);
    expect(result).toEqual(payment);
  });
});

// ============================================
// getLeasePayments
// ============================================

describe("getLeasePayments", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(getLeasePayments(1)).rejects.toThrow("logged in");
  });

  it("throws for invalid lease ID", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);

    await expect(getLeasePayments(0)).rejects.toThrow("Invalid lease ID");
  });

  it("throws when lease not found", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    mockDb.lease.findUnique.mockResolvedValue(null);

    await expect(getLeasePayments(1)).rejects.toThrow("Lease not found");
  });

  it("returns payments for authorized user", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    mockDb.lease.findUnique.mockResolvedValue({
      id: 1,
      tenantId: "tenant-1",
      listing: { hostId: "host-1" },
    } as never);
    mockDb.payment.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }] as never);

    const result = await getLeasePayments(1);
    expect(result).toHaveLength(2);
  });
});

// ============================================
// getUserPayments
// ============================================

describe("getUserPayments", () => {
  it("throws when no user ID available", async () => {
    mockAuth.mockResolvedValue({ user: {} } as never);

    await expect(getUserPayments()).rejects.toThrow("User ID is required");
  });

  it("allows viewing own payments", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    mockDb.payment.findMany.mockResolvedValue([{ id: 1 }] as never);

    const result = await getUserPayments();
    expect(result).toHaveLength(1);
  });

  it("throws when non-admin tries to view another user payments", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    mockDb.user.findUnique.mockResolvedValue({ role: "USER" } as never);

    await expect(getUserPayments("other-user")).rejects.toThrow("your own");
  });

  it("allows admin to view other users payments", async () => {
    mockAuth.mockResolvedValue(adminSession as never);
    mockDb.user.findUnique.mockResolvedValue({ role: "ADMIN" } as never);
    mockDb.payment.findMany.mockResolvedValue([{ id: 1 }] as never);

    const result = await getUserPayments("other-user");
    expect(result).toHaveLength(1);
  });
});

// ============================================
// processPayment
// ============================================

describe("processPayment", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(processPayment({ paymentId: 1, amountPaid: 100 })).rejects.toThrow("logged in");
  });

  it("throws for invalid data", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);

    await expect(processPayment({ paymentId: -1 })).rejects.toThrow("Invalid payment data");
  });

  it("throws when only host tries to pay (not tenant)", async () => {
    mockAuth.mockResolvedValue(hostSession as never);
    mockDb.payment.findUnique.mockResolvedValue({
      id: 1,
      amountPaid: 0,
      amountDue: 500,
      lease: { tenantId: "tenant-1", listing: { hostId: "host-1" } },
    } as never);

    await expect(processPayment({ paymentId: 1, amountPaid: 500 })).rejects.toThrow(
      "Only the tenant"
    );
  });

  it("marks payment Paid when full amount paid", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    mockDb.payment.findUnique.mockResolvedValue({
      id: 1,
      amountPaid: 0,
      amountDue: 500,
      leaseId: 10,
      lease: { tenantId: "tenant-1", listing: { hostId: "host-1" } },
    } as never);
    mockDb.payment.update.mockResolvedValue({ id: 1, paymentStatus: PaymentStatus.Paid } as never);

    const result = await processPayment({ paymentId: 1, amountPaid: 500 });

    expect(result).toHaveProperty("success", true);
    const updateData = mockDb.payment.update.mock.calls[0][0].data;
    expect(updateData).toHaveProperty("paymentStatus", PaymentStatus.Paid);
  });

  it("marks payment PartiallyPaid when partial amount paid", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    mockDb.payment.findUnique.mockResolvedValue({
      id: 1,
      amountPaid: 0,
      amountDue: 500,
      leaseId: 10,
      lease: { tenantId: "tenant-1", listing: { hostId: "host-1" } },
    } as never);
    mockDb.payment.update.mockResolvedValue({ id: 1 } as never);

    await processPayment({ paymentId: 1, amountPaid: 200 });

    const updateData = mockDb.payment.update.mock.calls[0][0].data;
    expect(updateData).toHaveProperty("paymentStatus", PaymentStatus.PartiallyPaid);
  });

  it("accumulates partial payments", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    mockDb.payment.findUnique.mockResolvedValue({
      id: 1,
      amountPaid: 200,
      amountDue: 500,
      leaseId: 10,
      lease: { tenantId: "tenant-1", listing: { hostId: "host-1" } },
    } as never);
    mockDb.payment.update.mockResolvedValue({ id: 1 } as never);

    await processPayment({ paymentId: 1, amountPaid: 300 });

    const updateData = mockDb.payment.update.mock.calls[0][0].data;
    expect(updateData).toHaveProperty("amountPaid", 500);
    expect(updateData).toHaveProperty("paymentStatus", PaymentStatus.Paid);
  });
});

// ============================================
// updatePaymentStatus
// ============================================

describe("updatePaymentStatus", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(updatePaymentStatus(1, PaymentStatus.Paid)).rejects.toThrow("logged in");
  });

  it("throws for invalid input", async () => {
    mockAuth.mockResolvedValue(hostSession as never);

    await expect(updatePaymentStatus(-1, "INVALID_STATUS")).rejects.toThrow("Invalid input");
  });

  it("throws when non-host non-admin tries to update", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    mockDb.payment.findUnique.mockResolvedValue({
      id: 1,
      lease: { listing: { hostId: "host-1" } },
    } as never);
    mockDb.user.findUnique.mockResolvedValue({ role: "USER" } as never);

    await expect(updatePaymentStatus(1, PaymentStatus.Paid)).rejects.toThrow("permission");
  });

  it("allows host to update status", async () => {
    mockAuth.mockResolvedValue(hostSession as never);
    mockDb.payment.findUnique.mockResolvedValue({
      id: 1,
      leaseId: 10,
      lease: { listing: { hostId: "host-1" } },
    } as never);
    mockDb.user.findUnique.mockResolvedValue({ role: "USER" } as never);
    mockDb.payment.update.mockResolvedValue({ id: 1 } as never);

    const result = await updatePaymentStatus(1, PaymentStatus.Paid);
    expect(result).toHaveProperty("success", true);
  });

  it("allows admin to update status", async () => {
    mockAuth.mockResolvedValue(adminSession as never);
    mockDb.payment.findUnique.mockResolvedValue({
      id: 1,
      leaseId: 10,
      lease: { listing: { hostId: "host-1" } },
    } as never);
    mockDb.user.findUnique.mockResolvedValue({ role: "ADMIN" } as never);
    mockDb.payment.update.mockResolvedValue({ id: 1 } as never);

    const result = await updatePaymentStatus(1, PaymentStatus.Overdue);
    expect(result).toHaveProperty("success", true);
  });
});

// ============================================
// markOverduePayments
// ============================================

describe("markOverduePayments", () => {
  it("marks pending and partially-paid past-due payments as overdue", async () => {
    mockDb.payment.updateMany.mockResolvedValue({ count: 3 } as never);

    const result = await markOverduePayments();

    expect(result).toEqual({ success: true, updatedCount: 3 });
    const where = mockDb.payment.updateMany.mock.calls[0][0].where;
    expect(where?.paymentStatus).toEqual({
      in: [PaymentStatus.Pending, PaymentStatus.PartiallyPaid],
    });
  });

  it("returns zero when no overdue payments", async () => {
    mockDb.payment.updateMany.mockResolvedValue({ count: 0 } as never);

    const result = await markOverduePayments();
    expect(result).toEqual({ success: true, updatedCount: 0 });
  });
});

// ============================================
// getPaymentSummary
// ============================================

describe("getPaymentSummary", () => {
  it("throws when no user ID available", async () => {
    mockAuth.mockResolvedValue({ user: {} } as never);

    await expect(getPaymentSummary()).rejects.toThrow("User ID is required");
  });

  it("calculates correct summary using aggregates", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);

    // The function now uses Promise.all with aggregate + count
    mockDb.payment.aggregate
      .mockResolvedValueOnce({ _sum: { amountDue: 2300, amountPaid: 1200 } } as never) // totals
      .mockResolvedValueOnce({ _sum: { amountDue: 500, amountPaid: 200 } } as never); // overdue
    mockDb.payment.count.mockResolvedValue(1 as never); // upcoming

    const result = await getPaymentSummary();

    expect(result.totalDue).toBe(2300);
    expect(result.totalPaid).toBe(1200);
    expect(result.balance).toBe(1100);
    expect(result.overdueAmount).toBe(300);
    expect(result.upcomingPayments).toBe(1);
  });
});

// ============================================
// generateMonthlyPayments
// ============================================

describe("generateMonthlyPayments", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(generateMonthlyPayments(1)).rejects.toThrow("logged in");
  });

  it("throws for invalid lease ID", async () => {
    mockAuth.mockResolvedValue(hostSession as never);

    await expect(generateMonthlyPayments(0)).rejects.toThrow("Invalid lease ID");
  });

  it("throws when only tenant tries (not host)", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    mockDb.lease.findUnique.mockResolvedValue({
      id: 1,
      listing: { hostId: "host-1" },
    } as never);

    await expect(generateMonthlyPayments(1)).rejects.toThrow("Only the host");
  });

  it("generates monthly payments for lease duration via createMany", async () => {
    mockAuth.mockResolvedValue(hostSession as never);
    const start = new Date("2025-01-01");
    const end = new Date("2025-03-01");
    mockDb.lease.findUnique.mockResolvedValue({
      id: 1,
      startDate: start,
      endDate: end,
      rent: 1000,
      listing: { hostId: "host-1" },
    } as never);
    mockDb.payment.createMany.mockResolvedValue({ count: 3 } as never);

    const result = await generateMonthlyPayments(1);

    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("count", 3);
    expect(mockDb.payment.createMany).toHaveBeenCalledTimes(1);
    // Verify the data array has 3 entries (Jan, Feb, Mar)
    const createData = mockDb.payment.createMany.mock.calls[0][0].data;
    expect(createData).toHaveLength(3);
  });
});

// ============================================
// Stripe placeholders
// ============================================

describe("Stripe integration stubs", () => {
  it("createStripePaymentIntent throws not implemented", async () => {
    await expect(
      createStripePaymentIntent({ amount: 100, paymentId: 1 })
    ).rejects.toThrow("not yet implemented");
  });

  it("handleStripeWebhook throws not implemented", async () => {
    await expect(handleStripeWebhook("payload", "sig")).rejects.toThrow("not yet implemented");
  });

  it("processRefund throws not implemented", async () => {
    mockAuth.mockResolvedValue(hostSession as never);

    await expect(processRefund({ paymentId: 1, amount: 50 })).rejects.toThrow("not yet implemented");
  });
});

// ============================================
// generateInvoice
// ============================================

describe("generateInvoice", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(generateInvoice(1)).rejects.toThrow("logged in");
  });

  it("throws for invalid payment ID", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);

    await expect(generateInvoice("abc")).rejects.toThrow("Invalid payment ID");
  });

  it("returns invoice data for authorized user", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    mockDb.payment.findUnique.mockResolvedValue({
      id: 1,
      amountDue: 1000,
      amountPaid: 500,
      dueDate: new Date("2025-06-01"),
      paymentStatus: PaymentStatus.PartiallyPaid,
      lease: {
        tenantId: "tenant-1",
        listing: {
          title: "Nice Flat",
          hostId: "host-1",
          host: { id: "host-1", email: "host@test.com", username: "hostman" },
          location: { address: "123 St", city: "Riyadh", state: "Riyadh" },
        },
        tenant: { name: "Tenant", email: "tenant@test.com" },
      },
    } as never);

    const invoice = await generateInvoice(1);

    expect(invoice).toHaveProperty("invoiceNumber", "INV-000001");
    expect(invoice.balanceDue).toBe(500);
    expect(invoice.property.title).toBe("Nice Flat");
  });
});
