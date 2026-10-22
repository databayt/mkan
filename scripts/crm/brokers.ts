/**
 * The broker and agency directory — who rents homes out in Kigali, and where.
 *
 *   pnpm crm:brokers            dry run (also --dry-run): pull Twenty edits, merge every source, print what would change
 *   pnpm crm:brokers --apply    copy Twenty edits + merges into Prisma, upsert Prisma `Broker`, link
 *                               ListingBroker.brokerId, mirror to Twenty `broker` + its `brokerZone` rows
 *   pnpm crm:brokers --list     dry run, and print every merged broker
 *
 * When /find has nothing to show, the agent's next move is to ask the people
 * who would know: brokers who post homes in that area at that price. Until now
 * a broker was a bare `User` behind a ListingBroker row, so there was no list
 * to ask. This builds one, daily, from everywhere a broker shows up:
 *
 *   (a) every ListingBroker user (the TikTok mirror's leads),
 *   (b) Twenty hosts that look like agencies (agencySuspected, or 3+ Airbnb listings) in Rwanda,
 *   (c) Twenty tiktokPost.brokerName + phonesSeen,
 *   (d) the TikTok seed accounts (scripts/crm/.data/tiktok/seeds.json),
 *   (e) Facebook posters (scripts/crm/.data/fb-rentals/posts.json, once that lane runs),
 *   (f) Maps agencies (scripts/crm/.data/agencies/agencies.json, `crm:agencies`).
 *
 * The merge and the coverage maths live in `brokers-pure.ts` (unit-tested).
 * Prisma is written first because the Worker reads it; Twenty second, for the
 * humans. Counters the agent owns (asks, answers, optOut) are never
 * overwritten here — they are read back and mirrored to Twenty as they are.
 *
 * Two-way (2026-10-22): each run first pulls the Twenty brokers a person
 * edited since our last write (`Broker.syncedAt`) — kind, name, phones,
 * WhatsApp, opt-out, zones served — into Prisma and locks those fields
 * (`Broker.lockedFields`), so the build never overwrites them in either
 * store. A broker whose `mergeInto` is set is merged into that one and
 * deleted from both. See scripts/crm/README.md → "Brokers, agencies and zones".
 *
 * The dry run only reads.
 */
import { config } from 'dotenv';
config({ override: true });
process.env.PRISMA_QUIET ??= '1';

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { twentyClient, fromMicros, type Currency } from './twenty-rest';
import { phonesFromTwenty, twentyPhones } from '../../src/lib/phone';
import { DISTRICTS } from '../../src/lib/geo/rwanda-places';
import {
  directoryCandidate,
  humanEdit,
  isAgencyName,
  isHousingAgency,
  mergeBrokerRows,
  mergeCandidates,
  normaliseHandle,
  normaliseRwPhone,
  resolveMerges,
  summarise,
  withoutLocked,
  TWENTY_KEYS,
  type BrokerKindT,
  type BrokerRowFull,
  type Candidate,
  type HomeFact,
  type LockableField,
  type MergedBroker,
  type SourceTag,
  type TwentyBrokerState,
} from './brokers-pure';
import type { AgencyRow } from './agencies-discover';

type Row = Record<string, unknown>;

const APPLY = process.argv.includes('--apply');
const LIST = process.argv.includes('--list');
const DATA = join(process.cwd(), 'scripts/crm/.data');
const DISTRICT_CODES = new Set(DISTRICTS.map((d) => d.code));
const DEAD_STAGES = new Set(['DECLINED', 'DUPLICATE', 'REJECTED']);

if (!(process.env.TWENTY_API_URL ?? '').trim()) process.env.TWENTY_API_URL = 'http://localhost:3100';

function readJson<T>(file: string, empty: T): T {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : empty;
  } catch {
    return empty;
  }
}
const dateOf = (v: unknown): Date | null => {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};
const linkOf = (v: unknown): string | null => {
  const u = (v as { primaryLinkUrl?: string | null } | null)?.primaryLinkUrl?.trim();
  return u && /^https?:\/\//.test(u) ? u : null;
};
const SOURCE_TAG: Record<string, SourceTag> = { AIRBNB: 'airbnb', TIKTOK: 'tiktok', FACEBOOK: 'facebook', MKAN_SITE: 'site', WEB: 'web', MANUAL: 'site' };
const tagOf = (src: unknown): SourceTag => SOURCE_TAG[String(src ?? '').toUpperCase()] ?? 'web';

// ── sources → candidates ─────────────────────────────────────────────────────

