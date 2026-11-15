import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized } from "@/lib/cron-auth";
import { sendSchedule } from "@/components/agent/loop-schedule";

/**
 * 07:00 and 20:00 Kigali (05:00 and 18:00 UTC, cf/crons.json): the day's viewings to Mkan's person on
 * WhatsApp — today's in the morning, tomorrow's in the evening, Sunday evening with the week's numbers
 * (src/components/agent/loop-schedule.ts). Once per slot; gated by `CRON_SECRET` like the other crons.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  return NextResponse.json({ ok: true, ...(await sendSchedule()) });
}
