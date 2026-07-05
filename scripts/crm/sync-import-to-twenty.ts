/**
 * Sync the mkan-import ledger back into Twenty (closes the G1.5 loop).
 *
 * `mkan-import.ts --apply` provisions 1000+ accounts and writes Busy listings to
 * the mkan DB, recording the mapping in a ledger. This reads that ledger and
 * stamps the CRM so the workspace reflects what landed:
 *   Host  → mkanUsername / mkanAccountEmail / mkanUserId / accountProvisionedAt
 *   Home  → mkanListingId / homeStatus=IMPORTED_BUSY / mkanPublishState=IMPORTED_BUSY / importedAt
 *
 *   pnpm crm:sync-import                 # dry (prints plan)
 *   pnpm crm:sync-import --apply         # PATCH Twenty
 *
 * Idempotent: matches Twenty records by airbnbHostId / airbnbListingId and only
 * PATCHes the account/import fields. Throttled 700ms + 429 backoff.
 */
import { config } from 'dotenv';
config({ override: true });
import { readFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const LEDGER = (process.argv.find((a) => a.startsWith('--ledger=')) ?? '').split('=')[1]
  || 'scripts/crm/.data/mkan-import-ledger.json';
const API_URL = (process.env.TWENTY_API_URL ?? '').replace(/\/+$/, '');
const API_KEY = process.env.TWENTY_API_KEY ?? '';
const REST = `${API_URL}/rest`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MIN_GAP_MS = 700;
let lastCallAt = 0;
async function throttle() { const w = lastCallAt + MIN_GAP_MS - Date.now(); if (w > 0) await sleep(w); lastCallAt = Date.now(); }
async function rest(method: 'GET' | 'PATCH', path: string, body?: unknown, attempt = 0): Promise<any> {
  await throttle();
  const res = await fetch(`${REST}/${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` }, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 429 && attempt < 8) { const b = 15_000 * (attempt + 1); console.warn(`  … 429 — waiting ${b / 1000}s (attempt ${attempt + 1})`); await sleep(b); return rest(method, path, body, attempt + 1); }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`REST ${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}
const records = (res: any, plural: string): any[] => {
  const d = res?.data ?? res; const v = d?.[plural] ?? d;
  if (Array.isArray(v)) return v; if (Array.isArray(v?.edges)) return v.edges.map((e: any) => e.node); return [];
};
const emails = (primary: string) => ({ primaryEmail: primary, additionalEmails: [] });

interface Ledger {
  hosts: Record<string, { mkanUserId: string; mkanAccountEmail: string; mkanUsername: string }>;
  homes: Record<string, { mkanListingId: number; mkanUserId: string }>;
}

async function main() {
  const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger;
  const hostEntries = Object.entries(ledger.hosts);
  const homeEntries = Object.entries(ledger.homes);
  console.log(`\n🔄 Sync import ledger → Twenty — ${hostEntries.length} hosts, ${homeEntries.length} homes  (${APPLY ? 'APPLY' : 'dry'})`);
  if (!API_URL || !API_KEY) throw new Error('needs TWENTY_API_URL + TWENTY_API_KEY');

  // Build external-id → Twenty-id maps in two calls (avoids per-record GETs).
  const hostIdByAirbnb = new Map<string, string>();
  for (const h of records(await rest('GET', 'hosts?limit=200&depth=0'), 'hosts')) if (h.airbnbHostId) hostIdByAirbnb.set(h.airbnbHostId, h.id);
  const homeIdByAirbnb = new Map<string, string>();
  for (const h of records(await rest('GET', 'homes?limit=200&depth=0'), 'homes')) if (h.airbnbListingId) homeIdByAirbnb.set(h.airbnbListingId, h.id);

  const now = new Date().toISOString();
  if (!APPLY) {
    console.log(`\nsample host patch (${hostEntries[0]?.[0]}):`, JSON.stringify({ mkanUsername: hostEntries[0]?.[1].mkanUsername, mkanAccountEmail: emails(hostEntries[0]?.[1].mkanAccountEmail ?? ''), mkanUserId: hostEntries[0]?.[1].mkanUserId }));
    console.log(`sample home patch (${homeEntries[0]?.[0]}):`, JSON.stringify({ mkanListingId: homeEntries[0]?.[1].mkanListingId, homeStatus: 'IMPORTED_BUSY', mkanPublishState: 'IMPORTED_BUSY' }));
    const missH = hostEntries.filter(([a]) => !hostIdByAirbnb.has(a)).length;
    const missM = homeEntries.filter(([a]) => !homeIdByAirbnb.has(a)).length;
    console.log(`\nWould PATCH ${hostEntries.length - missH} hosts + ${homeEntries.length - missM} homes (${missH}+${missM} not found in CRM). Re-run with --apply.\n`);
    return;
  }

  let hp = 0, mp = 0, miss = 0;
  for (const [airbnbHostId, a] of hostEntries) {
    const id = hostIdByAirbnb.get(airbnbHostId);
    if (!id) { console.warn(`  ? host ${airbnbHostId} not in CRM`); miss++; continue; }
    try { await rest('PATCH', `hosts/${id}`, { mkanUsername: a.mkanUsername, mkanAccountEmail: emails(a.mkanAccountEmail), mkanUserId: a.mkanUserId, accountProvisionedAt: now }); hp++; }
    catch (e) { console.warn(`  ! host ${airbnbHostId}: ${(e as Error).message}`); }
  }
  for (const [airbnbListingId, m] of homeEntries) {
    const id = homeIdByAirbnb.get(airbnbListingId);
    if (!id) { console.warn(`  ? home ${airbnbListingId} not in CRM`); miss++; continue; }
    try { await rest('PATCH', `homes/${id}`, { mkanListingId: m.mkanListingId, homeStatus: 'IMPORTED_BUSY', mkanPublishState: 'IMPORTED_BUSY', importedAt: now }); mp++; }
    catch (e) { console.warn(`  ! home ${airbnbListingId}: ${(e as Error).message}`); }
  }
  console.log(`\n✅ synced ${hp} hosts + ${mp} homes to Twenty${miss ? ` (${miss} not found)` : ''}.\n`);
}
main().catch((e) => { console.error(`\n❌ ${(e as Error).message}\n`); process.exit(1); });
