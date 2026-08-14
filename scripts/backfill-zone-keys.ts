/**
 * Backfills `Location.zoneKey` from the stored coordinates.
 *
 * Idempotent and safe to re-run: it recomputes every row and writes only the
 * ones whose derived zone differs from what is stored, so a second run is a
 * no-op and a gazetteer change can be rolled out by running it again.
 *
 *   pnpm tsx scripts/backfill-zone-keys.ts            # dry run, prints the diff
 *   pnpm tsx scripts/backfill-zone-keys.ts --apply    # writes
 *
 * `import "dotenv/config"` MUST come before the db import: `src/lib/db.ts`
 * builds the client at module scope and ESM hoists imports, so a plain
 * `tsx script.ts` otherwise connects to nothing.
 */
import "dotenv/config";

import { zoneKeyFor } from "@/lib/geo/zone";

async function main(): Promise<void> {
  const { db } = await import("@/lib/db");
  const apply = process.argv.includes("--apply");

  const rows = await db.location.findMany({
    select: { id: true, city: true, latitude: true, longitude: true, zoneKey: true },
  });

  const changes: { id: number; from: string | null; to: string | null; city: string }[] = [];
  for (const r of rows) {
    const next = zoneKeyFor(r.latitude, r.longitude);
    if (next !== r.zoneKey) changes.push({ id: r.id, from: r.zoneKey, to: next, city: r.city });
  }

  // Show how badly the free-text city disagrees with the coordinates — the
  // whole reason this column exists.
  const disagreements = new Map<string, number>();
  for (const r of rows) {
    const zone = zoneKeyFor(r.latitude, r.longitude);
    const key = `${r.city} -> ${zone ?? "UNZONED"}`;
    disagreements.set(key, (disagreements.get(key) ?? 0) + 1);
  }

  console.log(`locations: ${rows.length}`);
  console.log(`changes:   ${changes.length}`);
  console.log("\nstored city -> derived zone");
  [...disagreements.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  ${k}`));

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
