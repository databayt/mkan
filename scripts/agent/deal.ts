/**
 * The person from Mkan books the three-party viewing once the broker agreed the
 * time, and records how the deal ended (src/components/agent/deal.ts).
 *
 *   pnpm deal:list                                   viewings asked, booked, and open deals
 *   pnpm deal:terms --broker=<id or phone> --share-pct=50 | --share-rwf=30000 [--note="…"]
 *                                                    Mkan's share as the broker agreed it
 *   pnpm deal:book --task=<id> --listing=<id> --at=<ISO or "2026-11-04 10:00" Kigali> [--place="…"] [--by=Osman]
 *                  [what the broker confirmed: --rent=350000 --advance=3 --deposit=1 --commission=10
 *                   --fee=5000 --water=yes --power=no --lease=12 --move-in=2026-11-15]
 *                  [Mkan's share, unless already agreed: --share-pct=50 | --share-rwf=30000 | --no-share]
 *   pnpm deal:status --deal=<id> --status=viewed|signed|paid|lost [--share=<RWF>] [--no-share] [--note="…"]
 *                  (also: pnpm deal:status <id> SIGNED)
 *
 * `deal:book` messages the tenant on WhatsApp (the outbox's caps apply) and
 * posts to #mkan; the #mkan "Viewing asked" card carries the exact command and
 * the terms to ask. Each term flag is optional: a term left out was not discussed,
 * and the tenant's confirmation restates only what the broker said. A booking
 * needs Mkan's share (agreed now or before), and a signed or paid deal needs it
 * too — `--no-share` goes on without one, on purpose.
 */
import { config } from "dotenv";
config({ override: true });

import { refuseUnattended } from "../unattended";

const args = process.argv.slice(2);
const arg = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const has = (flag: string) => args.includes(`--${flag}`);
const cmd = args.find((a) => !a.startsWith("--")) ?? "list";
// These write money or reach a real tenant and broker: never from an unattended session, however it
// was started (the runner's --disallowedTools covers `pnpm deal:*`, not `tsx scripts/agent/deal.ts`).
if (cmd === "book") refuseUnattended("booking a viewing with a real tenant and broker");
if (cmd === "status") refuseUnattended("recording how a real deal ended (it writes revenue)");
if (cmd === "terms") refuseUnattended("recording a broker's share agreement");

/** An ISO instant, or "YYYY-MM-DD HH:MM" read as Kigali time (UTC+2). */
function when(text: string | undefined): Date {
  if (!text) throw new Error("--at is required");
  const local = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/);
  const at = local ? new Date(Date.UTC(+local[1]!, +local[2]! - 1, +local[3]!, +local[4]!, +local[5]!) - 2 * 3_600_000) : new Date(text);
  if (Number.isNaN(at.getTime())) throw new Error(`not a time: ${text}`);
  return at;
}

async function main() {
  const { db } = await import("../../src/lib/db");
  const deal = await import("../../src/components/agent/deal");
  const { confirmedTermsLine, parseShareFlags, parseStatusArgs, parseTermFlags, shareLabel, viewingLabel } = await import("../../src/components/agent/deal-pure");
  try {
    if (cmd === "book") {
      const taskId = arg("task");
      const listingId = Number(arg("listing"));
      if (!taskId || !listingId) throw new Error("--task and --listing are required");
      const at = when(arg("at"));
      // Parsed before anything is written: a mistyped term stops the booking, not half of it.
      const terms = parseTermFlags(arg);
      const share = parseShareFlags(arg, has);
      const res = await deal.bookViewing({ taskId, listingId, at, place: arg("place") ?? null, by: arg("by") ?? null, terms, share });
      console.log(`booked: visit ${res.visitId}, deal ${res.dealId} — ${viewingLabel(at, "en")} (Kigali)`);
      const said = confirmedTermsLine("en", terms, null);
      console.log(said ? `  ${said}` : "  no terms recorded — the tenant's confirmation keeps the deal sheet's usual terms");
      console.log(`  ${res.economics}`);
    } else if (cmd === "status") {
      const rest = [...args];
      rest.splice(args.indexOf(cmd), 1);
      const s = parseStatusArgs(rest);
      if (!s.id || !s.status || !["VIEWED", "SIGNED", "PAID", "LOST"].includes(s.status)) throw new Error("--deal and --status=viewed|signed|paid|lost are required");
      const res = await deal.setDealStatus(s.id, s.status as "VIEWED" | "SIGNED" | "PAID" | "LOST", { mkanShare: s.share, notes: s.note, noShare: s.noShare });
      console.log(`deal ${res.id} → ${s.status}${res.mkanShare ? ` · Mkan's share RWF ${res.mkanShare.toLocaleString("en-US")}` : ""}`);
    } else if (cmd === "terms") {
      const key = arg("broker")?.trim();
      if (!key) throw new Error("--broker=<broker id or phone> is required");
      const share = parseShareFlags(arg, has);
      if (!share || share.none) throw new Error("--share-pct=<% of their commission> or --share-rwf=<RWF a lease> is required");
      const digits = key.replace(/\D/g, "");
      const broker = await db.broker.findFirst({
        where: { OR: [{ id: key }, ...(digits.length >= 9 ? [{ phones: { hasSome: [`+${digits}`, digits] } }] : [])] },
        select: { id: true, name: true, relationship: true },
      });
      if (!broker) throw new Error(`no broker ${key}`);
      await db.broker.update({
        where: { id: broker.id },
        data: {
          sharePct: share.pct ?? null,
          shareFlatRwf: share.flatRwf ?? null,
          agreedAt: new Date(),
          agreementNote: arg("note") ?? `agreed via deal:terms ${new Date().toISOString().slice(0, 10)}`,
          ...(broker.relationship === "PAUSED" || broker.relationship === "DO_NOT_CONTACT" ? {} : { relationship: "PARTNER" as const }),
        },
      });
      console.log(`${broker.name}: Mkan's share ${shareLabel(share)} — recorded${broker.relationship === "PAUSED" || broker.relationship === "DO_NOT_CONTACT" ? ` (relationship stays ${broker.relationship})` : ", now a PARTNER"}`);
    } else {
      const [visits, deals] = await Promise.all([
        db.listingVisit.findMany({
          where: { taskId: { not: null }, scheduledFor: { gte: new Date(Date.now() - 7 * 86_400_000) } },
          orderBy: { scheduledFor: "asc" },
          select: { id: true, scheduledFor: true, outcome: true, contactPhone: true, repName: true, meetingPoint: true, listing: { select: { id: true, title: true } } },
        }),
        db.deal.findMany({ where: { status: { in: ["VIEWING_BOOKED", "VIEWED", "SIGNED"] } }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, status: true, listingId: true, rentMonthly: true, mkanShare: true, createdAt: true } }),
      ]);
      console.log(`viewings (last 7 days and ahead): ${visits.length}`);
      for (const v of visits) console.log(`  ${viewingLabel(v.scheduledFor, "en")}  ${v.outcome.padEnd(9)} K${v.listing.id} ${v.listing.title ?? ""} · ${v.repName ?? "?"}${v.meetingPoint ? ` · ${v.meetingPoint}` : ""}`);
      console.log(`open deals: ${deals.length}`);
      for (const d of deals) console.log(`  ${d.id}  ${d.status.padEnd(14)} K${d.listingId}  rent ${d.rentMonthly ?? "?"}  share ${d.mkanShare ?? "—"}`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exitCode = 1;
});
