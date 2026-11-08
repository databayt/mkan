/**
 * Read-only: every /find (web) chat of the last N days, and how far each got toward a broker's answer
 * reaching the tenant on WhatsApp (2026-11-08, sprint "Web chats reach WhatsApp").
 *
 *   pnpm tsx scripts/agent/web-number-trace.ts [--days=7] [--json]
 *
 * Per chat: reachedAsk (a "none"/shortlist reply with demand, or a home the broker could be asked
 * about), askShown (the DemandCard condition in content.tsx / bubble/panel.tsx), numberGiven
 * (TenantRequest.phone / optInAt), brokerAsked (BrokerRequest rows), answered (AVAILABLE/RENTED rows),
 * and `answerReaches` — whether an answer would reach the tenant on WhatsApp: a linked WhatsApp
 * profile (profile.waPhone), or a number left on the request (which the alert path uses for
 * demand matches only — see the verdicts below). Team chats are left out (src/lib/monetize/team.ts).
 */
import { config } from "dotenv";
config({ override: true, quiet: true } as never);

async function main() {
  const days = Number(process.argv.find((a) => a.startsWith("--days="))?.slice(7) ?? 7);
  const { db } = await import("../../src/lib/db");
  const { REAL_PERSON } = await import("../../src/lib/monetize/team");
  const { Prisma } = await import("@prisma/client");
  const since = new Date(Date.now() - days * 864e5);
  const ids = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT t.id FROM "AgentTask" t LEFT JOIN "AgentProfile" p ON p.id = t."profileId"
    WHERE t."createdAt" >= ${since} AND ${REAL_PERSON} AND p."waPhone" IS NULL`);
  const tasks = await db.agentTask.findMany({
    where: { id: { in: ids.map((r) => r.id) } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, createdAt: true, status: true, messages: true, shortlist: true, profile: { select: { waPhone: true } },
      demand: { select: { phone: true, optInAt: true, status: true } },
      brokerRequests: { select: { status: true, consentAt: true, listingId: true } },
    },
  });
  const rows = tasks.map((t) => {
    const msgs = (t.messages as { role?: string; kind?: string; demand?: boolean; say?: string }[] | null) ?? [];
    const agent = msgs.filter((m) => m.role === "agent");
    const demandMsg = agent.some((m) => (m.kind === "none" || m.kind === "shortlist") && m.demand);
    const checkLine = agent.some((m) => m.kind === "followUp" && ["check", "visit", "about", "person"].includes(m.say ?? ""));
    const list = (t.shortlist as { lead?: boolean; availability?: string }[] | null) ?? [];
    const unconfirmed = list.filter((s) => s.lead && s.availability === "unconfirmed").length;
    const asked = t.brokerRequests.length;
    const answered = t.brokerRequests.filter((r) => r.status === "AVAILABLE" || r.status === "RENTED").length;
    return {
      id: t.id, at: t.createdAt.toISOString().slice(0, 16), userTurns: msgs.filter((m) => m.role === "user").length,
      reachedAsk: demandMsg || checkLine || unconfirmed > 0 || asked > 0,
      askShown: demandMsg && !!t.demand,
      numberGiven: !!t.demand?.phone,
      brokerAsked: asked, answered, available: t.brokerRequests.filter((r) => r.status === "AVAILABLE").length,
      answerReachesWhatsApp: !!t.profile?.waPhone || !!t.demand?.phone,
    };
  });
  const sum = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;
  console.log(JSON.stringify({
    days, webChats: rows.length, reachedAsk: sum((r) => r.reachedAsk), askShown: sum((r) => r.askShown), numberGiven: sum((r) => r.numberGiven),
    brokerAsked: sum((r) => r.brokerAsked > 0), answered: sum((r) => r.answered > 0), availableAnswers: sum((r) => r.available > 0),
    availableAndReaches: sum((r) => r.available > 0 && r.answerReachesWhatsApp),
  }, null, 1));
  if (process.argv.includes("--json")) console.log(JSON.stringify(rows, null, 1));
  else rows.filter((r) => r.reachedAsk || r.brokerAsked).forEach((r) => console.log(JSON.stringify(r)));
  const exp = await db.experiment.findUnique({ where: { id: "cmw34ki160000zpsdcsbpefay" } });
  console.log("experiment", JSON.stringify(exp));
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
