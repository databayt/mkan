
import { config } from 'dotenv';
config({ override: true });
import { execSync } from 'child_process';

const API_URL = (process.env.TWENTY_API_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
const API_KEY = execSync('security find-generic-password -s databayt-twenty -a mkan -w', { encoding: 'utf8' }).trim();
const REST = `${API_URL}/rest`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rest(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<any> {
  await sleep(150);
  const res = await fetch(`${REST}/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`REST ${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}

const ZONE_MAP: Record<string, string> = {
  '1696436270388915687': 'AIRPORT_DISTRICT',
  '1730495124401785705': 'AIRPORT_DISTRICT',
  '1359527853314799247': 'CITY_CENTRE',
  '1228112964456623221': 'SALALAB',
  '1475219497357463082': 'AL_MIRGHANIYA',
  '1205831581863107211': 'AROUS',
  '1379646799119443021': 'CITY_CENTRE',
  '1392738255867997981': 'KURYA',
};

async function main() {
  console.log('=== SEEDING 8 SCRAPED AIRBNB PORT SUDAN LISTINGS INTO PORTSUDAN TABLE ===\n');

  // 1. Fetch all homes from CRM to get the 8 Port Sudan scraped listings
  const homesRes = await rest('GET', 'homes?limit=200&depth=0');
  const allHomes = homesRes.data?.homes ?? homesRes.data ?? [];
  const psScraped = allHomes.filter((h: any) => h.city === 'PORT_SUDAN' && h.airbnbListingId);

  console.log(`Found ${psScraped.length} scraped Airbnb listings in All Homes.\n`);

  // 2. Fetch existing portSudans records
  const psRes = await rest('GET', 'portSudans?limit=100&depth=0');
  const existingPs = psRes.data?.portSudans ?? psRes.data ?? [];
  const existingByListingId = new Map(existingPs.map((p: any) => [p.listingId, p]));

  let pos = 100; // Place down at bottom of table
  let added = 0;
  let updated = 0;

  for (const h of psScraped) {
    const listingId = h.airbnbListingId;
    const existing = existingByListingId.get(listingId);

    const lat = h.homeAddress?.addressLat ?? 19.6145;
    const lng = h.homeAddress?.addressLng ?? 37.2170;

    const payload = {
      listingId,
      account: 'AIRBNB',
      hostName: h.hostName || 'Airbnb Host',
      name: h.title,
      titleEn: h.title,
      titleAr: h.title,
      descriptionEn: h.description || h.title,
      descriptionAr: h.description || h.title,
      bedrooms: h.bedrooms ?? 1,
      beds: h.beds ?? 1,
      bathrooms: h.bathrooms ?? 1,
      guestCapacity: h.guestCapacity ?? 2,
      priceNightSdg: h.priceNightSdg?.amountMicros ? h.priceNightSdg : { amountMicros: 75000000000, currencyCode: 'SDG' },
      propertyType: 'APARTMENT',
      airbnbCategoryAr: h.airbnbCategoryAr || 'إقامة في بورتسودان',
      amenities: (h.mkanAmenities ?? []).filter((a: string) => [
        'AIR_CONDITIONING', 'WI_FI', 'KITCHEN', 'REFRIGERATOR', 'TV', 'PATIO_OR_BALCONY', 'FREE_PARKING', 'WASHER', 'ELEVATOR', 'GENERATOR', 'WATER_TANK'
      ].includes(a)),
      highlights: ['CLOSE_TO_TRANSIT', 'GREAT_VIEW'],
      overallTrustScore: h.overallTrustScore || h.homeTrustScore || 50,
      photoStage: ['NOT_FOUND', 'FOUND_POOR', 'ACCEPTABLE', 'HIGH_RES', 'SUPERIOR'].includes(h.photoStage) ? h.photoStage : 'ACCEPTABLE',
      listingUrl: {
        primaryLinkUrl: `https://www.airbnb.com/rooms/${listingId}`,
        primaryLinkLabel: 'Airbnb Room'
      },
      googleMapsUrl: {
        primaryLinkUrl: `https://www.google.com/maps?q=${lat},${lng}`,
        primaryLinkLabel: 'Google Maps'
      },
      country: 'SUDAN',
      city: 'PORT_SUDAN',
      zone: ZONE_MAP[listingId] ?? 'CITY_CENTRE',
      publishState: h.homeStatus === 'LIVE' ? 'LIVE' : 'DRAFT',
      position: pos++,
    };

    if (existing) {
      await rest('PATCH', `portSudans/${existing.id}`, payload);
      console.log(`  [UPDATED] ${listingId} - ${h.title.slice(0, 40)}`);
      updated++;
    } else {
      await rest('POST', 'portSudans', payload);
      console.log(`  [ADDED] ${listingId} - ${h.title.slice(0, 40)}`);
      added++;
    }
  }

  console.log(`\n✅ Complete! ${added} added, ${updated} updated in Portsudan table.`);
}

main().catch(console.error);
