import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized } from "@/lib/cron-auth";
import { markOverduePayments } from "@/lib/actions/payment-actions";

/**
 * Daily cron — flips Pending payments past their due date to Overdue.
 * Gated by the `CRON_SECRET` Bearer token (`cronUnauthorized`): the
 * Cloudflare Worker sends it on the schedule, and a manual curl can too.
 *
 * Schedule lives in `vercel.json` at `0 2 * * *` (02:00 UTC daily).
 */
export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;

  try {
    const result = await markOverduePayments();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
