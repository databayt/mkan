/**
 * The person from Mkan books the three-party viewing once the broker agreed the
 * time, and records how the deal ended (src/components/agent/deal.ts).
 *
 *   pnpm deal:list                                   viewings asked, booked, and open deals
 *   pnpm deal:book --task=<id> --listing=<id> --at=<ISO or "2026-11-04 10:00" Kigali> [--place="…"] [--by=Osman]
 *                  [what the broker confirmed: --rent=350000 --advance=3 --deposit=1 --commission=10
 *                   --fee=5000 --water=yes --power=no --lease=12 --move-in=2026-11-15]
 *   pnpm deal:status --deal=<id> --status=viewed|signed|paid|lost [--share=<RWF>] [--note="…"]
 *
 * `deal:book` messages the tenant on WhatsApp (the outbox's caps apply) and
 * posts to #mkan; the #mkan "Viewing asked" card carries the exact command and
 * the terms to ask. Each term flag is optional: a term left out was not discussed,
 * and the tenant's confirmation restates only what the broker said.
 */
import { config } from "dotenv";
config({ override: true });

import { refuseUnattended } from "../unattended";

const args = process.argv.slice(2);
const arg = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const cmd = args.find((a) => !a.startsWith("--")) ?? "list";
if (cmd === "book") refuseUnattended("booking a viewing with a real tenant and broker");

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
  const { confirmedTermsLine, parseTermFlags, viewingLabel } = await import("../../src/components/agent/deal-pure");
  try {
    if (cmd === "book") {
      const taskId = arg("task");
      const listingId = Number(arg("listing"));
      if (!taskId || !listingId) throw new Error("--task and --listing are required");
      const at = when(arg("at"));
      // Parsed before anything is written: a mistyped term stops the booking, not half of it.
      const terms = parseTermFlags(arg);
      const res = await deal.bookViewing({ taskId, listingId, at, place: arg("place") ?? null, by: arg("by") ?? null, terms });
      console.log(`booked: visit ${res.visitId}, deal ${res.dealId} — ${viewingLabel(at, "en")} (Kigali)`);
      const said = confirmedTermsLine("en", terms, null);
      console.log(said ? `  ${said}` : "  no terms recorded — the tenant's confirmation keeps the deal sheet's usual terms");
    } else if (cmd === "status") {
      const id = arg("deal");
      const status = (arg("status") ?? "").toUpperCase();
      if (!id || !["VIEWED", "SIGNED", "PAID", "LOST"].includes(status)) throw new Error("--deal and --status=viewed|signed|paid|lost are required");
      const share = arg("share");
      const res = await deal.setDealStatus(id, status as "VIEWED" | "SIGNED" | "PAID" | "LOST", { mkanShare: share ? Number(share) : null, notes: arg("note") ?? null });
      console.log(`deal ${res.id} → ${status}`);
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
