/**
 * Dry run of the direct-intro path against the real "available" answers — READ ONLY: nothing is sent,
 * queued or written. For each broker request that says AVAILABLE in the last 30 days it prints who
 * would be introduced, the terms ask and the tenant message the code would produce, and when each
 * would go (the form/pick path queues at once; a typed yes rides on the broker's reply; the sweep
 * runs at :00 :15 :30 :45; the outbox sends 08:00–20:00 Kigali).
 *
 *   pnpm intro:dry
 */
import { config } from "dotenv";
config({ override: true, quiet: true } as never);
process.env.PRISMA_QUIET ??= "1";

import { introPendingMessage, introTenantMessage, lastDigits, nextSweepTick, termsAskMessage, connectionMode } from "../../src/components/agent/intro-pure";
import { inSendWindow } from "./../wa/outbox-pure";

const kigali = (d: Date) => d.toLocaleString("en-GB", { timeZone: "Africa/Kigali", hour12: false });

async function main() {
  const { db } = await import("../../src/lib/db");
  const { brokerSendMode, testPhones } = await import("../../src/components/agent/broker-sends");
  const { agreementOf } = await import("../../src/components/agent/deal");
  try {
    const now = new Date();
    const [mode, tests, paid] = await Promise.all([brokerSendMode(), testPhones(), db.deal.count({ where: { status: "PAID" } })]);
    console.log(`now ${kigali(now)} Kigali · broker sends ${mode} · ${paid} paid deals → ${connectionMode(paid)} mode · send window ${inSendWindow(now) ? "open" : "closed"}`);
    const reqs = await db.brokerRequest.findMany({
      where: { status: "AVAILABLE", respondedAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } },
      orderBy: { respondedAt: "desc" },
      select: { listingId: true, respondedAt: true, brokerUserId: true },
    });
    const homes = [...new Map(reqs.map((r) => [r.listingId, r])).values()];
    console.log(`${reqs.length} available answers in 30 days on ${homes.length} homes`);
    for (const r of homes) {
      const ref = `K${r.listingId}`;
      const tasks = await db.agentTask.findMany({
        where: { brokerRequests: { some: { listingId: r.listingId } } },
        select: { id: true, locale: true, updatedAt: true, status: true, profile: { select: { waPhone: true } } },
      });
      const link = await db.listingBroker.findFirst({ where: { listingId: r.listingId, userId: r.brokerUserId, brokerId: { not: null } }, select: { brokerId: true } });
      const broker = link?.brokerId ? await db.broker.findUnique({ where: { id: link.brokerId }, select: { name: true, phones: true, sharePct: true, shareFlatRwf: true, optOut: true } }) : null;
      const home = await db.listing.findUnique({ where: { id: r.listingId }, select: { title: true } });
      const title = home?.title?.slice(0, 40) ?? ref;
      console.log(`\n${ref} (${title}) — said yes ${kigali(r.respondedAt!)}`);
      const who = tasks.map((t) => {
        const wa = t.profile?.waPhone;
        const gate = !wa ? "web chat, no WhatsApp number — sees the answer in the chat; no intro is possible" : tests.has(wa.replace(/\D/g, "")) ? "team number — TEST card, never reaches a broker" : "real tenant";
        return `  chat …${t.id.slice(-6)} ${wa ? lastDigits(wa) : "—"} (${t.locale}, ${t.status}, last update ${kigali(t.updatedAt)}): ${gate}`;
      });
      console.log(who.length ? who.join("\n") : "  no chat waiting on it");
      if (!broker) { console.log("  no broker on file for that yes → startIntro: started=false → the deal sheet goes (relay), no terms ask"); continue; }
      if (broker.optOut) { console.log("  broker opted out → no intro"); continue; }
      const real = tasks.filter((t) => t.profile?.waPhone && !tests.has(t.profile.waPhone.replace(/\D/g, "")));
      if (!real.length) { console.log("  no real WhatsApp tenant → nothing would go"); continue; }
      const agreed = agreementOf(broker);
      const tick = nextSweepTick(now);
      if (agreed) {
        console.log(`  terms already agreed → no terms ask. Intro now: tenant gets the broker's number (queued at once, sent ${inSendWindow(now) ? "within a minute" : "at 08:00 Kigali"}); broker gets the tenant's number on the sweep at ${kigali(tick)} (10-minute rule, then ${inSendWindow(tick) ? "sent" : "held to 08:00"}).`);
        console.log(`  tenant: ${introTenantMessage(real[0]!.locale === "rw" ? "rw" : real[0]!.locale === "ar" ? "ar" : "en", { title, ref, broker: broker.name, phone: "+250…" })}`);
      } else {
        const ask = termsAskMessage({ ref, title, tenants: real.length });
        const when = mode === "gated" ? (inSendWindow(now) ? "queued at once, sent within ~1 min of the broker gap" : "queued at once, held by the outbox to 08:00 Kigali") : "HELD — broker sends are off: a #mkan card + /monetize row, nothing queued";
        console.log(`  terms ask → ${broker.name} (${lastDigits(broker.phones[0] ?? "")}): ${when}\n  "${ask}"`);
        console.log(`  tenant now: "${introPendingMessage(real[0]!.locale === "rw" ? "rw" : real[0]!.locale === "ar" ? "ar" : "en", title)}" (queued with the ask — inside the hour)`);
        console.log(`  after the broker's YES: both numbers go in the same pass (≈1 min); no YES → deal sheet at 24 h. Sweep ticks at ${kigali(tick)}.`);
      }
    }
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(`❌ ${(e as Error).message}`);
  process.exit(1);
});
