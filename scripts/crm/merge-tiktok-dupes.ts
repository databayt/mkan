/**
 * Undo what `crm:sync-up` did to the TikTok leads before it learned to skip them.
 *
 *   pnpm crm:merge-tiktok-dupes            dry run: the pairs it found
 *   pnpm crm:merge-tiktok-dupes --apply
 *
 * `crm:tiktok-mirror` put each TikTok home into Prisma as a draft lead keyed
 * `sourceListingId = tiktok:<videoId>`. sync-up's create phase only knew
 * listings by `mkanListingId` / `airbnbListingId`, so every lead looked new and
 * came back up as a second `MKAN_SITE` home — and its `tiktok:<handle>` broker
 * as a second host stamped `OWNERSHIP_CLAIMED` / `TRUSTED`.
 *
 * This marks, never deletes (Twenty deletes are hard):
 *   copy home   → homeStatus DUPLICATE, duplicateCheck CONFIRMED, duplicateOf → the TikTok home
 *   TikTok home → mkanListingId (+ URL), the link the mirror now writes itself
 *   copy host   → hostTrustBand / identityVerified cleared, a note naming the real host
 *
 * Every change goes to `.data/merge-tiktok-dupes.jsonl` with the values it
 * replaced, so a wrong pair can be put back by hand.
 */
import { config } from 'dotenv';
config({ override: true });

import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { twentyClient } from './twenty-rest';

type Row = Record<string, unknown>;

const APPLY = process.argv.includes('--apply');
const LEDGER_DIR = join(__dirname, '.data');
const LEDGER = join(LEDGER_DIR, 'merge-tiktok-dupes.jsonl');
const SITE = 'https://www.mkan.sd';

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export interface DupePair {
  copyId: string;
  originalId: string;
  listingId: number;
  sourceId: string;
}

/**
 * Pure: which board homes are sync-up's copies of a TikTok lead, and which
 * TikTok home each one copies. A copy is an `MKAN_SITE` home whose
 * `mkanListingId` is a Prisma lead with a `tiktok:` source id.
 */
export function findPairs(homes: Row[], leads: { id: number; sourceListingId: string | null }[]): DupePair[] {
  const leadSource = new Map(leads.filter((l) => l.sourceListingId?.startsWith('tiktok:')).map((l) => [l.id, l.sourceListingId as string]));
  const originals = new Map(homes.filter((h) => h.source === 'TIKTOK' && str(h.sourceId)).map((h) => [str(h.sourceId), h]));
  const out: DupePair[] = [];
  for (const h of homes) {
    if (h.source !== 'MKAN_SITE' || h.homeStatus === 'DUPLICATE') continue;
    const listingId = typeof h.mkanListingId === 'number' ? h.mkanListingId : null;
    const sourceId = listingId != null ? leadSource.get(listingId) : undefined;
    const original = sourceId ? originals.get(sourceId) : undefined;
    if (!listingId || !sourceId || !original) continue;
    out.push({ copyId: String(h.id), originalId: String(original.id), listingId, sourceId });
  }
  return out;
}

async function main() {
  console.log(`\n🧹 TikTok copies made by sync-up  (${APPLY ? 'APPLY' : 'dry run'})\n`);
  const twenty = twentyClient();
  const { db } = await import('../../src/lib/db');
  const [homes, hosts] = await Promise.all([twenty.all('homes'), twenty.all('hosts')]);
  const leads = await db.listing.findMany({ where: { source: 'TIKTOK' }, select: { id: true, sourceListingId: true, hostId: true } });
  const pairs = findPairs(homes, leads);

  // The broker copies: MKAN_SITE hosts whose mkanUserId is a `tiktok:` broker.
  const brokers = await db.user.findMany({ where: { sourceHostId: { startsWith: 'tiktok:' } }, select: { id: true, sourceHostId: true } });
  const brokerHandle = new Map(brokers.map((b) => [b.id, (b.sourceHostId ?? '').slice('tiktok:'.length).toLowerCase()]));
  const realHost = new Map(hosts.filter((h) => str(h.tiktokHandle)).map((h) => [str(h.tiktokHandle).replace(/^@/, '').toLowerCase(), h]));
  const hostCopies = hosts.filter((h) => h.source === 'MKAN_SITE' && brokerHandle.has(str(h.mkanUserId)) && h.hostTrustBand === 'TRUSTED');

  const byId = new Map(homes.map((h) => [String(h.id), h]));
  console.log(`   ${leads.length} TikTok leads on the site · ${pairs.length} board copies · ${hostCopies.length} broker copies\n`);
  for (const p of pairs.slice(0, 20)) console.log(`     ${p.sourceId.padEnd(32)} listing #${p.listingId}  copy ${p.copyId.slice(0, 8)} → ${p.originalId.slice(0, 8)}`);
  if (pairs.length > 20) console.log(`     … ${pairs.length - 20} more`);
  for (const h of hostCopies) console.log(`     host ${str(h.name).padEnd(28)} → @${brokerHandle.get(str(h.mkanUserId))}`);

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply.\n');
    await db.$disconnect();
    return;
  }

  mkdirSync(LEDGER_DIR, { recursive: true });
  const log = (entry: Row) => appendFileSync(LEDGER, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
  let done = 0;
  for (const p of pairs) {
    const copy = byId.get(p.copyId)!;
    const original = byId.get(p.originalId)!;
    try {
      await twenty.rest('PATCH', `homes/${p.copyId}`, { homeStatus: 'DUPLICATE', duplicateCheck: 'CONFIRMED', duplicateOfId: p.originalId });
      log({ object: 'home', id: p.copyId, was: { homeStatus: copy.homeStatus, duplicateCheck: copy.duplicateCheck, duplicateOfId: copy.duplicateOfId ?? null } });
      if (original.mkanListingId !== p.listingId) {
        await twenty.rest('PATCH', `homes/${p.originalId}`, {
          mkanListingId: p.listingId,
          mkanListingUrl: { primaryLinkUrl: `${SITE}/en/listings/${p.listingId}`, primaryLinkLabel: '', secondaryLinks: [] },
        });
        log({ object: 'home', id: p.originalId, was: { mkanListingId: original.mkanListingId ?? null } });
      }
      done++;
    } catch (e) {
      console.warn(`   ! ${p.sourceId}: ${(e as Error).message.slice(0, 160)}`);
    }
  }
  let hostsDone = 0;
  for (const h of hostCopies) {
    const handle = brokerHandle.get(str(h.mkanUserId))!;
    const real = realHost.get(handle);
    try {
      await twenty.rest('PATCH', `hosts/${h.id}`, {
        hostTrustBand: null,
        identityVerified: null,
        notes: `Copy of the TikTok broker @${handle}${real ? ` (host ${real.id})` : ''} made by crm:sync-up — not a site signup. Marked by crm:merge-tiktok-dupes.`,
      });
      log({ object: 'host', id: h.id, was: { hostTrustBand: h.hostTrustBand, identityVerified: h.identityVerified, notes: h.notes ?? null } });
      hostsDone++;
    } catch (e) {
      console.warn(`   ! host ${h.id}: ${(e as Error).message.slice(0, 160)}`);
    }
  }
  console.log(`\n✅ ${done} copies marked · ${hostsDone} broker copies cleared · ledger ${LEDGER}\n`);
  await db.$disconnect();
}

if (process.argv[1] && /merge-tiktok-dupes\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(`\n❌ ${(e as Error).message}\n`);
    process.exit(1);
  });
}
