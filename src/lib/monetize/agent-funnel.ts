/**
 * The /find agent's funnel — conversations to booked viewings — counted from
 * AgentEvent rows and broker requests for a window. Shared by the terminal
 * (`pnpm agent:funnel`) and the /monetize page, so both say the same number.
 */
import { Prisma } from "@prisma/client";
import { REAL_PERSON } from "./team";
import { isE2eFixture, E2E_SENDER_PREFIX } from "./e2e-fixture";

/** SQL twin of isE2eFixture: a task whose messages carry a wa:e2e sender id. */
const E2E_FIXTURE_SQL = Prisma.sql`("messages"::text LIKE ${`%"wa":"${E2E_SENDER_PREFIX}%`})`;
export { isE2eFixture };

type Db = (typeof import("@/lib/db"))["db"];

export interface Funnel {
  days: number;
  tasks: number;
  /** People who wrote in the window, the team and Abdout's own contacts left out (team.ts): conversations count us too. */
  people: number;
  shortlisted: number;
  widened: number;
  rulesOnly: number;
  failed: number;
  asked: number;
  answered: number;
  available: number;
  slotChosen: number;
  booked: number;
  /** Who read the typed turns (taps need no reader). */
  readers: { claude: number; groq: number; rules: number; taps: number };
  /** Replies or "why" lines Claude wrote that passed the guard. */
  written: number;
  /** Claude spend this calendar month (UTC), agent lanes, and whether the cap row is set. */
  spendUsd: number;
  capped: boolean;
  /** Conversations whose first reply was homes, not a question. */
  homesFirst: number;
  /** Profiles that came back: a new chat from a profile older than the window. */
  returning: number;
  saves: number;
  passes: number;
  thumbsUp: number;
  thumbsDown: number;
  /** Unmet demand: requests opened, brokers asked for a home, homes they sent, requests matched, tenants opted in / alerted. */
  demand: { opened: number; asks: number; offers: number; matched: number; optIns: number; alerts: number };
}

/** `offsetDays` shifts the window back: (offsetDays=7, days=7) is the week before this one. */
/** All zeros: what the page shows for the chat funnel when its queries fail, instead of a 500. */
export function emptyFunnel(days: number): Funnel {
  return {
    days, tasks: 0, people: 0, shortlisted: 0, widened: 0, rulesOnly: 0, failed: 0, asked: 0, answered: 0, available: 0, slotChosen: 0, booked: 0,
    readers: { claude: 0, groq: 0, rules: 0, taps: 0 }, written: 0, spendUsd: 0, capped: false, homesFirst: 0, returning: 0,
    saves: 0, passes: 0, thumbsUp: 0, thumbsDown: 0, demand: { opened: 0, asks: 0, offers: 0, matched: 0, optIns: 0, alerts: 0 },
  };
}

