/**
 * Exhaustive Sudan discovery by map-viewport quadtree (Epic G1.2).
 *
 * ── Why this replaces the region sweep ──────────────────────────────────────
 *
 * `scrape-sudan.ts` asked Airbnb for 30 named places and merged the results. It
 * could not work, for a reason no amount of extra place names would fix:
 * Airbnb truncates any search at 15 pages × 18 results, and a place slug
 * geocodes to a viewport whose size Airbnb chooses. Measured 2026-07-26, the
 * whole-Sudan viewport declares exactly 15 pages and returns 263 unique
 * listings — the ceiling. Everything past it was invisible, so the sweep kept
 * re-reading the same truncated head of the same list.
 *
 * A viewport we control does not have that problem. Split it until every leaf
 * comes back under the ceiling, and the union of the leaves is provably the
 * complete set — because a viewport that declares fewer than 15 pages has told
 * us it has nothing more.
 *
 *     COMPLETE   declaredPages < 15  → Airbnb offered everything it has here
 *     SATURATED  declaredPages = 15  → truncated; split into four and recurse
 *     EMPTY      no results at all   → prune
 *     CAPPED     still saturated at the minimum cell size → an honest hole
 *     FAILED     navigation/parse error → retried on the next run
 *
 * ── Only Sudan ─────────────────────────────────────────────────────────────
 *
 * Sudan's bounding box also contains parts of Ethiopia, Eritrea, Chad, CAR,
 * South Sudan and Egypt. Cells lying entirely outside the border are never
 * fetched, and every result is checked with `checkPlace()` before it is kept —
 * coordinates alone are not enough, because Airbnb serves placeholder
 * coordinates that can land inside Sudan for listings on other continents.
 *
 *   pnpm crm:bbox --dry                 # plan the grid, no browser
 *   pnpm crm:bbox --max-cells=20        # smoke run
 *   pnpm crm:bbox                       # full crawl, resumable
 *
 * Flags: --dry --max-cells=<N> --retry-failed --no-resume --depth=<N>
 *        --out=<homes file> --frontier=<path> --cdp=<url> --delay=<ms>
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseSearchResult, type HomeRecord, type HostRecord } from './airbnb-parse';
import { paginateSearch, PAGE_CAP } from './airbnb-paginate';
import { SUDAN_BBOX, isInSudan, kmToBorder, checkPlace, BORDER_BUFFER_KM } from './sudan-places';

const arg = (name: string, def?: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

const DRY = flag('dry');
const RESUME = !flag('no-resume');
const RETRY_FAILED = flag('retry-failed');
const MAX_CELLS = parseInt(arg('max-cells', '0')!, 10);
const SEED_DEPTH = parseInt(arg('depth', '3')!, 10);
const DELAY = parseInt(arg('delay', '1200')!, 10);
const CDP = arg('cdp', 'http://127.0.0.1:9222')!;
const OUT = arg('out', 'scripts/crm/.data/airbnb-scrape.json')!;
const FRONTIER = arg('frontier', 'scripts/crm/.data/airbnb-bbox-frontier.json')!;

/** ~1.1 km. Below this we stop splitting and report the cell as a known hole. */
const MIN_SPAN_DEG = 0.01;

/** Retries and backoff for transient network failures — see TRANSIENT below. */
const NET_RETRIES = 4;
const NET_BACKOFF_MS = 20_000;
/** Consecutive network-failed cells before we stop rather than burn the frontier. */
const NET_ABORT_STREAK = 3;

type CellStatus = 'PENDING' | 'COMPLETE' | 'SATURATED' | 'EMPTY' | 'CAPPED' | 'FAILED' | 'SKIPPED_FOREIGN';

interface Cell {
  id: string;
  swLat: number; swLng: number; neLat: number; neLng: number;
  depth: number;
  status: CellStatus;
  pagesFetched?: number;
  declaredPages?: number;
  /** Results whose own coordinates fall inside this cell. Drives the split. */
  uniqueInside?: number;
  /** Results Airbnb injected from outside the viewport. Kept, but not counted. */
  uniqueOutside?: number;
  skippedForeign?: number;
  visitedAt?: string;
  error?: string | null;
}

