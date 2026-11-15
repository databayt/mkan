import "server-only";

/**
 * A word from Mkan's person, written (rep-word-pure.ts has the words): the home's newest open deal moves
 * to that status through the same setDealStatus `pnpm deal:status` calls — so SIGNED sends the share
 * request to the broker when a payout number is set, PAID writes the revenue entry, and a signed or paid
 * deal with no share is refused until they give one or say "no share". The reply says what was recorded.
 */
import { db } from "@/lib/db";
import { crmDealPatch, crmNote } from "@/lib/crm/deal-sync";
import { scrubTitle } from "@/lib/redact";
import { HUMAN_HOLD_MS } from "../../../scripts/wa/tenant-pure";
import { phoneKey } from "../../../scripts/wa/outbox-pure";
import { setDealStatus } from "./deal";
import { dealKey } from "./deal-event-pure";
import { rwf, viewingLabel } from "./deal-pure";
import { kigaliLabel } from "./loop-feed-pure";
import { repOffKey } from "./viewing-loop-pure";
import { mutateState, writeState } from "./wa-state";
import type { RepStatus, RepWord } from "./rep-word-pure";

const OPEN: Record<RepStatus, ("VIEWING_BOOKED" | "VIEWED" | "SIGNED")[]> = {
  VIEWED: ["VIEWING_BOOKED"],
  SIGNED: ["VIEWING_BOOKED", "VIEWED"],
  // Paid means signed too (deal.ts stamps signedAt): a deal can go straight there.
  PAID: ["SIGNED", "VIEWED", "VIEWING_BOOKED"],
  LOST: ["VIEWING_BOOKED", "VIEWED", "SIGNED"],
};

/** The open deals, one line each, newest first. */
async function openDeals(): Promise<string> {
  const deals = await db.deal.findMany({
    where: { status: { in: ["VIEWING_BOOKED", "VIEWED", "SIGNED"] } },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: { status: true, listingId: true, mkanShare: true, listing: { select: { title: true } }, visit: { select: { scheduledFor: true } } },
  });
  if (deals.length === 0) return "No open deals.";
  return deals
    .map((d) => {
      const when = d.visit?.scheduledFor ? ` · ${viewingLabel(d.visit.scheduledFor, "en")}` : "";
      const share = d.mkanShare ? ` · share ${rwf(d.mkanShare)}` : " · no share yet";
      return `K${d.listingId} · ${d.status.toLowerCase().replace("_", " ")}${when}${share} · ${scrubTitle(d.listing.title) || ""}`.trim();
    })
    .join("\n");
}

/** The deal a code points at (the newest, any status) and the deal's key for the feed and Twenty. */
async function dealOf(listingId: number) {
  const deal = await db.deal.findFirst({
    where: { listingId },
    orderBy: { createdAt: "desc" },
    select: { id: true, taskId: true, notes: true, tenantPhone: true },
  });
  return deal ? { deal, key: dealKey({ taskId: deal.taskId, dealId: deal.id, listingId }) } : null;
}