/** A Twenty home → coverage evidence (null when it is not a live Kigali home). */
export function homeFactFromTwenty(h: Row): HomeFact | null {
  const state = String(h.homeState ?? '').toUpperCase();
  const inRwanda = String(h.country ?? '').toUpperCase() === 'RWANDA' || String(h.city ?? '').toUpperCase() === 'KIGALI' || DISTRICT_CODES.has(state as never);
  if (!inRwanda) return null;
  if (DEAD_STAGES.has(String(h.pipelineStage)) || DEAD_STAGES.has(String(h.homeStatus))) return null;
  const addr = (h.homeAddress as Row | null) ?? null;
  const month = h.priceMonthLocal as Currency | null;
  const priceMonth = month?.currencyCode === 'RWF' ? fromMicros(month) : null;
  const lat = typeof addr?.addressLat === 'number' ? addr.addressLat : null;
  const lng = typeof addr?.addressLng === 'number' ? addr.addressLng : null;
  return {
    key: typeof h.mkanListingId === 'number' ? `listing:${h.mkanListingId}` : `home:${h.id}`,
    district: state || null,
    address: [addr?.addressStreet1, addr?.addressStreet2].filter(Boolean).join(', ') || null,
    lat,
    lng,
    pinIsReal: String(h.source) === 'AIRBNB' && lat != null,
    stay: h.rentPeriod === 'MONTH' ? 'month' : h.rentPeriod === 'NIGHT' || h.priceNightLocal ? 'night' : null,
    priceMonth,
    seenAt: dateOf(h.scrapedAt) ?? dateOf(h.createdAt),
  };
}

interface LbRow {
  userId: string;
  role: 'BROKER' | 'OWNER';
  user: { id: string; phoneNumber: string | null; sourceHostId: string | null; username: string | null };
  listing: {
    id: number;
    source: string | null;
    rentPeriod: 'NIGHTLY' | 'MONTHLY';
    priceMonth: number | null;
    currency: string;
    createdAt: Date;
    sourceCapturedAt: Date | null;
    location: { address: string; state: string; zoneKey: string | null; latitude: number; longitude: number } | null;
  };
}

/** (a) ListingBroker users, one candidate per user with all their homes. */
export function candidatesFromListingBrokers(rows: LbRow[]): Candidate[] {
  const byUser = new Map<string, Candidate>();
  for (const r of rows) {
    const handle = r.user.sourceHostId?.startsWith('tiktok:') ? r.user.sourceHostId.slice(7) : normaliseHandle(r.user.username);
    const c =
      byUser.get(r.userId) ??
      ({
        origin: 'listing',
        kind: 'LANDLORD',
        name: r.user.username?.startsWith('@') ? r.user.username : handle ? `@${handle}` : null,
        phones: [r.user.phoneNumber].filter((p): p is string => !!p),
        tiktokHandle: handle,
        userId: r.userId,
        sources: [],
        homes: [],
      } satisfies Candidate);
    if (r.role === 'BROKER') c.kind = 'BROKER';
    const tag = tagOf(r.listing.source);
    if (!c.sources.includes(tag)) c.sources.push(tag);
    const l = r.listing;
    c.homes.push({
      key: `listing:${l.id}`,
      district: l.location?.zoneKey ?? l.location?.state?.toUpperCase() ?? null,
      address: l.location?.address ?? null,
      lat: l.location?.latitude ?? null,
      lng: l.location?.longitude ?? null,
      pinIsReal: l.source === 'AIRBNB' || l.source === 'MANUAL',
      stay: l.rentPeriod === 'MONTHLY' ? 'month' : 'night',
      priceMonth: l.currency === 'RWF' && l.priceMonth ? l.priceMonth : null,
      seenAt: l.sourceCapturedAt ?? l.createdAt,
    });
    byUser.set(r.userId, c);
  }
  return [...byUser.values()];
}

/** (b) Twenty hosts that look like an agency or a portfolio landlord, in Rwanda. */
export function candidatesFromHosts(hosts: Row[], homesByHost: Map<string, HomeFact[]>): Candidate[] {
  const out: Candidate[] = [];
  for (const h of hosts) {
    const id = String(h.id);
    const homes = homesByHost.get(id) ?? [];
    const phones = phonesFromTwenty(h.phone as never, 'RW').filter((p) => p.startsWith('+250'));
    const agency = h.agencySuspected === true;
    const portfolio = Number(h.airbnbListingsCount ?? 0) >= 3;
    if (!agency && !portfolio) continue;
    if (!homes.length && !phones.length) continue; // a Sudan host, or nobody to reach
    const name = (h.name as string | null)?.trim() || null;
    const src = String(h.source ?? '');
    out.push({
      origin: 'host',
      kind: src === 'AIRBNB' ? (agency || isAgencyName(name) ? 'AGENCY' : 'LANDLORD') : isAgencyName(name) ? 'AGENCY' : 'BROKER',
      name,
      phones,
      whatsapp: phonesFromTwenty(h.whatsapp as never, 'RW').find((p) => p.startsWith('+250')) ?? null,
      tiktokHandle: normaliseHandle(h.tiktokHandle as string | null),
      facebookUrl: linkOf(h.facebookUrl),
      email: ((h.email as Row | null)?.primaryEmail as string | null) || null,
      twentyHostIds: [id],
      sources: [tagOf(src)],
      homes,
    });
  }
  return out;
}

