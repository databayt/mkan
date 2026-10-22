/**
 * Kigali zones in the CRM — the district → sector → neighbourhood tree from
 * `src/lib/geo/kigali-zones.ts` as Twenty `zone` records, with live counters,
 * and every Kigali home linked to its most specific zone.
 *
 *   pnpm crm:zones                 dry run: print what would be created / patched
 *   pnpm crm:zones --write         upsert the zones, refresh the counters, link homes
 *   pnpm crm:zones --write --no-homes   zones and counters only (fast)
 *
 * Idempotent: zones are keyed by `mkanZoneSlug`, created parents first (so a
 * sector's `parent` exists), and only fields that changed are PATCHed. Counters:
 *
 *   homesCount    Prisma listings in Rwanda (leads and published) placed in the zone or under it
 *   brokersCount  Prisma brokers with a zone served (`Broker.zoneSlugs`) in or under it
 *   openDemand    OPEN, unexpired tenant requests asking for the zone or a place inside it
 *
 * A Twenty home is matched to Prisma through `mkanListingId` (the mirror and
 * hygiene's key); a home with no listing is placed from its own address, pin
 * (Airbnb only — TikTok pins are district centres) and district.
 *
 * Needs the `zone` object: `crm:seed-objects --apply` first. `crm:demand-match`
 * calls `refreshOpenDemand` after matching, so open demand stays current daily.
 */
import { config } from 'dotenv';
config({ override: true });
process.env.PRISMA_QUIET ??= '1';

import { twentyClient, type TwentyClient } from './twenty-rest';
import { zoneOf } from './brokers-pure';
import { homeFactFromTwenty } from './brokers';
import { KIGALI_ZONE_BY_SLUG } from '../../src/lib/geo/kigali-zones';
import { demandZoneSlug, listingZoneSlug, zoneBody, zoneCounters, zonePatch, ZONES_PARENTS_FIRST, countWithin } from './zones-pure';

type Row = Record<string, unknown>;

/** Every zone record, or null when the object is not in the workspace yet. */
async function liveZones(client: TwentyClient): Promise<Row[] | null> {
  try {
    return await client.all('zones');
  } catch (e) {
    if (/not found/i.test((e as Error).message)) return null;
    throw e;
  }
}

/** Zone slugs of the tenant requests still waiting. */
async function openDemandSlugs(): Promise<(string | null)[]> {
  const { db } = await import('../../src/lib/db');
  const open = await db.tenantRequest.findMany({ where: { status: 'OPEN', expiresAt: { gte: new Date() } }, select: { requirements: true } });
  return open.map((r) => demandZoneSlug(r.requirements as { district?: string; neighbourhood?: string } | null));
}

/**
 * Only the `openDemand` counters — what `crm:demand-match` calls after a run.
 * A missing zone object is a no-op. Returns how many zones changed.
 */
export async function refreshOpenDemand(opts: { write: boolean }): Promise<number> {
  const client = twentyClient();
  const zones = await liveZones(client);
  if (!zones) return 0;
  const counts = countWithin(ZONES_PARENTS_FIRST, await openDemandSlugs());
  let changed = 0;
  for (const z of zones) {
    const want = counts.get(String(z.mkanZoneSlug));
    if (want == null || Number(z.openDemand ?? 0) === want) continue;
    changed += 1;
    if (opts.write) await client.rest('PATCH', `zones/${z.id}`, { openDemand: want });
  }
  return changed;
}

