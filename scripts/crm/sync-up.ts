/**
 * mkan.sd → Twenty. What the site actually shows, reported back to the board.
 *
 *   pnpm crm:sync-up            # dry run
 *   pnpm crm:sync-up --apply
 *
 * ── Why ────────────────────────────────────────────────────────────────────
 *
 * `sync-import-to-twenty.ts` stamps the CRM once, at import time, with
 * `IMPORTED_BUSY`. Nothing updated it afterwards. So a home that went live
 * through `crm:publish`, or came down because its host claimed and unpublished
 * it, still read `IMPORTED_BUSY` on the board weeks later — and an operator
 * deciding who to chase was reading a snapshot of the day it was imported.
 *
 * This is the return leg of `sync-down.ts`. Between them the two directions
 * have distinct jobs and never fight over the same field:
 *
 *   sync-down  operator decisions  → the site   (price, title, publish, trust)
 *   sync-up    observed site state → the board  (what is live, since when)
 *
 * Everything here is derived from the mkan DB, so there is no conflict to
 * resolve: the site is the authority on its own state by definition.
 *
 * ── Two phases, and the first one is newer ─────────────────────────────────
 *
 *   1. CREATE  a home the board has never seen, and its host
 *   2. PATCH   the homes it already has
 *
 * Phase 2 was all there was, and it walks the CRM's homes — so a listing born
 * on mkan.sd was never even looked at. Every one of the 147 homes on the board
 * got there through a batch import or the Slack intake lane; a host who signs
 * up on the site, adds a home and uploads photos produced nothing anywhere.
 * The board was only accidentally complete, because nobody had done that yet.
 *
 * Phase 1 closes it. It creates nothing on the site and decides nothing — it
 * reports that a home exists, so an operator can see it and the mastering
 * pipeline can be pointed at its photos.
 *
 * A host is someone who owns at least one home. A plain signup with no listing
 * is not a host and is not synced: 128 accounts exist and 76 of them own a
 * home, and putting the other 52 on the board would make it noise. The `NNNN`
 * account number stays unassigned — which host account a new signup gets is an
 * operator decision that has never been made, and inventing one here would
 * quietly make it (see `hostAccountNumber` in src/lib/listing-code.ts).
 */
import { config } from 'dotenv';
config({ override: true });

import { toUpperSnake } from './twenty-schema';
import { twentyClient } from './twenty-rest';

let prisma: (typeof import('@/lib/db'))['db'];

const APPLY = process.argv.includes('--apply');
/**
 * `--only=create` runs just the new-home phase, `--only=patch` just the
 * refresh. Both phases together are the right default and what the schedule
 * runs; the split exists so a first run on a long-unsynced board can add the
 * homes nobody has seen without also firing a hundred field updates in the
 * same breath.
 */
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '').split('=')[1] ?? '';
const DO_CREATE = ONLY !== 'patch';
const DO_PATCH = ONLY !== 'create';
const argv = (n: string, d = ''): string => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
// Deliberately NOT defaulted from NEXT_PUBLIC_APP_URL: in a dev checkout that
// is http://localhost:3000, and a localhost link written into the shared CRM is
// worse than no link at all — it is a link that works for exactly one person.
// Override with --site= when pointing at a preview deployment.
const SITE = argv('site', 'https://mkan.sd').replace(/\/+$/, '');
// The public route is /[lang]/listings/[id] and the default locale is Arabic.
const listingUrl = (id: number): string => `${SITE}/ar/listings/${id}`;

// ── Twenty composite write shapes (identical to manual-import.ts) ───────────
const linkOne = (url: string | null | undefined, label = '') =>
  url ? { primaryLinkUrl: url, primaryLinkLabel: label, secondaryLinks: [] } : undefined;
const linkMany = (urls: string[]) =>
  urls.length
    ? { primaryLinkUrl: urls[0], primaryLinkLabel: '', secondaryLinks: urls.slice(1).map((u) => ({ label: '', url: u })) }
    : undefined;
const currency = (amount: number | null | undefined, code: string) =>
  amount != null ? { amountMicros: Math.round(amount * 1_000_000), currencyCode: code } : undefined;
const emails = (primary: string | null | undefined) =>
  primary ? { primaryEmail: primary, additionalEmails: [] } : undefined;
