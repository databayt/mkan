/**
 * Comprehensive verification script for Port Sudan listings & zones.
 */
import "dotenv/config";
import { db } from "@/lib/db";
import {
  PORT_SUDAN_ZONES,
  PORT_SUDAN_ZONE_BY_SLUG,
  getPortSudanZone,
  getPortSudanZoneLabel,
  searchPortSudanZones,
} from "@/lib/geo/portsudan-zones";
import { zoneKeyFor, zoneLabel } from "@/lib/geo/zone";
import {
  getLocationSuggestions,
  getPopularLocations,
  searchListings,
} from "@/lib/actions/search-actions";

async function verify() {
  console.log("==================================================");
  console.log("  Port Sudan Zones & Listings Verification");
  console.log("==================================================\n");

  // 1. Check database publication state
  const publishedCount = await db.listing.count({ where: { isPublished: true, draft: false } });
  const unpublishedCount = await db.listing.count({ where: { isPublished: false } });
  const totalCount = await db.listing.count();

  console.log(`Total listings in DB:       ${totalCount}`);
  console.log(`Published listings (PS):    ${publishedCount}`);
  console.log(`Unpublished listings:       ${unpublishedCount}`);

  if (publishedCount !== 29) {
    throw new Error(`Expected exactly 29 published listings, got ${publishedCount}`);
  }

  // 2. Verify all 29 published listings have valid zone keys
  const publishedListings = await db.listing.findMany({
    where: { isPublished: true, draft: false },
    include: { location: true },
    orderBy: { id: "asc" },
  });

  const zoneTally = new Map<string, number>();
  for (const l of publishedListings) {
    const zk = l.location?.zoneKey;
    if (!zk) {
      throw new Error(`Listing #${l.id} has no zoneKey!`);
    }
    const zoneDef = PORT_SUDAN_ZONE_BY_SLUG.get(zk.toLowerCase());
    if (!zoneDef) {
      throw new Error(`Listing #${l.id} has invalid zoneKey: ${zk}`);
    }
    zoneTally.set(zk, (zoneTally.get(zk) ?? 0) + 1);
  }

  console.log("\nPublished Listings by Port Sudan Zone:");
  for (const [zk, count] of zoneTally.entries()) {
    const labelAr = zoneLabel(zk, "ar");
    const labelEn = zoneLabel(zk, "en");
    console.log(`  - [${zk}] (${labelAr} / ${labelEn}): ${count} listing(s)`);
  }

  // 3. Test Autocomplete Suggestions
  console.log("\n--- Testing Autocomplete Suggestions ---");
  const popular = await getPopularLocations(6);
  console.log("Popular locations:");
  popular.forEach((p) => {
    console.log(`  • ${p.displayName} (${p.searchValue}): ${p.listingCount} listings — ${p.description ?? ""}`);
  });

  const tests = ["دقنة", "digna", "عروس", "وسط", "مطار", "hedal", "هدل"];
  for (const q of tests) {
    const res = await getLocationSuggestions(q, 3);
    console.log(`\nQuery "${q}":`);
    res.forEach((r) => {
      console.log(`  -> ${r.displayName} [slug: ${r.searchValue}] (${r.listingCount} listings)`);
    });
  }

  // 4. Test Search Filtering by Zone
  console.log("\n--- Testing Search Listings by Zone ---");
  const dignaSearch = await searchListings({ location: "digna", limit: 20 });
  console.log(`Search 'digna': ${dignaSearch.listings.length} results (total: ${dignaSearch.totalCount})`);

  const arabicDignaSearch = await searchListings({ location: "دقنة", limit: 20 });
  console.log(`Search 'دقنة': ${arabicDignaSearch.listings.length} results (total: ${arabicDignaSearch.totalCount})`);

  const cityCentreSearch = await searchListings({ location: "city-centre", limit: 20 });
  console.log(`Search 'city-centre': ${cityCentreSearch.listings.length} results (total: ${cityCentreSearch.totalCount})`);

  const arousSearch = await searchListings({ location: "arous", limit: 20 });
  console.log(`Search 'arous': ${arousSearch.listings.length} results (total: ${arousSearch.totalCount})`);

  const portSudanAllSearch = await searchListings({ location: "Port Sudan", limit: 50 });
  console.log(`Search 'Port Sudan': ${portSudanAllSearch.listings.length} results (total: ${portSudanAllSearch.totalCount})`);

  console.log("\n✅ All checks passed successfully!");
}

verify()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
