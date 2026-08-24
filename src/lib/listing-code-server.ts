/**
 * Minting the mkan listing code (`NNNN-NN`) — see `listing-code.ts` for what
 * the code means.
 *
 * Codes are minted at **publish**, not at import. An imported row keeps the
 * Airbnb room id in `sourceListingId` and nothing else; it earns a code the
 * moment it becomes publicly reachable, which is the moment the code has to
 * exist. Every place that flips `isPublished` true calls this — if a new one
 * appears and forgets, the invariant "every published listing carries a code"
 * breaks silently, which is exactly how the 8 hand-migrated codes came to be
 * the only ones.
 */
import { db } from "@/lib/db";
import { hostAccountNumber } from "@/lib/listing-code";

const MAX_UNITS_PER_HOST = 99;
const RETRIES = 5;

/**
 * Give a listing a code if it lacks one, and return it.
 *
 * Returns null — loudly — when the host has no account number to build one
 * from. That is the 6 `legacy-*@mkan.org` hosts; the caller keeps going (the
 * listing still resolves by row id) rather than blocking a publish on an
 * operator decision about account allocation.
 */
export async function ensureListingCode(listingId: number): Promise<string | null> {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { id: true, code: true, host: { select: { email: true, username: true } } },
  });
  if (!listing) return null;
  if (listing.code) return listing.code;

  const account = hostAccountNumber(listing.host);
  if (!account) {
    console.warn(
      `[listing-code] listing ${listingId} has no account number to build a code from ` +
        `(host ${listing.host?.email ?? "unknown"}). It will resolve by row id until the ` +
        `host is given an NNNN@mkan.org account.`,
    );
    return null;
  }

  // Allocate the next free unit for this host. The read-then-write is racy
  // between two concurrent publishes for the same host, so the unique index on
  // `code` is the real arbiter and we simply take the next number and retry.
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const taken = await db.listing.findMany({
      where: { code: { startsWith: `${account}-` } },
      select: { code: true },
    });
    const highest = taken.reduce((max, row) => {
      const seq = parseInt((row.code ?? "").slice(account.length + 1), 10);
      return Number.isFinite(seq) && seq > max ? seq : max;
    }, 0);
    const next = highest + 1;
    if (next > MAX_UNITS_PER_HOST) {
      console.warn(
        `[listing-code] host account ${account} has used all ${MAX_UNITS_PER_HOST} unit ` +
          `slots; listing ${listingId} stays uncoded.`,
      );
      return null;
    }

    const code = `${account}-${String(next).padStart(2, "0")}`;
    try {
      await db.listing.update({ where: { id: listingId }, data: { code } });
      return code;
    } catch (error) {
      // P2002 = another publish took this number between the read and the
      // write. Re-read and take the next one.
      if ((error as { code?: string })?.code === "P2002") continue;
      throw error;
    }
  }

  console.warn(`[listing-code] gave up minting a code for listing ${listingId} after ${RETRIES} attempts.`);
  return null;
}
