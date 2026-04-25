"use server";

import { z } from "zod";
import Stripe from "stripe";
import { auth, canOverride, isAdminOrSuper } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { PaymentStatus } from "@prisma/client";
import { logger } from "@/lib/logger";

// Stripe is initialized lazily so a missing key only fails the actions
// that need it, not module load (which would break unrelated payment
// reads). Throw a clear error at first call site.
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(key, { apiVersion: "2026-04-22.dahlia" });
}

const createPaymentSchema = z.object({
  leaseId: z.number().int().positive(),
  amountDue: z.number().positive(),
  dueDate: z.coerce.date(),
});

const processPaymentSchema = z.object({
  paymentId: z.number().int().positive(),
  amountPaid: z.number().positive(),
  paymentMethod: z.string().optional(),
  stripePaymentIntentId: z.string().optional(),
});

const paymentIdSchema = z.number().int().positive();
const leaseIdSchema = z.number().int().positive();

// ============================================
// TYPES
// ============================================

export interface CreatePaymentData {
  leaseId: number;
  amountDue: number;
  dueDate: Date;
}

export interface ProcessPaymentData {
  paymentId: number;
  amountPaid: number;
  paymentMethod?: string;
  stripePaymentIntentId?: string;
}

export interface RefundData {
  paymentId: number;
  amount: number;
  reason?: string;
}

export interface PaymentSummary {
  totalDue: number;
  totalPaid: number;
  balance: number;
  overdueAmount: number;
  upcomingPayments: number;
}

// ============================================
// CREATE PAYMENT
// ============================================