interface Frontier {
  bbox: typeof SUDAN_BBOX;
  pageCap: number;
  seedDepth: number;
  startedAt: string;
  updatedAt: string;
  cells: Record<string, Cell>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Write via a temp file + rename so an interrupted run cannot truncate state. */
function writeAtomic(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, path);
}

// ── geometry ─────────────────────────────────────────────────────────────────

const spanOf = (c: Cell) => Math.max(c.neLat - c.swLat, c.neLng - c.swLng);

/** Airbnb renormalizes a viewport whose zoom disagrees with its span. */
function zoomFor(cell: Cell): number {
  const lngSpan = Math.max(cell.neLng - cell.swLng, 1e-6);
  return Math.min(16, Math.max(5, Math.round(Math.log2(360 / lngSpan))));
}

function cellUrl(cell: Cell): string {
  return (
    `https://www.airbnb.com/s/Sudan/homes?ne_lat=${cell.neLat.toFixed(5)}&ne_lng=${cell.neLng.toFixed(5)}` +
    `&sw_lat=${cell.swLat.toFixed(5)}&sw_lng=${cell.swLng.toFixed(5)}&zoom=${zoomFor(cell)}&search_by_map=true`
  );
}

/**
 * Does this rectangle touch Sudan at all? Sampled on a 5×5 lattice plus a
 * border-distance check, which catches a cell that clips a thin salient without
 * any sample point landing inside it. Cheap, and the cost of a false positive
 * is one wasted fetch against a false negative's silently missing region.
 */
function touchesSudan(cell: Cell): boolean {
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const lat = cell.swLat + ((cell.neLat - cell.swLat) * i) / steps;
      const lng = cell.swLng + ((cell.neLng - cell.swLng) * j) / steps;
      if (isInSudan(lat, lng)) return true;
      if (kmToBorder(lat, lng) <= BORDER_BUFFER_KM) return true;
    }
  }
  return false;
}

function quadrants(cell: Cell): Cell[] {
  const midLat = (cell.swLat + cell.neLat) / 2;
  const midLng = (cell.swLng + cell.neLng) / 2;
  const make = (q: number, swLat: number, swLng: number, neLat: number, neLng: number): Cell => ({
    id: `${cell.id}/${q}`,
    swLat, swLng, neLat, neLng,
    depth: cell.depth + 1,
    status: 'PENDING',
  });
  // 0 = SW, 1 = SE, 2 = NW, 3 = NE
  return [
    make(0, cell.swLat, cell.swLng, midLat, midLng),
    make(1, cell.swLat, midLng, midLat, cell.neLng),
    make(2, midLat, cell.swLng, cell.neLat, midLng),
    make(3, midLat, midLng, cell.neLat, cell.neLng),
  ];
}

/** Uniform grid at `depth`, so we skip proving that the top levels saturate. */
function seedGrid(depth: number): Cell[] {
  let cells: Cell[] = [
    { id: 'q', ...SUDAN_BBOX, depth: 0, status: 'PENDING' },
  ];
  for (let d = 0; d < depth; d++) cells = cells.flatMap(quadrants);
  return cells;
}

// ── crawl ────────────────────────────────────────────────────────────────────

interface Store {
  homes: Map<string, HomeRecord>;
  hosts: Map<string, HostRecord>;
}

function loadStore(): Store {
  const homes = new Map<string, HomeRecord>();
  const hosts = new Map<string, HostRecord>();
  if (existsSync(OUT)) {
    try {
      const prior = JSON.parse(readFileSync(OUT, 'utf8')) as { homes?: HomeRecord[]; hosts?: HostRecord[] };
      for (const h of prior.homes ?? []) homes.set(h.airbnbListingId, h);
      for (const h of prior.hosts ?? []) hosts.set(h.airbnbHostId, h);
    } catch (e) {
      console.warn(`  ! couldn't read ${OUT} (${(e as Error).message}) — starting fresh`);
    }
  }
  return { homes, hosts };
}

function saveStore(store: Store): void {
  writeAtomic(OUT, {
    scrapedAt: new Date().toISOString(),
    query: 'bbox-quadtree:Sudan',
    counts: { homes: store.homes.size, hosts: store.hosts.size },
    homes: [...store.homes.values()],
    hosts: [...store.hosts.values()],
  });
}