/** (c) TikTok posts: the name the ad shows, the numbers in it, and when it went up. */
export function candidatesFromPosts(posts: Row[], homeById: Map<string, HomeFact>): Candidate[] {
  const out: Candidate[] = [];
  for (const p of posts) {
    const handle = normaliseHandle(p.tiktokHandle as string | null);
    const phones = String(p.phonesSeen ?? '')
      .split(/[,;\s]+/)
      .map(normaliseRwPhone)
      .filter((n): n is string => !!n);
    if (!handle && !phones.length) continue;
    if (p.postStatus === 'SKIPPED' && !phones.length) continue; // not a rental, nothing gained
    const name = ((p.brokerName as string | null) || (p.accountName as string | null) || '').trim() || null;
    const home = p.homeId ? homeById.get(String(p.homeId)) : undefined;
    out.push({
      origin: 'post',
      kind: isAgencyName(name) ? 'AGENCY' : 'BROKER',
      name,
      phones,
      tiktokHandle: handle,
      twentyHostIds: p.hostId ? [String(p.hostId)] : [],
      sources: ['tiktok'],
      homes: home ? [home] : [],
      lastSeenAt: dateOf(p.publishedAt),
    });
  }
  return out;
}

/** (d) TikTok seed accounts the sweep vetted as rental posters (active or paused). */
export function candidatesFromSeeds(seeds: Record<string, { status?: string; lastListedAt?: string }>): Candidate[] {
  return Object.entries(seeds)
    .filter(([, s]) => s.status === 'active' || s.status === 'paused')
    .map(([handle]) => normaliseHandle(handle))
    .filter((h): h is string => !!h)
    .map((h) => ({ origin: 'seed', kind: isAgencyName(h.replace(/[._]/g, ' ')) ? 'AGENCY' : 'BROKER', name: null, phones: [], tiktokHandle: h, sources: ['tiktok'], homes: [] }) satisfies Candidate);
}

interface FbPost {
  author: string | null;
  authorId: string | null;
  text: string;
  createdAt: number | null;
  state: string;
  hostId?: string;
  read?: { phones?: string[]; inKigali?: boolean };
}
/** (e) Facebook group/Marketplace posters with a Rwandan number (the fb-rentals ledger). */
export function candidatesFromFacebook(posts: Record<string, FbPost>): Candidate[] {
  const out: Candidate[] = [];
  for (const p of Object.values(posts)) {
    if (p.state === 'skipped' || p.read?.inKigali === false) continue;
    const phones = (p.read?.phones ?? []).map(normaliseRwPhone).filter((n): n is string => !!n);
    if (!phones.length) continue;
    out.push({
      origin: 'facebook',
      kind: isAgencyName(p.author) ? 'AGENCY' : 'BROKER',
      name: p.author,
      phones,
      facebookUrl: p.authorId ? `https://www.facebook.com/${p.authorId}` : null,
      twentyHostIds: p.hostId ? [p.hostId] : [],
      sources: ['facebook'],
      homes: [],
      lastSeenAt: p.createdAt ? new Date(p.createdAt * 1000) : null,
    });
  }
  return out;
}

/** Lives in brokers-pure.ts now; re-exported for older imports. */
export { isHousingAgency };

/** (f) Maps agencies in Kigali that the discovery pass finished. */
export function candidatesFromAgencies(rows: Record<string, AgencyRow>): Candidate[] {
  return Object.values(rows)
    .filter((r) => r.state === 'done' && r.inKigali !== false && isHousingAgency(r))
    .map((r) => ({
      origin: 'maps',
      kind: 'AGENCY',
      name: r.name,
      phones: r.phones ?? [],
      whatsapp: r.whatsapp ?? null,
      website: r.website ?? null,
      email: r.email ?? null,
      sources: ['maps'],
      homes: [],
      places: [{ address: r.address ?? null, lat: r.lat ?? null, lng: r.lng ?? null }],
    }) satisfies Candidate);
}

// ── gather ───────────────────────────────────────────────────────────────────

