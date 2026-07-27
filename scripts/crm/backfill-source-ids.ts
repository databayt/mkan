/**
 * Move the Airbnb → mkan join key out of the ledger and into Postgres (Epic G1.5).
 *
 *   pnpm crm:backfill-source            # dry run — reports what it would set
 *   pnpm crm:backfill-source --apply
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * `.data/mkan-import-ledger.json` is the only thing that knows listing 1121 is
 * Airbnb room 24609038 and that user cmr8b7… stands for Airbnb host 56622144.
 * It is gitignored, single-writer, and `mkan-import.ts` writes it once after the
 * whole loop — so a crash mid-import, or one `rm`, and 74 listings plus 49
 * provisioned accounts become permanently unattributable. No re-scrape recovers
 * that: the mapping only ever existed in this file.
 *
 * After this runs, `Listing.sourceListingId` and `User.sourceHostId` carry the
 * mapping under unique constraints, and the ledger is demoted to a report.
 *
 * Strictly additive: it only ever writes columns that are currently NULL, so a
 * second run is a no-op and it can never overwrite a value a human set. Rows
 * whose ledger id disagrees with a value already in the DB are reported as
 * conflicts and left alone — a silent correction here would be worse than the
 * gap it fixes.
 */
import { config } from 'dotenv';
import { readFileSync, existsSync } from 'node:fs';

config({ override: true });

// Imported after dotenv: `@/lib/db` reads DATABASE_URL at module scope, and a
// static import would run first and bind to the wrong (or missing) URL.
let prisma: (typeof import('@/lib/db'))['db'];

const APPLY = process.argv.includes('--apply');
const arg = (name: string, def: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const LEDGER = arg('ledger', 'scripts/crm/.data/mkan-import-ledger.json');
const SCRAPE = arg('scrape', 'scripts/crm/.data/airbnb-scrape.json');

interface Ledger {
  hosts: Record<string, { mkanUserId: string; mkanAccountEmail?: string; mkanUsername?: string }>;
  homes: Record<string, { mkanListingId: number; mkanUserId: string }>;
}

interface Conflict {
  kind: 'listing' | 'user';
  id: string | number;
  column: string;
  inDb: string;
  inLedger: string;
}

async function main() {
  console.log('\n🔗 Backfill source ids — ledger → Postgres');
  if (!existsSync(LEDGER)) throw new Error(`no ledger at ${LEDGER} — nothing to backfill`);
  const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger;

  const hostEntries = Object.entries(ledger.hosts ?? {});
  const homeEntries = Object.entries(ledger.homes ?? {});
  console.log(`   ${hostEntries.length} hosts, ${homeEntries.length} homes in ${LEDGER}`);
  console.log(`   ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

  // mkanUserId → airbnbHostId, so a home can inherit its host's external id
  // without trusting the home record to carry one.
  const hostIdByUserId = new Map<string, string>();
  for (const [airbnbHostId, rec] of hostEntries) hostIdByUserId.set(rec.mkanUserId, airbnbHostId);

  // scrapedAt per listing, when the scrape file still has the row.
  const capturedAt = new Map<string, Date>();
  if (existsSync(SCRAPE)) {
    const scrape = JSON.parse(readFileSync(SCRAPE, 'utf8')) as { homes?: Array<Record<string, any>> };
    for (const h of scrape.homes ?? []) {
      const when = h.scrapedAt ?? h.pdpFetchedAt;
      if (h.airbnbListingId && when) capturedAt.set(String(h.airbnbListingId), new Date(when));
    }
    console.log(`   ${capturedAt.size} capture timestamps from ${SCRAPE}\n`);
  }

  prisma = (await import('@/lib/db')).db;

  const conflicts: Conflict[] = [];
  let usersSet = 0;
  let usersSkipped = 0;
  let usersMissing = 0;

  for (const [airbnbHostId, rec] of hostEntries) {
    const user = await prisma.user.findUnique({
      where: { id: rec.mkanUserId },
      select: { id: true, sourceHostId: true },
    });
    if (!user) {
      usersMissing++;
      console.warn(`  ! user ${rec.mkanUserId} (Airbnb host ${airbnbHostId}) no longer exists`);
      continue;
    }
    if (user.sourceHostId) {
      if (user.sourceHostId !== airbnbHostId) {
        conflicts.push({ kind: 'user', id: user.id, column: 'sourceHostId', inDb: user.sourceHostId, inLedger: airbnbHostId });
      } else usersSkipped++;
      continue;
    }
    if (APPLY) await prisma.user.update({ where: { id: user.id }, data: { sourceHostId: airbnbHostId } });
    usersSet++;
  }

  let listingsSet = 0;
  let listingsSkipped = 0;
  let listingsMissing = 0;
  let hostMismatch = 0;

  for (const [airbnbListingId, rec] of homeEntries) {
    const listing = await prisma.listing.findUnique({
      where: { id: rec.mkanListingId },
      select: { id: true, hostId: true, sourceListingId: true },
    });
    if (!listing) {
      listingsMissing++;
      console.warn(`  ! listing ${rec.mkanListingId} (Airbnb room ${airbnbListingId}) no longer exists`);
      continue;
    }

    // The audit the ledger never allowed: is this listing actually under the
    // user the ledger says imported it?
    if (listing.hostId !== rec.mkanUserId) {
      hostMismatch++;
      console.warn(`  ! listing ${listing.id} hostId ${listing.hostId} ≠ ledger ${rec.mkanUserId}`);
    }

    if (listing.sourceListingId) {
      if (listing.sourceListingId !== airbnbListingId) {
        conflicts.push({ kind: 'listing', id: listing.id, column: 'sourceListingId', inDb: listing.sourceListingId, inLedger: airbnbListingId });
      } else listingsSkipped++;
      continue;
    }

    if (APPLY) {
      await prisma.listing.update({
        where: { id: listing.id },
        data: {
          source: 'AIRBNB',
          sourceListingId: airbnbListingId,
          sourceUrl: `https://www.airbnb.com/rooms/${airbnbListingId}`,
          sourceHostId: hostIdByUserId.get(rec.mkanUserId) ?? null,
          sourceCapturedAt: capturedAt.get(airbnbListingId) ?? null,
        },
      });
    }
    listingsSet++;
  }

  console.log('\n── result ───────────────────────────────────────────');
  console.log(`  users    ${usersSet} set, ${usersSkipped} already correct, ${usersMissing} missing`);
  console.log(`  listings ${listingsSet} set, ${listingsSkipped} already correct, ${listingsMissing} missing`);
  console.log(`  listings under an unexpected host: ${hostMismatch}`);
  if (conflicts.length) {
    console.log(`\n  ⚠ ${conflicts.length} conflict(s) — left untouched, decide by hand:`);
    for (const c of conflicts) console.log(`     ${c.kind} ${c.id}.${c.column}: db="${c.inDb}" ledger="${c.inLedger}"`);
  }

  if (APPLY) {
    const listingsWithSource = await prisma.listing.count({ where: { sourceListingId: { not: null } } });
    const usersWithSource = await prisma.user.count({ where: { sourceHostId: { not: null } } });
    console.log(`\n  now in DB: ${listingsWithSource} listings, ${usersWithSource} users carry a source id`);
    console.log('\n✅ Backfilled. The ledger is now a report, not the source of truth.\n');
  } else {
    console.log('\nDRY RUN — re-run with --apply.\n');
  }
  process.exit(conflicts.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
