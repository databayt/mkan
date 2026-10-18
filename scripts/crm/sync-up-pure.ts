/**
 * Which site listings the board has never seen — sync-up's create phase,
 * kept pure so the matching can be tested without Twenty or the DB.
 */

export interface BoardHome {
  mkanListingId: number | null;
  airbnbListingId: string | null;
  sourceId?: string | null;
}

export interface SiteListing {
  id: number;
  source: string | null;
  sourceListingId: string | null;
}

/**
 * A listing is known by `mkanListingId`, by `airbnbListingId` (scraped homes),
 * or by `sourceId` (`tiktok:<videoId>`, which the mirror copies into the lead's
 * `sourceListingId`). TikTok leads are never "unseen": each was born from a
 * CRM home, and `crm:tiktok-mirror` writes its `mkanListingId` back. Creating
 * one here gave every lead a second MKAN_SITE home and its broker a TRUSTED host.
 *
 * Scraped (AIRBNB) listings are never unseen either: a wave publishes to the
 * site hours before `crm:upsert` files its board record (the link is slow),
 * and every hourly sync-up in that gap made an MKAN_SITE copy — 2,255 of them
 * by 2026-10-18. The wave's own upsert is how those reach the board.
 */
export function unseenListings<L extends SiteListing>(homes: BoardHome[], listings: L[]): L[] {
  const knownListingIds = new Set(homes.map((h) => h.mkanListingId).filter((v): v is number => v != null));
  const knownSourceIds = new Set(
    homes.flatMap((h) => [h.airbnbListingId, h.sourceId]).map((v) => (v ?? '').trim()).filter(Boolean),
  );
  return listings.filter(
    (l) =>
      l.source !== 'TIKTOK' &&
      l.source !== 'AIRBNB' &&
      !knownListingIds.has(l.id) &&
      !(l.sourceListingId && knownSourceIds.has(l.sourceListingId)),
  );
}
