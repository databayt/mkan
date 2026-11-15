import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized } from "@/lib/cron-auth";
import { runOutbox } from "@/components/agent/wa-outbox";
import { drainCrm } from "@/lib/crm/crm-ops";
import { sweepTenants } from "@/lib/crm/tenant-sync";
import { twentyConfigured } from "@/lib/crm/twenty";

/**
 * On events (wa-outbox.ts kickOutbox) and as a backstop — :00 hourly, :15/:30/:45 by day — sends the
 * WhatsApp outbox through the shared bridge and
 * reads broker replies (src/components/agent/wa-outbox.ts). Gated by
 * `CRON_SECRET` like the other crons (cf/worker.js, cf/crons.json).
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  const outbox = await runOutbox();
  return NextResponse.json({ ok: true, ...outbox, crm: await crmBackstop() });
}

/**
 * The CRM's backstop (2026-11-15): derive tenants from the database, then drain the CrmOp queue to Twenty.
 * It runs AFTER the outbox so it never delays a WhatsApp send, is time-boxed, and never throws. No new cron:
 * this one already wakes Neon only when there is something to do.
 */
async function crmBackstop() {
  if (!twentyConfigured()) return { skipped: "no-env" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const box = new Promise<{ skipped: string }>((resolve) => {
    timer = setTimeout(() => resolve({ skipped: "time-box" }), 25_000);
  });
  const run = (async () => {
    const swept = await sweepTenants();
    const drained = await drainCrm({ deadlineMs: 18_000 });
    return { swept: swept.queued, ...drained };
  })().catch((e: Error) => ({ error: e.message.slice(0, 200) }));
  return Promise.race([run, box]).finally(() => clearTimeout(timer));
}
