/**
 * Read-only: how many shortlists missed the area the tenant named (mkan#54).
 *
 *   pnpm tsx scripts/agent/area-misses.ts [--days=7]
 *
 * A chat "names an area" when its parsed requirements carry a neighbourhood.
 * Its shortlist "misses" when none of its homes is inside that neighbourhood
 * (zone slug under it, or a pin within the radius). Relaxed shortlists count
 * as misses on purpose: the tenant still got no home in the area.
 */
import { config } from 'dotenv';
config({ override: true });

async function main() {
  const days = Number(process.argv.find((a) => a.startsWith('--days='))?.slice(7) ?? 7);
  const { db } = await import('../../src/lib/db');
  const { neighbourhoodNamed, inNeighbourhood } = await import('../../src/components/agent/areas');
  const since = new Date(Date.now() - days * 864e5);
  const tasks = await db.agentTask.findMany({ where: { createdAt: { gte: since } }, select: { id: true, requirements: true, shortlist: true } });
  let named = 0, withList = 0, missed = 0;
  const rows: string[] = [];
  for (const t of tasks) {
    const hoodName = (t.requirements as { neighbourhood?: string | null } | null)?.neighbourhood;
    const hood = neighbourhoodNamed(hoodName);
    if (!hood) continue;
    named++;
    const ids = ((t.shortlist as { id: number }[] | null) ?? []).map((s) => s.id);
    if (!ids.length) { rows.push(`${t.id} ${hood.name}: empty shortlist`); continue; }
    withList++;
    const homes = await db.listing.findMany({ where: { id: { in: ids } }, select: { location: { select: { latitude: true, longitude: true, neighbourhood: true, sector: true } } } });
    const hit = homes.some((h) => {
      const l = h.location;
      if (!l) return false;
      const z = l.neighbourhood ?? l.sector ?? '';
      return z === hood.slug || z.startsWith(hood.slug + '/') || (l.latitude != null && l.longitude != null && inNeighbourhood(l.latitude, l.longitude, hood.name));
    });
    if (!hit) { missed++; rows.push(`${t.id} ${hood.name}: ${ids.length} homes, none inside`); }
  }
  console.log(JSON.stringify({ days, tasks: tasks.length, namedArea: named, withShortlist: withList, missed }, null, 1));
  rows.forEach((r) => console.log(r));
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
