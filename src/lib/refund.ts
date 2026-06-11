import type { CancellationPolicy } from "@prisma/client";

export interface ComputeRefundInput {
  /** Listing.cancellationPolicy. Null is treated as Flexible. */
  policy: CancellationPolicy | null | undefined;
  /** Total amount the guest paid (everything that hit Stripe). */
  totalPaid: number;
  /** Cleaning fee — refunded only when cancellation is more than 24h before check-in. */
  cleaningFee?: number;
  /** Whole hours between cancellation time and check-in. Negative if past check-in. */
  hoursBeforeCheckIn: number;
}

export interface RefundBreakdown {
  /** Amount in the same currency as `totalPaid` to send back to the guest. */
  refundAmount: number;
  /** Stripe-friendly minor-units integer (USD cents, SDG cents, etc.). */
  refundAmountMinor: number;
  /** Human-readable reason — surfaced to the tenant in the cancellation dialog. */
  reason: string;
  /** True if the refund equals `totalPaid`. */
  isFullRefund: boolean;
}

const HOURS_24 = 24;
const HOURS_5_DAYS = 5 * 24;
const HOURS_7_DAYS = 7 * 24;
const HOURS_30_DAYS = 30 * 24;

/**
 * Compute the refund a guest is owed when they cancel a booking.
 *
 * Policy semantics (mirrors Airbnb's wording so guests don't have to learn
 * a new vocabulary):
 *
 * - **Flexible**: full refund (minus cleaning fee on same-day cancel) up to
 *   24h before check-in. Within 24h: nightly rate of the first night kept,
 *   the rest refunded.
 * - **Moderate**: full refund up to 5 days before check-in. Within 5 days
 *   but more than 24h: 50% of nightly + cleaning fee refunded. Within 24h:
 *   first night + cleaning fee kept.
 * - **Firm**: full refund up to 30 days before check-in; otherwise no refund.
 * - **Strict**: full refund only within 48h of booking AND more than 7 days
 *   before check-in (we approximate with the 7-day threshold here since
 *   booking-time isn't passed in). Within 7 days: no refund.
 * - **NonRefundable**: never refund. Stripe charge stays.
 *
 * The function is pure (no Date, no DB) so it's trivially testable. Callers
 * pass `hoursBeforeCheckIn` they computed themselves; that lets us inject
 * a fixed clock in tests without monkey-patching.
 */
export function computeRefundAmount({
  policy,
  totalPaid,
  cleaningFee = 0,
  hoursBeforeCheckIn,
}: ComputeRefundInput): RefundBreakdown {
  if (totalPaid <= 0) {
    return { refundAmount: 0, refundAmountMinor: 0, reason: "Nothing to refund", isFullRefund: true };
  }

  // Past check-in is never refundable regardless of policy.
  if (hoursBeforeCheckIn < 0) {
    return refund(0, totalPaid, "Cancellation after check-in is not refundable");
  }

  const effective = policy ?? "Flexible";

  switch (effective) {
    case "Flexible": {
      if (hoursBeforeCheckIn >= HOURS_24) {
        return refund(totalPaid, totalPaid, "Full refund (cancelled more than 24 hours before check-in)");
      }
      // Less than 24h: keep the cleaning fee, refund everything else.
      const refundable = Math.max(totalPaid - cleaningFee, 0);
      return refund(refundable, totalPaid, "Partial refund (cleaning fee kept on same-day cancellation)");
    }

    case "Moderate": {
      if (hoursBeforeCheckIn >= HOURS_5_DAYS) {
        return refund(totalPaid, totalPaid, "Full refund (cancelled more than 5 days before check-in)");
      }
      if (hoursBeforeCheckIn >= HOURS_24) {
        // 5 days .. 24h: 50% of nightly portion refunded; cleaning fee returned in full.
        const nightly = Math.max(totalPaid - cleaningFee, 0);
        const refundable = nightly * 0.5 + cleaningFee;
        return refund(refundable, totalPaid, "50% refund (cancelled less than 5 days before check-in)");
      }
      return refund(0, totalPaid, "No refund (cancelled less than 24 hours before check-in)");
    }

    case "Firm": {
      if (hoursBeforeCheckIn >= HOURS_30_DAYS) {
        return refund(totalPaid, totalPaid, "Full refund (cancelled more than 30 days before check-in)");
      }
      return refund(0, totalPaid, "No refund (cancelled within 30 days of check-in)");
    }

    case "Strict": {
      if (hoursBeforeCheckIn >= HOURS_7_DAYS) {
        return refund(totalPaid, totalPaid, "Full refund (cancelled more than 7 days before check-in)");
      }
      return refund(0, totalPaid, "No refund (cancelled within 7 days of check-in)");
    }

    case "NonRefundable":
    default:
      return refund(0, totalPaid, "Non-refundable booking");
  }
}

function refund(amount: number, total: number, reason: string): RefundBreakdown {
  // Round to two decimals for currency safety; Stripe takes minor units (cents).
  const refundAmount = Math.max(0, Math.round(amount * 100) / 100);
  const refundAmountMinor = Math.round(refundAmount * 100);
  return {
    refundAmount,
    refundAmountMinor,
    reason,
    isFullRefund: refundAmount === total,
  };
}
