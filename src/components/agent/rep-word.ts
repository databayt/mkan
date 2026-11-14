import "server-only";

/**
 * A word from Mkan's person, written (rep-word-pure.ts has the words): the home's newest open deal moves
 * to that status through the same setDealStatus `pnpm deal:status` calls — so SIGNED sends the share
 * request to the broker when a payout number is set, PAID writes the revenue entry, and a signed or paid
 * deal with no share is refused until they give one or say "no share". The reply says what was recorded.
 */
import { db } from "@/lib/db";
import { scrubTitle } from "@/lib/redact";
import { setDealStatus } from "./deal";
import { rwf, viewingLabel } from "./deal-pure";
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

/** Apply the word and say what happened. Never throws: a refusal is the reply. */
export async function applyRepWord(word: RepWord): Promise<string> {
  if (word.kind === "list") return openDeals();
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
