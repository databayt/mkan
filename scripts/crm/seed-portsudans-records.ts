
import { config } from 'dotenv';
config({ override: true });
import { execSync } from 'child_process';

const API_URL = (process.env.TWENTY_API_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
const API_KEY = execSync('security find-generic-password -s databayt-twenty -a mkan -w', { encoding: 'utf8' }).trim();
const REST = `${API_URL}/rest`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rest(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<any> {
  await sleep(400);
  const res = await fetch(`${REST}/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`REST ${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}

const clean = <T extends Record<string, unknown>>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0))) as Partial<T>;

async function main() {
  console.log('--- Syncing 26 Manual Homes into Port Sudan Object ---');

  // 1. Fetch homes from /rest/homes
  const homesRes = await rest('GET', 'homes?limit=300&depth=0');
  const allHomes = homesRes.data?.homes ?? homesRes.data ?? [];
  const manualHomes = allHomes.filter((h: any) => ['0001', '0002', '0003', '0004'].includes(h.account));

  console.log(`Found ${manualHomes.length} manual homes in Homes object.`);

  // 2. Fetch existing portSudans
  const portSudansRes = await rest('GET', 'portSudans?limit=300&depth=0');
  const existingPortSudans = portSudansRes.data?.portSudans ?? portSudansRes.data ?? [];
  const portSudanByListingId = new Map<string, any>();
  for (const p of existingPortSudans) {
    if (p.listingId) portSudanByListingId.set(String(p.listingId), p);
  }

  let created = 0;
  let updated = 0;

  for (const h of manualHomes) {
    const payload = clean({
      name: h.titleAr ?? h.name,
      account: h.account,
      listingId: h.listingId,
      hostName: h.hostName,
      hostPhone: h.hostPhone,
      hostWhatsapp: h.hostWhatsapp,
      titleAr: h.titleAr,
      titleEn: h.titleEn,
      descriptionAr: h.descriptionAr,
      descriptionEn: h.descriptionEn,
      spaceAr: h.spaceAr,
      spaceEn: h.spaceEn,
      guestAccessAr: h.guestAccessAr,
      guestAccessEn: h.guestAccessEn,
      notesAr: h.notesAr,
      notesEn: h.notesEn,
      airbnbCategoryAr: h.airbnbCategoryAr,
      zone: h.zone,
      googleMapsUrl: h.googleMapsUrl,
      listingUrl: h.listingUrl,
      bedrooms: h.bedrooms,
      bathrooms: h.bathrooms,
      beds: h.beds,
      guestCapacity: h.guestCapacity,
      priceNightSdg: h.priceNightSdg,
      amenities: h.amenities,
      highlights: h.highlights,
      propertyType: h.propertyType,
      publishState: h.publishState,
      overallTrustScore: h.overallTrustScore,
    });

    const existing = portSudanByListingId.get(String(h.listingId));
    if (existing?.id) {
      console.log(`  = Updating Port Sudan Home [${h.listingId}] "${h.titleAr?.slice(0, 32)}"`);
      await rest('PATCH', `portSudans/${existing.id}`, payload);
      updated++;
    } else {
      console.log(`  + Creating Port Sudan Home [${h.listingId}] "${h.titleAr?.slice(0, 32)}"`);
      await rest('POST', 'portSudans', payload);
      created++;
    }
  }

  console.log(`✅ Port Sudan Object populated: ${created} created, ${updated} updated.`);
}

main().catch(console.error);
