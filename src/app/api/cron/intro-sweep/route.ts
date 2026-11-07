import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized } from "@/lib/cron-auth";
import { introSweep } from "@/components/agent/deal-intro";

/**
 * The direct-intro sweep (deal-intro.ts) on its own, at :15 :30 :45 by day — the hourly
 * /api/cron/broker-requests runs it at :00. A broker's yes to a tenant must become a terms ask in
 * minutes and the tenant's number within the hour, not at the next top of the hour (2026-11-07:
 * warm leads went cold in a week). Everything it does is decided from the outbox rows, so two
 * overlapping runs queue a message once.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  const intros = await introSweep().catch((err) => {
    console.warn(`[cron] intro sweep: ${(err as Error).message}`);
    return 0;
  });
  return NextResponse.json({ ok: true, intros });
}
