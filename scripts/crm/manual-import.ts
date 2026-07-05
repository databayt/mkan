/**
 * Import mkan's REAL (hand-curated) listings into Twenty + label every home.
 *
 * The scraped Airbnb inventory already lives in Twenty (via `crm:upsert`). This
 * brings in the *other* side — the real listings owned by the three known hosts
 * (accounts 0001-0003 = abdout / degna / hussein), which live in the mkan app DB,
 * NOT in the CRM — so Twenty holds ALL listings, manual + scraped, side by side.
 *
 * It also materializes the filter chips the workspace needs: a MULTI_SELECT
 * `labels` field on Home with
 *   MANUAL   — real, hand-curated (the 0001-0003 listings)
 *   SCRAPED  — pulled from Airbnb/other sources
 *   HIGH     — high overall trust (score ≥ 50; real hosts count as high)
 *   REVIEWED — human has eyeballed it (never auto-set — a manual toggle in Twenty)
 * and backfills it across every home (manual + scraped) so filtering works today.
 *
 *   pnpm crm:manual-import            # dry run — prints the plan, no writes
 *   pnpm crm:manual-import --apply    # create labels field, import, backfill
 *
 * Idempotent: hosts dedupe on mkanUserId, homes on mkanListingId; the labels
 * field is created once; the backfill only PATCHes homes whose labels changed.
 * Requires the Twenty backend up + `crm:seed-objects --apply` already run.
 */
import { config } from 'dotenv';
config({ override: true }); // MUST precede the dynamic @/lib/db import (ESM-hoist gotcha)

const APPLY = process.argv.includes('--apply');
const API_URL = (process.env.TWENTY_API_URL ?? '').replace(/\/+$/, '');
const API_KEY = process.env.TWENTY_API_KEY ?? '';
const REST = `${API_URL}/rest`;
const METADATA = `${API_URL}/metadata`;
const HIGH_TRUST_MIN = 50;

// The three real hosts. Account number (mkan username) → display name.
const REAL_HOSTS: Record<string, string> = { '0001': 'abdout', '0002': 'degna', '0003': 'hussein' };
const REAL_EMAILS = Object.keys(REAL_HOSTS).map((n) => `${n}@mkan.org`);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Twenty composite write shapes (match twenty-upsert.ts) ────────────────────
const linkOne = (url: string | null | undefined, label = '') =>
  url ? { primaryLinkUrl: url, primaryLinkLabel: label, secondaryLinks: [] } : undefined;
const linkMany = (urls: string[]) =>
  urls.length ? { primaryLinkUrl: urls[0], primaryLinkLabel: '', secondaryLinks: urls.slice(1).map((u) => ({ label: '', url: u })) } : undefined;
const currency = (amount: number | null | undefined, code: string) =>
  amount != null ? { amountMicros: Math.round(amount * 1_000_000), currencyCode: code } : undefined;
const emails = (primary: string | null | undefined) =>
  primary ? { primaryEmail: primary, additionalEmails: [] } : undefined;
const phones = (num: string | null | undefined) =>
  num ? { primaryPhoneNumber: num.replace(/^\+?249/, ''), primaryPhoneCountryCode: 'SD', primaryPhoneCallingCode: '+249', additionalPhones: [] } : undefined;
const clean = <T extends Record<string, unknown>>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0))) as Partial<T>;

const PROPERTY_TYPE: Record<string, string> = { Apartment: 'APARTMENT', Villa: 'VILLA', Townhouse: 'TOWNHOUSE', Cottage: 'COTTAGE', Tinyhouse: 'TINYHOUSE', Rooms: 'ROOMS' };

// ── REST client (throttled + 429 backoff, same policy as the rest of the pipeline)
const MIN_GAP_MS = 700;
let lastCallAt = 0;
async function throttle() {
  const wait = lastCallAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}