const phones = (num: string | null | undefined) =>
  num
    ? {
        primaryPhoneNumber: num.replace(/^\+?249/, ''),
        primaryPhoneCountryCode: 'SD',
        primaryPhoneCallingCode: '+249',
        additionalPhones: [],
      }
    : undefined;
const clean = <T extends Record<string, unknown>>(o: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)),
  ) as Partial<T>;

const PROPERTY_TYPE: Record<string, string> = {
  Apartment: 'APARTMENT', Villa: 'VILLA', Townhouse: 'TOWNHOUSE',
  Cottage: 'COTTAGE', Tinyhouse: 'TINYHOUSE', Rooms: 'ROOMS',
};

const createdId = (res: unknown): string | null =>
  (res as { data?: { createHome?: { id?: string }; createHost?: { id?: string } } })?.data?.createHome?.id ??
  (res as { data?: { createHost?: { id?: string } } })?.data?.createHost?.id ??
  (res as { id?: string })?.id ??
  null;

interface CrmHome {
  id: string;
  airbnbListingId: string | null;
  mkanListingId: number | null;
  mkanPublishState: string | null;
  homeStatus: string | null;
  photoCount: number | null;
  mkanListingUrl: unknown;
  mkanAmenities: string[] | null;
}

/** Twenty's SELECT options are UPPER_SNAKE; Prisma's Amenity enum is PascalCase. */
const sameAmenities = (crm: string[] | null, site: readonly string[]): boolean => {
  const want = site.map(toUpperSnake);
  const have = crm ?? [];
  return have.length === want.length && want.every((v) => have.includes(v));
};

async function main(): Promise<void> {
  console.log(`\n⬆️  mkan.sd → Twenty  (${APPLY ? 'APPLY' : 'dry run'})\n`);

  const twenty = twentyClient();
  prisma = (await import('@/lib/db')).db;

  let homes = (await twenty.all('homes')) as unknown as CrmHome[];

  // ── Phase 1 — homes the board has never seen ──────────────────────────────
  if (DO_CREATE) {
    const created = await createUnseen(twenty, homes);
    if (created) homes = (await twenty.all('homes')) as unknown as CrmHome[];
  }
  if (!DO_PATCH) return;

  // Scraped homes match on airbnbListingId; the three real owners' homes were
  // pushed up by `manual-import.ts` and have only `mkanListingId`. Both are
  // real listings and both belong in the report back.
  const crmListingIds = homes.map((h) => h.mkanListingId).filter((v): v is number => v != null);
  const listings = await prisma.listing.findMany({
    where: { OR: [{ source: 'AIRBNB', sourceListingId: { not: null } }, { id: { in: crmListingIds } }] },
    select: { id: true, sourceListingId: true, isPublished: true, claimedAt: true, photoUrls: true, amenities: true },
  });
  const byAirbnbId = new Map(listings.filter((l) => l.sourceListingId).map((l) => [l.sourceListingId!, l]));
  const byListingId = new Map(listings.map((l) => [l.id, l]));
  console.log(`   ${homes.length} homes in the CRM · ${listings.length} listings on the site\n`);

  const now = new Date().toISOString();
  interface Patch { id: string; label: string; body: Record<string, unknown>; fields: string[] }
  const patches: Patch[] = [];
  let gone = 0;

  for (const home of homes) {
    // Twenty round-trips absent text as "", not null.
    const airbnbId = home.airbnbListingId?.trim() || null;
    const listing =
      (airbnbId ? byAirbnbId.get(airbnbId) : undefined) ??
      (home.mkanListingId != null ? byListingId.get(home.mkanListingId) : undefined);
    if (!listing) { gone++; continue; }

    // A claimed listing is still IMPORTED_BUSY/LIVE from the board's point of
    // view; the claim itself is reported through the host's firstLoginAt, so
    // publish state stays a pure function of what the site is showing.
    const state = listing.isPublished ? 'LIVE' : 'IMPORTED_BUSY';
    const photoCount = listing.photoUrls.length;
    const url = listingUrl(listing.id);

    const body: Record<string, unknown> = {};
    const fields: string[] = [];
    const set = (f: string, v: unknown) => { body[f] = v; fields.push(f); };

    if (home.mkanListingId !== listing.id) set('mkanListingId', listing.id);
    if (home.mkanPublishState !== state) set('mkanPublishState', state);
    if (home.homeStatus !== state) set('homeStatus', state);
    if (home.photoCount !== photoCount) set('photoCount', photoCount);

    // The derived amenity set travels up, never down — see the note in
    // sync-down.ts. This is what keeps the board's list current after the
    // mapping table is widened.
    if (!sameAmenities(home.mkanAmenities, listing.amenities)) {
      set('mkanAmenities', listing.amenities.map(toUpperSnake));
    }

    const currentUrl = (home.mkanListingUrl as { primaryLinkUrl?: string } | null)?.primaryLinkUrl ?? '';
    if (currentUrl !== url) set('mkanListingUrl', { primaryLinkLabel: '', primaryLinkUrl: url, secondaryLinks: [] });

    // Only stamp publishedAt on the transition into LIVE, so it keeps meaning
    // "when this went live" rather than "when the sync last ran".
    if (state === 'LIVE' && home.mkanPublishState !== 'LIVE') set('publishedAt', now);

    if (!fields.length) continue;
    body.lastSyncedAt = now;
    patches.push({ id: home.id, label: airbnbId ?? `listing #${listing.id}`, body, fields });
  }

  console.log(`   ${patches.length} CRM homes to update`);
  console.log(`   ${gone} CRM homes with no listing on the site (not imported, or purged)\n`);

  for (const p of patches.slice(0, 15)) {
    console.log(`     ${p.label.padEnd(22)} ${p.fields.join(', ')}`);
  }
  if (patches.length > 15) console.log(`     … ${patches.length - 15} more`);

  if (!patches.length) { console.log('\nNothing to do — the board already matches the site.\n'); return; }
  if (!APPLY) { console.log('\nDRY RUN — re-run with --apply.\n'); return; }

  let written = 0;
  for (const p of patches) {
    try {
      await twenty.rest('PATCH', `homes/${p.id}`, p.body);
      written++;
    } catch (e) {
      console.warn(`  ! ${p.label}: ${(e as Error).message}`);
    }
  }
  console.log(`\n✅ ${written} CRM homes updated from the site\n`);
}

