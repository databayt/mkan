/**
 * Tenants the old "a person will reply" line left waiting (2026-11-14).
 *
 *   pnpm agent:stranded                 what it would do (reads only)
 *   pnpm agent:stranded --days=14       look further back (default 7)
 *   pnpm agent:stranded --apply         do it: re-check each pick and tell the tenant
 *
 * Until 2026-11-14 a pick the line could not ask about ("no broker to ask", "the broker went quiet", a
 * failed check) became a #mkan card, and the tenant was told a person from Mkan would reply. Nobody did —
 * on 11-12 a real tenant picked a home and has heard nothing since. Each of those picks is run again
 * through today's check (availability.ts askAvailabilityFor: a tenant's own pick may re-ask a silent
 * broker once), and the tenant gets one message: sorry for the slow reply, and what happened.
 *
 * Real WhatsApp tenants only: never a team number, a number that said STOP, a pick already asked about
 * since, or one with a viewing or a deal. `--apply` reaches real tenants and brokers, so it refuses an
 * unattended run (scripts/unattended.ts) and needs the deploy that carries the new check to be live —
 * the outbox on production sends what this queues.
 */
import { config } from "dotenv";
config({ override: true, quiet: true } as never);
process.env.PRISMA_QUIET ??= "1";

import { refuseUnattended } from "../unattended";
import { maskPhone } from "../../src/lib/redact";

const APPLY = process.argv.includes("--apply");
const DAYS = Number(process.argv.find((a) => a.startsWith("--days="))?.slice(7)) || 7;
const STRANDED = ["no-broker", "no-reply", "check-failed", "no-sheet"];

