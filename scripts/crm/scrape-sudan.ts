/**
 * Exhaustive Sudan sweep — run the Airbnb scraper across every population centre
 * and merge into one file, so we capture (near) all of Sudan's inventory rather
 * than the ~300 a single country search caps at.
 *
 * Airbnb geocodes each query to a bounding box and paginates to a hard limit, so
 * a lone "Sudan" search misses the tail (and skews to Khartoum). This runs the
 * scraper once per region with `--merge` — each pass adds that region's new
 * listings and PDP-enriches only the ones not already seen — then reports growth.
 *
 *   pnpm crm:scrape-sudan                       # full sweep, PDP on, 15 pages
 *   pnpm crm:scrape-sudan --max-pages=20
 *   pnpm crm:scrape-sudan --regions=Kassala--Sudan,Nyala--Sudan   # subset
 *   pnpm crm:scrape-sudan --list                # print the region list, no scrape
 *
 * Needs the vault Chrome up + logged in (chrome-debug.sh, CDP :9222).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const arg = (n: string, d = ''): string => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.split('=').slice(1).join('=') : d;
};
const flag = (n: string) => process.argv.includes(`--${n}`);

const OUT = arg('out', 'scripts/crm/.data/airbnb-scrape.json');
const MAX_PAGES = arg('max-pages', '15');
const PDP_DELAY = arg('pdp-delay', '1500');
const NO_PDP = flag('no-pdp');

// Sudan population centres + dense Khartoum neighbourhoods (to break the per-search
// cap where inventory clusters). Slugs use Airbnb's "Place--Country" URL form.
const DEFAULT_REGIONS = [
  'Sudan', // country catch-all first
  'Khartoum--Sudan', 'Khartoum-North--Sudan', 'Bahri--Sudan', 'Omdurman--Sudan',
  'Port-Sudan--Sudan', 'Kassala--Sudan', 'Wad-Madani--Sudan', 'Madani--Sudan',
  'Gedaref--Sudan', 'El-Obeid--Sudan', 'Nyala--Sudan', 'El-Fasher--Sudan',
  'Kosti--Sudan', 'Atbara--Sudan', 'Dongola--Sudan', 'Sennar--Sudan',
  'Ed-Damazin--Sudan', 'Merowe--Sudan', 'Karima--Sudan', 'Shendi--Sudan',
  'Ad-Damar--Sudan', 'Rabak--Sudan', 'Geneina--Sudan',
  // Khartoum neighbourhoods
  'Riyadh-Khartoum--Sudan', 'Arkaweet-Khartoum--Sudan', 'Kafouri-Khartoum--Sudan',
  'Al-Amarat-Khartoum--Sudan', 'Burri-Khartoum--Sudan', 'Taif-Khartoum--Sudan',
];
const REGIONS = (arg('regions') ? arg('regions').split(',') : DEFAULT_REGIONS).map((r) => r.trim()).filter(Boolean);

const count = (): number => {
  if (!existsSync(OUT)) return 0;
  try { return (JSON.parse(readFileSync(OUT, 'utf8')).homes ?? []).length; } catch { return 0; }
};

function main() {
  if (flag('list')) { console.log(`\n${REGIONS.length} regions:\n  ${REGIONS.join('\n  ')}\n`); return; }
  console.log(`\n🌍 Exhaustive Sudan sweep — ${REGIONS.length} regions, ${MAX_PAGES} pages each, PDP ${NO_PDP ? 'off' : 'on'} → ${OUT}`);
  const start = count();
  console.log(`   starting from ${start} homes\n`);

  const growth: { region: string; added: number; total: number }[] = [];
  for (let i = 0; i < REGIONS.length; i++) {
    const region = REGIONS[i];
    const before = count();
    console.log(`\n━━━ [${i + 1}/${REGIONS.length}] ${region}  (have ${before}) ━━━`);
    const args = ['tsx', 'scripts/crm/airbnb-scrape.ts', `--query=${region}`, '--merge', `--max-pages=${MAX_PAGES}`, `--pdp-delay=${PDP_DELAY}`, `--out=${OUT}`];
    if (NO_PDP) args.push('--no-pdp');
    const res = spawnSync('npx', args, { stdio: 'inherit' });
    if (res.status !== 0) console.warn(`  ! region "${region}" exited ${res.status} — continuing`);
    const after = count();
    growth.push({ region, added: after - before, total: after });
  }

  console.log(`\n\n📊 Sweep complete — ${start} → ${count()} homes (+${count() - start})`);
  for (const g of growth.filter((g) => g.added > 0).sort((a, b) => b.added - a.added)) {
    console.log(`   +${String(g.added).padStart(3)}  ${g.region}`);
  }
  console.log(`\n   Next: pnpm crm:upsert --apply · crm:score --apply · crm:rehost · crm:import · crm:publish\n`);
}
main();