async function rest(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown, attempt = 0): Promise<any> {
  await throttle();
  const res = await fetch(`${REST}/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429 && attempt < 8) {
    const backoff = 15_000 * (attempt + 1);
    console.warn(`  … 429 rate limit — waiting ${backoff / 1000}s (attempt ${attempt + 1})`);
    await sleep(backoff);
    return rest(method, path, body, attempt + 1);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`REST ${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}
const records = (res: any, plural: string): any[] => {
  const d = res?.data ?? res;
  const v = d?.[plural] ?? d;
  if (Array.isArray(v)) return v;
  if (Array.isArray(v?.edges)) return v.edges.map((e: any) => e.node);
  return [];
};
const createdId = (res: any): string | null => {
  const d = res?.data ?? res;
  if (d?.id) return d.id;
  for (const k in d) if (d[k] && typeof d[k] === 'object' && d[k].id) return d[k].id;
  return null;
};
async function findId(plural: string, field: string, value: string): Promise<string | null> {
  const res = await rest('GET', `${plural}?filter=${field}[eq]:${encodeURIComponent(value)}&depth=0&limit=1`);
  return records(res, plural)[0]?.id ?? null;
}

// ── metadata: ensure the `labels` MULTI_SELECT field exists on Home ───────────
async function metaGraphQL(query: string, variables: Record<string, unknown>): Promise<any> {
  const res = await fetch(METADATA, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors) throw new Error(`metadata ${res.status}: ${JSON.stringify(json.errors ?? json).slice(0, 300)}`);
  return json.data;
}
const LABEL_OPTIONS = ['MANUAL', 'SCRAPED', 'HIGH', 'REVIEWED'];
const LABEL_COLORS: Record<string, string> = { MANUAL: 'green', SCRAPED: 'blue', HIGH: 'purple', REVIEWED: 'turquoise' };
async function ensureLabelsField(): Promise<void> {
  const data = await metaGraphQL(
    `query { objects(paging:{first:200}) { edges { node { id nameSingular fieldsList { name } } } } }`, {});
  const home = data.objects.edges.map((e: any) => e.node).find((n: any) => n.nameSingular === 'home');
  if (!home) throw new Error('home object not found — run crm:seed-objects --apply first');
  if (home.fieldsList.some((f: any) => f.name === 'labels')) { console.log('= Home.labels field exists'); return; }
  await metaGraphQL(
    `mutation($input: CreateOneFieldMetadataInput!){ createOneField(input:$input){ id name } }`,
    { input: { field: {
      type: 'MULTI_SELECT', name: 'labels', label: 'Labels', icon: 'IconTag', objectMetadataId: home.id,
      description: 'Filter chips: MANUAL vs SCRAPED origin · HIGH trust · REVIEWED by a human.',
      options: LABEL_OPTIONS.map((v, i) => ({ label: v[0] + v.slice(1).toLowerCase(), value: v, color: LABEL_COLORS[v], position: i })),
    } } });
  console.log('+ Home.labels MULTI_SELECT field created');
}

// desired labels for a home given origin + trust
const desiredLabels = (origin: 'MANUAL' | 'SCRAPED', overall: number | null, existing: string[]): string[] => {
  const out = new Set<string>([origin]);
  if (origin === 'MANUAL' || (overall != null && overall >= HIGH_TRUST_MIN)) out.add('HIGH');
  if (existing.includes('REVIEWED')) out.add('REVIEWED'); // never auto-remove a human toggle
  return [...out];
};
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const { db } = await import('@/lib/db');

  const users = await db.user.findMany({
    where: { email: { in: REAL_EMAILS } },
    select: { id: true, email: true, username: true, phoneNumber: true },
  });
  const listings = await db.listing.findMany({
    where: { hostId: { in: users.map((u) => u.id) } },
    select: {
      id: true, title: true, description: true, pricePerNight: true, photoUrls: true,
      bedrooms: true, bathrooms: true, guestCount: true, propertyType: true,
      isPublished: true, draft: true, hostId: true, averageRating: true, numberOfReviews: true,
      location: { select: { address: true, city: true, state: true, latitude: true, longitude: true } },
    },
    orderBy: { id: 'asc' },
  });
  const byHost = new Map<string, typeof listings>();
  for (const l of listings) { const a = byHost.get(l.hostId) ?? []; a.push(l); byHost.set(l.hostId, a); }

  console.log(`\n🏠 Manual import — ${users.length} real hosts, ${listings.length} listings from mkan DB  (${APPLY ? 'APPLY' : 'dry'})`);
  for (const u of users) {
    const num = u.email.split('@')[0];
    console.log(`  · ${num} (${REAL_HOSTS[num] ?? '?'}) → ${(byHost.get(u.id) ?? []).length} listings`);
  }

  const hostBody = (u: (typeof users)[number]) => {
    const num = u.email.split('@')[0];
    return clean({
      name: REAL_HOSTS[num] ?? u.username ?? num,
      source: 'OTHER',
      mkanUserId: u.id,
      mkanUsername: num,
      mkanAccountEmail: emails(u.email),
      phone: phones(u.phoneNumber),
      identityVerified: 'OWNERSHIP_CLAIMED',
      crossSourceCorroborated: 'CONFIRMED',
      hostTrustBand: 'TRUSTED',
      preferredLanguage: 'AR',
      notes: 'Real hand-curated host (mkan account ' + num + ') — imported from mkan DB, not scraped.',
    });
  };
  const homeBody = (l: (typeof listings)[number], hostId: string | null) => {
    const live = l.isPublished && !l.draft;
    return clean({
      name: l.title ?? `mkan #${l.id}`,
      title: l.title ?? undefined,
      description: l.description ?? undefined,
      source: 'OTHER',
      city: 'PORT_SUDAN',
      homeAddress: l.location ? {
        addressStreet1: l.location.address ?? '',
        addressCity: l.location.city || 'Port Sudan',
        addressState: l.location.state || 'Red Sea',
        addressCountry: 'Sudan',
        addressLat: l.location.latitude ?? undefined,
        addressLng: l.location.longitude ?? undefined,
      } : undefined,
      bedrooms: l.bedrooms ?? undefined,
      bathrooms: l.bathrooms ?? undefined,
      guestCapacity: l.guestCount ?? undefined,
      photoUrls: linkMany(l.photoUrls ?? []),
      photoCount: (l.photoUrls ?? []).length,
      coverPhotoUrl: linkOne((l.photoUrls ?? [])[0]),
      photosRehosted: false,
      priceNightSdg: currency(l.pricePerNight, 'SDG'),
      avgRating: l.averageRating ?? undefined,
      reviewCount: l.numberOfReviews ?? undefined,
      mkanPropertyType: l.propertyType ? PROPERTY_TYPE[l.propertyType] : undefined,
      mkanListingId: l.id,
      // Real, owner-known inventory: pre-approved (AUTO_ONBOARD) and already live on mkan.
      homeStatus: live ? 'LIVE' : 'IMPORTED_BUSY',
      mkanPublishState: live ? 'LIVE' : 'IMPORTED_BUSY',
      trustBand: 'AUTO_ONBOARD',
      publishReady: true,
      importedAt: new Date().toISOString(),
      labels: desiredLabels('MANUAL', null, []),
      hostId: hostId ?? undefined,
    });
  };

  if (!APPLY) {
    console.log('\nmode: DRY RUN (no writes)\n');
    const u0 = users.find((u) => u.email === '0001@mkan.org') ?? users[0];
    const l0 = (byHost.get(u0.id) ?? [])[0];
    console.log('sample host body:', JSON.stringify(hostBody(u0), null, 1));
    if (l0) console.log('\nsample home body:', JSON.stringify(homeBody(l0, 'HOST_ID'), null, 1));
    console.log(`\nWould: create labels field · import ${users.length} hosts + ${listings.length} homes · backfill labels on ALL homes.`);
    console.log('Apply:  pnpm crm:manual-import --apply\n');
    await db.$disconnect();
    return;
  }
  if (!API_URL || !API_KEY) throw new Error('APPLY needs TWENTY_API_URL + TWENTY_API_KEY (backend up).');
  console.log(`\nmode: APPLY → ${REST}\n`);

  // 1) labels field
  await ensureLabelsField();

  // 2) hosts (dedupe on mkanUserId)
  const hostRecId = new Map<string, string>(); // mkan userId → Twenty host id
  for (const u of users) {
    try {
      let id = await findId('hosts', 'mkanUserId', u.id);
      if (id) console.log(`= host ${u.email} exists`);
      else { id = createdId(await rest('POST', 'hosts', hostBody(u))); console.log(`+ host ${u.email} (${REAL_HOSTS[u.email.split('@')[0]]})`); }
      if (id) hostRecId.set(u.id, id);
    } catch (e) { console.warn(`! host ${u.email}: ${(e as Error).message}`); }
  }

  // 3) homes (dedupe on mkanListingId)
  let created = 0, skipped = 0;
  for (const l of listings) {
    try {
      if (await findId('homes', 'mkanListingId', String(l.id))) { console.log(`= home #${l.id} exists`); skipped++; continue; }
      await rest('POST', 'homes', homeBody(l, hostRecId.get(l.hostId) ?? null));
      console.log(`+ home #${l.id} (${(l.title ?? '').slice(0, 34)})`);
      created++;
    } catch (e) { console.warn(`! home #${l.id}: ${(e as Error).message}`); }
  }

  // 4) one Opportunity per real host (stage LIVE — already onboarded), if missing
  for (const u of users) {
    const id = hostRecId.get(u.id);
    if (!id) continue;
    try {
      if (await findId('opportunities', 'hostId', id)) continue;
      const n = (byHost.get(u.id) ?? []).length;
      await rest('POST', 'opportunities', clean({
        name: `Onboard ${REAL_HOSTS[u.email.split('@')[0]]} — ${n} home${n === 1 ? '' : 's'}`,
        onboardingStage: 'LIVE', hostTrustBand: 'TRUSTED', homesCount: n, liveHomes: n, hostId: id,
      }));
      console.log(`+ opportunity for ${u.email}`);
    } catch (e) { console.warn(`! opportunity ${u.email}: ${(e as Error).message}`); }
  }

  // 5) backfill labels across ALL homes (manual just-created + the 116 scraped)
  console.log('\n🏷  Backfilling labels on all homes…');
  const allHomes = records(await rest('GET', 'homes?limit=200&depth=0'), 'homes');
  let patched = 0, unchanged = 0;
  for (const h of allHomes) {
    const origin: 'MANUAL' | 'SCRAPED' = h.source === 'AIRBNB' ? 'SCRAPED' : 'MANUAL';
    const existing: string[] = Array.isArray(h.labels) ? h.labels : [];
    const want = desiredLabels(origin, h.overallTrustScore ?? null, existing);
    if (sameSet(existing, want)) { unchanged++; continue; }
    try { await rest('PATCH', `homes/${h.id}`, { labels: want }); patched++; }
    catch (e) { console.warn(`! label ${h.id}: ${(e as Error).message}`); }
  }
  console.log(`   labels: ${patched} updated, ${unchanged} already correct`);

  console.log(`\n✅ Done — ${created} homes imported (${skipped} already there), labels live on all ${allHomes.length} homes.`);
  console.log('   Filter in Twenty by the Labels chip: MANUAL / SCRAPED / HIGH / REVIEWED.\n');
  await db.$disconnect();
}

main().catch((e) => { console.error(`\n❌ ${(e as Error).message}\n`); process.exit(1); });
