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
 * ── What `--force` bypasses, and the decision behind it ────────────────────
 *
 * `--force` publishes an operator-authorized batch: it skips the trust *band*
 * threshold, the `publishReady` flag, the `gateNote` hard gate, and — this is
 * the part worth reading — the requirement that the owner has claimed the
 * listing.
 *
 * This file used to argue, at length, that the claim gate could never be a
 * flag. The argument was: these are other people's property, photos and words,
 * scraped without their knowledge, and `Listing.claimedAt` is the only record
 * that the owner has seen them and agreed; a flag that skipped it would let one
 * operator publish a stranger's home.
 *
 * That argument is still true, and it lost to a fact on the ground. The 74
 * homes already live on mkan.sd were published unclaimed, so the gate was
 * describing an intention rather than the state of the site, and holding the
 * remaining inventory behind it protected nobody while making the catalogue
 * arbitrarily incomplete. The operator's call (2026-08-05) is to publish the
 * whole scraped set on the same terms as the 74, and to treat host consent as
 * something outreach obtains and the claim flow records — not as something the
 * publish step can wait for.
 *
 * So the gate is now bypassable, but never quietly: `--force` requires
 * FORCE_SEED, and it prints every unclaimed listing and every gated home it is
 * about to publish, grouped by reason. If that list is ever surprising, stop.
 *
 * Without `--force` the behaviour is unchanged: claimed and trust-passing only.
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
    // Structural gates, never bypassed: a listing that was never imported has
    // no row to publish, and a wave is scoped to its city by definition.
    if (mkanListingId == null) { eligible = false; why = 'not imported'; }
    else if (!cityOk) { eligible = false; why = `city≠${CITY}`; }
    // The trust gate and the consent gate. Both are bypassable under --force,
    // which is an operator saying "publish this wave anyway" — see the note at
    // the top of this file for what that means and when it is defensible.
    else if (!FORCE && h.gateNote) { eligible = false; why = `gate:${h.gateNote}`; }
    else if (!FORCE && !claimed.has(mkanListingId)) { eligible = false; why = 'not claimed by its owner'; }
    // Soft trust gate (skipped under --force for an operator-authorized wave).
    else if (!FORCE && !h.publishReady) { eligible = false; why = 'not publish-ready'; }
    else if (!FORCE && (BAND_RANK[h.trustBand] ?? 0) < minRank) { eligible = false; why = `${h.trustBand}<${MIN_BAND}`; }
    else if (FORCE) { why = 'eligible (forced)'; }
    return { h, mkanListingId, eligible, why };
  });
  if (LIMIT) rows = rows.slice(0, LIMIT);
  const eligible = rows.filter((r) => r.eligible);

  console.log(`\n🚀 Wave publish — city=${CITY}, min-band=${MIN_BAND} · ${eligible.length}/${rows.length} eligible to go Available`);

  // Nothing that --force waves through gets published without being named. The
  // whole safety of a bypassable consent gate rests on the bypass being visible.
  if (FORCE && eligible.length) {
    const unclaimed = eligible.filter((r) => !claimed.has(r.mkanListingId!));
    const gated = eligible.filter((r) => r.h.gateNote);
    console.log(`\n   ⚠️  --force is bypassing the trust and consent gates.`);
    if (unclaimed.length) {
      console.log(`      ${unclaimed.length} listing(s) NOT claimed by their owner will go live:`);
      for (const r of unclaimed) console.log(`        · #${r.mkanListingId} ${(r.h.title ?? '').slice(0, 48)}`);
    }
    if (gated.length) {
      console.log(`      ${gated.length} listing(s) the trust gate held back will go live:`);
      for (const r of gated) console.log(`        · #${r.mkanListingId} [${r.h.gateNote}] ${(r.h.title ?? '').slice(0, 40)}`);
    }
    console.log('      If either list is surprising, stop and re-read the note at the top of this file.');
  }
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
  // --force can publish someone's home without their claim on record. That is
  // not something to arrive at by autocompleting a flag.
  if (FORCE && !process.env.FORCE_SEED) {
    throw new Error('--force bypasses the consent gate — re-run with FORCE_SEED=1 to confirm you mean it');
  }

  // Minting the code here is what keeps mkan.sd and the CRM addressing the
  // same listing by the same string. The first eight codes were assigned by a
  // one-shot migration script and nothing in the pipeline reproduced it, so
  // the next wave would have published listings whose only public id was an
  // Airbnb room number — a URL no host recognises and the CRM cannot show.
  const { ensureListingCode } = await import('@/lib/listing-code-server');

  let flipped = 0;
  let uncoded = 0;
  for (const r of eligible) {
    try {
      await prisma.listing.update({
        where: { id: r.mkanListingId! },
        data: { isPublished: true, lastAvailabilityConfirmedAt: new Date() },
      });
      flipped++;
      const code = await ensureListingCode(r.mkanListingId!);
      if (!code) uncoded++;
      console.log(
        `+ Available: listing #${r.mkanListingId}  ${code ? code.padEnd(8) : '(no code)'.padEnd(8)} ${(r.h.title ?? '').slice(0, 40)}`,
      );
    } catch (e) {
      console.warn(`! listing #${r.mkanListingId}: ${(e as Error).message}`);
    }
  }
  console.log(`\n✅ ${flipped} listing(s) now Available (${CITY} wave). Sync mkanPublishState=LIVE + publishedAt back to Twenty.`);
  if (uncoded) {
    console.log(
      `⚠️  ${uncoded} of them have no mkan code — their host has no NNNN@mkan.org account, so there is\n` +
        `   no account number to build one from. They resolve by row id until that is fixed.`,
    );
  }
  console.log('');
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