export async function agentFunnel(db: Db, days = 7, offsetDays = 0): Promise<Funnel> {
  const until = new Date(Date.now() - offsetDays * 86_400_000);
  const since = new Date(until.getTime() - days * 86_400_000);
  const distinctTasks = async (kind: string, extra: Record<string, unknown> = {}) =>
    (await db.agentEvent.findMany({ where: { kind, createdAt: { gte: since, lt: until }, ...extra }, distinct: ['taskId'], select: { taskId: true } })).length;
  const silent = (kind: string, extra: Record<string, unknown> = {}) => db.agentEvent.count({ where: { kind, createdAt: { gte: since, lt: until }, ...extra } });
  const reader = (name: string) => silent('requirements_extracted', { payload: { path: ['reader'], equals: name } });
  const month = new Date().toISOString().slice(0, 7);
  const [claude, groq, taps, written, spend, homesFirst, returning, saves, passes, thumbsUp, thumbsDown] = await Promise.all([
    reader('claude'),
    reader('groq'),
    reader('taps'),
    silent('reply_written'),
    db.apiSpend.findMany({ where: { day: { startsWith: month } }, select: { lane: true, usd: true } }),
    db.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM "AgentTask" WHERE "createdAt" >= ${since} AND "createdAt" < ${until} AND "messages"->1->>'kind' = 'shortlist'`,
    db.$queryRaw<{ n: number }[]>`SELECT COUNT(DISTINCT t."profileId")::int AS n FROM "AgentTask" t JOIN "AgentProfile" p ON p.id = t."profileId" WHERE t."createdAt" >= ${since} AND t."createdAt" < ${until} AND p."createdAt" < ${since}`,
    silent('home_saved'),
    silent('home_dismissed'),
    silent('feedback', { payload: { path: ['kind'], equals: 'good' } }),
    silent('feedback', { payload: { path: ['kind'], equals: 'bad' } }),
  ]);
  const [tasks, failed, shortlisted, widened, rulesOnly, requests, people] = await Promise.all([
    db.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM "AgentTask" WHERE "createdAt" >= ${since} AND "createdAt" < ${until} AND NOT ${E2E_FIXTURE_SQL}`.then((r) => r[0]?.n ?? 0),
    db.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM "AgentTask" WHERE "createdAt" >= ${since} AND "createdAt" < ${until} AND status = 'FAILED' AND NOT ${E2E_FIXTURE_SQL}`.then((r) => r[0]?.n ?? 0),
    distinctTasks('shortlist_ready'),
    distinctTasks('relaxed', { status: 'done' }),
    // Turns the Groq reader missed (429, timeout) and the rules read alone.
    db.agentEvent.count({ where: { kind: 'requirements_extracted', createdAt: { gte: since, lt: until }, payload: { path: ['reader'], equals: 'rules' } } }),
    // Asks that really went out (sentAt), so a skipped or queued one is not "asked" (2026-11-06).
    db.brokerRequest.findMany({ where: { sentAt: { gte: since, lt: until }, channel: { not: 'joined' } }, select: { status: true, respondedAt: true, chosenSlot: true, visitId: true } }),
    db.$queryRaw<{ n: number }[]>`
      SELECT COUNT(DISTINCT COALESCE(t."profileId", t.id))::int AS n
      FROM "AgentTask" t LEFT JOIN "AgentProfile" p ON p.id = t."profileId"
      CROSS JOIN LATERAL jsonb_array_elements(t.messages) m
      WHERE t."updatedAt" >= ${since} AND m->>'role' = 'user' AND m->>'at' >= ${since.toISOString()} AND m->>'at' < ${until.toISOString()} AND ${REAL_PERSON}`
      .then((r) => r[0]?.n ?? 0)
      .catch(() => 0),
  ]);
  // Zeros, not a failed report, on a database without the demand tables yet.
  const demand = await Promise.all([
    db.tenantRequest.count({ where: { createdAt: { gte: since, lt: until } } }),
    db.outboundMessage.count({ where: { kind: 'BROKER_ASK', createdAt: { gte: since, lt: until } } }),
    db.outboundMessage.count({ where: { kind: 'BROKER_ASK', createdAt: { gte: since, lt: until }, listingId: { not: null } } }),
    db.tenantRequest.count({ where: { createdAt: { gte: since, lt: until }, matchedListingIds: { isEmpty: false } } }),
    db.tenantRequest.count({ where: { createdAt: { gte: since, lt: until }, optInAt: { not: null } } }),
    db.outboundMessage.count({ where: { kind: 'TENANT_ALERT', createdAt: { gte: since, lt: until } } }),
  ])
    .then(([opened, asks, offers, matched, optIns, alerts]) => ({ opened, asks, offers, matched, optIns, alerts }))
    .catch(() => ({ opened: 0, asks: 0, offers: 0, matched: 0, optIns: 0, alerts: 0 }));
  return {
    days,
    tasks,
    people,
    shortlisted,
    widened,
    rulesOnly,
    failed,
    asked: requests.length,
    // The broker's own answer only: applyAnswer closes the other brokers' asks about the same home
    // without one (respondedAt stays null), and those used to count as answered — and as available.
    answered: requests.filter((r) => r.respondedAt && (r.status === 'AVAILABLE' || r.status === 'RENTED')).length,
    available: requests.filter((r) => r.respondedAt && r.status === 'AVAILABLE').length,
    slotChosen: requests.filter((r) => r.chosenSlot).length,
    booked: requests.filter((r) => r.visitId != null).length,
    readers: { claude, groq, rules: rulesOnly, taps },
    written,
    spendUsd: spend.filter((r) => r.lane.startsWith('agent-')).reduce((sum, r) => sum + Number(r.usd), 0),
    capped: spend.some((r) => r.lane === 'capped'),
    homesFirst: homesFirst[0]?.n ?? 0,
    returning: returning[0]?.n ?? 0,
    saves,
    passes,
    thumbsUp,
    thumbsDown,
    demand,
  };
}

