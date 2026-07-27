/**
 * mkan provision + import (Epic G1.5) — the payoff step.
 *
 * Reads trusted scored homes → provisions `1000@mkan.org`+ MANAGER accounts
 * (mint-forward, emailVerified, bootstrap password) → imports their homes into
 * the mkan app as **Busy** (`Listing` + `Location`, `isPublished:false`).
 * Photos import empty until G1.4 re-hosts them (Airbnb muscache URLs can't be
 * hot-linked); price imports only if SDG is known (SR→SDG is G1.4) or an
 * explicit `--fx-rate` is given.
 *
 * Writes to the **mkan DB** (Prisma). **Dry-run by default** (prints the plan,
 * no writes). `--apply` performs the writes — prod-guarded (`FORCE_SEED`),
 * idempotent via a ledger file, and Busy-only (nothing goes Live here).
 *
 *   npx tsx scripts/crm/mkan-import.ts --min-band=HOLD           # dry plan
 *   FORCE_SEED=1 npx tsx scripts/crm/mkan-import.ts --apply      # write to mkan
 *
 * Flags: --in=<scored file> --min-band=<AUTO_ONBOARD|MANUAL_REVIEW|HOLD>
 *        --fx-rate=<SAR→SDG> --limit=<N> --apply --out=<ledger>
 *
 * ⚠️ Consent gate: only homes that are NOT hard-gated (hotel / duplicate /
 * location-fail) and meet --min-band import. In real operation the CRM sets a
 * home READY_FOR_IMPORT at the ONBOARDING stage (the host agreed); --min-band is
 * the manual override for a human-vetted batch. Do NOT --apply for hosts who
 * have not agreed to join mkan.
 */
import { config } from 'dotenv';
config({ override: true });

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Amenity, PropertyType } from '@prisma/client';
import { mapAmenities as mapAmenityNames } from './amenity-map';
import { cityNameEn, stateNameEn, stateOfCity, type CityCode } from './sudan-places';

// Deferred until after env loads (only used with --apply) — avoids the
// db-before-dotenv "DatabaseDoesNotExist" trap.
let prisma: (typeof import('@/lib/db'))['db'];

const APPLY = process.argv.includes('--apply');
const argv = (n: string, d = ''): string => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.split('=').slice(1).join('=') : d;
};
const IN = argv('in', 'scripts/crm/.data/airbnb-scored.json');
const OUT = argv('out', 'scripts/crm/.data/mkan-import-ledger.json');
const MIN_BAND = argv('min-band', 'MANUAL_REVIEW');
const FX = parseFloat(argv('fx-rate', '0')) || 0;
const LIMIT = parseInt(argv('limit', '0'), 10) || 0;

const BAND_RANK: Record<string, number> = { REJECT: 0, HOLD: 1, MANUAL_REVIEW: 2, AUTO_ONBOARD: 3 };
const POSTAL_OF: Record<string, string> = { PORT_SUDAN: '33311' };

// City/state names and the amenity table are shared — they used to be copied
// here and into twenty-upsert.ts, which is how the CRM and the app ended up
// able to disagree about the same listing.
const cityLabel = (c: string): string => cityNameEn(c as CityCode);
const stateLabel = (c: string): string => {
  const s = stateOfCity(c as CityCode);
  return s === 'UNKNOWN' ? '' : stateNameEn(s);
};
const mapAmenities = (raw: string[]): Amenity[] =>
  mapAmenityNames(raw).map((n) => Amenity[n as keyof typeof Amenity]).filter(Boolean);
const mapPropertyType = (v: string | null | undefined): PropertyType | undefined =>
  v && v in PropertyType ? PropertyType[v as keyof typeof PropertyType] : undefined;

interface ScoredHome {
  airbnbListingId: string;
  hostAirbnbId: string | null;
  title: string | null;
  description: string | null;
  city: string;
  latitude: number | null;
  longitude: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  guestCapacity: number | null;
  amenitiesRaw: string[];
  photoUrls: string[];
  photosRehosted?: boolean;
  priceNightSar: number | null;
  priceNightSdg?: number | null;
  avgRating: number | null;
  reviewCount: number | null;
  mkanPropertyType: string | null;
  trustBand: string;
  gateNote: string | null;
  scrapedAt?: string | null;
  canonicalLocale?: string | null;
  authoredLocale?: string | null;
  /** Which PDP rule resolved the host — see airbnb-parse.ts. */
  hostSource?: string | null;
}
interface ScoredHost { airbnbHostId: string; name: string | null }
interface Ledger {
  hosts: Record<string, { mkanUserId: string; mkanAccountEmail: string; mkanUsername: string }>;
  homes: Record<string, { mkanListingId: number; mkanUserId: string }>;
}

/**
 * Write the ledger atomically, after every host and every home.
 *
 * It used to be written once after the whole loop, which meant a crash — or a
 * Ctrl-C — orphaned every row already created: the DB had the listings, nothing
 * recorded which Airbnb id they came from. Provenance now lives in Postgres, so
 * this file is only a report, but a stale report is still worth avoiding.
 */