/** The tenant a code is about: the deal's, else the newest chat that asked a broker about the home. Digits only. */
async function tenantDigits(listingId: number, deal: { tenantPhone: string | null } | null): Promise<string | null> {
  const fromDeal = deal?.tenantPhone ? phoneKey(deal.tenantPhone) : "";
  if (fromDeal) return fromDeal;
  const ask = await db.brokerRequest.findFirst({
    where: { listingId, taskId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { task: { select: { profile: { select: { waPhone: true } } } } },
  });
  const wa = ask?.task?.profile?.waPhone ? phoneKey(ask.task.profile.waPhone) : "";
  return wa || null;
}

/** The words that are not a status (rep-word-pure.ts): pause, hand back, note, cost, day off, numbers. */
async function applyControl(word: Exclude<RepWord, { kind: "status" } | { kind: "list" }>): Promise<string> {
  if (word.kind === "numbers") {
    const { numbersReport } = await import("./loop-numbers");
    return numbersReport();
  }
  if (word.kind === "off") {
    await writeState(repOffKey(word.day), { at: new Date().toISOString() });
    const day = new Date(`${word.day}T00:00:00Z`);
    const from = new Date(day.getTime() - 2 * 3_600_000);
    const booked = await db.listingVisit.count({ where: { outcome: "Scheduled", scheduledFor: { gte: from, lt: new Date(from.getTime() + 86_400_000) } } }).catch(() => 0);
    const label = kigaliLabel(new Date(day.getTime() + 12 * 3_600_000)).split(",")[0];
    return `Marked off: ${label}. The line offers no viewing that day.${booked ? ` ${booked} already booked that day stay — move them yourself.` : ""}`;
  }
  const ref = `K${word.listingId}`;
  const found = await dealOf(word.listingId);
  if (word.kind === "take" || word.kind === "back") {
    const digits = await tenantDigits(word.listingId, found?.deal ?? null);
    if (!digits) return `No tenant found for ${ref}: no deal and no chat asked about it.`;
    if (word.kind === "back") {
      await mutateState<Record<string, string>>("tenant-human", {}, (human) => {
        const { [digits]: _gone, ...rest } = human;
        void _gone;
        return rest;
      });
      return `Back: the line answers in the +${digits} chat again (${ref}).`;
    }
    const now = new Date();
    await mutateState<Record<string, string>>("tenant-human", {}, (human) => ({ ...human, [digits]: now.toISOString() }));
    return `Taken: the line is paused in the +${digits} chat until ${kigaliLabel(new Date(now.getTime() + HUMAN_HOLD_MS))} (${ref}). Send: back ${ref} to hand it back sooner.`;
  }
  if (!found) return `There is no deal for ${ref} yet — nothing saved.`;
  if (word.kind === "note") {
    const stamp = new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10);
    const notes = [found.deal.notes, `[${stamp}] ${word.text}`].filter(Boolean).join("\n");
    await db.deal.update({ where: { id: found.deal.id }, data: { notes } });
    await crmNote(found.key, word.text).catch((err) => console.warn(`[rep-word] crm note: ${(err as Error).message}`));
    return `Noted on ${ref}.`;
  }
  await db.deal.update({ where: { id: found.deal.id }, data: { tripCost: word.amount } });
  await crmDealPatch(found.key, { tripCostRwf: word.amount }).catch((err) => console.warn(`[rep-word] crm patch: ${(err as Error).message}`));
  return `Recorded: the trip for ${ref} cost ${rwf(word.amount)}.`;
}

/** Apply the word and say what happened. Never throws: a refusal is the reply. */
export async function applyRepWord(word: RepWord): Promise<string> {
  if (word.kind === "list") return openDeals();
  if (word.kind !== "status") {
    try {
      return await applyControl(word);
    } catch (err) {
      return `That did not go through: ${(err as Error).message.slice(0, 200)}`;
    }
  }
  const ref = `K${word.listingId}`;
  const deal = await db.deal.findFirst({
    where: { listingId: word.listingId, status: { in: OPEN[word.status] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true },
  });
  if (!deal) return `No open deal for ${ref} that can become ${word.status.toLowerCase()}.\n${await openDeals()}`;
  try {
    const done = await setDealStatus(deal.id, word.status, { mkanShare: word.share, noShare: word.noShare, notes: word.note ? `${word.note} (WhatsApp, Mkan's person)` : null });
    const share = done.mkanShare ? rwf(done.mkanShare) : null;
    if (word.status === "SIGNED") {
      const asked = await db.waState.findUnique({ where: { key: `share-asked:${done.id}` }, select: { key: true } }).catch(() => null);
      const next = !share ? "Closed with no share for Mkan." : asked ? `Mkan's share ${share}: the request went to the broker on WhatsApp.` : `Mkan's share ${share}: the request is drafted in #mkan (no payout number is set, or the broker has no number).`;
      return `Recorded: ${ref} signed. ${next} When the broker pays, send: paid ${ref}`;
    }
    if (word.status === "PAID") return `Recorded: ${ref} paid${share ? `, ${share} received` : ""}.`;
    if (word.status === "VIEWED") return `Recorded: ${ref} viewed. When it is signed, send: signed ${ref}`;
    return `Recorded: ${ref} lost${word.note ? ` (${word.note})` : ""}.`;
  } catch (err) {
    const why = (err as Error).message;
    if (/no share for Mkan/i.test(why)) return `${ref} has no share on record. Send: ${word.status.toLowerCase()} ${ref} share <RWF> — or: ${word.status.toLowerCase()} ${ref} no share`;
    return `That did not go through for ${ref}: ${why.slice(0, 200)}`;
  }
}
