import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized } from "@/lib/cron-auth";
import { expireRequests, failStuckTasks, handOnUnanswered, nudgeUnanswered, settleOrphanedWaiting } from "@/components/agent/broker";
import { viewingReminders } from "@/components/agent/deal";
import { introSweep } from "@/components/agent/deal-intro";
import { quietSweep } from "@/components/agent/quiet-nudge";
import { viewingSweep } from "@/components/agent/viewing-loop";

/**
 * Hourly — a broker who has not answered the rental agent within 24 h is
 * recorded as NO_REPLY, and every task waiting on that home is told so
 * (silence is never read as "available") — unless another broker posted the
 * same home, who is asked next. A broker silent for 3 daytime hours already
 * hands the home on to the next one (handOnUnanswered, at most 3 per home per
 * tenant), after the expiries so one home is never handed on twice in a run. It also fails turns stuck RUNNING for an hour
 * (a recycled Worker loses its `after()`); an open tab recovers its own sooner. A task left WAITING with
 * no question still open is settled (settleOrphanedWaiting).
 *
 * It also runs the direct-intro sweep (deal-intro.ts): terms asks, and follow-ups at 24 h and 7 days —
 * and the viewing sweep (viewing-loop.ts): a broker silent on a time the line asked them to confirm.
 *
 * Gated by `CRON_SECRET` like the other crons; `cf/worker.js` sends it as a
 * Bearer token on the schedule in `cf/crons.json`.
 */
export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  const [{ expired, nudged, handedOn, settled }, unstuck, reminded, intros, viewings, quiet] = await Promise.all([
    expireRequests().then(async (expired) => ({
      expired,
      // The one nudge goes at 2 daytime hours, before the hand-on at 3.
      nudged: await nudgeUnanswered().catch((err) => {
        console.warn(`[cron] nudge unanswered: ${(err as Error).message}`);
        return 0;
      }),
      handedOn: await handOnUnanswered().catch((err) => {
        console.warn(`[cron] hand on unanswered: ${(err as Error).message}`);
        return 0;
      }),
      // After the expiries and hand-ons: a task whose last question just closed has nothing to wait on.
      settled: await settleOrphanedWaiting().catch((err) => {
        console.warn(`[cron] settle waiting: ${(err as Error).message}`);
        return 0;
      }),
    })),
    failStuckTasks(new Date(), 3_600_000),
    // Three-party viewings: 24 h and 2 h before, and "how did it go?" after (deal.ts).
    viewingReminders().catch((err) => {
      console.warn(`[cron] viewing reminders: ${(err as Error).message}`);
      return 0;
    }),
    // Direct intros: terms asks that waited too long, follow-ups at 24 h and 7 days (deal-intro.ts).
    introSweep().catch((err) => {
      console.warn(`[cron] intro sweep: ${(err as Error).message}`);
      return 0;
    }),
    // Viewing times the line asked a broker to confirm: one chase for a silent broker, then the tenant is told (viewing-loop.ts).
    viewingSweep().catch((err) => {
      console.warn(`[cron] viewing sweep: ${(err as Error).message}`);
      return 0;
    }),
    // A tenant who went quiet under the homes is asked once whether any of them fit (quiet-nudge.ts).
    quietSweep().catch((err) => {
      console.warn(`[cron] quiet sweep: ${(err as Error).message}`);
      return 0;
    }),
  ]);
  return NextResponse.json({ ok: true, expired, nudged, handedOn, settled, unstuck, reminded, intros, viewings, quiet });
}