function flushLedger(ledger: Ledger): void {
  mkdirSync(dirname(OUT), { recursive: true });
  const tmp = `${OUT}.tmp`;
  writeFileSync(tmp, JSON.stringify(ledger, null, 2));
  renameSync(tmp, OUT);
}

function listingData(home: ScoredHome): Record<string, unknown> {
  const amenities = mapAmenities(home.amenitiesRaw);
  const price = home.priceNightSdg ?? (FX && home.priceNightSar ? Math.round(home.priceNightSar * FX) : null);
  const photos = home.photosRehosted ? home.photoUrls : []; // empty → app placeholder until G1.4
  return {
    title: home.title ?? 'Untitled',
    description: home.description ?? null,
    pricePerNight: price,
    photoUrls: photos,
    amenities,
    highlights: [],
    isParkingIncluded: amenities.includes(Amenity.Parking),
    isPetsAllowed: amenities.includes(Amenity.PetsAllowed),
    bedrooms: home.bedrooms ?? null,
    bathrooms: home.bathrooms ?? null,
    guestCount: home.guestCapacity ?? Math.max(2, (home.bedrooms ?? 1) * 2),
    propertyType: mapPropertyType(home.mkanPropertyType) ?? null,
    averageRating: home.avgRating ?? 0,
    numberOfReviews: home.reviewCount ?? 0,
    postedDate: new Date(),
    draft: false,
    isPublished: false, // BUSY — the trust gate flips this to Available later
  };
}
function locationData(home: ScoredHome): Record<string, unknown> {
  return {
    address: cityLabel(home.city),
    city: cityLabel(home.city),
    state: stateLabel(home.city),
    country: 'Sudan',
    postalCode: POSTAL_OF[home.city] ?? '11111',
    latitude: home.latitude ?? 0,
    longitude: home.longitude ?? 0,
  };
}

