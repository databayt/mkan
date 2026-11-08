/**
 * The team's own chats, kept out of every count on /monetize and in the funnel (src/lib/monetize/team.ts).
 * Until 2026-11-08 every chat the numbers showed was the team testing the bot; this marks them.
 *
 *   T="pnpm -s exec tsx --require ./scripts/agent/no-server-only.js scripts/monetize/team.ts"
 *   $T                       what is marked: team browsers, team numbers (masked)
 *   $T suggest [--days=30]   chats that look like us: WhatsApp numbers not yet marked, busy browsers
 *   $T add <profileId…>      a WhatsApp profile's number joins the team numbers (`test-phones`:
 *                            its picks never reach a broker); a browser joins `team-profiles`
 *   $T remove <profileId…>
 *
 * Not a package.json script: package.json is a held path for the guarded deploy (ship.sh), and this
 * runs on the Mac only. Ids, never numbers, on the command line: the number is read from the profile
 * and never printed whole.
 */
import { config } from "dotenv";
config({ override: true, quiet: true } as Parameters<typeof config>[0]);
process.env.PRISMA_QUIET = "1";

import { refuseUnattended } from "../unattended";

const args = process.argv.slice(2);
const words = args.filter((a) => !a.startsWith("--"));
const daysArg = Number(args.find((a) => a.startsWith("--days="))?.slice(7));
const DAYS = Number.isFinite(daysArg) && daysArg > 0 ? daysArg : 30;

async function main() {
  // After the env: the db client reads DATABASE_URL when it is first imported.
  const { db } = await import("../../src/lib/db");
  const { Prisma } = await import("@prisma/client");
  const { setTestPhones, testPhones } = await import("../../src/components/agent/broker-sends");
  const { idList, REAL_PERSON, TEAM_PROFILES_KEY } = await import("../../src/lib/monetize/team");
  const { maskPhone } = await import("../../src/lib/redact");
  const digits = (p: string) => p.replace(/\D/g, "");

  const readTeam = async () => idList((await db.waState.findUnique({ where: { key: TEAM_PROFILES_KEY }, select: { value: true } }))?.value);
  const writeTeam = (ids: string[]) =>
    db.waState.upsert({ where: { key: TEAM_PROFILES_KEY }, create: { key: TEAM_PROFILES_KEY, value: ids }, update: { value: ids } });

  try {
    const [cmd, ...ids] = words;
    if (cmd === "add" || cmd === "remove") {
      refuseUnattended("marking the team's chats");
      if (!ids.length) throw new Error(`usage: team.ts ${cmd} <profileId…>`);
      const profiles = await db.agentProfile.findMany({ where: { id: { in: ids } }, select: { id: true, waPhone: true } });
      const missing = ids.filter((id) => !profiles.some((p) => p.id === id));
      if (missing.length) console.warn(`not found: ${missing.join(", ")}`);
      const [phones, team] = await Promise.all([testPhones(), readTeam()]);
      const browsers = new Set(team);
      for (const p of profiles) {
        if (p.waPhone) {
          if (cmd === "add") phones.add(digits(p.waPhone));
          else phones.delete(digits(p.waPhone));
          console.log(`${cmd === "add" ? "+" : "−"} team number ${maskPhone(p.waPhone)} (${p.id})`);
        } else {
          if (cmd === "add") browsers.add(p.id);
          else browsers.delete(p.id);
          console.log(`${cmd === "add" ? "+" : "−"} team browser ${p.id}`);
        }
      }
      await Promise.all([setTestPhones([...phones]), writeTeam([...browsers])]);
    }

    if (cmd === "suggest") {
      const since = new Date(Date.now() - DAYS * 86_400_000);
      const rows = await db.$queryRaw<{ id: string; waPhone: string | null; chats: number; messages: number; first: Date; last: Date }[]>(Prisma.sql`
        SELECT p.id, p."waPhone",
               COUNT(t.id)::int AS chats,
               COALESCE(SUM(jsonb_array_length(t.messages)), 0)::int AS messages,
               MIN(t."createdAt") AS first, MAX(t."updatedAt") AS last
        FROM "AgentProfile" p JOIN "AgentTask" t ON t."profileId" = p.id
        WHERE t."createdAt" >= ${since} AND ${REAL_PERSON}
        GROUP BY p.id, p."waPhone"
        ORDER BY p."waPhone" IS NULL, COUNT(t.id) DESC, MAX(t."updatedAt") DESC`);
      const day = (d: Date) => d.toISOString().slice(5, 10);
      console.log(`Chats in ${DAYS} days that count as real people now (${rows.length}). WhatsApp numbers first; a browser with 4+ chats is usually us:`);
      for (const r of rows) {
        const who = r.waPhone ? `WhatsApp ${maskPhone(r.waPhone)}` : r.chats >= 4 ? "browser (likely us)" : "browser";
        console.log(`  ${r.id}  ${who.padEnd(22)} ${String(r.chats).padStart(3)} chats  ${String(r.messages).padStart(4)} messages  ${day(r.first)} → ${day(r.last)}`);
      }
      console.log(`Mark ours with: team.ts add <id> <id> …`);
      return;
    }

    if (cmd && !["add", "remove", "status", "list"].includes(cmd)) {
      console.error("usage: team.ts [status | suggest [--days=30] | add <profileId…> | remove <profileId…>]");
      process.exitCode = 2;
      return;
    }
    const [phones, team] = await Promise.all([testPhones(), readTeam()]);
    console.log(`team numbers (${phones.size}): ${[...phones].map((p) => maskPhone(`+${p}`)).join(", ") || "none"}`);
    console.log(`team browsers (${team.length}): ${team.join(", ") || "none"}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(`❌ ${(e as Error).message}`);
  process.exit(1);
});