function loadFrontier(): Frontier {
  if (RESUME && existsSync(FRONTIER)) {
    try {
      const f = JSON.parse(readFileSync(FRONTIER, 'utf8')) as Frontier;
      if (f.cells) return f;
    } catch (e) {
      console.warn(`  ! couldn't read ${FRONTIER} (${(e as Error).message}) — starting a new frontier`);
    }
  }
  const cells: Record<string, Cell> = {};
  for (const c of seedGrid(SEED_DEPTH)) cells[c.id] = c;
  return {
    bbox: SUDAN_BBOX,
    pageCap: PAGE_CAP,
    seedDepth: SEED_DEPTH,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cells,
  };
}

/**
 * Transient enough to be worth waiting out rather than burning the cell.
 * The LAN resolver here intermittently fails to resolve, and a run that treats
 * that as a permanent cell failure marks the whole remaining frontier FAILED in
 * a couple of minutes — which is exactly what happened on the first full crawl.
 */
const TRANSIENT = /ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_CONNECTION_(?:RESET|CLOSED|TIMED_OUT)|ERR_TIMED_OUT|Timeout \d+ms exceeded/i;

/** Fetch one cell, merge its listings, and decide whether it must be split. */
async function crawlCell(page: Page, cell: Cell, store: Store): Promise<void> {
  let result = await paginateSearch(page, cellUrl(cell), { delayMs: DELAY });

  for (let attempt = 1; attempt <= NET_RETRIES && result.outcome === 'FAILED' && TRANSIENT.test(result.error ?? ''); attempt++) {
    const backoff = NET_BACKOFF_MS * attempt;
    console.log(`      … network error, waiting ${backoff / 1000}s before retry ${attempt}/${NET_RETRIES}`);
    await sleep(backoff);
    result = await paginateSearch(page, cellUrl(cell), { delayMs: DELAY });
  }

  let inside = 0;
  let outside = 0;
  let foreign = 0;

  for (const el of result.elements) {
    const home = parseSearchResult(el, 'OTHER');
    if (!home) continue;

    const within =
      home.latitude != null && home.longitude != null &&
      home.latitude >= cell.swLat && home.latitude <= cell.neLat &&
      home.longitude >= cell.swLng && home.longitude <= cell.neLng;

    // Airbnb pads a sparse viewport with nearby listings from outside it.
    // Those are free data, but counting them would make a sparse cell look
    // dense and split forever — and a dense one look complete.
    if (within) inside++;
    else outside++;

    if (store.homes.has(home.airbnbListingId)) continue;

    const e = el as { title?: string };
    const place = checkPlace(home.latitude, home.longitude, e?.title ?? home.airbnbCategory);
    if (place.agreement === 'SUSPECT_FOREIGN') {
      foreign++;
      continue;
    }
    home.city = place.city;
    store.homes.set(home.airbnbListingId, home);
  }

  cell.pagesFetched = result.pagesFetched;
  cell.declaredPages = result.declaredPages;
  cell.uniqueInside = inside;
  cell.uniqueOutside = outside;
  cell.skippedForeign = foreign;
  cell.visitedAt = new Date().toISOString();
  cell.error = result.error;

  if (result.outcome === 'FAILED') cell.status = 'FAILED';
  else if (result.outcome === 'EMPTY') cell.status = 'EMPTY';
  else if (result.outcome === 'SATURATED') {
    cell.status = spanOf(cell) <= MIN_SPAN_DEG ? 'CAPPED' : 'SATURATED';
  } else cell.status = 'COMPLETE';
}

// ── reporting ────────────────────────────────────────────────────────────────

/** Rough km² of a lat/lng rectangle — good enough for a coverage fraction. */
function areaKm2(c: Cell): number {
  const midLat = ((c.swLat + c.neLat) / 2) * (Math.PI / 180);
  return (c.neLat - c.swLat) * 111 * ((c.neLng - c.swLng) * 111 * Math.cos(midLat));
}

