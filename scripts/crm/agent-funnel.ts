/**
 * The /find agent's funnel, read-only — conversations to booked viewings.
 *
 *   pnpm agent:funnel [--days=7]
 *
 * Nothing measured the agent's outcomes: the only record was its AgentEvent
 * rows. This counts them (and the broker requests) for a window, so the daily
 * hygiene report can say whether tenants get anywhere.
 */
import { config } from 'dotenv';
config({ override: true });

import { agentFunnel, type Funnel } from '../../src/lib/monetize/agent-funnel';
export { agentFunnel, type Funnel };

export const funnelLine = (f: Funnel): string =>
  `/find, last ${f.days}d: ${f.tasks} conversations, ${f.people} real people (${f.homesFirst} homes-first, ${f.returning} returning) → ${f.shortlisted} shortlists (${f.widened} widened) → ${f.asked} broker asks → ${f.answered} answers (${f.available} available) → ${f.slotChosen} slots (${f.proposed} named on WhatsApp) → ${f.booked} viewings (${f.intros} intros) · ${f.failed} failed` +
  ` · read by Claude ${f.readers.claude} / Groq ${f.readers.groq} / rules ${f.readers.rules} / taps ${f.readers.taps} · ${f.written} written` +
  ` · ♥ ${f.saves} · passed ${f.passes} · 👍 ${f.thumbsUp} 👎 ${f.thumbsDown}` +
  ` · no match → ${f.demand.opened} requests → ${f.demand.asks} brokers asked → ${f.demand.offers} homes sent → ${f.demand.matched} matched · ${f.demand.optIns} opted in, ${f.demand.alerts} alerts` +
  ` · Claude US$${f.spendUsd.toFixed(2)} this month${f.capped ? " (CAPPED)" : ""}`;

if (process.argv[1] && /agent-funnel\.ts$/.test(process.argv[1])) {
  (async () => {
    const { db } = await import('../../src/lib/db');
    const days = Number((process.argv.find((a) => a.startsWith('--days=')) ?? '').split('=')[1]) || 7;
    console.log(funnelLine(await agentFunnel(db, days)));
    await db.$disconnect();
  })().catch((e) => {
    console.error(`❌ ${(e as Error).message}`);
    process.exit(1);
  });
}
