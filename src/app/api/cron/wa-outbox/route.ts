import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized } from "@/lib/cron-auth";
import { runOutbox } from "@/components/agent/wa-outbox";

/**
 * Every 2 minutes — sends the WhatsApp outbox through the shared bridge and
 * reads broker replies (src/components/agent/wa-outbox.ts). Gated by
 * `CRON_SECRET` like the other crons (cf/worker.js, cf/crons.json).
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  return NextResponse.json({ ok: true, ...(await runOutbox()) });
}
