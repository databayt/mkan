/**
 * The mkan listing code — `NNNN-NN`, the one id the CRM, the outreach messages
 * and mkan.sd all share.
 *
 *   NNNN  the host's account number, the same digits as their `NNNN@mkan.org`
 *         login (0001-0004 are the hand-curated hosts, 1000+ the scraped ones)
 *   NN    the unit sequence within that host, allocated in order of publish
 *
 * A host reading "0002-05" in a WhatsApp message can type it into mkan.sd and
 * land on their own listing, and an operator looking at the same string in
 * Twenty knows they are looking at the same row. That only holds while the
 * code is the URL the site itself emits — see `listingSegment`.
 *
 * Pure module on purpose: client components import `listingSegment`, so
 * nothing here may reach for the database. Minting lives in
 * `listing-code-server.ts`.
 */

export const LISTING_CODE_RE = /^\d{4}-\d{2}$/;

/** The `NNNN` half — a host account number. */
const ACCOUNT_RE = /^\d{4}$/;

export function isListingCode(value: string | null | undefined): boolean {
  return typeof value === "string" && LISTING_CODE_RE.test(value);
}

/**
 * The host's account number, or null when they have none.
 *
 * Read from the `NNNN@mkan.org` login first — that is what the operator
 * actually assigns — and fall back to a numeric username. 69 of the 76 hosts
 * holding listings resolve; the 6 `legacy-*@mkan.org` accounts (19 listings,
 * all unpublished) do not, and callers must handle that rather than invent a
 * number. Which account a new host gets is an operator decision that has not
 * been made, and guessing it here would quietly make it.
 */
export function hostAccountNumber(
  host: { email?: string | null; username?: string | null } | null | undefined,
): string | null {
  const local = (host?.email ?? "").split("@")[0] ?? "";
  if (ACCOUNT_RE.test(local)) return local;
  if (ACCOUNT_RE.test(host?.username ?? "")) return host!.username!;
  return null;
}

/**
 * The URL segment for a listing — the code when it has one.
 *
 * `sourceListingId` is the fallback for the 113 scraped-but-unpublished rows
 * that never got a code, and it is second rather than first because for 8 rows
 * it used to hold the code itself. The numeric row id is last and still
 * resolves, so old links keep working; the page 308s them onto the code.
 */
export function listingSegment(
  listing: {
    code?: string | null;
    sourceListingId?: string | null;
    id: number | string;
  },
): string {
  return String(listing.code || listing.sourceListingId || listing.id);
}

/** `/{lang}/listings/{code}` — the canonical path for a listing. */
export function listingPath(lang: string, listing: Parameters<typeof listingSegment>[0]): string {
  return `/${lang}/listings/${listingSegment(listing)}`;
}
