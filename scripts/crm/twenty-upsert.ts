/**
 * Upsert scraped Airbnb records into Twenty (Epic G1.2, step 4).
 *
 * Reads the scraper's output (`.data/airbnb-scrape.json`), dedups by external id,
 * and creates `Host` + `Home` records + one `Opportunity` per NEW host, via
 * Twenty's REST data API. Run AFTER `seed-twenty-objects.ts --apply` (the objects
 * must exist) and with the backend up.
 *
 *   npx tsx scripts/crm/twenty-upsert.ts                    # dry run (prints bodies)
 *   TWENTY_API_URL=http://localhost:3000 TWENTY_API_KEY=… \
 *     npx tsx scripts/crm/twenty-upsert.ts --apply          # write to Twenty
 *
 * Flags: --in=<path>  --limit=<N>  --apply
 *
 * Idempotent: a Host/Home that already exists (by airbnbHostId / airbnbListingId)
 * is skipped. Composite fields use Twenty's exact shapes (verified against
 * twentyhq/twenty composite-types): LINKS {primaryLinkUrl, secondaryLinks},
 * ADDRESS {addressCity/State/Country/Lat/Lng}, CURRENCY {amountMicros, currencyCode}.
 * To-one relations are written as the FK `<field>Id` (e.g. hostId).
 */
import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import type { HomeRecord, HostRecord } from './airbnb-parse';
import { toUpperSnake } from './twenty-schema'; // SELECT values must match the seeded options (UPPER_SNAKE)

config({ override: true }); // load central .env (TWENTY_API_URL / TWENTY_API_KEY)

const APPLY = process.argv.includes('--apply');
const arg = (n: string, d?: string) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.split('=').slice(1).join('=') : d;
};
const IN = arg('in', 'scripts/crm/.data/airbnb-scrape.json')!;
const LIMIT = parseInt(arg('limit', '0')!, 10);
const API_URL = (process.env.TWENTY_API_URL ?? '').replace(/\/+$/, '');
const API_KEY = process.env.TWENTY_API_KEY ?? '';
const REST = `${API_URL}/rest`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── composite / value mappers (Twenty write shapes) ──────────────────────────
const linkOne = (url: string | null | undefined, label = '') =>
  url ? { primaryLinkUrl: url, primaryLinkLabel: label, secondaryLinks: [] } : undefined;
const linkMany = (urls: string[]) =>
  urls.length ? { primaryLinkUrl: urls[0], primaryLinkLabel: '', secondaryLinks: urls.slice(1).map((u) => ({ label: '', url: u })) } : undefined;
const currency = (amount: number | null, code: string) =>
  amount != null ? { amountMicros: Math.round(amount * 1_000_000), currencyCode: code } : undefined;

const STATE_OF: Record<string, string> = { KHARTOUM: 'Khartoum', OMDURMAN: 'Khartoum', BAHRI: 'Khartoum', EAST_NILE: 'Khartoum', PORT_SUDAN: 'Red Sea' };
const cityLabel = (c: string) => c.split('_').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ');
const address = (h: HomeRecord) => ({
  addressStreet1: '',
  addressCity: cityLabel(h.city),
  addressState: STATE_OF[h.city] ?? '',
  addressCountry: 'Sudan',
  addressLat: h.latitude ?? undefined,
  addressLng: h.longitude ?? undefined,
});

// raw amenity strings → mkan Amenity enum subset (docs/growth.md §4.4)
const AMENITY_RULES: [RegExp, string][] = [
  [/wi-?fi/i, 'WiFi'], [/fast wifi|\d+\s*mbps/i, 'HighSpeedInternet'], [/air ?condition/i, 'AirConditioning'],
  [/washer|dryer|washing machine/i, 'WasherDryer'], [/dishwasher/i, 'Dishwasher'], [/microwave/i, 'Microwave'],
  [/fridge|refrigerator/i, 'Refrigerator'], [/pool/i, 'Pool'], [/gym|exercise equipment/i, 'Gym'],
  [/parking/i, 'Parking'], [/pets? allowed/i, 'PetsAllowed'], [/walk-?in closet/i, 'WalkInClosets'], [/hardwood/i, 'HardwoodFloors'],
];
const mapAmenities = (raw: string[]) => {
  const set = new Set<string>();
  for (const a of raw) for (const [re, v] of AMENITY_RULES) if (re.test(a)) set.add(v);
  return [...set];
};