async function gather(): Promise<{ candidates: Candidate[]; counts: Record<string, number> }> {
  const client = twentyClient();
  const [hosts, homes, posts] = await Promise.all([client.all('hosts'), client.all('homes'), client.all('tiktokPosts')]);
  const homesByHost = new Map<string, HomeFact[]>();
  const homeById = new Map<string, HomeFact>();
  for (const h of homes) {
    const f = homeFactFromTwenty(h);
    if (!f) continue;
    homeById.set(String(h.id), f);
    if (h.hostId) homesByHost.set(String(h.hostId), [...(homesByHost.get(String(h.hostId)) ?? []), f]);
  }

  const { db } = await import('../../src/lib/db');
  const lb = (await db.listingBroker.findMany({
    select: {
      userId: true,
      role: true,
      user: { select: { id: true, phoneNumber: true, sourceHostId: true, username: true } },
      listing: {
        select: {
          id: true,
          source: true,
          rentPeriod: true,
          priceMonth: true,
          currency: true,
          createdAt: true,
          sourceCapturedAt: true,
          location: { select: { address: true, state: true, zoneKey: true, latitude: true, longitude: true } },
        },
      },
    },
  })) as LbRow[];
  // The directory itself: keys a person merged in Twenty keep their groups together.
  const directoryRows = await db.broker.findMany({ select: { phones: true, whatsapp: true, tiktokHandle: true, userId: true, website: true, facebookUrl: true } });

  const seeds = readJson<Record<string, { status?: string }>>(join(DATA, 'tiktok/seeds.json'), {});
  const fb = readJson<Record<string, FbPost>>(join(DATA, 'fb-rentals/posts.json'), {});
  const agencies = readJson<Record<string, AgencyRow>>(join(DATA, 'agencies/agencies.json'), {});

  const parts = {
    listingBrokers: candidatesFromListingBrokers(lb),
    hosts: candidatesFromHosts(hosts, homesByHost),
    tiktokPosts: candidatesFromPosts(posts, homeById),
    seeds: candidatesFromSeeds(seeds),
    facebook: candidatesFromFacebook(fb),
    agencies: candidatesFromAgencies(agencies),
    directory: directoryRows.map(directoryCandidate),
  };
  // A post's host's other homes count too: the post names the broker, the host holds the portfolio.
  for (const c of parts.tiktokPosts) for (const id of c.twentyHostIds ?? []) c.homes.push(...(homesByHost.get(id) ?? []));
  const counts = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.length]));
  counts.twentyHosts = hosts.length;
  counts.twentyHomesInRwanda = homeById.size;
  counts.twentyTiktokPosts = posts.length;
  counts.listingBrokerRows = lb.length;
  return { candidates: Object.values(parts).flat(), counts };
}

// ── Twenty → Prisma: edits and merges ────────────────────────────────────────

const BROKER_FULL = {
  id: true, kind: true, name: true, userId: true, phones: true, whatsapp: true, tiktokHandle: true, facebookUrl: true, website: true,
  email: true, districts: true, neighbourhoods: true, stays: true, priceMin: true, priceMax: true, listingsCount: true, lastSeenAt: true,
  lastAskedAt: true, asks: true, answers: true, availableAnswers: true, optOut: true, optOutAt: true, twentyId: true, sources: true,
  zoneSlugs: true, lockedFields: true, syncedAt: true,
} as const;
type BrokerRow = BrokerRowFull & { twentyId: string | null };

const KINDS = new Set<BrokerKindT>(['BROKER', 'AGENCY', 'LANDLORD']);

/** Every record of an object, or null when the object is not in the workspace yet (crm:seed-objects not applied). */
async function allOrNull(client: ReturnType<typeof twentyClient>, plural: string): Promise<Row[] | null> {
  try {
    return await client.all(plural);
  } catch (e) {
    if (/not found/i.test((e as Error).message)) return null;
    throw e;
  }
}

/** One page of records pointing at a broker (a broker has far fewer than 200 of each). */
async function pointingAt(client: ReturnType<typeof twentyClient>, plural: string, brokerId: string): Promise<Row[]> {
  const res = (await client.rest('GET', `${plural}?filter=brokerId[eq]:${encodeURIComponent(brokerId)}&limit=200&depth=0`)) as { data?: Record<string, Row[]> };
  return res?.data?.[plural] ?? [];
}

interface TwentyDirectory {
  brokers: Row[];
  /** null: the junction object is not seeded yet. */
  brokerZones: Row[] | null;
  /** zone record id → slug, and back; null when the zone object is not seeded yet. */
  zoneSlugById: Map<string, string> | null;
  zoneIdBySlug: Map<string, string> | null;
}

async function readTwentyDirectory(client: ReturnType<typeof twentyClient>): Promise<TwentyDirectory> {
  const brokers = await client.all('brokers');
  const brokerZones = await allOrNull(client, 'brokerZones');
  const zones = await allOrNull(client, 'zones');
  const pairs = (zones ?? []).filter((z) => z.mkanZoneSlug).map((z) => [String(z.id), String(z.mkanZoneSlug)] as const);
  return {
    brokers,
    brokerZones,
    zoneSlugById: zones ? new Map(pairs) : null,
    zoneIdBySlug: zones ? new Map(pairs.map(([id, slug]) => [slug, id])) : null,
  };
}

const actorOf = (v: unknown): string | null => ((v as Row | null)?.source as string | undefined) ?? null;

