import { NextRequest, NextResponse } from "next/server";
import { completeElapsedBookings } from "@/lib/actions/booking-actions";

/**
 * Daily cron — closes out stays whose checkout date has passed.
 *
 * Without this the homes vertical had no writer for `BookingStatus.Completed`
 * at all: the "Completed Rentals" stage of the marketplace funnel was
 * unreachable, and `createReview` (which requires a completed stay) could never
 * fire. Travel already did the equivalent through QR check-in.
 *
 * Gated by `CRON_SECRET` so only Vercel's cron (or a manual curl with the right
 * Bearer token) can invoke it. Vercel sets the `x-vercel-cron` header on
 * scheduled invocations; we accept either that or the Bearer token so
 * local/manual runs work too.
 *
 * Schedule lives in `vercel.json` at `0 5 * * *` (05:00 UTC daily) — after
 * `release-seats` and `topup-trips` so the nightly jobs don't contend.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  const isVercelCron = request.headers.has("x-vercel-cron");

  if (!isVercelCron) {
    if (!expected || authHeader !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

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
