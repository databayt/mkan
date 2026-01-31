"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { PaymentStatus } from "@prisma/client";

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

export async function createPayment(data: CreatePaymentData) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to create a payment");
  }

  const { leaseId, amountDue, dueDate } = data;

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

    // Only host or tenant can create payments
    if (lease.listing.hostId !== session.user.id && lease.tenantId !== session.user.id) {
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
    console.error("Error creating payment:", error);
    throw new Error(
      `Failed to create payment: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// GET PAYMENTS
// ============================================

export async function getPayment(paymentId: number) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to view payment details");
  }

  try {
    const payment = await db.payment.findUnique({
      where: { id: paymentId },
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
      payment.lease.listing.hostId !== session.user.id &&
      payment.lease.tenantId !== session.user.id
    ) {
      throw new Error("You don't have permission to view this payment");
    }

    return payment;
  } catch (error) {
    console.error("Error fetching payment:", error);
    throw new Error(
      `Failed to fetch payment: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function getLeasePayments(leaseId: number) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to view payments");
  }

  try {
    // Verify lease access
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

    if (lease.listing.hostId !== session.user.id && lease.tenantId !== session.user.id) {
      throw new Error("You don't have permission to view payments for this lease");
    }

    const payments = await db.payment.findMany({
      where: { leaseId },
      orderBy: { dueDate: "asc" },
    });

    return payments;
  } catch (error) {
    console.error("Error fetching lease payments:", error);
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

  // Only allow viewing own payments unless admin
  if (userId && userId !== session?.user?.id) {
    const currentUser = await db.user.findUnique({
      where: { id: session?.user?.id },
      select: { role: true },
    });
    if (currentUser?.role !== "ADMIN") {
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
    console.error("Error fetching user payments:", error);
    throw new Error(
      `Failed to fetch payments: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// PROCESS PAYMENT
// ============================================

export async function processPayment(data: ProcessPaymentData) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to process a payment");
  }

  const { paymentId, amountPaid } = data;

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
    console.error("Error processing payment:", error);
    throw new Error(
      `Failed to process payment: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// UPDATE PAYMENT STATUS
// ============================================

export async function updatePaymentStatus(paymentId: number, status: PaymentStatus) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to update payment status");
  }

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

    // Only host or admin can update payment status
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (payment.lease.listing.hostId !== session.user.id && user?.role !== "ADMIN") {
      throw new Error("You don't have permission to update this payment");
    }

    const updatedPayment = await db.payment.update({
      where: { id: paymentId },
      data: { paymentStatus: status },
    });

    revalidatePath(`/leases/${payment.leaseId}`);

    return { success: true, payment: updatedPayment };
  } catch (error) {
    console.error("Error updating payment status:", error);
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
    console.error("Error marking overdue payments:", error);
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
    const payments = await db.payment.findMany({
      where: {
        lease: {
          tenantId: targetUserId,
        },
      },
    });

    const now = new Date();
    let totalDue = 0;
    let totalPaid = 0;
    let overdueAmount = 0;
    let upcomingPayments = 0;

    payments.forEach((payment) => {
      totalDue += payment.amountDue;
      totalPaid += payment.amountPaid;

      if (payment.paymentStatus === PaymentStatus.Overdue) {
        overdueAmount += payment.amountDue - payment.amountPaid;
      }

      if (
        payment.dueDate > now &&
        payment.paymentStatus !== PaymentStatus.Paid
      ) {
        upcomingPayments++;
      }
    });

    return {
      totalDue,
      totalPaid,
      balance: totalDue - totalPaid,
      overdueAmount,
      upcomingPayments,
    };
  } catch (error) {
    console.error("Error getting payment summary:", error);
    throw new Error(
      `Failed to get payment summary: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// GENERATE RECURRING PAYMENTS
// ============================================

export async function generateMonthlyPayments(leaseId: number) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in");
  }

  try {
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

    // Only host can generate payments
    if (lease.listing.hostId !== session.user.id) {
      throw new Error("Only the host can generate payments");
    }

    const startDate = new Date(lease.startDate);
    const endDate = new Date(lease.endDate);
    const payments = [];

    // Generate monthly payments
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const payment = await db.payment.create({
        data: {
          leaseId,
          amountDue: lease.rent,
          amountPaid: 0,
          dueDate: new Date(currentDate),
          paymentDate: new Date(currentDate),
          paymentStatus: PaymentStatus.Pending,
        },
      });
      payments.push(payment);

      // Move to next month
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    revalidatePath(`/leases/${leaseId}`);

    return { success: true, payments };
  } catch (error) {
    console.error("Error generating payments:", error);
    throw new Error(
      `Failed to generate payments: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// ============================================
// STRIPE INTEGRATION PLACEHOLDERS
// ============================================

export async function createStripePaymentIntent(data: {
  amount: number;
  currency?: string;
  paymentId: number;
}) {
  // TODO: Implement Stripe payment intent creation
  // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  // const paymentIntent = await stripe.paymentIntents.create({
  //   amount: data.amount * 100, // Convert to cents
  //   currency: data.currency || 'usd',
  //   metadata: { paymentId: data.paymentId.toString() },
  // });
  // return paymentIntent;

  throw new Error("Stripe integration not yet implemented. Please configure STRIPE_SECRET_KEY.");
}

export async function handleStripeWebhook(payload: string, signature: string) {
  // TODO: Implement Stripe webhook handler
  // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  // const event = stripe.webhooks.constructEvent(
  //   payload,
  //   signature,
  //   process.env.STRIPE_WEBHOOK_SECRET!
  // );
  //
  // switch (event.type) {
  //   case 'payment_intent.succeeded':
  //     // Update payment status
  //     break;
  //   case 'payment_intent.payment_failed':
  //     // Handle failure
  //     break;
  // }

  throw new Error("Stripe webhook handler not yet implemented.");
}

export async function processRefund(data: RefundData) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to process a refund");
  }

  // TODO: Implement Stripe refund
  // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  // const refund = await stripe.refunds.create({
  //   payment_intent: paymentIntentId,
  //   amount: data.amount * 100,
  // });

  throw new Error("Refund processing not yet implemented. Please configure Stripe.");
}

// ============================================
// INVOICE GENERATION
// ============================================

export async function generateInvoice(paymentId: number) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("You must be logged in to generate an invoice");
  }

  try {
    const payment = await db.payment.findUnique({
      where: { id: paymentId },
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
      payment.lease.listing.hostId !== session.user.id &&
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
    console.error("Error generating invoice:", error);
    throw new Error(
      `Failed to generate invoice: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
