/**
 * Twenty → mkan.sd. The direction that did not exist.
 *
 *   pnpm crm:sync-down            # dry run — prints the per-listing diff
 *   pnpm crm:sync-down --apply
 *
 * ── Why ────────────────────────────────────────────────────────────────────
 *
 * Every other script in this directory writes *into* Twenty: the scrape, the
 * trust scores, the re-hosted photos, the import ledger, the hunted contacts.
 * Nothing read back out. So a human working the CRM — confirming a price with a
 * host, correcting a title, marking a home REJECT, moving it to LIVE — was
 * writing into a system the public site never consulted. The board and the site
 * could disagree indefinitely and neither would notice.
 *
 * This closes it. The CRM is upstream for the facts an operator owns; the site
 * is where they land.
 *
 * ── What it will and will not touch ────────────────────────────────────────
 *
 * A listing with `claimedAt` set belongs to its host. Their title is theirs,
 * their price is theirs, and a CRM record written before they ever logged in
 * does not get to overwrite either. For a claimed listing only two signals
 * still apply, because both are statements about whether the home may be shown
 * at all rather than about its content:
 *
 *   stillListed = false   the home is gone from Airbnb
 *   trustBand   = REJECT  it failed the trust gate (hotel, agency, duplicate)
 *
 * Everything else is skipped and counted, so the run reports exactly what it
 * declined to do. This is the same "fill empty, never replace populated" rule
 * that governs sync-contacts-to-twenty.ts and backfill-listing-facts.ts.
 *
 * Price is narrower still: it is taken only when a human ticked
 * `priceConfirmedByHost`, or when the listing has no price at all. An
 * unconfirmed FX conversion is an estimate, and estimates do not overwrite.
 */
import { config } from 'dotenv';
config({ override: true });

import { twentyClient, fromMicros, phoneOf, type Currency, type Phones } from './twenty-rest';
import { detectScript } from '@/components/translation/util';

let prisma: (typeof import('@/lib/db'))['db'];

const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

interface CrmHome {
  id: string;
  airbnbListingId: string | null;
  mkanListingId: number | null;
  title: string | null;
  description: string | null;
  stillListed: boolean | null;
  trustBand: string | null;
  trustBandOverride: string | null;
  mkanPublishState: string | null;
  priceNightSdg: Currency | null;
  priceConfirmedByHost: boolean | null;
}
interface CrmHost {
  id: string;
  airbnbHostId: string | null;
  phone: Phones | null;
  whatsapp: Phones | null;
  contactVerifiedByHuman: boolean | null;
}

/** The band an operator's override wins over the scored one. */
const effectiveBand = (h: CrmHome): string | null => h.trustBandOverride ?? h.trustBand;

