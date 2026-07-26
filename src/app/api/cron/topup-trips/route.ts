import { NextRequest, NextResponse } from "next/server";
import { topUpTrips } from "@/lib/transport-topup";

export const maxDuration = 60;

/**
 * Daily cron — keeps the travel vertical's trip inventory rolling by
 * topping up the next 14 days of trips on every active route (idempotent,
 * add-only; see src/lib/transport-topup.ts). Without this, seeded trips
 * age out and travel search goes empty — which happened on 2026-07-22.
 * Gated by CRON_SECRET so only Vercel cron or an authorized curl
 * invocation can trigger it. Schedule lives in vercel.json.
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
    const result = await topUpTrips();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
