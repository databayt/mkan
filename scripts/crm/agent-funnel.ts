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

type Db = (typeof import('../../src/lib/db'))['db'];

export interface Funnel {
  days: number;
  tasks: number;
  shortlisted: number;
  widened: number;
  rulesOnly: number;
  failed: number;
  asked: number;
  answered: number;
  available: number;
  slotChosen: number;
  booked: number;
}

export async function agentFunnel(db: Db, days = 7): Promise<Funnel> {
  const since = new Date(Date.now() - days * 86_400_000);
  const distinctTasks = async (kind: string, extra: Record<string, unknown> = {}) =>
    (await db.agentEvent.findMany({ where: { kind, createdAt: { gte: since }, ...extra }, distinct: ['taskId'], select: { taskId: true } })).length;
  const [tasks, failed, shortlisted, widened, rulesOnly, requests] = await Promise.all([
    db.agentTask.count({ where: { createdAt: { gte: since } } }),
    db.agentTask.count({ where: { createdAt: { gte: since }, status: 'FAILED' } }),
    distinctTasks('shortlist_ready'),
    distinctTasks('relaxed', { status: 'done' }),
    // Turns the Groq reader missed (429, timeout) and the rules read alone.
    db.agentEvent.count({ where: { kind: 'requirements_extracted', createdAt: { gte: since }, payload: { path: ['reader'], equals: 'rules' } } }),
    db.brokerRequest.findMany({ where: { createdAt: { gte: since }, channel: { not: 'joined' } }, select: { status: true, chosenSlot: true, visitId: true } }),
  ]);
  return {
    days,
    tasks,
    shortlisted,
    widened,
    rulesOnly,
    failed,
    asked: requests.length,
    answered: requests.filter((r) => r.status === 'AVAILABLE' || r.status === 'RENTED').length,
    available: requests.filter((r) => r.status === 'AVAILABLE').length,
    slotChosen: requests.filter((r) => r.chosenSlot).length,
    booked: requests.filter((r) => r.visitId != null).length,
  };
}

export const funnelLine = (f: Funnel): string =>
  `/find, last ${f.days}d: ${f.tasks} conversations → ${f.shortlisted} shortlists (${f.widened} widened) → ${f.asked} broker asks → ${f.answered} answers (${f.available} available) → ${f.slotChosen} slots → ${f.booked} viewings · ${f.failed} failed · ${f.rulesOnly} turns without Groq`;

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