async function main(): Promise<void> {
  console.log(`\n⬇️  Twenty → mkan.sd  (${APPLY ? 'APPLY' : 'dry run'})\n`);

  const twenty = twentyClient();
  prisma = (await import('@/lib/db')).db;

  const homes = (await twenty.all('homes')) as unknown as CrmHome[];
  const hosts = (await twenty.all('hosts')) as unknown as CrmHost[];
  console.log(`   ${homes.length} homes · ${hosts.length} hosts in the CRM`);

  // Two kinds of CRM home reach a listing. The scraped ones carry an
  // `airbnbListingId` that matches `Listing.sourceListingId`. The three real
  // owners' homes were pushed up by `manual-import.ts` instead, so they have no
  // Airbnb id at all and are keyed on `mkanListingId` — they are just as real,
  // and leaving them outside the sync is how the board goes stale about them.
  const crmListingIds = homes.map((h) => h.mkanListingId).filter((v): v is number => v != null);
  const listings = await prisma.listing.findMany({
    where: { OR: [{ source: 'AIRBNB', sourceListingId: { not: null } }, { id: { in: crmListingIds } }] },
    select: {
      id: true, sourceListingId: true, claimedAt: true, title: true, description: true,
      isPublished: true, pricePerNight: true, amenities: true, canonicalLocale: true,
    },
  });
  const byAirbnbId = new Map(listings.filter((l) => l.sourceListingId).map((l) => [l.sourceListingId!, l]));
  const byListingId = new Map(listings.map((l) => [l.id, l]));
  console.log(`   ${listings.length} listings on the site reachable from the CRM\n`);

  type SiteListing = (typeof listings)[number];
  // Twenty round-trips absent text as "", not null.
  const airbnbIdOf = (home: CrmHome): string | null => home.airbnbListingId?.trim() || null;
  const matchListing = (home: CrmHome): SiteListing | undefined => {
    const airbnbId = airbnbIdOf(home);
    return (
      (airbnbId ? byAirbnbId.get(airbnbId) : undefined) ??
      (home.mkanListingId != null ? byListingId.get(home.mkanListingId) : undefined)
    );
  };

  interface Change { id: number; label: string; data: Record<string, unknown>; fields: string[]; forced: boolean }
  const changes: Change[] = [];
  const skippedClaimed: string[] = [];
  const counts: Record<string, number> = {};
  const bump = (f: string) => { counts[f] = (counts[f] ?? 0) + 1; };
  let unmatched = 0;

  for (const home of homes) {
    const listing = matchListing(home);
    if (!listing) { unmatched++; continue; }

    const data: Record<string, unknown> = {};
    const fields: string[] = [];
    const set = (f: string, v: unknown) => { data[f] = v; fields.push(f); bump(f); };

    // ── Signals that apply even to a claimed listing ──────────────────────
    const delisted = home.stillListed === false;
    const rejected = effectiveBand(home) === 'REJECT';
    if ((delisted || rejected) && listing.isPublished) {
      set('isPublished', false);
      fields[fields.length - 1] = `isPublished=false (${delisted ? 'delisted on Airbnb' : 'trust REJECT'})`;
    }

    if (listing.claimedAt) {
      // Content is the host's now. Take the unpublish if there is one, and
      // report everything else we chose not to do.
      if (fields.length) changes.push({ id: listing.id, label: home.title ?? '', data, fields, forced: true });
      else skippedClaimed.push(airbnbIdOf(home) ?? `listing #${listing.id}`);
      continue;
    }

    // ── Publish state ────────────────────────────────────────────────────
    if (!delisted && !rejected && home.mkanPublishState === 'LIVE' && !listing.isPublished) {
      set('isPublished', true);
    }

    // ── Price ────────────────────────────────────────────────────────────
    const crmPrice = fromMicros(home.priceNightSdg);
    if (crmPrice != null && crmPrice !== listing.pricePerNight) {
      if (home.priceConfirmedByHost) set('pricePerNight', crmPrice);
      else if (listing.pricePerNight == null) set('pricePerNight', crmPrice);
    }

    // ── Amenities are deliberately NOT synced down ────────────────────────
    // They are a derivation, not a decision. `backfill-listing-facts.ts` maps
    // them from the scrape through `amenity-map.ts`, and the CRM's
    // `mkanAmenities` is a mirror of that same derivation — written by
    // `twenty-upsert`, never hand-edited, and stale whenever the mapping table
    // has been widened since the last upsert.
    //
    // Pushing it back down made the two steps fight: backfill derived 11
    // amenities from the scrape, sync-down overwrote them with the CRM's older
    // 10, and the next run started again. On a schedule that is an endless
    // write loop over the same two rows. The derivation owns the field; the
    // board learns about it through sync-up.

    // ── Title / description an operator edited in the CRM ─────────────────
    // Trimmed compare: Twenty round-trips empty strings for absent text, and an
    // empty CRM field is not an instruction to blank the listing.
    const crmTitle = home.title?.trim();
    if (crmTitle && crmTitle !== listing.title) {
      set('title', crmTitle);
      set('canonicalLocale', detectScript(crmTitle));
      fields.pop(); // canonicalLocale rides along with the title; don't list it twice
    }
    const crmDescription = home.description?.trim();
    if (crmDescription && crmDescription !== listing.description) set('description', crmDescription);

    if (fields.length) changes.push({ id: listing.id, label: home.title ?? '', data, fields, forced: false });
  }

  // ── Host contact, fill-if-empty ────────────────────────────────────────
  const users = await prisma.user.findMany({
    where: { sourceHostId: { not: null } },
    select: { id: true, sourceHostId: true, phoneNumber: true },
  });
  const userByHostId = new Map(users.map((u) => [u.sourceHostId!, u]));
  const hostUpdates: Array<{ id: string; phone: string }> = [];
  for (const host of hosts) {
    if (!host.airbnbHostId) continue;
    const user = userByHostId.get(host.airbnbHostId);
    if (!user || user.phoneNumber) continue; // never replace a number already there
    const phone = phoneOf(host.whatsapp) ?? phoneOf(host.phone);
    if (phone) hostUpdates.push({ id: user.id, phone });
  }

  // ── Report ─────────────────────────────────────────────────────────────
  console.log(`   ${changes.length} listings to update`);
  console.log(`   ${skippedClaimed.length} skipped — claimed by their host, nothing forced`);
  console.log(`   ${unmatched} CRM homes with no listing on the site (not yet imported)`);
  console.log(`   ${hostUpdates.length} host phone numbers to fill in\n`);

  if (Object.keys(counts).length) {
    console.log('   by field:');
    for (const [f, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      console.log(`     ${String(n).padStart(4)}  ${f}`);
    }
    console.log('');
  }

  const shown = VERBOSE ? changes : changes.slice(0, 15);
  for (const c of shown) {
    console.log(`     #${c.id}${c.forced ? ' [claimed — forced]' : ''} ${c.label.slice(0, 34).padEnd(34)} ${c.fields.join(', ')}`);
  }
  if (!VERBOSE && changes.length > shown.length) console.log(`     … ${changes.length - shown.length} more (--verbose for all)`);

  if (!changes.length && !hostUpdates.length) { console.log('\nNothing to do — the site already matches the CRM.\n'); return; }
  if (!APPLY) { console.log('\nDRY RUN — re-run with --apply.\n'); return; }

  let written = 0;
  for (const c of changes) {
    await prisma.listing.update({ where: { id: c.id }, data: c.data });
    written++;
  }
  for (const u of hostUpdates) {
    await prisma.user.update({ where: { id: u.id }, data: { phoneNumber: u.phone } });
  }

  console.log(`\n✅ ${written} listings and ${hostUpdates.length} host contacts updated from the CRM\n`);
}

main()
  .catch((e) => {
    console.error(`\n❌ ${(e as Error).message}\n`);
    process.exit(1);
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
