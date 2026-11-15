/**
 * pnpm crm:airbnb-match [--per=4] — how many Airbnb homes are a broker home Mkan already has
 * (kun docs mkan-airbnb.mdx, idea 1). Read-only: hashes each home's first photos (the 400-px CDN
 * variants, cached in .data/match/hashes.json so a re-run costs nothing) and prints the count, by
 * source, with up to 15 example pairs by code for a check by eye. Linking a match to the broker
 * (ListingBroker) is a later step, after those examples are checked.
 */
import { config } from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

import { variantUrl } from '../../src/lib/image-variants';
import { dHash, matchHomes, type Hashed } from './airbnb-match-pure';

config({ path: join(process.cwd(), '.env'), quiet: true });

const PER = Number(process.argv.find((a) => a.startsWith('--per='))?.slice(6) ?? 4) || 4;
const DIR = join(process.cwd(), 'scripts/crm/.data/match');
const CACHE = join(DIR, 'hashes.json');
const CONCURRENCY = 8;

async function hashOf(url: string): Promise<string | null> {
  const small = variantUrl(url, 400, 'webp') ?? url;
  for (const u of small === url ? [url] : [small, url]) {
    try {
      const res = await fetch(u);
      if (!res.ok) continue;
      const px = await sharp(Buffer.from(await res.arrayBuffer())).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
      return dHash(px);
    } catch {
      /* the next form, else none */
    }
  }
  return null;
}

async function main(): Promise<void> {
  const { db } = await import('../../src/lib/db');
  const rows = await db.listing.findMany({
    where: { source: { in: ['AIRBNB', 'TIKTOK', 'WEB', 'FACEBOOK'] } },
    select: { id: true, code: true, source: true, photoUrls: true, location: { select: { state: true } } },
  });
  mkdirSync(DIR, { recursive: true });
  const cache: Record<string, string | null> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
  const urls = [...new Set(rows.flatMap((r) => r.photoUrls.slice(0, r.source === 'AIRBNB' ? PER : 8)))].filter((u) => !(u in cache));
  console.log(`${rows.length} homes · ${urls.length} photos to hash (${Object.keys(cache).length} cached)`);
  let done = 0;
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    const hs = await Promise.all(batch.map(hashOf));
    batch.forEach((u, k) => (cache[u] = hs[k] ?? null));
    done += batch.length;
    if (done % 400 < CONCURRENCY) {
      writeFileSync(CACHE, JSON.stringify(cache));
      console.log(`  … ${done}/${urls.length}`);
    }
  }
  writeFileSync(CACHE, JSON.stringify(cache));

  const hashed = (r: (typeof rows)[number]): Hashed => ({
    id: r.id,
    hashes: r.photoUrls.slice(0, r.source === 'AIRBNB' ? PER : 8).map((u) => cache[u]).filter((h): h is string => !!h),
  });
  const airbnb = rows.filter((r) => r.source === 'AIRBNB');
  const broker = rows.filter((r) => r.source !== 'AIRBNB');
  const byId = new Map(rows.map((r) => [r.id, r]));
  const m = matchHomes(airbnb.map(hashed), broker.map(hashed));

  const bySource: Record<string, number> = {};
  let sameDistrict = 0;
  for (const [aid, ms] of m) {
    const b = byId.get(ms[0]!.id)!;
    bySource[b.source ?? '?'] = (bySource[b.source ?? '?'] ?? 0) + 1;
    if ((byId.get(aid)?.location?.state ?? '').toLowerCase() === (b.location?.state ?? '').toLowerCase()) sameDistrict++;
  }
  console.log(`\nAirbnb homes sharing a photo with a broker home: ${m.size} of ${airbnb.length}`);
  console.log(`  closest match by source: ${Object.entries(bySource).map(([s, n]) => `${s} ${n}`).join(', ') || '—'}`);
  console.log(`  same district too: ${sameDistrict}`);
  console.log(`\nexamples (Airbnb → broker home, bits apart):`);
  for (const [aid, ms] of [...m].slice(0, 15)) {
    const a = byId.get(aid)!;
    console.log(`  ${a.code ?? a.id} → K${ms[0]!.id} (${ms[0]!.distance})${ms.length > 1 ? ` +${ms.length - 1} more` : ''}`);
  }
  console.log('\nnothing changed (read-only)');
}

main()
  .then(async () => (await import('../../src/lib/db')).db.$disconnect())
  .catch((e) => {
    console.error(`\n❌ ${(e as Error).message}\n`);
    process.exit(1);
  });