/** A Twenty broker record as the pure two-way logic reads it. */
export function twentyBrokerState(t: Row, junction: Row[] | null, zoneSlugById: Map<string, string> | null): TwentyBrokerState {
  const rows = junction && zoneSlugById ? junction.filter((j) => String(j.brokerId) === String(t.id)) : null;
  const kind = String(t.kind ?? '') as BrokerKindT;
  return {
    id: String(t.id),
    updatedAt: dateOf(t.updatedAt),
    updatedBy: actorOf(t.updatedBy),
    kind: KINDS.has(kind) ? kind : null,
    name: typeof t.name === 'string' ? t.name : null,
    phones: phonesFromTwenty(t.phone as never, 'RW'),
    whatsapp: phonesFromTwenty(t.whatsapp as never, 'RW')[0] ?? null,
    optOut: t.optOut === true,
    zoneSlugs: rows ? [...new Set(rows.map((j) => zoneSlugById!.get(String(j.zoneId))).filter((z): z is string => !!z))] : null,
    zonesByPerson: (rows ?? []).some((j) => {
      const by = actorOf(j.createdBy);
      return !!by && by !== 'API' && by !== 'SYSTEM';
    }),
    mergeIntoId: t.mergeIntoId ? String(t.mergeIntoId) : null,
  };
}

/**
 * Step one of every run: what people did in Twenty since our last write.
 * Edits are copied into Prisma and locked; `mergeInto` merges are applied to
 * both stores. The dry run prints the plan.
 */
async function pullTwenty(write: boolean): Promise<void> {
  const { db } = await import('../../src/lib/db');
  const client = twentyClient();
  const tw = await readTwentyDirectory(client);
  const rows = (await db.broker.findMany({ select: BROKER_FULL })) as BrokerRow[];
  const byTwentyId = new Map(rows.filter((r) => r.twentyId).map((r) => [r.twentyId!, r]));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const twentyById = new Map(tw.brokers.map((t) => [String(t.id), t]));
  const rowOf = (t: Row | undefined) => (t ? (byTwentyId.get(String(t.id)) ?? byId.get(String(t.mkanBrokerId ?? ''))) : undefined);
  const merges = resolveMerges(tw.brokers.map((t) => ({ id: String(t.id), mergeIntoId: t.mergeIntoId ? String(t.mergeIntoId) : null })));

  console.log(`\n🔁 Twenty → Prisma — ${tw.brokers.length} Twenty broker(s), ${rows.length} Prisma row(s)${tw.brokerZones ? '' : ' · brokerZone not seeded'}${tw.zoneSlugById ? '' : ' · zone not seeded'}`);
  let edits = 0;
  for (const t of tw.brokers) {
    if (merges.has(String(t.id))) continue; // about to be deleted
    const row = rowOf(t);
    if (!row) continue;
    const e = humanEdit(twentyBrokerState(t, tw.brokerZones, tw.zoneSlugById), row);
    if (!e.changed.length) continue;
    edits += 1;
    console.log(`   ✎ ${row.name.slice(0, 32).padEnd(32)} ${e.changed.map((f) => `${f}=${JSON.stringify(e.data[f])}`).join(' · ')}  → lock ${e.changed.join(',')}`);
    if (write) await db.broker.update({ where: { id: row.id }, data: e.data });
    Object.assign(row, e.data);
  }

  let merged = 0;
  for (const [loserT, survivorT] of merges) {
    const loser = rowOf(twentyById.get(loserT));
    const survivor = rowOf(twentyById.get(survivorT));
    if (!survivor) {
      console.warn(`   ! merge ${loserT} → ${survivorT}: the survivor has no Prisma row yet — skipped`);
      continue;
    }
    console.log(`   ⇢ merge ${loser?.name ?? `(Twenty ${loserT})`} → ${survivor.name}`);
    merged += 1;
    if (!write) continue;
    if (loser && loser.id !== survivor.id) {
      const data = mergeBrokerRows(survivor, loser);
      // Loser goes first so its unique userId / tiktokHandle are free for the survivor.
      await db.$transaction([
        db.listingBroker.updateMany({ where: { brokerId: loser.id }, data: { brokerId: survivor.id } }),
        db.outboundMessage.updateMany({ where: { brokerId: loser.id }, data: { brokerId: survivor.id } }),
        db.broker.delete({ where: { id: loser.id } }),
        db.broker.update({ where: { id: survivor.id }, data }),
      ]);
      Object.assign(survivor, data);
    }
    // Twenty: re-point what pointed at the loser, then delete it.
    for (const plural of ['homes', 'hosts', 'tiktokPosts']) {
      for (const r of await pointingAt(client, plural, loserT)) await client.rest('PATCH', `${plural}/${r.id}`, { brokerId: survivorT });
    }
    // Its zone rows join the survivor's (the union Prisma now holds), so the next run does not read
    // the gap as a person removing zones; duplicates, and rows a locked survivor does not want, go.
    const survivorZones = new Set((tw.brokerZones ?? []).filter((j) => String(j.brokerId) === survivorT).map((j) => String(j.zoneId)));
    for (const j of (tw.brokerZones ?? []).filter((j) => String(j.brokerId) === loserT)) {
      if (survivor.lockedFields.includes('zoneSlugs') || survivorZones.has(String(j.zoneId))) await client.rest('DELETE', `brokerZones/${j.id}`);
      else {
        await client.rest('PATCH', `brokerZones/${j.id}`, { brokerId: survivorT });
        survivorZones.add(String(j.zoneId));
        j.brokerId = survivorT;
      }
    }
    await client.rest('DELETE', `brokers/${loserT}`);
    // The survivor's merged contact fields reach Twenty now, stamped, so a later edit there is read against them.
    const patch = Object.fromEntries(
      Object.entries({
        kind: survivor.kind,
        phone: twentyPhones(survivor.phones[0], survivor.phones.slice(1)),
        whatsapp: twentyPhones(survivor.whatsapp),
        optOut: survivor.optOut,
        optOutAt: survivor.optOutAt?.toISOString() ?? null,
      }).filter(([k, v]) => v !== undefined && !survivor.lockedFields.some((f) => TWENTY_KEYS[f as LockableField]?.includes(k))),
    );
    const res = (await client.rest('PATCH', `brokers/${survivorT}`, patch)) as { data?: Record<string, { updatedAt?: string }> };
    const stamp = dateOf(Object.values(res?.data ?? {})[0]?.updatedAt);
    const now = new Date();
    await db.broker.update({ where: { id: survivor.id }, data: { syncedAt: stamp && stamp > now ? stamp : now } });
  }
  console.log(`   ${edits} edited broker(s) to copy and lock · ${merged} merge(s)${write ? ' — applied' : ' — dry run'}`);
}