/** Drop undefined/null so Twenty doesn't reject empty composites. */
const clean = <T extends Record<string, unknown>>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0))) as Partial<T>;

function hostBody(h: HostRecord) {
  return clean({
    source: h.source,
    airbnbHostId: h.airbnbHostId,
    airbnbProfileUrl: linkOne(h.airbnbProfileUrl),
    avatarUrl: linkOne(h.avatarUrl),
    name: h.name ?? undefined,
    superhost: h.superhost,
    hostSince: h.hostSince ?? undefined,
    responseRate: h.responseRate ?? undefined,
    airbnbListingsCount: h.airbnbListingsCount ?? undefined,
    portfolioReviewsTotal: h.portfolioReviewsTotal ?? undefined,
    portfolioAvgRating: h.portfolioAvgRating ?? undefined,
    hostTrustBand: 'UNSCORED',
  });
}

function homeBody(h: HomeRecord, hostId: string | null) {
  const amen = mapAmenities(h.amenitiesRaw);
  return clean({
    source: h.source,
    airbnbListingId: h.airbnbListingId,
    airbnbUrl: linkOne(h.airbnbUrl, 'Airbnb'),
    title: h.title ?? undefined,
    name: h.title ?? h.airbnbListingId, // object label
    description: h.description ?? undefined,
    roomType: h.roomType ?? undefined,
    airbnbCategory: h.airbnbCategory ?? undefined,
    city: h.city,
    address: address(h),
    bedrooms: h.bedrooms ?? undefined,
    beds: h.beds ?? undefined,
    bathrooms: h.bathrooms ?? undefined,
    guestCapacity: h.guestCapacity ?? undefined,
    amenitiesRaw: h.amenitiesRaw.length ? h.amenitiesRaw : undefined,
    mkanAmenities: amen.length ? amen.map(toUpperSnake) : undefined,
    petsAllowed: h.amenitiesRaw.some((a) => /pets? allowed/i.test(a)) || undefined,
    parkingIncluded: h.amenitiesRaw.some((a) => /free parking/i.test(a)) || undefined,
    photoUrls: linkMany(h.photoUrls),
    photoCount: h.photoCount,
    coverPhotoUrl: linkOne(h.coverPhotoUrl),
    photosRehosted: false,
    priceNightSar: currency(h.priceNightSar, 'SAR'),
    avgRating: h.avgRating ?? undefined,
    reviewCount: h.reviewCount ?? undefined,
    mkanPropertyType: h.mkanPropertyType ? toUpperSnake(h.mkanPropertyType) : undefined,
    homeStatus: 'SCRAPED',
    mkanPublishState: 'NOT_IMPORTED',
    trustBand: 'UNSCORED',
    hostId: hostId ?? undefined,
  });
}

const oppBody = (host: HostRecord, hostId: string, homesCount: number) =>
  clean({ name: `Onboard ${host.name ?? host.airbnbHostId} — ${homesCount} home${homesCount === 1 ? '' : 's'}`, onboardingStage: 'SCRAPED', homesCount, hostId });

