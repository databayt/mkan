import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized } from "@/lib/cron-auth";
import { expireRequests, failStuckTasks, handOnUnanswered } from "@/components/agent/broker";
import { viewingReminders } from "@/components/agent/deal";

/**
 * Hourly — a broker who has not answered the rental agent within 24 h is
 * recorded as NO_REPLY, and every task waiting on that home is told so
 * (silence is never read as "available") — unless another broker posted the
 * same home, who is asked next. A broker silent for 3 daytime hours already
 * hands the home on to the next one (handOnUnanswered, at most 3 per home per
 * tenant), after the expiries so one home is never handed on twice in a run. It also fails turns stuck RUNNING for an hour
 * (a recycled Worker loses its `after()`); an open tab recovers its own sooner.
 *
 * Gated by `CRON_SECRET` like the other crons; `cf/worker.js` sends it as a
 * Bearer token on the schedule in `cf/crons.json`.
 */
export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  const [{ expired, handedOn }, unstuck, reminded] = await Promise.all([
    expireRequests().then(async (expired) => ({
      expired,
      handedOn: await handOnUnanswered().catch((err) => {
        console.warn(`[cron] hand on unanswered: ${(err as Error).message}`);
        return 0;
      }),
    })),
    failStuckTasks(new Date(), 3_600_000),
    // Three-party viewings: 24 h and 2 h before, and "how did it go?" after (deal.ts).
    viewingReminders().catch((err) => {
      console.warn(`[cron] viewing reminders: ${(err as Error).message}`);
      return 0;
    }),
  ]);
  return NextResponse.json({ ok: true, expired, handedOn, unstuck, reminded });
}