async function main(): Promise<void> {
  const WRITE = process.argv.includes('--write');
  const HOMES = !process.argv.includes('--no-homes');
  const { db } = await import('../../src/lib/db');
  const client = twentyClient();

  // ── counters from Prisma ──
  const listings = await db.listing.findMany({
    where: { location: { country: 'Rwanda' } },
    select: {
      id: true,
      source: true,
      location: { select: { state: true, zoneKey: true, sector: true, neighbourhood: true, address: true, latitude: true, longitude: true } },
    },
  });
  const realPin = (source: string | null) => source === 'AIRBNB' || source === 'MANUAL' || source === null;
  const listingSlug = new Map(listings.map((l) => [l.id, l.location ? listingZoneSlug({ ...l.location, pinIsReal: realPin(l.source) }) : null]));
  const brokers = await db.broker.findMany({ select: { zoneSlugs: true } });
  const demand = await openDemandSlugs();
  const counters = zoneCounters({ homes: [...listingSlug.values()], brokers: brokers.map((b) => b.zoneSlugs), demand });
  const placed = [...listingSlug.values()].filter(Boolean);
  const fine = placed.filter((s) => s!.includes('/')).length;
  console.log(`\n🗺  Kigali zones — ${WRITE ? 'WRITE' : 'DRY RUN'}`);
  console.log(`   ${ZONES_PARENTS_FIRST.length} zones · ${listings.length} Rwanda listing(s), ${placed.length} placed (${fine} at sector/neighbourhood) · ${brokers.length} broker(s), ${brokers.filter((b) => b.zoneSlugs.length).length} with zones · ${demand.length} open request(s)`);

  // ── zones, parents first ──
  const live = await liveZones(client);
  if (!live) console.log('   ! zone object not in Twenty yet — run `pnpm crm:seed-objects --apply` first; showing what would be created');
  const bySlug = new Map((live ?? []).filter((z) => z.mkanZoneSlug).map((z) => [String(z.mkanZoneSlug), z]));
  const idBySlug = new Map([...bySlug].map(([slug, z]) => [slug, String(z.id)]));
  let created = 0;
  let patched = 0;
  for (const z of ZONES_PARENTS_FIRST) {
    const want: Row = zoneBody(z, counters.get(z.slug));
    const parentId = z.parent ? idBySlug.get(z.parent) : null;
    if (z.parent && parentId) want.parentId = parentId;
    const have = bySlug.get(z.slug);
    if (!have) {
      created += 1;
      const c = counters.get(z.slug)!;
      console.log(`   + ${z.slug.padEnd(36)} ${z.level.padEnd(13)} homes ${c.homesCount} · brokers ${c.brokersCount} · demand ${c.openDemand}`);
      if (!WRITE || !live) continue;
      const res = (await client.rest('POST', 'zones', want)) as { data?: Record<string, { id?: string }> };
      const id = Object.values(res?.data ?? {})[0]?.id;
      if (id) idBySlug.set(z.slug, id);
      continue;
    }
    const patch = zonePatch(have, want);
    if (!Object.keys(patch).length) continue;
    patched += 1;
    console.log(`   ~ ${z.slug.padEnd(36)} ${Object.entries(patch).map(([k, v]) => `${k}=${typeof v === 'string' && v.length > 24 ? `${v.slice(0, 24)}…` : v}`).join(' · ')}`);
    if (WRITE) await client.rest('PATCH', `zones/${have.id}`, patch);
  }
  console.log(`   zones: ${created} to create · ${patched} to patch · ${ZONES_PARENTS_FIRST.length - created - patched} unchanged`);

  // ── homes → their most specific zone ──
  if (HOMES) {
    const homes = await client.all('homes');
    const levels: Record<string, number> = {};
    const toLink: { id: string; zoneId: string | null; slug: string }[] = [];
    let kigaliHomes = 0;
    for (const h of homes) {
      // Live Kigali homes only: duplicates, declined and Sudan homes keep no zone link.
      const fact = homeFactFromTwenty(h);
      if (!fact) continue;
      const id = typeof h.mkanListingId === 'number' ? h.mkanListingId : null;
      const fromListing = id != null ? (listingSlug.get(id) ?? null) : null;
      const fromHome = zoneOf(fact)?.slug ?? null;
      // Whichever is more specific: the listing's backfilled zone, or what the home itself says.
      const slug = [fromListing, fromHome].filter((s): s is string => !!s).sort((a, b) => b.split('/').length - a.split('/').length)[0];
      if (!slug) continue;
      kigaliHomes += 1;
      const level = KIGALI_ZONE_BY_SLUG.get(slug)!.level;
      levels[level] = (levels[level] ?? 0) + 1;
      const zoneId = idBySlug.get(slug) ?? null;
      if (zoneId && h.kigaliZoneId === zoneId) continue;
      toLink.push({ id: String(h.id), zoneId, slug });
    }
    console.log(`   homes: ${kigaliHomes} Kigali home(s) placed (${Object.entries(levels).map(([k, v]) => `${k} ${v}`).join(' · ')}) · ${toLink.length} to link`);
    if (toLink.length && !WRITE) console.log(`   (≈${Math.ceil((toLink.length * 0.7) / 60)} min at Twenty's rate limit)`);
    if (WRITE) {
      let linked = 0;
      for (const l of toLink) {
        if (!l.zoneId) continue;
        await client
          .rest('PATCH', `homes/${l.id}`, { kigaliZoneId: l.zoneId })
          .then(() => (linked += 1))
          .catch((e) => console.warn(`  ! home ${l.id}: ${(e as Error).message.slice(0, 120)}`));
      }
      console.log(`   ✅ ${linked} home(s) linked`);
    }
  }
  if (!WRITE) console.log('\nDRY RUN — nothing written. Pass --write to apply.');
}

if (process.argv[1] && /zones\.ts$/.test(process.argv[1])) {
  main()
    .then(async () => (await import('../../src/lib/db')).db.$disconnect())
    .catch((e) => {
      console.error(`\n❌ ${(e as Error).message}\n`);
      process.exit(1);
    });
}
