/**
 * The chat funnel's rows (chat-funnel-pure.ts): real people's chats in a window with the facts that
 * say how far each went. Read-only, and nothing a reader could name a person by leaves this file —
 * the task id, the language, the source and the stamps only. `db` is passed in, as agent-funnel.ts
 * does, so the terminal and the page share it.
 */
import { REAL_PERSON } from "./team";
import { isE2eFixture } from "./e2e-fixture";
import { chatFacts, type ChatFacts, type DealFacts, type TaskRow } from "./chat-funnel-pure";

type Db = (typeof import("@/lib/db"))["db"];

const DAY = 86_400_000;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

export async function loadChatFacts(db: Db, days = 30, now = new Date()): Promise<ChatFacts[]> {
  const since = new Date(now.getTime() - days * DAY);
  const ids = (
    await db.$queryRaw<{ id: string }[]>`
      SELECT t.id
      FROM "AgentTask" t LEFT JOIN "AgentProfile" p ON p.id = t."profileId"
      WHERE t."createdAt" >= ${since} AND ${REAL_PERSON}
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(t.messages) m WHERE m->>'role' = 'user')`
  ).map((r) => r.id);
  if (!ids.length) return [];
  const [tasks, deals] = await Promise.all([
    db.agentTask.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        profileId: true,
        locale: true,
        messages: true,
        requirements: true,
        refSource: true,
        createdAt: true,
        profile: { select: { waPhone: true, firstSource: true } },
        brokerRequests: { where: { channel: { not: "joined" } }, select: { consentAt: true, sentAt: true, respondedAt: true, status: true, listing: { select: { priceMonth: true } } } },
        events: { where: { kind: "viewing_proposed" }, orderBy: { createdAt: "asc" }, take: 1, select: { createdAt: true } },
      },
    }),
    db.deal.findMany({
      where: { taskId: { in: ids } },
      select: { taskId: true, status: true, createdAt: true, updatedAt: true, signedAt: true, paidAt: true, notes: true, rentMonthly: true, visit: { select: { createdAt: true, scheduledFor: true, occurredAt: true } } },
    }),
  ]);
  const rows: TaskRow[] = tasks
    .filter((t) => !isE2eFixture(t.messages))
    .map((t) => {
      const req = (t.requirements ?? {}) as { stay?: string | null; pricePeriod?: string | null; maxPrice?: number | null };
      return {
        id: t.id,
        profileId: t.profileId,
        wa: !!t.profile?.waPhone,
        source: t.refSource ?? t.profile?.firstSource ?? null,
        lang: t.locale,
        createdAt: t.createdAt,
        messages: Array.isArray(t.messages) ? (t.messages as TaskRow["messages"]) : [],
        // A nightly budget is another market: only a monthly figure is a rent.
        budget: req.stay === "short" || req.pricePeriod === "night" ? null : num(req.maxPrice),
        requests: t.brokerRequests.map((r) => ({ consentAt: r.consentAt, sentAt: r.sentAt, respondedAt: r.respondedAt, status: r.status, rent: num(r.listing?.priceMonth) })),
        proposedAt: t.events[0]?.createdAt ?? null,
      };
    });
  const facts: DealFacts[] = deals.map((d) => ({ taskId: d.taskId, status: d.status, createdAt: d.createdAt, updatedAt: d.updatedAt, signedAt: d.signedAt, paidAt: d.paidAt, notes: d.notes, rent: num(d.rentMonthly), visit: d.visit }));
  return chatFacts(rows, facts);
}
