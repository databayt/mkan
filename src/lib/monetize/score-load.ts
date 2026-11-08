import "server-only";

import { db } from "@/lib/db";

import type { PostPoint, ScoreRaw } from "./score-samples";
import { REAL_PERSON } from "./team";

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
  const [post30, people, asks, deals, brokers, feedback, stops, shareYes, toAsk, intro, picks, told, tiktok] = await Promise.all([
    db.blockSnapshot
      .findFirst({ where: { block: "post", at: { lte: since } }, orderBy: { at: "desc" }, select: { at: true, metrics: true } })
      .then((r) => (r ? pointOf(r.at, r.metrics) : null))
      .catch(() => null),
    // The same people the page counts (load.ts inbox): client words in the window, the team and Abdout's own contacts left out (team.ts).
    db.$queryRaw<{ people: number; returning: number }[]>`
      WITH said AS (
        SELECT COALESCE(t."profileId", t.id) AS who, left(m->>'at', 10) AS day
        FROM "AgentTask" t
        LEFT JOIN "AgentProfile" p ON p.id = t."profileId"
        CROSS JOIN LATERAL jsonb_array_elements(t.messages) m
        WHERE t."updatedAt" >= ${since} AND m->>'role' = 'user' AND m->>'at' >= ${since.toISOString()} AND ${REAL_PERSON}
      )
      SELECT COUNT(DISTINCT who)::int AS people,
             (SELECT COUNT(*) FROM (SELECT who FROM said GROUP BY who HAVING COUNT(DISTINCT day) >= 2) x)::int AS returning
      FROM said`.catch(() => [{ people: 0, returning: 0 }]),
    // Asks that really went out (sentAt), as agent-funnel.ts counts them, for real people's chats; only the answering broker's own row carries respondedAt.
    db.$queryRaw<{ sent: number; answered: number; tasks: number; yes: number }[]>`
      SELECT COUNT(*)::int AS sent,
             COUNT(*) FILTER (WHERE r."respondedAt" IS NOT NULL AND r.status IN ('AVAILABLE', 'RENTED'))::int AS answered,
             COUNT(DISTINCT r."taskId")::int AS tasks,
             COUNT(DISTINCT r."taskId") FILTER (WHERE r."respondedAt" IS NOT NULL AND r.status = 'AVAILABLE')::int AS yes
      FROM "BrokerRequest" r
      LEFT JOIN "AgentTask" t ON t.id = r."taskId"
      LEFT JOIN "AgentProfile" p ON p.id = t."profileId"
      WHERE r."sentAt" >= ${since} AND r.channel <> 'joined' AND ${REAL_PERSON}`.catch(() => [{ sent: 0, answered: 0, tasks: 0, yes: 0 }]),
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
    // How many messages a tenant wrote before Mkan first asked a broker for them (real people's chats).
    db.$queryRaw<{ median: number | null; n: number }[]>`
      WITH asked AS (
        SELECT "taskId", MIN("sentAt") AS first FROM "BrokerRequest"
        WHERE "sentAt" >= ${since} AND "taskId" IS NOT NULL AND channel <> 'joined' GROUP BY "taskId"
      ), counted AS (
        SELECT (SELECT COUNT(*) FROM jsonb_array_elements(t.messages) m
                WHERE m->>'role' = 'user' AND (m->>'at' IS NULL OR m->>'at' <= to_char(a.first, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))::int AS n
        FROM "AgentTask" t JOIN asked a ON a."taskId" = t.id
        LEFT JOIN "AgentProfile" p ON p.id = t."profileId"
        WHERE ${REAL_PERSON}
      )
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY n) AS median, COUNT(*)::int AS n FROM counted WHERE n > 0`.catch(() => [{ median: null, n: 0 }]),
    db.$queryRaw<{ intros: number; paid: number }[]>`
      SELECT COUNT(*) FILTER (WHERE "introducedAt" IS NOT NULL)::int AS intros, COUNT(*) FILTER (WHERE status = 'PAID')::int AS paid FROM "Deal"`.catch(() => [{ intros: 0, paid: 0 }]),
    // Real WhatsApp tenants who got homes, and of them who picked one: a check started (availability.ts
    // writes availability_asked for a broker ask and for a person's check alike).
    db.$queryRaw<{ shown: number; picked: number }[]>`
      WITH shown AS (
        SELECT t."profileId" AS who, t.id
        FROM "AgentTask" t JOIN "AgentProfile" p ON p.id = t."profileId"
        WHERE p."waPhone" IS NOT NULL AND ${REAL_PERSON}
          AND EXISTS (SELECT 1 FROM "AgentEvent" e WHERE e."taskId" = t.id AND e.kind = 'shortlist_ready' AND e."createdAt" >= ${since}
                        AND COALESCE((e.payload->>'count')::int, 0) > 0 AND COALESCE((e.payload->>'demand')::boolean, false) = false)
      )
      SELECT COUNT(DISTINCT who)::int AS shown,
             COUNT(DISTINCT who) FILTER (WHERE EXISTS (SELECT 1 FROM "AgentEvent" a WHERE a."taskId" = shown.id AND a.kind = 'availability_asked' AND a."createdAt" >= ${since}))::int AS picked
      FROM shown`.catch(() => [{ shown: 0, picked: 0 }]),
    // Hearing back on WhatsApp: a message to the tenant (the broker's answer, the intro, the deal sheet,
    // "no answer yet") within 3 h of their first ask, and within 1 h of each broker's answer.
    db.$queryRaw<{ asked: number; told3h: number; answers: number; told1h: number }[]>`
      WITH mine AS (
        SELECT r."taskId", r."sentAt", r."respondedAt", r.status, regexp_replace(p."waPhone", '[^0-9]', '', 'g') AS phone
        FROM "BrokerRequest" r JOIN "AgentTask" t ON t.id = r."taskId" JOIN "AgentProfile" p ON p.id = t."profileId"
        WHERE p."waPhone" IS NOT NULL AND r.channel <> 'joined' AND ${REAL_PERSON}
      ), firsts AS (
        SELECT "taskId", phone, MIN("sentAt") AS at FROM mine WHERE "sentAt" >= ${since} GROUP BY "taskId", phone
      ), answers AS (
        SELECT "taskId", phone, MIN("respondedAt") AS at FROM mine
        WHERE "respondedAt" >= ${since} AND status IN ('AVAILABLE', 'RENTED') GROUP BY "taskId", phone
      ), told AS (
        SELECT regexp_replace(o."to", '[^0-9]', '', 'g') AS phone, COALESCE(o."sentAt", o."createdAt") AS at
        FROM "OutboundMessage" o WHERE o.kind = 'TENANT_ALERT' AND o.status = 'SENT' AND o."createdAt" >= ${since}
      )
      SELECT (SELECT COUNT(*) FROM firsts)::int AS asked,
             (SELECT COUNT(*) FROM firsts f WHERE EXISTS (SELECT 1 FROM told WHERE told.phone = f.phone AND told.at BETWEEN f.at AND f.at + interval '3 hours'))::int AS told3h,
             (SELECT COUNT(*) FROM answers)::int AS answers,
             (SELECT COUNT(*) FROM answers a WHERE EXISTS (SELECT 1 FROM told WHERE told.phone = a.phone AND told.at BETWEEN a.at - interval '5 minutes' AND a.at + interval '1 hour'))::int AS told1h`.catch(
      () => [{ asked: 0, told3h: 0, answers: 0, told1h: 0 }],
    ),
    // People who came from TikTok: a post's code, the /tt page, or saying so (refSource); older chats carry the code's `pin`.
    db.$queryRaw<{ n: number }[]>`
      SELECT COUNT(DISTINCT COALESCE(t."profileId", t.id))::int AS n
      FROM "AgentTask" t LEFT JOIN "AgentProfile" p ON p.id = t."profileId"
      WHERE t."createdAt" >= ${since} AND ${REAL_PERSON}
        AND (t."refSource" IN ('tiktok', 'tiktok_bio') OR (t."refSource" IS NULL AND t.messages->0->>'pin' IS NOT NULL))`.catch(() => [{ n: 0 }]),
  ]);
  const b = brokers[0]!;
  const f = feedback[0]!;
  return {
    post30,
    people30: people[0]?.people ?? 0,
    returning30: people[0]?.returning ?? 0,
    tiktokPeople30: tiktok[0]?.n ?? 0,
    asks: asks[0]!,
    picks: picks[0] ?? { shown: 0, picked: 0 },
    told: told[0] ?? { asked: 0, told3h: 0, answers: 0, told1h: 0 },
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
