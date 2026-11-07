/**
 * Start the direct intro for a home a broker already said yes to — the old yeses that came before
 * intros existed, or any a tenant has not picked again. Messages the broker and the tenant, so it
 * refuses an unattended run (scripts/unattended.ts); Abdout runs it, or taps Yes on /monetize.
 *
 *   pnpm intro:start --listing=6041            the tenants waiting on K6041 with a WhatsApp number
 */
import { config } from "dotenv";
config({ override: true, quiet: true } as never);
process.env.PRISMA_QUIET ??= "1";

import { refuseUnattended } from "../unattended";

async function main() {
  const listingId = Number(process.argv.find((a) => a.startsWith("--listing="))?.slice(10));
  if (!Number.isInteger(listingId) || listingId <= 0) throw new Error("usage: pnpm intro:start --listing=<id>");
  refuseUnattended("starting a direct intro (messages a broker and a tenant)");
  const { db } = await import("../../src/lib/db");
  const { startIntro } = await import("../../src/components/agent/deal-intro");
  const { brokerSendMode, testPhones } = await import("../../src/components/agent/broker-sends");
  try {
    if ((await brokerSendMode()) !== "gated") throw new Error("broker sends are off: `pnpm wa:brokers gated` first");
    const tests = await testPhones();
    const yes = await db.brokerRequest.findFirst({ where: { listingId, status: "AVAILABLE" }, orderBy: { respondedAt: "desc" }, select: { broker: { select: { phoneNumber: true } } } });
    const tasks = await db.agentTask.findMany({
      where: { brokerRequests: { some: { listingId } }, profile: { is: { waPhone: { not: null } } } },
      select: { id: true, locale: true, shortlist: true, profile: { select: { waPhone: true } } },
    });
    const real = tasks.filter((t) => !tests.has((t.profile?.waPhone ?? "").replace(/\D/g, "")));
    if (!real.length) throw new Error(`no real WhatsApp tenant is waiting on K${listingId}`);
    const res = await startIntro(real, listingId, yes?.broker.phoneNumber ?? null, { typed: false });
    console.log(res.started ? `intro started for ${real.length} tenant(s) on K${listingId}: the terms ask and the tenant's note are queued` : `K${listingId}: no broker on file to introduce — nothing started`);
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(`❌ ${(e as Error).message}`);
  process.exit(1);
});
