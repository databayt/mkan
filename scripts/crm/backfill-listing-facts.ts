/**
 * Re-derive amenities, house rules and canonical locale for imported listings.
 *
 *   pnpm crm:backfill-facts            # dry run — prints the per-listing diff
 *   pnpm crm:backfill-facts --apply
 *   pnpm crm:backfill-facts --photos=scripts/crm/.data/airbnb-rehosted.json
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
 * ── Why it compares every field, not just amenities ────────────────────────
 *
 * It used to decide "already current" from the amenity set alone. That made it
 * blind to every other field it writes: a listing whose amenities happened to
 * match was skipped outright, so its house rules and locale never landed. 48 of
 * the 74 imported listings still had `houseRules` NULL because of it, and
 * `canonicalLocale` — which it never wrote at all — was NULL on all 74, leaving
 * `localize()` unable to tell which language the stored title is in. The site
 * renders Arabic off that column, so the practical effect was an Arabic-first
 * marketplace showing English titles on /ar.
 *
 * Now it diffs each managed field and writes when any one of them differs.
 *
 * ── The one thing it must never do ─────────────────────────────────────────
 *
 * Overwrite a person. A listing with `claimedAt` set belongs to its host now;
 * whatever its amenities say is their statement about their own property, and
 * a scraper from July has no business correcting it. Those are skipped and
 * counted, never written — the same "fill empty, never replace populated" rule
 * that governs sync-contacts-to-twenty.ts.
 *
 * Photos and price follow the softer half of that same rule: they are only ever
 * filled in when the listing has none, never replaced. A host who has uploaded
 * their own photos keeps them.
 */
import { config } from 'dotenv';
config({ override: true });

import { readFileSync, existsSync } from 'node:fs';
import { Amenity } from '@prisma/client';
import { mapAmenities as mapAmenityNames, smokingFromAmenities } from './amenity-map';
import { parseHouseRules, toListingHouseRules } from './house-rules';
import { detectScript } from '@/components/translation/util';

let prisma: (typeof import('@/lib/db'))['db'];

const APPLY = process.argv.includes('--apply');
const argv = (n: string, d = ''): string => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const IN = argv('in', 'scripts/crm/.data/airbnb-scrape.json');
// The re-hosted file is the only place CDN photo URLs and the SDG price exist.
// Optional: without it, photos and price are simply left alone.
const PHOTOS_IN = argv('photos', 'scripts/crm/.data/airbnb-rehosted.json');

