import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized } from "@/lib/cron-auth";
import { generateMonthlyPaymentsForAllLeases } from "@/lib/actions/payment-actions";

/**
 * Monthly cron — creates the next Payment row for every active lease that
 * doesn't already have one in the next 30 days. Gated the same way as
 * `mark-overdue`. Schedule: `0 1 1 * *` (01:00 UTC on the 1st).
 */
export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;

  try {
    const result = await generateMonthlyPaymentsForAllLeases();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