export async function createPayment(data: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to create a payment");
  }

  const parsed = createPaymentSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Invalid payment data");
  }

  const { leaseId, amountDue, dueDate } = parsed.data;

  try {
    // Verify lease exists and user has permission
    const lease = await db.lease.findUnique({
      where: { id: leaseId },
      include: {
        listing: {
          select: { hostId: true },
        },
      },
    });

    if (!lease) {
      throw new Error("Lease not found");
    }

    // Only host, tenant, or platform admin can create payments
    if (!canOverride(session, lease.listing.hostId) && lease.tenantId !== session.user.id) {
      throw new Error("You don't have permission to create payments for this lease");
    }

    const payment = await db.payment.create({
      data: {
        leaseId,
        amountDue,
        amountPaid: 0,
        dueDate,
        paymentDate: new Date(),
        paymentStatus: PaymentStatus.Pending,
      },
    });

    revalidatePath(`/leases/${leaseId}`);

    return { success: true, payment };
  } catch (error) {
    logger.error("Error creating payment:", error);
    throw new Error(
      `Failed to create payment: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// GET PAYMENTS
// ============================================

export async function getPayment(paymentId: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to view payment details");
  }

  const parsedId = paymentIdSchema.safeParse(paymentId);
  if (!parsedId.success) {
    throw new Error("Invalid payment ID");
  }

  try {
    const payment = await db.payment.findUnique({
      where: { id: parsedId.data },
      include: {
        lease: {
          include: {
            listing: {
              select: {
                id: true,
                title: true,
                hostId: true,
              },
            },
            tenant: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!payment) {
      throw new Error("Payment not found");
    }

    // Verify permission
    if (
      !canOverride(session, payment.lease.listing.hostId) &&
      payment.lease.tenantId !== session.user.id
    ) {
      throw new Error("You don't have permission to view this payment");
    }

    return payment;
  } catch (error) {
    logger.error("Error fetching payment:", error);
    throw new Error(
      `Failed to fetch payment: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function getLeasePayments(leaseId: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to view payments");
  }

  const parsedId = leaseIdSchema.safeParse(leaseId);
  if (!parsedId.success) {
    throw new Error("Invalid lease ID");
  }

  try {
    // Verify lease access
    const lease = await db.lease.findUnique({
      where: { id: parsedId.data },
      include: {
        listing: {
          select: { hostId: true },
        },
      },
    });

    if (!lease) {
      throw new Error("Lease not found");
    }

    if (!canOverride(session, lease.listing.hostId) && lease.tenantId !== session.user.id) {
      throw new Error("You don't have permission to view payments for this lease");
    }

    const payments = await db.payment.findMany({
      where: { leaseId: parsedId.data },
      orderBy: { dueDate: "asc" },
    });

    return payments;
  } catch (error) {
    logger.error("Error fetching lease payments:", error);
    throw new Error(
      `Failed to fetch payments: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function getUserPayments(userId?: string) {
  const session = await auth();
  const targetUserId = userId || session?.user?.id;

  if (!targetUserId) {
    throw new Error("User ID is required");
  }

  // Only allow viewing own payments unless admin or super admin
  if (userId && userId !== session?.user?.id) {
    if (!isAdminOrSuper(session)) {
      throw new Error("You can only view your own payments");
    }
  }

  try {
    const payments = await db.payment.findMany({
      where: {
        lease: {
          tenantId: targetUserId,
        },
      },
      include: {
        lease: {
          include: {
            listing: {
              select: {
                id: true,
                title: true,
                location: {
                  select: {
                    city: true,
                    state: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { dueDate: "desc" },
    });

    return payments;
  } catch (error) {
    logger.error("Error fetching user payments:", error);
    throw new Error(
      `Failed to fetch payments: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// PROCESS PAYMENT
// ============================================

export async function processPayment(data: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to process a payment");
  }

  const parsed = processPaymentSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Invalid payment data");
  }

  const { paymentId, amountPaid } = parsed.data;

  try {
    const payment = await db.payment.findUnique({
      where: { id: paymentId },
      include: {
        lease: {
          include: {
            listing: {
              select: { hostId: true },
            },
          },
        },
      },
    });

    if (!payment) {
      throw new Error("Payment not found");
    }

    // Only tenant can make payments
    if (payment.lease.tenantId !== session.user.id) {
      throw new Error("Only the tenant can make payments");
    }

    // Calculate new total paid
    const newAmountPaid = payment.amountPaid + amountPaid;

    // Determine new status
    let newStatus: PaymentStatus;
    if (newAmountPaid >= payment.amountDue) {
      newStatus = PaymentStatus.Paid;
    } else if (newAmountPaid > 0) {
      newStatus = PaymentStatus.PartiallyPaid;
    } else {
      newStatus = PaymentStatus.Pending;
    }

    const updatedPayment = await db.payment.update({
      where: { id: paymentId },
      data: {
        amountPaid: newAmountPaid,
        paymentStatus: newStatus,
        paymentDate: new Date(),
      },
    });

    revalidatePath(`/leases/${payment.leaseId}`);
    revalidatePath("/tenants/payments");

    return { success: true, payment: updatedPayment };
  } catch (error) {
    logger.error("Error processing payment:", error);
    throw new Error(
      `Failed to process payment: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// UPDATE PAYMENT STATUS
// ============================================

export async function updatePaymentStatus(paymentId: unknown, status: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to update payment status");
  }

  const parsedId = paymentIdSchema.safeParse(paymentId);
  const parsedStatus = z.enum(PaymentStatus).safeParse(status);
  if (!parsedId.success || !parsedStatus.success) {
    throw new Error("Invalid input");
  }

  try {
    const payment = await db.payment.findUnique({
      where: { id: parsedId.data },
      include: {
        lease: {
          include: {
            listing: {
              select: { hostId: true },
            },
          },
        },
      },
    });

    if (!payment) {
      throw new Error("Payment not found");
    }

    // Only host, admin, or super admin can update payment status
    if (!canOverride(session, payment.lease.listing.hostId)) {
      throw new Error("You don't have permission to update this payment");
    }

    const updatedPayment = await db.payment.update({
      where: { id: parsedId.data },
      data: { paymentStatus: parsedStatus.data },
    });

    revalidatePath(`/leases/${payment.leaseId}`);

    return { success: true, payment: updatedPayment };
  } catch (error) {
    logger.error("Error updating payment status:", error);
    throw new Error(
      `Failed to update payment status: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// MARK OVERDUE PAYMENTS
// ============================================

export async function markOverduePayments() {
  // This should be called by a cron job
  try {
    const now = new Date();

    const result = await db.payment.updateMany({
      where: {
        dueDate: { lt: now },
        paymentStatus: {
          in: [PaymentStatus.Pending, PaymentStatus.PartiallyPaid],
        },
      },
      data: {
        paymentStatus: PaymentStatus.Overdue,
      },
    });

    return { success: true, updatedCount: result.count };
  } catch (error) {
    logger.error("Error marking overdue payments:", error);
    throw new Error(
      `Failed to mark overdue payments: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// PAYMENT SUMMARY
// ============================================

export async function getPaymentSummary(userId?: string): Promise<PaymentSummary> {
  const session = await auth();
  const targetUserId = userId || session?.user?.id;

  if (!targetUserId) {
    throw new Error("User ID is required");
  }

  try {
    const tenantFilter = { lease: { tenantId: targetUserId } };
    const now = new Date();

    const [totals, overdueAgg, upcomingCount] = await Promise.all([
      db.payment.aggregate({
        where: tenantFilter,
        _sum: { amountDue: true, amountPaid: true },
      }),
      db.payment.aggregate({
        where: { ...tenantFilter, paymentStatus: PaymentStatus.Overdue },
        _sum: { amountDue: true, amountPaid: true },
      }),
      db.payment.count({
        where: {
          ...tenantFilter,
          dueDate: { gt: now },
          paymentStatus: { not: PaymentStatus.Paid },
        },
      }),
    ]);

    const totalDue = totals._sum.amountDue ?? 0;
    const totalPaid = totals._sum.amountPaid ?? 0;
    const overdueDue = overdueAgg._sum.amountDue ?? 0;
    const overduePaid = overdueAgg._sum.amountPaid ?? 0;

    return {
      totalDue,
      totalPaid,
      balance: totalDue - totalPaid,
      overdueAmount: overdueDue - overduePaid,
      upcomingPayments: upcomingCount,
    };
  } catch (error) {
    logger.error("Error getting payment summary:", error);
    throw new Error(
      `Failed to get payment summary: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// GENERATE RECURRING PAYMENTS
// ============================================

export async function generateMonthlyPayments(leaseId: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in");
  }

  const parsedId = leaseIdSchema.safeParse(leaseId);
  if (!parsedId.success) {
    throw new Error("Invalid lease ID");
  }

  try {
    const lease = await db.lease.findUnique({
      where: { id: parsedId.data },
      include: {
        listing: {
          select: { hostId: true },
        },
      },
    });

    if (!lease) {
      throw new Error("Lease not found");
    }

    // Only host (or platform admin) can generate payments
    if (!canOverride(session, lease.listing.hostId)) {
      throw new Error("Only the host can generate payments");
    }

    const startDate = new Date(lease.startDate);
    const endDate = new Date(lease.endDate);
    const paymentData = [];

    // Build payment records
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      paymentData.push({
        leaseId: parsedId.data,
        amountDue: lease.rent,
        amountPaid: 0,
        dueDate: new Date(currentDate),
        paymentDate: new Date(currentDate),
        paymentStatus: PaymentStatus.Pending,
      });
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    // Batch create all payments at once
    const result = await db.payment.createMany({ data: paymentData });

    revalidatePath(`/leases/${parsedId.data}`);

    return { success: true, count: result.count };
  } catch (error) {
    logger.error("Error generating payments:", error);
    throw new Error(
      `Failed to generate payments: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// Cron-friendly variant: iterates every active lease and creates the next
// month's Payment row if one isn't already present. Skips auth checks
// because it's only reachable behind the CRON_SECRET header check in
// `/api/cron/generate-monthly/route.ts`.
export async function generateMonthlyPaymentsForAllLeases() {
  const now = new Date();
  const horizonEnd = new Date(now);
  horizonEnd.setMonth(horizonEnd.getMonth() + 1);

  const leases = await db.lease.findMany({
    where: {
      startDate: { lte: now },
      endDate: { gte: now },
    },
    select: {
      id: true,
      rent: true,
      startDate: true,
      endDate: true,
      payments: {
        where: {
          dueDate: { gte: now, lte: horizonEnd },
        },
        select: { id: true },
      },
    },
  });

  // Build the batch of payments to create — one per lease that doesn't
  // already have a payment in the next month. A single createMany avoids
  // N+1 round-trips for large lease portfolios (was one INSERT per lease).
  const paymentsToCreate: Array<{
    leaseId: number;
    amountDue: number;
    amountPaid: number;
    dueDate: Date;
    paymentDate: Date;
    paymentStatus: PaymentStatus;
  }> = [];

  for (const lease of leases) {
    if (lease.payments.length > 0) continue;

    // Due date is the same day-of-month as the lease start, bumped forward
    // to the next occurrence in the future.
    const due = new Date(lease.startDate);
    while (due < now) {
      due.setMonth(due.getMonth() + 1);
    }
    if (due > new Date(lease.endDate)) continue;

    paymentsToCreate.push({
      leaseId: lease.id,
      amountDue: lease.rent,
      amountPaid: 0,
      dueDate: due,
      paymentDate: due,
      paymentStatus: PaymentStatus.Pending,
    });
  }

  let created = 0;
  if (paymentsToCreate.length > 0) {
    const result = await db.payment.createMany({ data: paymentsToCreate });
    created = result.count;
  }

  return { success: true, created, scanned: leases.length };
}

// ============================================
// STRIPE INTEGRATION
// ============================================

const stripeIntentSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().min(3).max(3).default("usd"),
  paymentId: z.number().int().positive(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export async function createStripePaymentIntent(input: unknown) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: "unauthorized" };
  }

  const parsed = stripeIntentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "invalid", issues: parsed.error.issues };
  }

  const data = parsed.data;
  const payment = await db.payment.findUnique({ where: { id: data.paymentId } });
  if (!payment) {
    return { ok: false as const, error: "not_found" };
  }

  try {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(data.amount * 100),
      currency: data.currency,
      metadata: {
        kind: "lease_payment",
        paymentId: String(data.paymentId),
        ...(data.metadata ?? {}),
      },
      automatic_payment_methods: { enabled: true },
    });

    logger.info("stripe_intent_created", {
      paymentId: data.paymentId,
      intentId: intent.id,
      amount: data.amount,
    });

    return { ok: true as const, clientSecret: intent.client_secret, intentId: intent.id };
  } catch (err) {
    logger.error("stripe_intent_failed", { paymentId: data.paymentId, error: String(err) });
    return { ok: false as const, error: "stripe_error" };
  }
}

export async function handleStripeWebhook(payload: string, signature: string) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return { ok: false as const, error: "webhook_secret_missing" };
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, secret);
  } catch (err) {
    logger.warn("stripe_webhook_signature_invalid", { error: String(err) });
    return { ok: false as const, error: "invalid_signature" };
  }

  // Idempotency: skip if event already processed.
  // We use Payment.transactionId / TransportPayment.transactionId as the
  // store of the Stripe charge id. A second delivery of the same event
  // is a no-op.
  switch (event.type) {
    case "payment_intent.succeeded": {
      const intent = event.data.object;
      const kind = intent.metadata?.kind;
      const paymentId = intent.metadata?.paymentId;
      const transportPaymentId = intent.metadata?.transportPaymentId;

      if (kind === "lease_payment" && paymentId) {
        await db.payment.update({
          where: { id: Number(paymentId) },
          data: {
            paymentStatus: PaymentStatus.Paid,
            amountPaid: intent.amount_received / 100,
            paymentDate: new Date(),
          },
        });
        logger.info("stripe_lease_payment_paid", { paymentId, intentId: intent.id });
      } else if (kind === "transport_booking" && transportPaymentId) {
        await db.transportPayment.update({
          where: { id: Number(transportPaymentId) },
          data: {
            status: "Paid",
            transactionId: intent.id,
            paidAt: new Date(),
          },
        });
        logger.info("stripe_transport_paid", { transportPaymentId, intentId: intent.id });
      } else {
        logger.warn("stripe_intent_unknown_kind", { kind, intentId: intent.id });
      }
      break;
    }
    case "payment_intent.payment_failed": {
      const intent = event.data.object;
      const paymentId = intent.metadata?.paymentId;
      const transportPaymentId = intent.metadata?.transportPaymentId;
      if (paymentId) {
        await db.payment.update({
          where: { id: Number(paymentId) },
          data: { paymentStatus: PaymentStatus.Overdue },
        });
      }
      if (transportPaymentId) {
        await db.transportPayment.update({
          where: { id: Number(transportPaymentId) },
          data: { status: "Failed" },
        });
      }
      logger.warn("stripe_payment_failed", { paymentId, transportPaymentId, intentId: intent.id });
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object;
      const paymentId = charge.metadata?.paymentId;
      const transportPaymentId = charge.metadata?.transportPaymentId;
      if (paymentId) {
        await db.payment.update({
          where: { id: Number(paymentId) },
          data: { paymentStatus: PaymentStatus.Pending },
        });
      }
      if (transportPaymentId) {
        await db.transportPayment.update({
          where: { id: Number(transportPaymentId) },
          data: { status: "Refunded" },
        });
      }
      logger.info("stripe_refunded", { paymentId, transportPaymentId, chargeId: charge.id });
      break;
    }
    default:
      logger.info("stripe_event_unhandled", { type: event.type, id: event.id });
  }

  return { ok: true as const };
}

export async function processRefund(input: unknown) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: "unauthorized" };
  }

  if (!isAdminOrSuper(session)) {
    return { ok: false as const, error: "forbidden" };
  }

  const parsed = z
    .object({
      paymentIntentId: z.string().startsWith("pi_"),
      amount: z.number().positive().optional(),
      reason: z.string().optional(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "invalid", issues: parsed.error.issues };
  }

  try {
    const stripe = getStripe();
    const refund = await stripe.refunds.create({
      payment_intent: parsed.data.paymentIntentId,
      amount: parsed.data.amount ? Math.round(parsed.data.amount * 100) : undefined,
      reason: parsed.data.reason as Stripe.RefundCreateParams.Reason | undefined,
    });

    logger.info("stripe_refund_created", {
      intentId: parsed.data.paymentIntentId,
      refundId: refund.id,
      amount: refund.amount / 100,
    });

    return { ok: true as const, refundId: refund.id, amount: refund.amount / 100 };
  } catch (err) {
    logger.error("stripe_refund_failed", { error: String(err) });
    return { ok: false as const, error: "stripe_error" };
  }
}

// ============================================
// INVOICE GENERATION
// ============================================

export async function generateInvoice(paymentId: unknown) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to generate an invoice");
  }

  const parsedId = paymentIdSchema.safeParse(paymentId);
  if (!parsedId.success) {
    throw new Error("Invalid payment ID");
  }

  try {
    const payment = await db.payment.findUnique({
      where: { id: parsedId.data },
      include: {
        lease: {
          include: {
            listing: {
              include: {
                host: {
                  select: {
                    id: true,
                    email: true,
                    username: true,
                  },
                },
                location: true,
              },
            },
            tenant: true,
          },
        },
      },
    });

    if (!payment) {
      throw new Error("Payment not found");
    }

    // Verify permission
    if (
      !canOverride(session, payment.lease.listing.hostId) &&
      payment.lease.tenantId !== session.user.id
    ) {
      throw new Error("You don't have permission to generate this invoice");
    }

    // Generate invoice data
    const invoice = {
      invoiceNumber: `INV-${payment.id.toString().padStart(6, "0")}`,
      date: new Date().toISOString(),
      dueDate: payment.dueDate.toISOString(),
      status: payment.paymentStatus,
      property: {
        title: payment.lease.listing.title,
        address: payment.lease.listing.location
          ? `${payment.lease.listing.location.address}, ${payment.lease.listing.location.city}, ${payment.lease.listing.location.state}`
          : "N/A",
      },
      tenant: {
        name: payment.lease.tenant.name,
        email: payment.lease.tenant.email,
      },
      host: {
        name: payment.lease.listing.host.username || "Host",
        email: payment.lease.listing.host.email,
      },
      lineItems: [
        {
          description: `Rent for ${new Date(payment.dueDate).toLocaleDateString("en-US", { month: "long", year: "numeric" })}`,
          amount: payment.amountDue,
        },
      ],
      subtotal: payment.amountDue,
      total: payment.amountDue,
      amountPaid: payment.amountPaid,
      balanceDue: payment.amountDue - payment.amountPaid,
    };

    return invoice;
  } catch (error) {
    logger.error("Error generating invoice:", error);
    throw new Error(
      `Failed to generate invoice: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