// ── writes ───────────────────────────────────────────────────────────────────

const STAY_OPTION = { month: 'MONTH', night: 'NIGHT' } as const;

/**
 * The Twenty `broker` record body for a merged broker and its Prisma row.
 * Fields a person locked are left out, so their edit stands.
 */
export function twentyBrokerBody(
  b: MergedBroker,
  row: { id: string; asks: number; answers: number; availableAnswers: number; lastAskedAt: Date | null; optOut: boolean; optOutAt: Date | null; lockedFields?: string[]; districts?: string[]; neighbourhoods?: string[] },
) {
  const link = (url: string | null, label: string) => (url ? { primaryLinkUrl: url, primaryLinkLabel: label, secondaryLinks: [] } : undefined);
  const locked = (row.lockedFields ?? []) as LockableField[];
  // Locked zones keep the row's districts/neighbourhoods, which were derived from them.
  const zonesLocked = locked.includes('zoneSlugs');
  const body: Record<string, unknown> = {
    name: b.name,
    kind: b.kind,
    phone: twentyPhones(b.phones[0], b.phones.slice(1)),
    whatsapp: twentyPhones(b.whatsapp),
    tiktokHandle: b.tiktokHandle ?? '',
    facebookUrl: link(b.facebookUrl, 'Facebook'),
    website: link(b.website, 'Website'),
    email: b.email ? { primaryEmail: b.email, additionalEmails: [] } : undefined,
    districts: zonesLocked && row.districts ? row.districts : b.districts,
    neighbourhoods: (zonesLocked && row.neighbourhoods ? row.neighbourhoods : b.neighbourhoods).join(', '),
    stays: b.stays.map((s) => STAY_OPTION[s]),
    priceMin: b.priceMin,
    priceMax: b.priceMax,
    listingsCount: b.listingsCount,
    lastSeenAt: b.lastSeenAt?.toISOString() ?? null,
    lastAskedAt: row.lastAskedAt?.toISOString() ?? null,
    asks: row.asks,
    answers: row.answers,
    availableAnswers: row.availableAnswers,
    optOut: row.optOut,
    optOutAt: row.optOutAt?.toISOString() ?? null,
    sources: b.sources.map((s) => s.toUpperCase()),
    mkanBrokerId: row.id,
  };
  for (const f of locked) for (const k of TWENTY_KEYS[f] ?? []) delete body[k];
  for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
  return body;
}

