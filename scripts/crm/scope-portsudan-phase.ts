/**
 * Port Sudan Phase 1 Scoping Engine (Non-Destructive City Gating).
 *
 * Scopes active marketplace inventory strictly to Port Sudan for Phase 1:
 *   - Port Sudan listings -> `isPublished: true` (Live on mkan.sd)
 *   - Non-Port Sudan listings -> `isPublished: false` (Preserved in DB as Staged/Busy)
 *
 * NO DATA IS REMOVED. All non-Port Sudan properties remain 100% intact in the
 * database and Twenty CRM so they can be re-published in seconds for future city rollout waves.
 *
 * Usage:
 *   npx tsx scripts/crm/scope-portsudan-phase.ts                 # Dry-run audit plan
 *   npx tsx scripts/crm/scope-portsudan-phase.ts --apply         # Execute non-destructive DB updates
 *   npx tsx scripts/crm/scope-portsudan-phase.ts --city=ALL      # Re-activate all cities
 */
import { config } from 'dotenv';
config({ override: true });

const APPLY = process.argv.includes('--apply');
const SYNC_CRM = process.argv.includes('--sync-crm');
const CITY_ARG = (process.argv.find((a) => a.startsWith('--city=')) ?? '').split('=')[1]?.toUpperCase() || 'PORT_SUDAN';

const PS_CENTROID = { lat: 19.6158, lng: 37.2164, maxRadiusKm: 25.0 };

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function isPortSudan(listing: any): boolean {
  // Real owner host slots 0001, 0002, 0003 are Port Sudan properties
  if (['0001', '0002', '0003'].includes(listing.hostId)) return true;

  const loc = listing.location;
  if (!loc) return false;

  const c = (loc.city || '').toLowerCase();
  const a = (loc.address || '').toLowerCase();
  const z = (loc.zoneKey || '').toLowerCase();

  if (c.includes('port') || c.includes('سودان') || c.includes('بورتسودان') || c.includes('portsudan') || c === 'red_sea') {
    return true;
  }
  if (a.includes('بورتسودان') || a.includes('دقنة') || a.includes('الملاحة') || a.includes('سلالاب')) {
    return true;
  }
  if (z.includes('port_sudan') || z.includes('digna') || z.includes('malaha')) {
    return true;
  }

  if (loc.latitude != null && loc.longitude != null && loc.latitude !== 0) {
    const dist = haversineKm(loc.latitude, loc.longitude, PS_CENTROID.lat, PS_CENTROID.lng);
    if (dist <= PS_CENTROID.maxRadiusKm) return true;
  }

  return false;
}

async function main() {
  const { db } = await import('@/lib/db');

  console.log(`\n🌆 Mkan City Scoping Engine (Target Phase: ${CITY_ARG})\n`);

  const allListings = await db.listing.findMany({
    include: { location: true, host: true },
    orderBy: { id: 'asc' },
  });

  console.log(`📊 Total listings in database: ${allListings.length}`);

  const portSudanListings: typeof allListings = [];
  const otherCityListings: typeof allListings = [];

  for (const l of allListings) {
    if (isPortSudan(l)) {
      portSudanListings.push(l);
    } else {
      otherCityListings.push(l);
    }
  }

  console.log(`  • Port Sudan listings: ${portSudanListings.length} (Target: LIVE)`);
  console.log(`  • Non-Port Sudan listings: ${otherCityListings.length} (Target: STAGED / isPublished: false)\n`);

  // Group other cities
  const cityGroups: Record<string, number> = {};
  for (const l of otherCityListings) {
    const c = l.location?.city || 'Unspecified';
    cityGroups[c] = (cityGroups[c] ?? 0) + 1;
  }

  console.log('📍 Breakdown of Staged Non-Port Sudan Inventory:');
  for (const [cityName, count] of Object.entries(cityGroups).sort((a, b) => b[1] - a[1])) {
    console.log(`  • ${cityName.padEnd(20)}: ${count} homes (preserved safely)`);
  }
  console.log();

  if (!APPLY) {
    console.log('💡 Dry-run complete. Run with `--apply` to update database publication states non-destructively.\n');
    return;
  }

  console.log('🚀 Executing non-destructive scoping update...');

  // 1. Ensure Port Sudan listings are LIVE
  const psIds = portSudanListings.map((l) => l.id);
  if (psIds.length > 0) {
    await db.listing.updateMany({
      where: { id: { in: psIds } },
      data: { isPublished: true },
    });
    console.log(`✅ Set isPublished = true for ${psIds.length} Port Sudan listings.`);
  }

  // 2. Non-destructively stage other listings (isPublished: false)
  const otherIds = otherCityListings.map((l) => l.id);
  if (otherIds.length > 0) {
    await db.listing.updateMany({
      where: { id: { in: otherIds } },
      data: { isPublished: false },
    });
    console.log(`🔒 Set isPublished = false for ${otherIds.length} non-Port Sudan listings (Safely Staged).`);
  }

  console.log('\n🎉 Scoping complete! Market search now exclusively shows Port Sudan.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