/**
 * Create a CRM record for every home on the site the board has never seen, and
 * for the host who owns it.
 *
 * Matching is by `mkanListingId` first and `airbnbListingId` second — the same
 * pair the patch phase uses, because scraped homes carry one and site-born
 * homes carry the other. A listing matched by either is left alone, including
 * the one home that exists twice on the board: creating a third would be worse
 * than the duplicate, and quietly deleting one is not this script's decision.
 *
 * Returns the number created, so the caller knows to re-read before patching.
 */
async function createUnseen(
  twenty: ReturnType<typeof twentyClient>,
  homes: CrmHome[],
): Promise<number> {
  const knownListingIds = new Set(homes.map((h) => h.mkanListingId).filter((v): v is number => v != null));
  const knownAirbnbIds = new Set(homes.map((h) => (h.airbnbListingId ?? '').trim()).filter(Boolean));

  const listings = await prisma.listing.findMany({
    select: {
      id: true, code: true, title: true, description: true, pricePerNight: true, photoUrls: true,
      bedrooms: true, bathrooms: true, guestCount: true, propertyType: true,
      isPublished: true, draft: true, hostId: true, sourceListingId: true, createdAt: true,
      location: { select: { address: true, city: true, state: true, latitude: true, longitude: true } },
    },
    orderBy: { id: 'asc' },
  });
  const unseen = listings.filter(
    (l) => !knownListingIds.has(l.id) && !(l.sourceListingId && knownAirbnbIds.has(l.sourceListingId)),
  );
  if (!unseen.length) {
    console.log('   the board has a record for every home on the site\n');
    return 0;
  }

  // Their hosts, and which of those the board already knows.
  const hosts = (await twenty.all('hosts')) as unknown as { id: string; mkanUserId: string | null }[];
  const hostRecByUser = new Map(hosts.filter((h) => h.mkanUserId).map((h) => [h.mkanUserId as string, h.id]));
  const owners = await prisma.user.findMany({
    where: { id: { in: [...new Set(unseen.map((l) => l.hostId))] } },
    select: { id: true, email: true, username: true, phoneNumber: true },
  });
  const ownerById = new Map(owners.map((u) => [u.id, u]));
  const newHosts = owners.filter((u) => !hostRecByUser.has(u.id));

  console.log(`   ${unseen.length} home(s) on the site with no CRM record — ${newHosts.length} new host(s)`);
  for (const l of unseen.slice(0, 15)) {
    const u = ownerById.get(l.hostId);
    console.log(
      `     + #${String(l.id).padEnd(6)} ${(l.title ?? '(untitled)').slice(0, 34).padEnd(36)}` +
        `${l.photoUrls.length} photo(s)  ${l.isPublished ? 'live' : 'busy'}  ${u?.email ?? '?'}`,
    );
  }
  if (unseen.length > 15) console.log(`     … ${unseen.length - 15} more`);

  if (!APPLY) {
    console.log('   (dry run — nothing created)\n');
    return 0;
  }

  // Hosts first: a home is created with its owner already attached.
  for (const u of newHosts) {
    const account = (u.email ?? '').split('@')[0] ?? '';
    try {
      const res = await twenty.rest('POST', 'hosts', clean({
        name: u.username || account || 'Host',
        source: 'MKAN_SITE',
        mkanUserId: u.id,
        mkanUsername: u.username ?? undefined,
        mkanAccountEmail: emails(u.email),
        phone: phones(u.phoneNumber),
        identityVerified: 'OWNERSHIP_CLAIMED',
        hostTrustBand: 'TRUSTED',
        preferredLanguage: 'AR',
        notes: 'Signed up on mkan.sd and added a home — synced by crm:sync-up.',
      }));
      const id = createdId(res);
      if (id) hostRecByUser.set(u.id, id);
      console.log(`   + host ${u.email}`);
    } catch (e) {
      console.warn(`   ! host ${u.email}: ${(e as Error).message.slice(0, 120)}`);
    }
  }

  let made = 0;
  for (const l of unseen) {
    const live = l.isPublished && !l.draft;
    const state = live ? 'LIVE' : 'IMPORTED_BUSY';
    try {
      await twenty.rest('POST', 'homes', clean({
        name: l.title ?? `mkan #${l.id}`,
        title: l.title ?? undefined,
        description: l.description ?? undefined,
        // Not a discovery: the host put this here themselves.
        source: 'MKAN_SITE',
        country: 'SUDAN',
        homeAddress: l.location
          ? {
              addressStreet1: l.location.address ?? '',
              addressCity: l.location.city || '',
              addressState: l.location.state || '',
              addressCountry: 'Sudan',
              addressLat: l.location.latitude ?? undefined,
              addressLng: l.location.longitude ?? undefined,
            }
          : undefined,
        bedrooms: l.bedrooms ?? undefined,
        bathrooms: l.bathrooms ?? undefined,
        guestCapacity: l.guestCount ?? undefined,
        photoUrls: linkMany(l.photoUrls ?? []),
        photoCount: (l.photoUrls ?? []).length,
        coverPhotoUrl: linkOne((l.photoUrls ?? [])[0]),
        photosRehosted: true, // born on our own CDN — nothing to re-host
        priceNightSdg: currency(l.pricePerNight, 'SDG'),
        propertyType: l.propertyType ? PROPERTY_TYPE[l.propertyType] : undefined,
        mkanPropertyType: l.propertyType ? PROPERTY_TYPE[l.propertyType] : undefined,
        // `listingId` is the public code (`0001-01`) and is TEXT; `mkanListingId`
        // is the row id and is the number every script joins on. A home created
        // before its host publishes has no code yet — it is minted at publish,
        // and the Twenty→mkan webhook writes it back here when that happens.
        listingId: l.code ?? undefined,
        mkanListingId: l.id,
        mkanListingUrl: linkOne(listingUrl(l.id)),
        homeStatus: state,
        publishState: state,
        mkanPublishState: state,
        trustBand: 'AUTO_ONBOARD',
        publishReady: live,
        importedAt: l.createdAt.toISOString(),
        lastSyncedAt: new Date().toISOString(),
        labels: ['MANUAL'],
        hostId: hostRecByUser.get(l.hostId) ?? undefined,
      }));
      made++;
    } catch (e) {
      console.warn(`   ! home #${l.id}: ${(e as Error).message.slice(0, 160)}`);
    }
  }
  console.log(`   ✅ ${made} home(s) added to the board\n`);
  return made;
}

main()
  .catch((e) => {
    console.error(`\n❌ ${(e as Error).message}\n`);
    process.exit(1);
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
