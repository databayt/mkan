/**
 * Re-derive amenities and house rules for listings already imported.
 *
 *   pnpm crm:backfill-facts            # dry run — prints the per-listing diff
 *   pnpm crm:backfill-facts --apply
 *
 * ── Why this exists separately from the import ─────────────────────────────
 *
 * `mkan-import.ts` is create-only by design: it keys off `sourceListingId` and
 * skips anything already there, so a second run cannot duplicate a listing. The
 * cost is that the 74 rows imported before the `Amenity` enum was widened still
 * carry what the old 13-value enum could express — 57% of every captured
 * amenity list was dropped on the way in, and re-running the import will not
 * fix a single one of them. Nor would deleting and re-importing: that discards
 * ids, claim tokens and anything a host has since touched.
 *
 * So this reads the same scrape, re-maps it through the current tables, and
 * writes only the fields it derives.
 *
 * ── The one thing it must never do ─────────────────────────────────────────
 *
 * Overwrite a person. A listing with `claimedAt` set belongs to its host now;
 * whatever its amenities say is their statement about their own property, and
 * a scraper from July has no business correcting it. Those are skipped and
 * counted, never written — the same "fill empty, never replace populated" rule
 * that governs sync-contacts-to-twenty.ts.
 */
import { config } from 'dotenv';
config({ override: true });

import { readFileSync, existsSync } from 'node:fs';
import { Amenity } from '@prisma/client';
import { mapAmenities as mapAmenityNames, smokingFromAmenities } from './amenity-map';
import { parseHouseRules, toListingHouseRules } from './house-rules';

let prisma: (typeof import('@/lib/db'))['db'];

const APPLY = process.argv.includes('--apply');
const argv = (n: string, d = ''): string => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const IN = argv('in', 'scripts/crm/.data/airbnb-scrape.json');

interface LocaleCapture {
  amenities?: string[] | null;
  houseRules?: string[] | null;
}
interface Home {
  airbnbListingId: string;
  amenitiesRaw?: string[] | null;
  houseRules?: string[] | null;
  i18n?: { en?: LocaleCapture; ar?: LocaleCapture };
}

const mapAmenities = (...groups: Array<string[] | null | undefined>): Amenity[] =>
  mapAmenityNames(...groups).map((n) => Amenity[n as keyof typeof Amenity]).filter(Boolean);

/** Exactly what `mkan-import.ts` derives, so the two cannot disagree. */
function derive(home: Home) {
  const amenities = mapAmenities(
    home.amenitiesRaw,
    home.i18n?.en?.amenities,
    home.i18n?.ar?.amenities
  );
  const parsed = parseHouseRules(home.i18n?.en?.houseRules ?? home.houseRules);
  if (parsed.smokingAllowed === null) {
    parsed.smokingAllowed = smokingFromAmenities(
      home.amenitiesRaw,
      home.i18n?.en?.amenities,
      home.i18n?.ar?.amenities
    );
  }
  return {
    amenities,
    isParkingIncluded: amenities.includes(Amenity.Parking),
    isPetsAllowed: amenities.includes(Amenity.PetsAllowed),
    checkInTime: parsed.checkInTime,
    checkOutTime: parsed.checkOutTime,
    checkInMethod: parsed.checkInMethod,
    houseRules: toListingHouseRules(parsed),
  };
}

async function main() {
  console.log('\n🔁 Re-derive amenities + house rules for imported listings');
  if (!existsSync(IN)) throw new Error(`no scrape file at ${IN}`);
  const homes = (JSON.parse(readFileSync(IN, 'utf8')) as { homes: Home[] }).homes ?? [];
  const byId = new Map(homes.map((h) => [h.airbnbListingId, h]));

  prisma = (await import('@/lib/db')).db;

  const listings = await prisma.listing.findMany({
    where: { source: 'AIRBNB', sourceListingId: { not: null } },
    select: {
      id: true,
      sourceListingId: true,
      claimedAt: true,
      amenities: true,
      checkInTime: true,
      checkOutTime: true,
    },
  });

  let claimed = 0;
  let noCapture = 0;
  let unchanged = 0;
  let amenitiesBefore = 0;
  let amenitiesAfter = 0;
  const updates: Array<{ id: number; data: ReturnType<typeof derive>; from: number; to: number }> = [];

  for (const l of listings) {
    if (l.claimedAt) { claimed++; continue; }
    const home = byId.get(l.sourceListingId!);
    if (!home) { noCapture++; continue; }

    const data = derive(home);
    amenitiesBefore += l.amenities.length;
    amenitiesAfter += data.amenities.length;

    const same =
      data.amenities.length === l.amenities.length &&
      data.amenities.every((a) => l.amenities.includes(a));
    if (same) { unchanged++; continue; }
    updates.push({ id: l.id, data, from: l.amenities.length, to: data.amenities.length });
  }

  console.log(`   ${listings.length} imported listings`);
  console.log(`   ${claimed} skipped — claimed by their host (never overwritten)`);
  console.log(`   ${noCapture} skipped — no matching capture in the scrape`);
  console.log(`   ${unchanged} already current`);
  console.log(`   ${updates.length} to update`);
  console.log(`   amenity values: ${amenitiesBefore} → ${amenitiesAfter}\n`);

  for (const u of updates.slice(0, 10)) {
    console.log(`     listing #${u.id}: ${u.from} → ${u.to} amenities`);
  }
  if (updates.length > 10) console.log(`     … ${updates.length - 10} more`);

  if (!updates.length) { console.log('\nNothing to do.\n'); process.exit(0); }
  if (!APPLY) { console.log('\nDRY RUN — re-run with --apply.\n'); process.exit(0); }

  let written = 0;
  for (const u of updates) {
    await prisma.listing.update({
      where: { id: u.id },
      data: {
        amenities: u.data.amenities,
        isParkingIncluded: u.data.isParkingIncluded,
        isPetsAllowed: u.data.isPetsAllowed,
        ...(u.data.checkInTime ? { checkInTime: u.data.checkInTime } : {}),
        ...(u.data.checkOutTime ? { checkOutTime: u.data.checkOutTime } : {}),
        ...(u.data.checkInMethod ? { checkInMethod: u.data.checkInMethod } : {}),
        ...(u.data.houseRules ? { houseRules: u.data.houseRules } : {}),
      },
    });
    written++;
  }

  console.log(`\n✅ ${written} listings updated · ${amenitiesBefore} → ${amenitiesAfter} amenity values\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
