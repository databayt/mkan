import "server-only";
/**
 * The numbers for Abdout's phone (loop-numbers-pure.ts has the words): the chat funnel's own rows for real
 * people (lib/monetize/chat-funnel.ts, the same ones /monetize shows), plus the paid deals' money and the
 * chats that quoted a K-code. Read-only.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isE2eFixture } from "@/lib/monetize/e2e-fixture";
import { loadChatFacts } from "@/lib/monetize/chat-funnel";
import { loadInbound } from "@/lib/monetize/inbound";
import { REAL_PERSON } from "@/lib/monetize/team";
import { numbersLines, numbersMessage, type NumberLine } from "./loop-numbers-pure";

/** Real WhatsApp chats of the last 7 days whose tenant wrote a home's code ("K5811"). */
async function quotingCount(now: Date): Promise<number> {
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const rows = await db
    .$queryRaw<{ id: string; messages: unknown }[]>(
      Prisma.sql`
        SELECT DISTINCT t.id, t.messages
        FROM "AgentTask" t JOIN "AgentProfile" p ON p.id = t."profileId"
        CROSS JOIN LATERAL jsonb_array_elements(t.messages) m
        WHERE t."createdAt" >= ${since} AND p."waPhone" IS NOT NULL AND ${REAL_PERSON}
          AND m->>'role' = 'user' AND m->>'text' ~* '(^|[^a-z0-9])k[-[:space:]#]?[0-9]{3,6}([^0-9]|$)'`,
    )
    .catch(() => []);
  return rows.filter((r) => !isE2eFixture(r.messages)).length;
}

/** The lines, now. */
export async function loadNumbers(now = new Date()): Promise<NumberLine[]> {
  const [chats, paid, quoting] = await Promise.all([
    loadChatFacts(db, 30, now),
    db.deal.findMany({ where: { status: "PAID" }, select: { mkanShare: true, tripCost: true, paidAt: true } }),
    quotingCount(now),
  ]);
  return numbersLines({ now, chats, paidDeals: paid, quoting });
}

/** The report as a message. */
export async function numbersReport(now = new Date()): Promise<string> {
  // Inbound first (2026-11-16); a failed read is "not ready", never a broken Sunday message.
  const inbound = await loadInbound(now).catch(() => null);
  return numbersMessage(await loadNumbers(now), undefined, inbound);
}