function report(frontier: Frontier, store: Store, priorHomes: number): void {
  const cells = Object.values(frontier.cells);
  const by = (s: CellStatus) => cells.filter((c) => c.status === s);
  const leaves = cells.filter((c) => c.status !== 'SATURATED' && c.status !== 'PENDING');

  // Unvisited area counts against coverage exactly like a hole does. A run
  // stopped by --max-cells has not proven anything about what it did not open,
  // and a coverage figure that ignores that is worse than no figure at all.
  const proven = by('COMPLETE').concat(by('EMPTY'), by('SKIPPED_FOREIGN'));
  const holes = by('CAPPED').concat(by('FAILED'));
  const unvisited = by('PENDING');
  const km2 = (list: Cell[]) => list.reduce((a, c) => a + areaKm2(c), 0);
  const denom = km2(proven) + km2(holes) + km2(unvisited);
  const coverage = denom > 0 ? km2(proven) / denom : 0;

  const totalInside = leaves.reduce((a, c) => a + (c.uniqueInside ?? 0), 0);
  const totalOutside = leaves.reduce((a, c) => a + (c.uniqueOutside ?? 0), 0);
  const foreign = leaves.reduce((a, c) => a + (c.skippedForeign ?? 0), 0);

  console.log('\n── coverage ─────────────────────────────────────────────');
  console.log(`  cells             ${cells.length} total, ${by('SATURATED').length} split into quadrants`);
  console.log(`    complete        ${by('COMPLETE').length}`);
  console.log(`    empty           ${by('EMPTY').length}`);
  console.log(`    outside Sudan   ${by('SKIPPED_FOREIGN').length}  (never fetched)`);
  console.log(`    capped          ${by('CAPPED').length}${by('CAPPED').length ? '  ← still truncated at the minimum cell size' : ''}`);
  console.log(`    failed          ${by('FAILED').length}${by('FAILED').length ? '  ← rerun with --retry-failed' : ''}`);
  console.log(`    not yet visited ${unvisited.length}${unvisited.length ? '  ← rerun to continue' : ''}`);
  console.log(`  provable coverage ${(coverage * 100).toFixed(2)}% of the Sudan bbox area`);
  console.log(`  results           ${totalInside} inside viewports, ${totalOutside} injected from outside`);
  console.log(`  skipped foreign   ${foreign}`);
  console.log(`  homes             ${priorHomes} → ${store.homes.size}  (+${store.homes.size - priorHomes})`);

  if (holes.length) {
    console.log('\n  holes (report these rather than implying full coverage):');
    for (const c of holes.slice(0, 20)) {
      console.log(`    ${c.id.padEnd(22)} ${c.status.padEnd(7)} [${c.swLat.toFixed(3)},${c.swLng.toFixed(3)} → ${c.neLat.toFixed(3)},${c.neLng.toFixed(3)}]${c.error ? '  ' + c.error : ''}`);
    }
    if (holes.length > 20) console.log(`    … and ${holes.length - 20} more (see ${FRONTIER})`);
  }

  if (unvisited.length) {
    console.log(`\n  INCOMPLETE — ${unvisited.length} cell(s) never opened. Rerun \`pnpm crm:bbox\` to continue;`);
    console.log('  the frontier file resumes exactly where this run stopped.');
  } else if (!holes.length) {
    console.log(`\n  Every leaf paginated to exhaustion and no cell was left unvisited, so`);
    console.log(`  the union is Airbnb's complete Sudan result set as of ${new Date().toISOString().slice(0, 10)}.`);
  } else {
    console.log(`\n  Complete except for the ${holes.length} hole(s) listed above.`);
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const frontier = loadFrontier();
  const store = loadStore();
  const priorHomes = store.homes.size;

  // Prune anything that cannot contain a Sudanese listing before spending a
  // single request on it.
  let pruned = 0;
  for (const cell of Object.values(frontier.cells)) {
    if (cell.status === 'PENDING' && !touchesSudan(cell)) {
      cell.status = 'SKIPPED_FOREIGN';
      pruned++;
    }
  }

  const pending = () =>
    Object.values(frontier.cells).filter(
      (c) => c.status === 'PENDING' || (RETRY_FAILED && c.status === 'FAILED'),
    );

  console.log(`\n🗺  Airbnb Sudan quadtree — seed depth ${frontier.seedDepth}, page ceiling ${PAGE_CAP}`);
  console.log(`   ${Object.keys(frontier.cells).length} cells, ${pending().length} to visit, ${pruned} pruned as outside Sudan`);
  console.log(`   ${priorHomes} homes already known\n`);

  if (DRY) {
    const toVisit = pending();
    for (const c of toVisit.slice(0, 12)) {
      console.log(`   ${c.id.padEnd(14)} d${c.depth} [${c.swLat.toFixed(2)},${c.swLng.toFixed(2)} → ${c.neLat.toFixed(2)},${c.neLng.toFixed(2)}] zoom ${zoomFor(c)}`);
    }
    if (toVisit.length > 12) console.log(`   … and ${toVisit.length - 12} more`);
    writeAtomic(FRONTIER, { ...frontier, updatedAt: new Date().toISOString() });
    console.log(`\nDRY RUN — no browser opened. Frontier → ${FRONTIER}\n`);
    return;
  }

  const browser = await chromium.connectOverCDP(CDP).catch((e) => {
    throw new Error(`can't reach vault Chrome at ${CDP} — is chrome-debug.sh running? (${(e as Error).message})`);
  });
  const ctx = browser.contexts()[0] ?? (await browser.newContext());
  const page = await ctx.newPage();

  let visited = 0;
  let netStreak = 0;
  // Breadth-first: a whole level completes before the next one starts, so an
  // interrupted run leaves uniform coverage rather than one deep spike.
  for (;;) {
    const queue = pending().sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
    if (!queue.length) break;
    if (MAX_CELLS && visited >= MAX_CELLS) {
      console.log(`\n  reached --max-cells=${MAX_CELLS}; ${queue.length} cell(s) still pending (resume to continue)`);
      break;
    }

    const cell = queue[0];
    await crawlCell(page, cell, store);
    visited++;

    // A sustained outage must stop the run, not race through the frontier
    // marking everything FAILED — those cells then look investigated when they
    // were never opened.
    if (cell.status === 'FAILED' && TRANSIENT.test(cell.error ?? '')) {
      netStreak++;
      if (netStreak >= NET_ABORT_STREAK) {
        frontier.updatedAt = new Date().toISOString();
        writeAtomic(FRONTIER, frontier);
        saveStore(store);
        console.error(
          `\n❌ ${netStreak} consecutive network failures — the connection is down. Stopping so the` +
            '\n   remaining cells stay PENDING rather than being marked failed. Rerun when it is back:' +
            '\n     pnpm crm:bbox --retry-failed\n',
        );
        break;
      }
    } else {
      netStreak = 0;
    }

    const mark =
      cell.status === 'COMPLETE' ? '✓' : cell.status === 'SATURATED' ? '↳' : cell.status === 'EMPTY' ? '·' : '!';
    console.log(
      `  ${mark} ${cell.id.padEnd(20)} d${cell.depth} ${String(cell.status).padEnd(9)} ` +
        `pages ${cell.pagesFetched}/${cell.declaredPages}  in ${cell.uniqueInside} out ${cell.uniqueOutside}` +
        `${cell.skippedForeign ? ` foreign ${cell.skippedForeign}` : ''}  Σ${store.homes.size}`,
    );

    if (cell.status === 'SATURATED') {
      for (const child of quadrants(cell)) {
        if (!touchesSudan(child)) {
          child.status = 'SKIPPED_FOREIGN';
        }
        frontier.cells[child.id] = frontier.cells[child.id] ?? child;
      }
    }

    // Checkpoint after every cell — a crash must never cost more than one.
    frontier.updatedAt = new Date().toISOString();
    writeAtomic(FRONTIER, frontier);
    saveStore(store);
  }

  await page.close().catch(() => {});
  report(frontier, store, priorHomes);
  console.log(`\n✅ ${store.homes.size} homes → ${OUT}`);
  console.log(`   frontier → ${FRONTIER}`);
  console.log('   Next: pnpm crm:pdp --locale=en --only-missing\n');
  process.exit(0);
}

main().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