async function apply(brokers: MergedBroker[]): Promise<void> {
  const { db } = await import('../../src/lib/db');
  const client = twentyClient();
  let created = 0;
  let updated = 0;
  let linked = 0;
  const claimedUsers = new Set<string>();
  const claimedHandles = new Set<string>();
  const written: { b: MergedBroker; id: string }[] = [];

  for (const b of brokers) {
    // The existing row: same user, same handle, or a shared phone.
    const existing = await db.broker.findFirst({
      where: {
        OR: [
          ...(b.userIds.length ? [{ userId: { in: b.userIds } }] : []),
          ...(b.tiktokHandles.length ? [{ tiktokHandle: { in: b.tiktokHandles } }] : []),
          ...(b.phones.length ? [{ phones: { hasSome: b.phones } }] : []),
        ],
      },
      select: { id: true, userId: true, tiktokHandle: true, sources: true, lockedFields: true, zoneSlugs: true },
    });
    if (!existing && !b.userIds.length && !b.tiktokHandles.length && !b.phones.length && !b.website) continue;
    // Unique columns: only take a user / handle no other Broker row holds.
    const free = async (field: 'userId' | 'tiktokHandle', value: string | null, claimed: Set<string>) => {
      if (!value || claimed.has(value)) return null;
      const other = await db.broker.findFirst({ where: { [field]: value, ...(existing ? { NOT: { id: existing.id } } : {}) }, select: { id: true } });
      return other ? null : value;
    };
    const userId = existing?.userId ?? (await free('userId', b.userId, claimedUsers));
    const tiktokHandle = existing?.tiktokHandle ?? (await free('tiktokHandle', b.tiktokHandle, claimedHandles));
    if (userId) claimedUsers.add(userId);
    if (tiktokHandle) claimedHandles.add(tiktokHandle);
    const derived = {
      kind: b.kind,
      name: b.name,
      userId,
      phones: b.phones,
      whatsapp: b.whatsapp,
      tiktokHandle,
      facebookUrl: b.facebookUrl,
      website: b.website,
      email: b.email,
      zoneSlugs: b.zoneSlugs,
      districts: b.districts,
      neighbourhoods: b.neighbourhoods,
      stays: b.stays,
      priceMin: b.priceMin,
      priceMax: b.priceMax,
      listingsCount: b.listingsCount,
      lastSeenAt: b.lastSeenAt,
      sources: [...new Set([...(existing?.sources ?? []), ...b.sources])],
    };
    // A person's edit in Twenty wins over what the ads say.
    const data = existing ? withoutLocked(derived, existing.lockedFields, existing.zoneSlugs) : derived;
    const row = existing
      ? await db.broker.update({ where: { id: existing.id }, data, select: { id: true } })
      : await db.broker.create({ data: derived, select: { id: true } });
    if (existing) updated += 1;
    else created += 1;
    if (b.userIds.length) {
      const r = await db.listingBroker.updateMany({ where: { userId: { in: b.userIds }, OR: [{ brokerId: null }, { brokerId: { not: row.id } }] }, data: { brokerId: row.id } });
      linked += r.count;
    }
    written.push({ b, id: row.id });
  }
  console.log(`\n✅ Prisma: ${created} broker(s) created · ${updated} updated · ${linked} ListingBroker row(s) linked`);

  // Twenty second. A missing `broker` object (crm:seed-objects not applied) stops here, loudly.
  let tCreated = 0;
  let tUpdated = 0;
  let hostsLinked = 0;
  let zonesAdded = 0;
  let zonesRemoved = 0;
  let unsynced = 0;
  const brokerZones = await allOrNull(client, 'brokerZones');
  const zones = await allOrNull(client, 'zones');
  const zoneIdBySlug = zones ? new Map(zones.filter((z) => z.mkanZoneSlug).map((z) => [String(z.mkanZoneSlug), String(z.id)])) : null;
  const junctionOf = new Map<string, Row[]>();
  for (const j of brokerZones ?? []) junctionOf.set(String(j.brokerId), [...(junctionOf.get(String(j.brokerId)) ?? []), j]);
  if (!brokerZones || !zoneIdBySlug) console.warn('  ! zone / brokerZone objects not in Twenty yet — zones served not mirrored (crm:seed-objects --apply, then crm:zones --write)');

  const twentyHostBroker = new Map<string, string>();
  for (const { b, id } of written) {
    const row = await db.broker.findUniqueOrThrow({
      where: { id },
      select: {
        id: true, name: true, twentyId: true, asks: true, answers: true, availableAnswers: true, lastAskedAt: true, optOut: true, optOutAt: true,
        lockedFields: true, zoneSlugs: true, districts: true, neighbourhoods: true,
      },
    });
    const body = twentyBrokerBody(b, row);
    let twentyId = row.twentyId;
    let stamp: Date | null = null;
    const stampOf = (res: unknown) => dateOf(Object.values((res as { data?: Record<string, { updatedAt?: string }> })?.data ?? {})[0]?.updatedAt);
    if (twentyId) {
      stamp = stampOf(await client.rest('PATCH', `brokers/${twentyId}`, body));
      tUpdated += 1;
    } else {
      const res = (await client.rest('POST', 'brokers', body)) as { data?: Record<string, { id?: string; updatedAt?: string }> };
      twentyId = Object.values(res?.data ?? {})[0]?.id ?? null;
      stamp = stampOf(res);
      tCreated += 1;
    }
    if (!twentyId) continue;
    for (const h of b.twentyHostIds) twentyHostBroker.set(h, twentyId);

    // Zones served → brokerZone rows, unless a person owns them (then their rows are the truth).
    let zonesInSync = !!(brokerZones && zoneIdBySlug);
    if (zonesInSync && !row.lockedFields.includes('zoneSlugs')) {
      try {
        const have = junctionOf.get(twentyId) ?? [];
        const want = new Set<string>();
        for (const slug of row.zoneSlugs) {
          const zid = zoneIdBySlug!.get(slug);
          if (zid) want.add(zid);
          else zonesInSync = false; // a zone crm:zones has not created: try again next run
        }
        for (const zid of want) {
          if (have.some((j) => String(j.zoneId) === zid)) continue;
          await client.rest('POST', 'brokerZones', { name: `${row.name} · ${zones!.find((z) => String(z.id) === zid)?.name ?? ''}`.slice(0, 120), brokerId: twentyId, zoneId: zid });
          zonesAdded += 1;
        }
        for (const j of have) {
          if (want.has(String(j.zoneId))) continue;
          await client.rest('DELETE', `brokerZones/${j.id}`);
          zonesRemoved += 1;
        }
      } catch (e) {
        console.warn(`  ! zones for ${row.name}: ${(e as Error).message.slice(0, 120)}`);
        zonesInSync = false;
      }
    }
    // syncedAt: Twenty's own stamp for our write (no clock skew), or now. A half-written junction
    // clears it instead, so the next run rebuilds the rows rather than reading them as a person's edit.
    const now = new Date();
    const syncedAt = zonesInSync || !(brokerZones && zoneIdBySlug) ? (stamp && stamp > now ? stamp : now) : null;
    if (!syncedAt) unsynced += 1;
    await db.broker.update({ where: { id }, data: { twentyId, syncedAt } });
  }
  // Each host points at its directory entry (the reverse field lists a broker's hosts).
  const hosts = await client.all('hosts');
  for (const h of hosts) {
    const want = twentyHostBroker.get(String(h.id));
    if (want && h.brokerId !== want) {
      await client.rest('PATCH', `hosts/${h.id}`, { brokerId: want }).catch((e) => console.warn(`  ! host ${h.id}: ${(e as Error).message.slice(0, 120)}`));
      hostsLinked += 1;
    }
  }
  console.log(`✅ Twenty: ${tCreated} broker(s) created · ${tUpdated} updated · ${hostsLinked} host(s) linked · zones served +${zonesAdded} −${zonesRemoved}${unsynced ? ` · ${unsynced} left unsynced (retry next run)` : ''}`);
}

