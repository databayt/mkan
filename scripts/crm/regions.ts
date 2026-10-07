/**
 * The Airbnb pipeline's notion of "where we are crawling".
 *
 * Every stage used to import Sudan directly — the crawl root, the foreign-
 * listing guard, the CRM country, the DB Location — so opening a second market
 * meant forking the scripts. A region is the handful of facts those stages
 * actually need. Sudan stays the default everywhere, so every existing command
 * behaves exactly as before; `--region=rwanda` opens the Kigali wave.
 */
import * as sudan from './sudan-places';
import * as rwanda from '@/lib/geo/rwanda-places';

export type RegionKey = 'sudan' | 'rwanda';

export interface RegionPlace {
  city: string;
  state: string;
  /** `SUSPECT_FOREIGN` and `OUTSIDE_CITY` rows are skipped by the crawl. */
  agreement: string;
  note: string | null;
}

export interface Region {
  key: RegionKey;
  /** Twenty `home.country` SELECT value. */
  country: 'SUDAN' | 'RWANDA';
  countryEn: string;
  countryAr: string;
  /** Path segment Airbnb's search URL carries; the viewport params do the real work. */
  searchSlug: string;
  bbox: { swLat: number; swLng: number; neLat: number; neLng: number };
  /** Could this rectangle hold a listing we want? Prunes cells before fetching. */
  touches(cell: { swLat: number; swLng: number; neLat: number; neLng: number }): boolean;
  checkPlace(lat: number | null | undefined, lng: number | null | undefined, title?: string | null, subtitle?: string | null): RegionPlace;
  cityNameEn(city: string): string;
  stateNameEn(city: string, state?: string | null): string;
  /** What mkan lists this market's homes in. */
  currency: 'SDG' | 'RWF';
  /** Default data files, so a Kigali run can never overwrite the Sudan wave. */
  files: { scrape: string; frontier: string; scored: string; rehosted: string; ledger: string };
}

function lattice(cell: Region['bbox'], test: (lat: number, lng: number) => boolean): boolean {
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const lat = cell.swLat + ((cell.neLat - cell.swLat) * i) / steps;
      const lng = cell.swLng + ((cell.neLng - cell.swLng) * j) / steps;
      if (test(lat, lng)) return true;
    }
  }
  return false;
}

const SUDAN: Region = {
  key: 'sudan',
  country: 'SUDAN',
  countryEn: 'Sudan',
  countryAr: 'السودان',
  searchSlug: 'Sudan',
  bbox: sudan.SUDAN_BBOX,
  touches: (cell) =>
    lattice(cell, (lat, lng) => sudan.isInSudan(lat, lng) || sudan.kmToBorder(lat, lng) <= sudan.BORDER_BUFFER_KM),
  checkPlace: (lat, lng, title, subtitle) => sudan.checkPlace(lat, lng, title, subtitle),
  cityNameEn: (c) => sudan.cityNameEn(c as sudan.CityCode),
  stateNameEn: (c) => {
    const s = sudan.stateOfCity(c as sudan.CityCode);
    return s === 'UNKNOWN' ? '' : sudan.stateNameEn(s);
  },
  currency: 'SDG',
  files: {
    scrape: 'scripts/crm/.data/airbnb-scrape.json',
    frontier: 'scripts/crm/.data/airbnb-bbox-frontier.json',
    scored: 'scripts/crm/.data/airbnb-scored.json',
    rehosted: 'scripts/crm/.data/airbnb-rehosted.json',
    ledger: 'scripts/crm/.data/mkan-import-ledger.json',
  },
};

const RWANDA: Region = {
  key: 'rwanda',
  country: 'RWANDA',
  countryEn: 'Rwanda',
  countryAr: 'رواندا',
  searchSlug: 'Kigali--Rwanda',
  bbox: rwanda.KIGALI_BBOX,
  // A cell is worth opening if any of it lies within the city radius; the
  // corners of the bbox are rural Bugesera/Rwamagana and get pruned.
  touches: (cell) =>
    lattice(cell, (lat, lng) => rwanda.haversineKm(lat, lng, rwanda.KIGALI.lat, rwanda.KIGALI.lng) <= rwanda.KIGALI.radiusKm + 3),
  checkPlace: (lat, lng, title, subtitle) => rwanda.checkPlace(lat, lng, title, subtitle),
  cityNameEn: (c) => (c === 'KIGALI' ? rwanda.KIGALI.nameEn : 'Rwanda'),
  stateNameEn: (_c, state) => (state ? rwanda.districtName(state, 'en') : ''),
  currency: 'RWF',
  files: {
    scrape: 'scripts/crm/.data/airbnb-kigali.json',
    frontier: 'scripts/crm/.data/airbnb-kigali-frontier.json',
    scored: 'scripts/crm/.data/airbnb-kigali-scored.json',
    rehosted: 'scripts/crm/.data/airbnb-kigali-rehosted.json',
    ledger: 'scripts/crm/.data/mkan-import-kigali-ledger.json',
  },
};

export const REGIONS: Record<RegionKey, Region> = { sudan: SUDAN, rwanda: RWANDA };

/** `--region=` from argv (default Sudan). Unknown values fail loudly rather than crawl Sudan by accident. */
export function regionFromArgv(argv: string[] = process.argv): Region {
  const hit = argv.find((a) => a.startsWith('--region='));
  const key = (hit ? hit.split('=')[1] : 'sudan').toLowerCase();
  const r = REGIONS[key as RegionKey];
  if (!r) throw new Error(`unknown --region=${key} (known: ${Object.keys(REGIONS).join(', ')})`);
  return r;
}

/** Skip rows the region does not want: foreign placeholders and out-of-city padding. */
export const isWanted = (p: RegionPlace) => p.agreement !== 'SUSPECT_FOREIGN' && p.agreement !== 'OUTSIDE_CITY';
