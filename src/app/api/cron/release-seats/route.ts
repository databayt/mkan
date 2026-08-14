import { NextRequest, NextResponse } from "next/server";
import { releaseExpiredSeatHolds } from "@/lib/actions/travel-actions";

/**
 * Daily backstop cron — releases seat holds whose reservedUntil TTL has
 * expired and cancels the associated Pending bookings. Daily is all a Vercel
 * hobby plan allows; the 30-minute TTL is actually enforced inline instead,
 * by getTripDetails / getTripSeats / createBooking each calling
 * releaseExpiredSeatHolds(tripId) before they read or sell. This sweep only
 * catches holds on trips nobody has looked at since. Gated by
 * CRON_SECRET so only Vercel cron or an authorized curl invocation
 * can trigger it. Schedule lives in vercel.json.
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
    const result = await releaseExpiredSeatHolds();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
