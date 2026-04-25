import { NextRequest, NextResponse } from "next/server";
import { releaseExpiredSeatHolds } from "@/lib/actions/transport-actions";

/**
 * 5-minute cron — releases seat holds whose reservedUntil TTL has
 * expired and cancels the associated Pending bookings. Gated by
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