async function main() {
  if (APPLY) {
    refuseUnattended("agent:stranded --apply messages real tenants and brokers");
    // Queued for production's outbox (whatsapp.ts): without this every message is a #mkan card for a person.
    process.env.MKAN_WA_OUTBOX = "1";
  }
  const { db } = await import("../../src/lib/db");
  const { testPhones, brokerSendMode } = await import("../../src/components/agent/broker-sends");
  const { readState } = await import("../../src/components/agent/wa-state");
  const { phoneKey, ALERT_LABEL } = await import("../wa/outbox-pure");
  const { lateLead } = await import("../wa/tenant-pure");
  const { scrubTitle } = await import("../../src/lib/redact");

  const since = new Date(Date.now() - DAYS * 86_400_000);
  const events = await db.agentEvent.findMany({
    where: { kind: "availability_asked", createdAt: { gte: since }, payload: { path: ["handed"], equals: true } },
    orderBy: { createdAt: "desc" },
    select: { taskId: true, createdAt: true, payload: true },
  });
  const [tests, stopped, mode] = await Promise.all([testPhones(), readState<string[]>("tenant-stop", []), brokerSendMode()]);
  const stoppedSet = new Set(stopped.map(phoneKey));
  const seen = new Set<string>();
  const rows: { taskId: string; listingId: number; why: string; at: Date }[] = [];
  for (const e of events) {
    const p = e.payload as { listingId?: number; why?: string } | null;
    if (!p?.listingId || !p.why || !STRANDED.includes(p.why)) continue;
    const key = `${e.taskId}:${p.listingId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ taskId: e.taskId, listingId: p.listingId, why: p.why, at: e.createdAt });
  }
  console.log(`stranded picks, last ${DAYS} d: ${rows.length} · broker sends ${mode}${APPLY ? "" : " · dry run (nothing is written or sent)"}\n`);
  if (APPLY && mode !== "gated") {
    console.log("✋ broker sends are not `gated`: a re-check could reach no broker. Turn them on first (pnpm wa:brokers gated).");
    return;
  }

  let done = 0;
  for (const r of rows) {
    const task = await db.agentTask.findUnique({ where: { id: r.taskId }, select: { id: true, locale: true, shortlist: true, profile: { select: { waPhone: true } } } });
    const to = task?.profile?.waPhone ?? null;
    const item = ((task?.shortlist as { id: number; title?: string; path?: string; availability?: string }[] | null) ?? []).find((s) => s.id === r.listingId);
    const head = `K${r.listingId} ${scrubTitle(item?.title) || ""} · tenant ${maskPhone(to)} · handed ${r.at.toISOString().slice(0, 16)}Z (${r.why})`;
    const skip = (why: string) => console.log(`– ${head}\n    skipped: ${why}`);
    if (!task || !to || !item) {
      skip("no chat, number or home on the chat any more");
      continue;
    }
    const digits = phoneKey(to);
    if (tests.has(digits)) {
      skip("a team number");
      continue;
    }
    if (stoppedSet.has(digits)) {
      skip("the tenant said STOP");
      continue;
    }
    const [asked, deal, home] = await Promise.all([
      db.brokerRequest.findFirst({ where: { taskId: task.id, listingId: r.listingId, createdAt: { gt: r.at } }, select: { status: true } }),
      db.deal.findFirst({ where: { taskId: task.id, listingId: r.listingId }, select: { status: true } }),
      db.listing.findUnique({ where: { id: r.listingId }, select: { lostAt: true } }),
    ]);
    if (asked) {
      skip(`already asked about since (${asked.status})`);
      continue;
    }
    if (deal) {
      skip(`a deal exists (${deal.status})`);
      continue;
    }
    const lang = task.locale === "ar" || task.locale === "rw" ? task.locale : "en";
    if (!APPLY) {
      console.log(`• ${head}\n    would re-check with today's rules${home?.lostAt ? " (the home is off the market now: the tenant is told it was taken)" : ""}, then tell the tenant: "${lateLead(lang)} …"`);
      continue;
    }
    const { askAvailabilityFor } = await import("../../src/components/agent/availability");
    const { checkText } = await import("../../src/components/agent/whatsapp-format");
    const { sendMessages } = await import("../../src/components/agent/whatsapp");
    const { publicAppUrl } = await import("../crm/public-links");
    const title = scrubTitle(item.title) || `K${r.listingId}`;
    const res = home?.lostAt ? { ok: true, asked: false, why: "taken" as const } : await askAvailabilityFor(task.id, r.listingId).catch(() => null);
    const outcome = res?.asked ? (("slow" in res && res.slow) ? "slow" : "asked") : res?.why === "already" || res?.why === "taken" || res?.why === "unreachable" || res?.why === "host" || res?.why === "confirmed" ? res.why : null;
    if (!outcome) {
      console.log(`✗ ${head}\n    the check did not run (${res?.why ?? "error"}): nothing sent`);
      continue;
    }
    if (outcome === "confirmed") {
      // A broker already said yes: the deal sheet itself, which opens "when can you come?" (deal.ts).
      const { sendDealSheet } = await import("../../src/components/agent/deal");
      const sheet = await sendDealSheet({ id: task.id, locale: task.locale, shortlist: task.shortlist, profile: task.profile }, r.listingId).catch(() => false);
      await db.agentTask.update({ where: { id: task.id }, data: { updatedAt: new Date() } }).catch(() => {});
      console.log(`${sheet ? "✓" : "✗"} ${head}\n    confirmed: ${sheet ? "the deal sheet went to the tenant" : "no deal sheet could be written"}`);
      if (sheet) done += 1;
      continue;
    }
    const body = `${lateLead(lang)}\n\n${checkText(lang, outcome, title, outcome === "host" && item.path ? `${publicAppUrl()}${item.path}` : null)}`;
    await sendMessages([{ kind: "TENANT_ALERT", to, body, label: ALERT_LABEL.brokerAnswer }], `Stranded pick → tenant (home #${r.listingId})`);
    // Their answer ("2", "tomorrow 10am") continues this chat (a WhatsApp chat is one search for 24 h).
    await db.agentTask.update({ where: { id: task.id }, data: { updatedAt: new Date() } }).catch(() => {});
    console.log(`✓ ${head}\n    ${outcome}: the tenant was told`);
    done += 1;
  }
  if (APPLY) console.log(`\n${done} tenant(s) told.`);
  await db.$disconnect().catch(() => {});
}

main().catch((err) => {
  console.error(`❌ ${(err as Error).message}`);
  process.exit(1);
});