async function main(): Promise<void> {
  const payload = JSON.parse(readFileSync(IN, 'utf8')) as { homes: ScoredHome[]; hosts: ScoredHost[] };
  const hostName = new Map(payload.hosts.map((h) => [h.airbnbHostId, h.name]));

  // Importable = not hard-gated, band ≥ threshold, has a host.
  const minRank = BAND_RANK[MIN_BAND] ?? 2;
  const skipped: string[] = [];
  let importable = payload.homes.filter((h) => {
    if (!h.hostAirbnbId) { skipped.push(`${h.airbnbListingId} (no host)`); return false; }
    // A HEURISTIC host came from a whole-document key walk that a co-host or a
    // "similar listings" card can win. Provisioning an account for the wrong
    // person and telling them "your listings are ready" is the worst outreach
    // outcome available, so these go to manual review instead.
    if (h.hostSource === 'HEURISTIC') { skipped.push(`${h.airbnbListingId} (host attribution HEURISTIC)`); return false; }
    if (h.gateNote) { skipped.push(`${h.airbnbListingId} (gate:${h.gateNote})`); return false; }
    if ((BAND_RANK[h.trustBand] ?? 0) < minRank) { skipped.push(`${h.airbnbListingId} (${h.trustBand} < ${MIN_BAND})`); return false; }
    return true;
  });
  if (LIMIT) importable = importable.slice(0, LIMIT);

  const byHost = new Map<string, ScoredHome[]>();
  for (const h of importable) {
    const hid = h.hostAirbnbId!;
    if (!byHost.has(hid)) byHost.set(hid, []);
    byHost.get(hid)!.push(h);
  }

  console.log(`\n🏠 mkan import — ${importable.length} importable homes across ${byHost.size} hosts (min-band ${MIN_BAND})`);
  console.log(`   ${skipped.length} skipped${skipped.length ? ': ' + skipped.slice(0, 6).join(', ') + (skipped.length > 6 ? '…' : '') : ''}`);

  const ledger: Ledger = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { hosts: {}, homes: {} };

  if (!APPLY) {
    let simNum = 1000;
    for (const [hid, homes] of byHost) {
      const existing = ledger.hosts[hid];
      const email = existing?.mkanAccountEmail ?? `${String(simNum).padStart(4, '0')}@mkan.org`;
      if (!existing) simNum++;
      console.log(`\n▸ host ${hid} (${hostName.get(hid) ?? '?'}) → ${email}${existing ? ' [exists]' : ' [new]'}, ${homes.length} home(s)`);
      for (const h of homes) {
        if (ledger.homes[h.airbnbListingId]) { console.log(`    = ${h.airbnbListingId} already imported`); continue; }
        const ld = listingData(h);
        console.log(`    + ${(h.title ?? '').slice(0, 34).padEnd(34)} ${ld.propertyType ?? '—'} · ${ld.pricePerNight ?? 'price TBD'} SDG · ${(ld.amenities as Amenity[]).length} amenities · Busy`);
      }
    }
    console.log(`\nDRY RUN — no writes. Provisions ${[...byHost.keys()].filter((h) => !ledger.hosts[h]).length} new accounts, imports ${importable.filter((h) => !ledger.homes[h.airbnbListingId]).length} homes.`);
    console.log('To apply:  FORCE_SEED=1 npx tsx scripts/crm/mkan-import.ts --apply  (writes real Busy listings to mkan)\n');
    return;
  }

  if (process.env.NODE_ENV === 'production' && !process.env.FORCE_SEED) throw new Error('refusing to write in production without FORCE_SEED=1');
  prisma = (await import('@/lib/db')).db;

  // Idempotency lives in the DB, not the ledger. If the provenance columns are
  // empty while the ledger says 74 homes were imported, the backfill has not
  // run — every listing would look new and we would create 74 duplicates.
  const alreadySourced = await prisma.listing.count({ where: { sourceListingId: { not: null } } });
  if (Object.keys(ledger.homes).length && alreadySourced === 0) {
    throw new Error(
      `${Object.keys(ledger.homes).length} homes in the ledger but no Listing carries a sourceListingId.\n` +
        '   Run `pnpm crm:backfill-source --apply` first, or this import would duplicate every one of them.',
    );
  }

  // Mint-forward account number: max existing numeric username ≥ 1000, + 1.
  const users = await prisma.user.findMany({ where: { username: { not: null } }, select: { username: true } });
  let nextNum = Math.max(999, ...users.map((u) => parseInt(u.username ?? '', 10)).filter((n) => Number.isFinite(n) && n >= 1000)) + 1;

  let provisioned = 0, imported = 0;
  for (const [hid, homes] of byHost) {
    // Provision — idempotent on User.sourceHostId, with the ledger as a hint
    // only. The DB is authoritative so a lost ledger cannot re-provision a host.
    let acct = ledger.hosts[hid];
    const existingUser = await prisma.user.findUnique({
      where: { sourceHostId: hid },
      select: { id: true, email: true, username: true },
    });
    if (existingUser) {
      acct = { mkanUserId: existingUser.id, mkanAccountEmail: existingUser.email, mkanUsername: existingUser.username ?? '' };
      ledger.hosts[hid] = acct;
    }
    if (!acct) {
      const num = String(nextNum++);
      const email = `${num}@mkan.org`;
      const bootstrapPw = randomBytes(4).toString('hex');
      const user = await prisma.user.upsert({
        where: { email },
        update: { username: num, role: 'MANAGER', emailVerified: new Date(), sourceHostId: hid },
        create: { email, username: num, password: await bcrypt.hash(bootstrapPw, 10), role: 'MANAGER', emailVerified: new Date(), sourceHostId: hid },
      });
      acct = { mkanUserId: user.id, mkanAccountEmail: email, mkanUsername: num };
      ledger.hosts[hid] = acct;
      provisioned++;
      // The bootstrap password is printed once and stored nowhere. That is
      // deliberate now — the handover path is the claim link (crm:claim-token),
      // not this string. Losing it costs nothing.
      console.log(`+ account ${email}  pw ${bootstrapPw}  (host ${hid} — ${hostName.get(hid) ?? '?'})  ← superseded by the claim link`);
      flushLedger(ledger);
    }
    // Import homes — idempotent on Listing.sourceListingId.
    for (const h of homes) {
      const already = await prisma.listing.findUnique({
        where: { sourceListingId: h.airbnbListingId },
        select: { id: true, hostId: true },
      });
      if (already) {
        ledger.homes[h.airbnbListingId] = { mkanListingId: already.id, mkanUserId: already.hostId };
        console.log(`  = ${h.airbnbListingId} already imported (listing #${already.id})`);
        continue;
      }

      // One transaction: a crash between the two used to leave an orphan
      // Location behind with nothing pointing at it.
      const listing = await prisma.$transaction(async (tx) => {
        const location = await tx.location.create({ data: locationData(h) as never });
        return tx.listing.create({
          data: {
            ...listingData(h),
            locationId: location.id,
            hostId: acct!.mkanUserId,
            source: 'AIRBNB',
            sourceListingId: h.airbnbListingId,
            sourceUrl: `https://www.airbnb.com/rooms/${h.airbnbListingId}`,
            sourceHostId: hid,
            sourceCapturedAt: h.scrapedAt ? new Date(h.scrapedAt) : new Date(),
            canonicalLocale: h.canonicalLocale ?? h.authoredLocale ?? null,
          } as never,
        });
      });

      ledger.homes[h.airbnbListingId] = { mkanListingId: listing.id, mkanUserId: acct.mkanUserId };
      imported++;
      console.log(`  + listing #${listing.id}  ${(h.title ?? '').slice(0, 40)}  (Busy)`);
      // Written after every home, not once at the end: a crash here used to
      // orphan every row already created.
      flushLedger(ledger);
    }
  }

  flushLedger(ledger);
  console.log(`\n✅ provisioned ${provisioned} accounts, imported ${imported} homes (Busy). Ledger → ${OUT}`);
  console.log('   Sync mkanUserId/mkanListingId back to Twenty, then flip Available via the trust gate.\n');
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