// ── REST client ──────────────────────────────────────────────────────────────
async function rest(method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${REST}/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`REST ${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}
function createdId(res: any): string | null {
  const d = res?.data ?? res;
  if (d?.id) return d.id;
  for (const k in d) if (d[k] && typeof d[k] === 'object' && d[k].id) return d[k].id; // { createHome: { id } }
  return null;
}
function records(res: any, plural: string): any[] {
  const d = res?.data ?? res;
  const v = d?.[plural] ?? d;
  if (Array.isArray(v)) return v;
  if (Array.isArray(v?.edges)) return v.edges.map((e: any) => e.node);
  return [];
}
async function findId(plural: string, field: string, value: string): Promise<string | null> {
  const res = await rest('GET', `${plural}?filter=${field}[eq]:${encodeURIComponent(value)}&depth=0&limit=1`);
  return records(res, plural)[0]?.id ?? null;
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const payload = JSON.parse(readFileSync(IN, 'utf8')) as { homes: HomeRecord[]; hosts: HostRecord[] };
  let homes = payload.homes ?? [];
  if (LIMIT) homes = homes.slice(0, LIMIT);
  const hostIds = new Set(homes.map((h) => h.hostAirbnbId).filter(Boolean));
  const hosts = (payload.hosts ?? []).filter((h) => hostIds.has(h.airbnbHostId));
  const homesPerHost = new Map<string, number>();
  for (const h of homes) if (h.hostAirbnbId) homesPerHost.set(h.hostAirbnbId, (homesPerHost.get(h.hostAirbnbId) ?? 0) + 1);

  console.log(`\n📥 Twenty upsert — ${hosts.length} hosts, ${homes.length} homes from ${IN}`);

  if (!APPLY) {
    console.log('mode: DRY RUN (no network)\n');
    console.log('sample host body:', JSON.stringify(hostBody(hosts[0]), null, 1));
    console.log('\nsample home body:', JSON.stringify(homeBody(homes[0], 'HOST_ID'), null, 1));
    console.log('\nsample opportunity:', JSON.stringify(oppBody(hosts[0], 'HOST_ID', homesPerHost.get(hosts[0].airbnbHostId) ?? 0)));
    console.log(`\nWould create up to ${hosts.length} hosts + ${homes.length} homes + ${hosts.length} opportunities.`);
    console.log('To apply:  TWENTY_API_URL=… TWENTY_API_KEY=… npx tsx scripts/crm/twenty-upsert.ts --apply\n');
    return;
  }
  if (!API_URL || !API_KEY) throw new Error('APPLY needs TWENTY_API_URL + TWENTY_API_KEY (backend up, objects created).');
  console.log(`mode: APPLY → ${REST}\n`);

  // 1) Hosts (dedup → id map; remember which were newly created).
  const hostRecId = new Map<string, string>(); // airbnbHostId → Twenty id
  const newHosts = new Set<string>();
  for (const host of hosts) {
    try {
      let id = await findId('hosts', 'airbnbHostId', host.airbnbHostId);
      if (id) {
        console.log(`= host ${host.airbnbHostId} (${host.name}) exists`);
      } else {
        id = createdId(await rest('POST', 'hosts', hostBody(host)));
        newHosts.add(host.airbnbHostId);
        console.log(`+ host ${host.airbnbHostId} (${host.name})`);
      }
      if (id) hostRecId.set(host.airbnbHostId, id);
    } catch (e) {
      console.warn(`! host ${host.airbnbHostId} failed: ${(e as Error).message}`);
    }
    await sleep(150);
  }

  // 2) Homes (dedup → link to host).
  for (const home of homes) {
    try {
      if (await findId('homes', 'airbnbListingId', home.airbnbListingId)) {
        console.log(`= home ${home.airbnbListingId} exists`);
      } else {
        await rest('POST', 'homes', homeBody(home, home.hostAirbnbId ? hostRecId.get(home.hostAirbnbId) ?? null : null));
        console.log(`+ home ${home.airbnbListingId} (${(home.title ?? '').slice(0, 32)})`);
      }
    } catch (e) {
      console.warn(`! home ${home.airbnbListingId} failed: ${(e as Error).message}`);
    }
    await sleep(150);
  }

  // 3) One Opportunity per NEW host.
  for (const host of hosts) {
    if (!newHosts.has(host.airbnbHostId)) continue;
    const id = hostRecId.get(host.airbnbHostId);
    if (!id) continue;
    try {
      await rest('POST', 'opportunities', oppBody(host, id, homesPerHost.get(host.airbnbHostId) ?? 0));
      console.log(`+ opportunity for host ${host.airbnbHostId}`);
    } catch (e) {
      console.warn(`! opportunity for ${host.airbnbHostId} failed: ${(e as Error).message}`);
    }
    await sleep(150);
  }

  console.log('\n✅ Upsert done. Verify in the Twenty workspace.\n');
}

main().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
