
import { config } from 'dotenv';
config({ override: true });
import { execSync } from 'child_process';
import { PrismaClient, Amenity, Highlight, PropertyType, ListingSource } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const API_URL = (process.env.TWENTY_API_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
const API_KEY = execSync('security find-generic-password -s databayt-twenty -a mkan -w', { encoding: 'utf8' }).trim();
const REST = `${API_URL}/rest`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rest(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<any> {
  await sleep(100);
  const res = await fetch(`${REST}/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`REST ${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}

const AMENITY_MAP: Record<string, Amenity> = {
  AIR_CONDITIONING: 'AirConditioning',
  WI_FI: 'WiFi',
  KITCHEN: 'Kitchen',
  REFRIGERATOR: 'Refrigerator',
  TV: 'TV',
  PATIO_OR_BALCONY: 'PatioOrBalcony',
  FREE_PARKING: 'Parking',
  WASHER: 'WasherDryer',
  ELEVATOR: 'Elevator',
};

const HIGHLIGHT_MAP: Record<string, Highlight> = {
  GREAT_VIEW: 'GreatView',
  CENTRAL_LOCATION: 'CloseToTransit',
  HIGH_SPEED_INTERNET_ACCESS: 'HighSpeedInternetAccess',
  FAMILY_FRIENDLY: 'QuietNeighborhood',
  BALCONY_ACCESS: 'GreatView',
};

const PROPERTY_TYPE_MAP: Record<string, PropertyType> = {
  APARTMENT: 'Apartment',
  HOUSE: 'Townhouse',
  STUDIO: 'Apartment',
  VILLA: 'Villa',
};

function parseGeo(mapsUrl?: string): { lat?: number; lng?: number } {
  if (!mapsUrl) return {};
  const match = mapsUrl.match(/q=([0-9.]+),([0-9.]+)/);
  if (match) {
    return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
  }
  return {};
}

async function main() {
  console.log('=== SYNCING TWENTY CRM LISTINGS (0001–0004) → MKAN.SD DATABASE ===\n');

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  // 1. Fetch CRM Port Sudan listings
  const crmRes = await rest('GET', 'portSudans?limit=100&depth=0');
  const crmListings = (crmRes.data?.portSudans ?? crmRes.data ?? [])
    .filter((r: any) => ['0001', '0002', '0003', '0004'].includes(r.account))
    .sort((a: any, b: any) => a.listingId.localeCompare(b.listingId));

  console.log(`Found ${crmListings.length} manual listings in Twenty CRM for Port Sudan.\n`);

  let createdCount = 0;
  let updatedCount = 0;

  for (const c of crmListings) {
    const email = `${c.account}@mkan.org`;
    const phone = c.hostPhone?.primaryPhoneNumber ? `+249${c.hostPhone.primaryPhoneNumber}` : undefined;
    const { lat, lng } = parseGeo(c.googleMapsUrl?.primaryLinkUrl);

    // 1. Upsert Host User
    const hostUser = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        username: c.account,
        phoneNumber: phone,
      },
      update: {
        phoneNumber: phone ?? undefined,
      }
    });

    // 2. Create Location
    const districtName = c.zone === 'RAILWAY_DISTRICT' ? 'السكة حديد' : (c.zone === 'HAYY_AL_AGHAREEQ' ? 'حي الإغريق' : 'بورتسودان');
    const location = await prisma.location.create({
      data: {
        city: 'Port Sudan',
        state: 'Red Sea',
        country: 'Sudan',
        postalCode: '33311',
        address: `${districtName}، بورتسودان`,
        latitude: lat ?? 19.6145,
        longitude: lng ?? 37.2170,
        zoneKey: 'portsudan',
      }
    });

    // 3. Map Amenities & Highlights
    const validAmenities: Amenity[] = (c.amenities ?? [])
      .map((a: string) => AMENITY_MAP[a])
      .filter(Boolean);

    const validHighlights: Highlight[] = (c.highlights ?? [])
      .map((h: string) => HIGHLIGHT_MAP[h])
      .filter(Boolean);

    const propType: PropertyType = PROPERTY_TYPE_MAP[c.propertyType] ?? 'Apartment';
    const pricePerNight = c.priceNightSdg?.amountMicros ? Math.round(c.priceNightSdg.amountMicros / 1_000_000) : 0;
    const isPublished = c.publishState === 'LIVE';

    // 4. Find existing listing by sourceListingId or title + host
    const existingListing = await prisma.listing.findFirst({
      where: {
        OR: [
          { sourceListingId: c.listingId },
          { hostId: hostUser.id, title: c.name },
          { hostId: hostUser.id, title: c.titleAr }
        ]
      }
    });

    const listingData = {
      sourceListingId: c.listingId,
      source: 'MANUAL' as ListingSource,
      canonicalLocale: 'ar',
      title: c.titleAr ?? c.name,
      description: c.descriptionAr ?? c.descriptionEn ?? c.name,
      pricePerNight,
      bedrooms: c.bedrooms ?? 1,
      bathrooms: c.bathrooms ?? 1,
      guestCount: c.guestCapacity ?? (c.bedrooms ? c.bedrooms * 2 : 2),
      propertyType: propType,
      amenities: validAmenities,
      highlights: validHighlights,
      isPublished,
      draft: !isPublished,
      claimedAt: new Date(),
      hostId: hostUser.id,
      locationId: location.id,
    };

    if (existingListing) {
      await prisma.listing.update({
        where: { id: existingListing.id },
        data: listingData
      });
      console.log(`  [UPDATE] #${existingListing.id} -> ListingID: ${c.listingId} | ${c.titleAr?.slice(0, 40)}...`);
      updatedCount++;
    } else {
      const created = await prisma.listing.create({
        data: listingData
      });
      console.log(`  [CREATE] #${created.id} -> ListingID: ${c.listingId} | ${c.titleAr?.slice(0, 40)}...`);
      createdCount++;
    }
  }

  console.log(`\n✅ Sync Complete! ${updatedCount} updated, ${createdCount} created in mkan.sd database.`);
}

main().catch(console.error);
