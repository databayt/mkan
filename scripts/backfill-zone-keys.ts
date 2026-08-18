/**
 * Backfills `Location.zoneKey` from stored coordinates, addresses, and listing titles.
 *
 * Accurately classifies:
 *   - Port Sudan listings into canonical 45 zones (e.g. 'digna', 'city-centre', 'airport-district', 'arous', etc.)
 *   - Non-Port Sudan listings into national city codes (e.g. 'KHARTOUM', 'OMDURMAN', 'BAHRI', 'EAST_NILE', etc.)
 *
 * Usage:
 *   pnpm tsx scripts/backfill-zone-keys.ts            # dry run, prints the diff
 *   pnpm tsx scripts/backfill-zone-keys.ts --apply    # executes updates
 */
import "dotenv/config";

import { zoneKeyFor } from "@/lib/geo/zone";

async function main(): Promise<void> {
  const { db } = await import("@/lib/db");
  const apply = process.argv.includes("--apply");

  const rows = await db.location.findMany({
    select: {
      id: true,
      city: true,
      address: true,
      latitude: true,
      longitude: true,
      zoneKey: true,
      listings: {
        select: { title: true },
      },
    },
  });

  const changes: { id: number; from: string | null; to: string | null; city: string; address: string }[] = [];
  for (const r of rows) {
    const textContext = [r.address, ...r.listings.map((l) => l.title)].filter(Boolean).join(" ");
    const next = zoneKeyFor(r.latitude, r.longitude, textContext);
    if (next !== r.zoneKey) {
      changes.push({ id: r.id, from: r.zoneKey, to: next, city: r.city, address: r.address });
    }
  }

  const zoneDistribution = new Map<string, number>();
  for (const r of rows) {
    const textContext = [r.address, ...r.listings.map((l) => l.title)].filter(Boolean).join(" ");
    const zone = zoneKeyFor(r.latitude, r.longitude, textContext) ?? "UNZONED";
    const key = `${r.city} -> ${zone}`;
    zoneDistribution.set(key, (zoneDistribution.get(key) ?? 0) + 1);
  }

  console.log(`locations: ${rows.length}`);
  console.log(`changes:   ${changes.length}`);
  console.log("\nstored city -> derived zone");
  [...zoneDistribution.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  ${k}`));

  if (changes.length > 0) {
    console.log("\nSample changes:");
    changes.slice(0, 15).forEach((c) => {
      console.log(`  Location #${c.id} (${c.city} - ${c.address}): ${c.from} -> ${c.to}`);
    });
  }

  if (!apply) {
    console.log("\ndry run — pass --apply to write");
    return;
  }

  let written = 0;
  for (const c of changes) {
    await db.location.update({ where: { id: c.id }, data: { zoneKey: c.to } });
    written++;
  }
  console.log(`\nwrote ${written} rows`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