async function main(): Promise<void> {
  await pullTwenty(APPLY);
  const { candidates, counts } = await gather();
  const brokers = mergeCandidates(candidates);
  const s = summarise(brokers);
  console.log(`\n📇 Broker directory — ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`   inputs: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  console.log(`   ${candidates.length} candidate(s) → ${s.total} broker(s) · ${s.withPhone} with a phone · ${s.withCoverage} with coverage · ${s.withZones} with a sector/neighbourhood · ${s.withHomes} with homes`);
  console.log(`   by kind:   ${Object.entries(s.byKind).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  console.log(`   by source: ${Object.entries(s.bySource).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  console.log(`   by origin: ${Object.entries(s.byOrigin).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  const shown = LIST ? brokers : brokers.slice(0, 15);
  console.log(`\n   ${LIST ? 'every broker' : 'top 15 by homes'}:`);
  for (const b of shown) {
    const band = b.priceMin != null ? ` RWF ${b.priceMin.toLocaleString('en')}–${(b.priceMax ?? b.priceMin).toLocaleString('en')}/mo` : '';
    const zones = b.zoneSlugs.slice(0, 3).map((z) => z.split('/').pop()).join('/');
    console.log(`   ${b.kind.padEnd(8)} ${b.name.slice(0, 32).padEnd(32)} ${String(b.listingsCount).padStart(3)} home(s)  ${b.phones[0] ?? '(no phone)'}  ${b.tiktokHandle ? `@${b.tiktokHandle}` : ''}  ${zones || b.districts.join('/')}${band}  [${b.sources.join(',')}]`);
  }
  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Pass --apply (after crm:seed-objects --apply and crm:zones --write).');
    return;
  }
  await apply(brokers);
}

if (process.argv[1] && /brokers\.ts$/.test(process.argv[1])) {
  main()
    .then(async () => (await import('../../src/lib/db')).db.$disconnect())
    .catch((e) => {
      console.error(`\n❌ ${(e as Error).message}\n`);
      process.exit(1);
    });
}
