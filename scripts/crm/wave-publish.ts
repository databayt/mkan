/**
 * Wave publish (Epic G1.7) — the last step: flip imported listings Busy→Available.
 *
 * An imported mkan `Listing` starts Busy (`isPublished:false`). It goes Available
 * only through the trust gate (docs/growth.md §5.5): the home is `publishReady`
 * (band passes + host replied + price confirmed + photos re-hosted + no hard gate)
 * — and we roll out **per city** (Port Sudan first, Khartoum next). This worker
 * applies that gate + wave filter and flips the eligible listings.
 *
 *   npx tsx scripts/crm/wave-publish.ts --city=PORT_SUDAN            # dry plan
 *   FORCE_SEED=1 npx tsx scripts/crm/wave-publish.ts --city=PORT_SUDAN --apply
 *
 * Flags: --in=<scored/rehosted> --ledger=<import ledger> --city=<CITY|all>
 *        --min-band=<AUTO_ONBOARD|MANUAL_REVIEW> --limit=<N> --apply --force
 *
 * `--force` publishes an operator-authorized batch that hasn't cleared the trust
 * *band* threshold. It does not, and cannot, publish an unclaimed listing.
 *
 * That distinction is the whole point. These listings are other people's
 * property, photos and words, scraped without their knowledge, and
 * `Listing.claimedAt` is the only record that the owner has seen them and
 * agreed. A flag that skipped it would let one operator publish a stranger's
 * home — which is what `--force` used to do, since it bypassed `publishReady`,
 * and `publishReady` was where "the host replied" was encoded.
 *
 * So the gate is now read from the database, not from a scored JSON file, and
 * it sits above the `--force` branch with the other hard gates: a `gateNote`
 * (hotel/duplicate/location-fail), the city filter, and being imported at all.
 * Publishing unclaimed inventory remains possible, but only as a deliberate
 * code change someone has to argue for — not a flag.
 *
 * Reads eligibility from the scored file (`publishReady`, `trustBand`, `city`) and
 * the mkan listing id from the import ledger. `--apply` sets `isPublished:true` +
 * `lastAvailabilityConfirmedAt` on the mkan Listing (Prisma), prod-guarded. Only
 * imported + eligible listings flip; nothing else is touched.
 */
import { config } from 'dotenv';
config({ override: true });

import { readFileSync, existsSync } from 'node:fs';

let prisma: (typeof import('@/lib/db'))['db'];

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force'); // operator override: skip the soft trust gate (keeps hard gates)
const argv = (n: string, d = ''): string => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.split('=').slice(1).join('=') : d;
};
const IN = argv('in', 'scripts/crm/.data/airbnb-scored.json');
const LEDGER = argv('ledger', 'scripts/crm/.data/mkan-import-ledger.json');
const CITY = argv('city', 'all').toUpperCase();
const MIN_BAND = argv('min-band', 'MANUAL_REVIEW');
const LIMIT = parseInt(argv('limit', '0'), 10) || 0;
const BAND_RANK: Record<string, number> = { REJECT: 0, HOLD: 1, MANUAL_REVIEW: 2, AUTO_ONBOARD: 3 };

interface ScoredHome {
  airbnbListingId: string; city: string; title: string | null;
  trustBand: string; publishReady?: boolean; gateNote?: string | null;
}

async function main(): Promise<void> {
  const payload = JSON.parse(readFileSync(IN, 'utf8')) as { homes: ScoredHome[] };
  const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { homes: {} };
  const minRank = BAND_RANK[MIN_BAND] ?? 2;

  // Consent is read from the DB even in dry-run: a plan that says "would
  // publish" while the owner has not claimed the listing is a plan that lies
  // about the only thing worth checking.
  prisma = (await import('@/lib/db')).db;
  const claimed = new Set(
    (await prisma.listing.findMany({ where: { claimedAt: { not: null } }, select: { id: true } })).map((l) => l.id),
  );

  type Row = { h: ScoredHome; mkanListingId: number | null; eligible: boolean; why: string };
  let rows: Row[] = (payload.homes ?? []).map((h) => {
    const mkanListingId = ledger.homes?.[h.airbnbListingId]?.mkanListingId ?? null;
    const cityOk = CITY === 'ALL' || h.city === CITY;
    let eligible = true, why = 'eligible';
    // Hard gates (never bypassed): must be imported, in-wave, not hard-gated,
    // and claimed by its owner.
    if (mkanListingId == null) { eligible = false; why = 'not imported'; }
    else if (!cityOk) { eligible = false; why = `city≠${CITY}`; }
    else if (h.gateNote) { eligible = false; why = `gate:${h.gateNote}`; }
    else if (!claimed.has(mkanListingId)) { eligible = false; why = 'not claimed by its owner'; }
    // Soft trust gate (skipped under --force for an operator-authorized wave).
    else if (!FORCE && !h.publishReady) { eligible = false; why = 'not publish-ready'; }
    else if (!FORCE && (BAND_RANK[h.trustBand] ?? 0) < minRank) { eligible = false; why = `${h.trustBand}<${MIN_BAND}`; }
    else if (FORCE) { why = 'eligible (forced)'; }
    return { h, mkanListingId, eligible, why };
  });
  if (LIMIT) rows = rows.slice(0, LIMIT);
  const eligible = rows.filter((r) => r.eligible);

  console.log(`\n🚀 Wave publish — city=${CITY}, min-band=${MIN_BAND} · ${eligible.length}/${rows.length} eligible to go Available`);
  for (const r of rows) {
    const mark = r.eligible ? '✓' : '·';
    console.log(`  ${mark} ${(r.h.title ?? '').slice(0, 34).padEnd(34)} ${r.h.city.padEnd(11)} ${r.h.trustBand.padEnd(13)} ${r.eligible ? `→ publish (listing #${r.mkanListingId})` : r.why}`);
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — would flip ${eligible.length} listing(s) Busy→Available.`);
    if (!eligible.length) console.log('   (nothing eligible — homes go Available only after import + the trust gate: host replied, price confirmed, photos re-hosted, band passes)');
    console.log('To apply:  FORCE_SEED=1 npx tsx scripts/crm/wave-publish.ts --city=' + CITY + ' --apply\n');
    return;
  }

  if (!eligible.length) { console.log('\nNothing eligible to publish. Done.\n'); return; }
  if (process.env.NODE_ENV === 'production' && !process.env.FORCE_SEED) throw new Error('refusing to publish in production without FORCE_SEED=1');

  let flipped = 0;
  for (const r of eligible) {
    try {
      await prisma.listing.update({
        where: { id: r.mkanListingId! },
        data: { isPublished: true, lastAvailabilityConfirmedAt: new Date() },
      });
      flipped++;
      console.log(`+ Available: listing #${r.mkanListingId}  ${(r.h.title ?? '').slice(0, 40)}`);
    } catch (e) {
      console.warn(`! listing #${r.mkanListingId}: ${(e as Error).message}`);
    }
  }
  console.log(`\n✅ ${flipped} listing(s) now Available (${CITY} wave). Sync mkanPublishState=LIVE + publishedAt back to Twenty.\n`);
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
