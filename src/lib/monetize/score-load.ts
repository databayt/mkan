import "server-only";

import { db } from "@/lib/db";

import type { PostPoint, ScoreRaw } from "./score-samples";

/**
 * The scorecard's own counts (score-samples.ts), each read on its own so one failed query leaves its
 * parts "not enough data" instead of taking the page down. Thirty days for the deal road — a week
 * holds too few deals to mean anything yet — and ninety for the 1–5 ratings.
 */
const DAY = 86_400_000;

export type ScoreQueries = Omit<ScoreRaw, "now" | "post" | "week"> & {
  /** Direct intros so far and paid deals ever: intros last until INTRO_CAP deals are paid (deal-intro.ts). */
  intro: { intros: number; paid: number };
};

const pointOf = (at: Date, metrics: unknown): PostPoint => {
  const p =
    ((metrics ?? {}) as { post?: { videos?: number; photos?: number; views?: number; followers?: number | null; likes?: number | null; comments?: number | null; shares?: number | null } }).post ?? {};
  const posts = p.videos != null || p.photos != null ? (p.videos ?? 0) + (p.photos ?? 0) : null;
  const talk = p.comments != null || p.shares != null ? (p.comments ?? 0) + (p.shares ?? 0) : null;
  return { at: at.getTime(), posts, views: p.views ?? null, followers: p.followers ?? null, likes: p.likes ?? null, talk };
};

export function postPoints(rows: { at: Date; metrics: unknown }[]): PostPoint[] {
  return rows.map((r) => pointOf(r.at, r.metrics));
}