interface LocaleCapture {
  amenities?: string[] | null;
  houseRules?: string[] | null;
}
interface Home {
  airbnbListingId: string;
  title?: string | null;
  description?: string | null;
  amenitiesRaw?: string[] | null;
  houseRules?: string[] | null;
  i18n?: { en?: LocaleCapture; ar?: LocaleCapture };
}
/** The subset of the re-hosted file this script reads. */
interface RehostedHome {
  airbnbListingId: string;
  photoUrls?: string[] | null;
  photosRehosted?: boolean;
  priceNightSdg?: number | null;
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

type Derived = ReturnType<typeof derive>;

/** Deep-equal for the small JSON shapes `toListingHouseRules` produces. */
const sameJson = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const sameAmenities = (a: readonly Amenity[], b: readonly Amenity[]): boolean =>
  a.length === b.length && a.every((v) => b.includes(v));

async function main() {
  console.log('\n🔁 Re-derive amenities + house rules for imported listings');
  if (!existsSync(IN)) throw new Error(`no scrape file at ${IN}`);
  const homes = (JSON.parse(readFileSync(IN, 'utf8')) as { homes: Home[] }).homes ?? [];
  const byId = new Map(homes.map((h) => [h.airbnbListingId, h]));

  // Photos and price live in the re-hosted file, which is optional.
  const rehosted = new Map<string, RehostedHome>();
  if (existsSync(PHOTOS_IN)) {
    const rh = (JSON.parse(readFileSync(PHOTOS_IN, 'utf8')) as { homes: RehostedHome[] }).homes ?? [];
    for (const h of rh) if (h.photosRehosted) rehosted.set(h.airbnbListingId, h);
    console.log(`   photos/price from ${PHOTOS_IN} — ${rehosted.size} re-hosted homes`);
  } else {
    console.log(`   no re-hosted file at ${PHOTOS_IN} — photos and price left alone`);
  }

  prisma = (await import('@/lib/db')).db;

  const listings = await prisma.listing.findMany({
    where: { source: 'AIRBNB', sourceListingId: { not: null } },
    select: {
      id: true,
      sourceListingId: true,
      claimedAt: true,
      title: true,
      description: true,
      amenities: true,
      isParkingIncluded: true,
      isPetsAllowed: true,
      checkInTime: true,
      checkOutTime: true,
      checkInMethod: true,
      houseRules: true,
      canonicalLocale: true,
      photoUrls: true,
      pricePerNight: true,
    },
  });

  let claimed = 0;
  let noCapture = 0;
  let unchanged = 0;
  let amenitiesBefore = 0;
  let amenitiesAfter = 0;
  const fieldCounts: Record<string, number> = {};
  const bump = (f: string) => { fieldCounts[f] = (fieldCounts[f] ?? 0) + 1; };

  interface Update {
    id: number;
    data: Record<string, unknown>;
    changed: string[];
    amenityFrom: number;
    amenityTo: number;
  }
  const updates: Update[] = [];

  for (const l of listings) {
    if (l.claimedAt) { claimed++; continue; }
    const home = byId.get(l.sourceListingId!);
    if (!home) { noCapture++; continue; }

    const d: Derived = derive(home);
    amenitiesBefore += l.amenities.length;
    amenitiesAfter += d.amenities.length;

    const data: Record<string, unknown> = {};
    const changed: string[] = [];
    const set = (field: string, value: unknown) => { data[field] = value; changed.push(field); bump(field); };

    if (!sameAmenities(d.amenities, l.amenities)) set('amenities', d.amenities);
    if (d.isParkingIncluded !== l.isParkingIncluded) set('isParkingIncluded', d.isParkingIncluded);
    if (d.isPetsAllowed !== l.isPetsAllowed) set('isPetsAllowed', d.isPetsAllowed);

    // Derived-but-absent never clears a value that is already there: the parse
    // failing to find a check-in time is not a statement that there isn't one.
    if (d.checkInTime && d.checkInTime !== l.checkInTime) set('checkInTime', d.checkInTime);
    if (d.checkOutTime && d.checkOutTime !== l.checkOutTime) set('checkOutTime', d.checkOutTime);
    if (d.checkInMethod && d.checkInMethod !== l.checkInMethod) set('checkInMethod', d.checkInMethod);
    if (d.houseRules && !sameJson(d.houseRules, l.houseRules)) set('houseRules', d.houseRules);

    // Which language the STORED title is written in — read off the listing
    // itself, never off the scrape. Those two disagree routinely: the capture
    // that created a row may have been the English pass while a later scrape
    // returns the same home's Arabic title, and `authoredLocale` describes the
    // host, not the string we saved. Deriving it from `l.title` with the same
    // function the renderer uses means the column cannot contradict what
    // `localize()` decides at display time.
    const locale = detectScript(l.title ?? l.description);
    if (locale !== l.canonicalLocale) set('canonicalLocale', locale);

    // Fill-if-empty only — a host's own uploads and prices are never replaced.
    const rh = rehosted.get(l.sourceListingId!);
    if (rh?.photoUrls?.length && l.photoUrls.length === 0) set('photoUrls', rh.photoUrls);
    if (rh?.priceNightSdg != null && l.pricePerNight == null) set('pricePerNight', rh.priceNightSdg);

    if (!changed.length) { unchanged++; continue; }
    updates.push({ id: l.id, data, changed, amenityFrom: l.amenities.length, amenityTo: d.amenities.length });
  }

  console.log(`\n   ${listings.length} imported listings`);
  console.log(`   ${claimed} skipped — claimed by their host (never overwritten)`);
  console.log(`   ${noCapture} skipped — no matching capture in the scrape`);
  console.log(`   ${unchanged} already current`);
  console.log(`   ${updates.length} to update`);
  console.log(`   amenity values: ${amenitiesBefore} → ${amenitiesAfter}\n`);

  console.log('   by field:');
  for (const [field, n] of Object.entries(fieldCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${String(n).padStart(4)}  ${field}`);
  }
  console.log('');

  for (const u of updates.slice(0, 10)) {
    const am = u.amenityFrom !== u.amenityTo ? ` (amenities ${u.amenityFrom} → ${u.amenityTo})` : '';
    console.log(`     listing #${u.id}: ${u.changed.join(', ')}${am}`);
  }
  if (updates.length > 10) console.log(`     … ${updates.length - 10} more`);

  if (!updates.length) { console.log('\nNothing to do.\n'); process.exit(0); }
  if (!APPLY) { console.log('\nDRY RUN — re-run with --apply.\n'); process.exit(0); }

  let written = 0;
  for (const u of updates) {
    await prisma.listing.update({ where: { id: u.id }, data: u.data });
    written++;
  }

  console.log(`\n✅ ${written} listings updated · ${amenitiesBefore} → ${amenitiesAfter} amenity values\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
