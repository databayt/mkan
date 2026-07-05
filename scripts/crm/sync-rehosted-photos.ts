/**
 * Sync re-hosted CDN photos back into Twenty (one-off ops helper).
 *
 * `photo-rehost.ts` writes CDN URLs into `.data/airbnb-rehosted.json` for the
 * import step, but leaves the Twenty CRM records on their original muscache URLs.
 * This patches the matching Twenty homes with the CDN photoUrls/coverPhotoUrl,
 * updates photoCount, and flags photosRehosted:true so the CRM reflects reality.
 *
 *   npx tsx scripts/crm/sync-rehosted-photos.ts            # dry (prints plan)
 *   npx tsx scripts/crm/sync-rehosted-photos.ts --apply    # PATCH Twenty
 */
import { config } from 'dotenv';
config({ override: true });
import { readFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const IN = (process.argv.find((a) => a.startsWith('--in=')) ?? '').split('=')[1]
  || 'scripts/crm/.data/airbnb-rehosted.json';
const API_URL = (process.env.TWENTY_API_URL ?? '').replace(/\/+$/, '');
const API_KEY = process.env.TWENTY_API_KEY ?? '';
const REST = `${API_URL}/rest`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MIN_GAP_MS = 700;
let lastCallAt = 0;
async function throttle() {
  const wait = lastCallAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}
async function rest(method: 'GET' | 'PATCH', path: string, body?: unknown, attempt = 0): Promise<any> {
  await throttle();
  const res = await fetch(`${REST}/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429 && attempt < 8) {
    const backoff = 15_000 * (attempt + 1);
    console.warn(`  … 429 — waiting ${backoff / 1000}s (attempt ${attempt + 1})`);
    await sleep(backoff);
    return rest(method, path, body, attempt + 1);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`REST ${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}
const records = (res: any, plural: string): any[] => {
  const d = res?.data ?? res;
  const v = d?.[plural] ?? d;
  return Array.isArray(v) ? v : Array.isArray(v?.edges) ? v.edges.map((e: any) => e.node) : [];
};

// Twenty LINKS composites (match twenty-upsert.ts shapes).
const linkOne = (url: string) => ({ primaryLinkUrl: url, primaryLinkLabel: '', secondaryLinks: [] });
const linkMany = (urls: string[]) =>
  urls.length ? { primaryLinkUrl: urls[0], primaryLinkLabel: '', secondaryLinks: urls.slice(1).map((u) => ({ label: '', url: u })) } : undefined;

async function main() {
  const payload = JSON.parse(readFileSync(IN, 'utf8')) as { homes: any[] };
  const homes = (payload.homes ?? []).filter((h) => h.photosRehosted && Array.isArray(h.photoUrls) && h.photoUrls.length);
  console.log(`\n🔗 Sync re-hosted photos → Twenty — ${homes.length} homes from ${IN}  (${APPLY ? 'APPLY' : 'dry'})`);
  if (!API_URL || !API_KEY) throw new Error('needs TWENTY_API_URL + TWENTY_API_KEY');

  let done = 0, skipped = 0, failed = 0;
  for (const h of homes) {
    try {
      const id = records(await rest('GET', `homes?filter=airbnbListingId[eq]:${encodeURIComponent(h.airbnbListingId)}&depth=0&limit=1`), 'homes')[0]?.id;
      if (!id) { console.warn(`  ? no Twenty home for ${h.airbnbListingId}`); skipped++; continue; }
      const body: Record<string, unknown> = {
        photoUrls: linkMany(h.photoUrls),
        coverPhotoUrl: linkOne(h.coverPhotoUrl ?? h.photoUrls[0]),
        photoCount: h.photoUrls.length,
        photosRehosted: true,
      };
      // Carry the SAR→SDG conversion (stamped by photo-rehost --fx-rate) into the
      // CRM's CURRENCY field so the workspace shows local prices.
      if (h.priceNightSdg != null) {
        body.priceNightSdg = { amountMicros: Math.round(h.priceNightSdg * 1_000_000), currencyCode: 'SDG' };
        if (h.fxRateSarSdg != null) body.fxRateSarSdg = h.fxRateSarSdg;
        if (h.fxRateDate) body.fxRateDate = h.fxRateDate;
      }
      if (!APPLY) { console.log(`  · ${(h.title ?? '').slice(0, 34).padEnd(34)} ${h.photoUrls.length} CDN photos${h.priceNightSdg != null ? ` · ${h.priceNightSdg} SDG` : ''}`); continue; }
      await rest('PATCH', `homes/${id}`, body);
      console.log(`  ✓ ${(h.title ?? '').slice(0, 34).padEnd(34)} ${h.photoUrls.length} CDN photos`);
      done++;
    } catch (e) {
      console.warn(`  ! ${h.airbnbListingId}: ${(e as Error).message}`);
      failed++;
    }
  }
  console.log(APPLY ? `\n✅ synced ${done} homes (${skipped} skipped, ${failed} failed).\n` : `\nDRY — would sync ${homes.length} homes. Re-run with --apply.\n`);
}
main().catch((e) => { console.error(`\n❌ ${(e as Error).message}\n`); process.exit(1); });
