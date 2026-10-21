import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized } from "@/lib/cron-auth";
import { expireRequests, failStuckTasks } from "@/components/agent/broker";

/**
 * Hourly — a broker who has not answered the rental agent within 24 h is
 * recorded as NO_REPLY, and every task waiting on that home is told so
 * (silence is never read as "available") — unless another broker posted the
 * same home, who is asked next. It also fails turns stuck RUNNING for an hour
 * (a recycled Worker loses its `after()`); an open tab recovers its own sooner.
 *
 * Gated by `CRON_SECRET` like the other crons; `cf/worker.js` sends it as a
 * Bearer token on the schedule in `cf/crons.json`.
 */
export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  const [expired, unstuck] = await Promise.all([expireRequests(), failStuckTasks(new Date(), 3_600_000)]);
  return NextResponse.json({ ok: true, expired, unstuck });
}