export async function loadScoreQueries(now = Date.now()): Promise<ScoreQueries> {
  const since = new Date(now - 30 * DAY);
  const since90 = new Date(now - 90 * DAY);
  const [post30, people, asks, deals, brokers, feedback, stops, shareYes, toAsk, intro] = await Promise.all([
    db.blockSnapshot
      .findFirst({ where: { block: "post", at: { lte: since } }, orderBy: { at: "desc" }, select: { at: true, metrics: true } })
      .then((r) => (r ? pointOf(r.at, r.metrics) : null))
      .catch(() => null),
    // The same people the page counts (load.ts inbox): client words in the window, Abdout's own and test numbers left out.
    db.$queryRaw<{ people: number; returning: number }[]>`
      WITH said AS (
        SELECT COALESCE(t."profileId", t.id) AS who, left(m->>'at', 10) AS day
        FROM "AgentTask" t
        LEFT JOIN "AgentProfile" p ON p.id = t."profileId"
        CROSS JOIN LATERAL jsonb_array_elements(t.messages) m
        WHERE t."updatedAt" >= ${since} AND m->>'role' = 'user' AND m->>'at' >= ${since.toISOString()}
          AND NOT EXISTS (SELECT 1 FROM "WaState" w WHERE p."waPhone" IS NOT NULL AND w.key = 'personal:' || replace(p."waPhone", '+', ''))
          AND NOT EXISTS (SELECT 1 FROM "WaState" w WHERE p."waPhone" IS NOT NULL AND w.key = 'test-phones' AND w.value @> to_jsonb(replace(p."waPhone", '+', '')))
      )
      SELECT COUNT(DISTINCT who)::int AS people,
             (SELECT COUNT(*) FROM (SELECT who FROM said GROUP BY who HAVING COUNT(DISTINCT day) >= 2) x)::int AS returning
      FROM said`.catch(() => [{ people: 0, returning: 0 }]),
    // Asks that really went out (sentAt), as agent-funnel.ts counts them; only the answering broker's own row carries respondedAt.
    db.$queryRaw<{ sent: number; answered: number; tasks: number; yes: number; fast: number }[]>`
      SELECT COUNT(*)::int AS sent,
             COUNT(*) FILTER (WHERE "respondedAt" IS NOT NULL AND status IN ('AVAILABLE', 'RENTED'))::int AS answered,
             COUNT(DISTINCT "taskId")::int AS tasks,
             COUNT(DISTINCT "taskId") FILTER (WHERE "respondedAt" IS NOT NULL AND status = 'AVAILABLE')::int AS yes,
             COUNT(DISTINCT "taskId") FILTER (WHERE "respondedAt" IS NOT NULL AND status IN ('AVAILABLE', 'RENTED') AND "respondedAt" - "sentAt" <= interval '3 hours')::int AS fast
      FROM "BrokerRequest"
      WHERE "sentAt" >= ${since} AND channel <> 'joined'`.catch(() => [{ sent: 0, answered: 0, tasks: 0, yes: 0, fast: 0 }]),
    db.$queryRaw<{ booked: number; viewed: number; paid: number }[]>`
      SELECT COUNT(*) FILTER (WHERE "createdAt" >= ${since})::int AS booked,
             COUNT(*) FILTER (WHERE "createdAt" >= ${since} AND status IN ('VIEWED', 'SIGNED', 'PAID'))::int AS viewed,
             COUNT(*) FILTER (WHERE status = 'PAID' AND "paidAt" >= ${since})::int AS paid
      FROM "Deal"`.catch(() => [{ booked: 0, viewed: 0, paid: 0 }]),
    db.$queryRaw<{ asked: number; optOut: number; saidYes: number; agreed: number; replyMedianMin: number | null; replyN: number }[]>`
      SELECT COUNT(*) FILTER (WHERE asks > 0)::int AS asked,
             COUNT(*) FILTER (WHERE asks > 0 AND "optOut")::int AS "optOut",
             COUNT(*) FILTER (WHERE "availableAnswers" > 0 OR "agreedAt" IS NOT NULL)::int AS "saidYes",
             COUNT(*) FILTER (WHERE "agreedAt" IS NOT NULL)::int AS agreed,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY "replyMinutes") FILTER (WHERE "lastReplyAt" >= ${since} AND "replyMinutes" IS NOT NULL) AS "replyMedianMin",
             COUNT(*) FILTER (WHERE "lastReplyAt" >= ${since} AND "replyMinutes" IS NOT NULL)::int AS "replyN"
      FROM "Broker" WHERE "mergedIntoId" IS NULL`.catch(() => [{ asked: 0, optOut: 0, saidYes: 0, agreed: 0, replyMedianMin: null, replyN: 0 }]),
    // 1–5 answers (deal.ts follow-ups) and the web thumbs.
    db.$queryRaw<{ tenantAvg: number | null; tenantN: number; brokerAvg: number | null; brokerN: number; up: number; down: number }[]>`
      SELECT AVG((payload->>'score')::float) FILTER (WHERE payload->>'kind' = 'score' AND payload->>'who' = 'tenant') AS "tenantAvg",
             COUNT(*) FILTER (WHERE payload->>'kind' = 'score' AND payload->>'who' = 'tenant')::int AS "tenantN",
             AVG((payload->>'score')::float) FILTER (WHERE payload->>'kind' = 'score' AND payload->>'who' = 'broker') AS "brokerAvg",
             COUNT(*) FILTER (WHERE payload->>'kind' = 'score' AND payload->>'who' = 'broker')::int AS "brokerN",
             COUNT(*) FILTER (WHERE payload->>'kind' = 'good' AND "createdAt" >= ${since})::int AS up,
             COUNT(*) FILTER (WHERE payload->>'kind' = 'bad' AND "createdAt" >= ${since})::int AS down
      FROM "AgentEvent" WHERE kind = 'feedback' AND "createdAt" >= ${since90}`.catch(() => [
      { tenantAvg: null, tenantN: 0, brokerAvg: null, brokerN: 0, up: 0, down: 0 },
    ]),
    db.$queryRaw<{ stops: number; wa: number }[]>`
      SELECT COALESCE((SELECT jsonb_array_length(value::jsonb) FROM "WaState" WHERE key = 'tenant-stop' AND jsonb_typeof(value::jsonb) = 'array'), 0)::int AS stops,
             (SELECT COUNT(*) FROM "AgentProfile" WHERE "waPhone" IS NOT NULL)::int AS wa`.catch(() => [{ stops: 0, wa: 0 }]),
    // Brokers who ever said a home is free (the answering broker's own row), and of them who agreed Mkan's terms.
    // Broker.availableAnswers only counts since its counter shipped, so the requests are the record.
    db.$queryRaw<{ saidYes: number; agreed: number }[]>`
      SELECT COUNT(DISTINCT r."brokerUserId")::int AS "saidYes",
             COUNT(DISTINCT r."brokerUserId") FILTER (WHERE b."agreedAt" IS NOT NULL)::int AS agreed
      FROM "BrokerRequest" r LEFT JOIN "Broker" b ON b."userId" = r."brokerUserId"
      WHERE r.status = 'AVAILABLE' AND r."respondedAt" IS NOT NULL`.catch(() => null),
    // How many messages a tenant wrote before Mkan first asked a broker for them.
    db.$queryRaw<{ median: number | null; n: number }[]>`
      WITH asked AS (
        SELECT "taskId", MIN("sentAt") AS first FROM "BrokerRequest"
        WHERE "sentAt" >= ${since} AND "taskId" IS NOT NULL AND channel <> 'joined' GROUP BY "taskId"
      ), counted AS (
        SELECT (SELECT COUNT(*) FROM jsonb_array_elements(t.messages) m
                WHERE m->>'role' = 'user' AND (m->>'at' IS NULL OR m->>'at' <= to_char(a.first, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))::int AS n
        FROM "AgentTask" t JOIN asked a ON a."taskId" = t.id
      )
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY n) AS median, COUNT(*)::int AS n FROM counted WHERE n > 0`.catch(() => [{ median: null, n: 0 }]),
    db.$queryRaw<{ intros: number; paid: number }[]>`
      SELECT COUNT(*) FILTER (WHERE "introducedAt" IS NOT NULL)::int AS intros, COUNT(*) FILTER (WHERE status = 'PAID')::int AS paid FROM "Deal"`.catch(() => [{ intros: 0, paid: 0 }]),
  ]);
  const b = brokers[0]!;
  const f = feedback[0]!;
  return {
    post30,
    people30: people[0]?.people ?? 0,
    returning30: people[0]?.returning ?? 0,
    asks: asks[0]!,
    deals: deals[0]!,
    brokers: {
      ...b,
      ...(shareYes?.[0] ? { saidYes: Math.max(shareYes[0].saidYes, b.saidYes), agreed: Math.max(shareYes[0].agreed, b.agreed) } : {}),
      replyMedianMin: b.replyMedianMin != null ? Number(b.replyMedianMin) : null,
    },
    messagesToAsk: { median: toAsk[0]?.median != null ? Number(toAsk[0].median) : null, n: toAsk[0]?.n ?? 0 },
    intro: intro[0] ?? { intros: 0, paid: 0 },
    feedback: { ...f, tenantAvg: f.tenantAvg != null ? Number(f.tenantAvg) : null, brokerAvg: f.brokerAvg != null ? Number(f.brokerAvg) : null },
    stops: stops[0]?.stops ?? 0,
    waTenants: stops[0]?.wa ?? 0,
  };
}
