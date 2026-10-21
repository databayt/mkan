import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized } from "@/lib/cron-auth";
import { completeElapsedBookings } from "@/lib/actions/booking-actions";

/**
 * Daily cron — closes out stays whose checkout date has passed.
 *
 * Without this the homes vertical had no writer for `BookingStatus.Completed`
 * at all: the "Completed Rentals" stage of the marketplace funnel was
 * unreachable, and `createReview` (which requires a completed stay) could never
 * fire. Travel already did the equivalent through QR check-in.
 *
 * Gated by the `CRON_SECRET` Bearer token (`cronUnauthorized`): the
 * Cloudflare Worker sends it on the schedule, and a manual curl can too.
 *
 * Schedule lives in `vercel.json` at `0 5 * * *` (05:00 UTC daily) — after
 * `release-seats` and `topup-trips` so the nightly jobs don't contend.
 */
export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;

  try {
    const result = await completeElapsedBookings();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
