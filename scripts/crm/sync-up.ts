/**
 * mkan.sd → Twenty. What the site actually shows, reported back to the board.
 *
 *   pnpm crm:sync-up            # dry run
 *   pnpm crm:sync-up --apply
 *
 * ── Why ────────────────────────────────────────────────────────────────────
 *
 * `sync-import-to-twenty.ts` stamps the CRM once, at import time, with
 * `IMPORTED_BUSY`. Nothing updated it afterwards. So a home that went live
 * through `crm:publish`, or came down because its host claimed and unpublished
 * it, still read `IMPORTED_BUSY` on the board weeks later — and an operator
 * deciding who to chase was reading a snapshot of the day it was imported.
 *
 * This is the return leg of `sync-down.ts`. Between them the two directions
 * have distinct jobs and never fight over the same field:
 *
 *   sync-down  operator decisions  → the site   (price, title, publish, trust)
 *   sync-up    observed site state → the board  (what is live, since when)
 *
 * Everything here is derived from the mkan DB, so there is no conflict to
 * resolve: the site is the authority on its own state by definition.
 */
import { config } from 'dotenv';
config({ override: true });

import { toUpperSnake } from './twenty-schema';
import { twentyClient } from './twenty-rest';

let prisma: (typeof import('@/lib/db'))['db'];

const APPLY = process.argv.includes('--apply');
const argv = (n: string, d = ''): string => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
// Deliberately NOT defaulted from NEXT_PUBLIC_APP_URL: in a dev checkout that
// is http://localhost:3000, and a localhost link written into the shared CRM is
// worse than no link at all — it is a link that works for exactly one person.
// Override with --site= when pointing at a preview deployment.
const SITE = argv('site', 'https://mkan.sd').replace(/\/+$/, '');
// The public route is /[lang]/listings/[id] and the default locale is Arabic.
const listingUrl = (id: number): string => `${SITE}/ar/listings/${id}`;

interface CrmHome {
  id: string;
  airbnbListingId: string | null;
  mkanListingId: number | null;
  mkanPublishState: string | null;
  homeStatus: string | null;
  photoCount: number | null;
  mkanListingUrl: unknown;
  mkanAmenities: string[] | null;
}

/** Twenty's SELECT options are UPPER_SNAKE; Prisma's Amenity enum is PascalCase. */
const sameAmenities = (crm: string[] | null, site: readonly string[]): boolean => {
  const want = site.map(toUpperSnake);
  const have = crm ?? [];
  return have.length === want.length && want.every((v) => have.includes(v));
};

async function main(): Promise<void> {
  console.log(`\n⬆️  mkan.sd → Twenty  (${APPLY ? 'APPLY' : 'dry run'})\n`);

  const twenty = twentyClient();
  prisma = (await import('@/lib/db')).db;

  const homes = (await twenty.all('homes')) as unknown as CrmHome[];
  // Scraped homes match on airbnbListingId; the three real owners' homes were
  // pushed up by `manual-import.ts` and have only `mkanListingId`. Both are
  // real listings and both belong in the report back.
  const crmListingIds = homes.map((h) => h.mkanListingId).filter((v): v is number => v != null);
  const listings = await prisma.listing.findMany({
    where: { OR: [{ source: 'AIRBNB', sourceListingId: { not: null } }, { id: { in: crmListingIds } }] },
    select: { id: true, sourceListingId: true, isPublished: true, claimedAt: true, photoUrls: true, amenities: true },
  });
  const byAirbnbId = new Map(listings.filter((l) => l.sourceListingId).map((l) => [l.sourceListingId!, l]));
  const byListingId = new Map(listings.map((l) => [l.id, l]));
  console.log(`   ${homes.length} homes in the CRM · ${listings.length} listings on the site\n`);

  const now = new Date().toISOString();
  interface Patch { id: string; label: string; body: Record<string, unknown>; fields: string[] }
  const patches: Patch[] = [];
  let gone = 0;

  for (const home of homes) {
    // Twenty round-trips absent text as "", not null.
    const airbnbId = home.airbnbListingId?.trim() || null;
    const listing =
      (airbnbId ? byAirbnbId.get(airbnbId) : undefined) ??
      (home.mkanListingId != null ? byListingId.get(home.mkanListingId) : undefined);
    if (!listing) { gone++; continue; }

    // A claimed listing is still IMPORTED_BUSY/LIVE from the board's point of
    // view; the claim itself is reported through the host's firstLoginAt, so
    // publish state stays a pure function of what the site is showing.
    const state = listing.isPublished ? 'LIVE' : 'IMPORTED_BUSY';
    const photoCount = listing.photoUrls.length;
    const url = listingUrl(listing.id);

    const body: Record<string, unknown> = {};
    const fields: string[] = [];
    const set = (f: string, v: unknown) => { body[f] = v; fields.push(f); };

    if (home.mkanListingId !== listing.id) set('mkanListingId', listing.id);
    if (home.mkanPublishState !== state) set('mkanPublishState', state);
    if (home.homeStatus !== state) set('homeStatus', state);
    if (home.photoCount !== photoCount) set('photoCount', photoCount);

    // The derived amenity set travels up, never down — see the note in
    // sync-down.ts. This is what keeps the board's list current after the
    // mapping table is widened.
    if (!sameAmenities(home.mkanAmenities, listing.amenities)) {
      set('mkanAmenities', listing.amenities.map(toUpperSnake));
    }

    const currentUrl = (home.mkanListingUrl as { primaryLinkUrl?: string } | null)?.primaryLinkUrl ?? '';
    if (currentUrl !== url) set('mkanListingUrl', { primaryLinkLabel: '', primaryLinkUrl: url, secondaryLinks: [] });

    // Only stamp publishedAt on the transition into LIVE, so it keeps meaning
    // "when this went live" rather than "when the sync last ran".
    if (state === 'LIVE' && home.mkanPublishState !== 'LIVE') set('publishedAt', now);

    if (!fields.length) continue;
    body.lastSyncedAt = now;
    patches.push({ id: home.id, label: airbnbId ?? `listing #${listing.id}`, body, fields });
  }

  console.log(`   ${patches.length} CRM homes to update`);
  console.log(`   ${gone} CRM homes with no listing on the site (not imported, or purged)\n`);

  for (const p of patches.slice(0, 15)) {
    console.log(`     ${p.label.padEnd(22)} ${p.fields.join(', ')}`);
  }
  if (patches.length > 15) console.log(`     … ${patches.length - 15} more`);

  if (!patches.length) { console.log('\nNothing to do — the board already matches the site.\n'); return; }
  if (!APPLY) { console.log('\nDRY RUN — re-run with --apply.\n'); return; }

  let written = 0;
  for (const p of patches) {
    try {
      await twenty.rest('PATCH', `homes/${p.id}`, p.body);
      written++;
    } catch (e) {
      console.warn(`  ! ${p.label}: ${(e as Error).message}`);
    }
  }
  console.log(`\n✅ ${written} CRM homes updated from the site\n`);
}

main()
  .catch((e) => {
    console.error(`\n❌ ${(e as Error).message}\n`);
    process.exit(1);
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
