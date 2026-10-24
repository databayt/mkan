/**
 * Listing-photo variants — every CDN photo gets its pre-made AVIF + WebP ladder.
 *
 * For each photo it writes `<base>-{sm,md,lg}.{webp,avif}` beside the original
 * (src/lib/image-variants.ts), so cf/worker.js answers /_next/image straight
 * from the CDN and the one half-vCPU container never resizes a listing photo
 * on request. A cold /listings page queued ~20 s of AVIF encodes there
 * (2026-10-23). Mirrors scripts/process-stock-images.ts.
 *
 * Run (GitHub Actions does this hourly — .github/workflows/listing-images.yml):
 *   pnpm images:variants --since=3            photos of listings changed in the last 3 h
 *   pnpm images:variants --all --shard=0/20   every photo, one shard of twenty
 *   pnpm images:variants --listing=0001-01    one listing, by code or id
 *   pnpm images:variants --assets --profile=default
 *        mkan's own art + stock photos (the app key can only write mkan/uploads/*,
 *        so this one runs on the Mac with the `hogwarts` profile)
 *   flags: --concurrency=N (encodes, default = cores) --limit=N --dry-run
 *
 * Idempotent: a photo whose lg.avif — always written last — answers 200 on the
 * CDN is skipped, so re-runs and overlapping windows cost one HEAD per photo.
 */
import "dotenv/config";
import { readdirSync, readFileSync, appendFileSync } from "fs";
import { cpus } from "os";
import { join } from "path";
import sharp from "sharp";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  VARIANT_CACHE_CONTROL,
  VARIANT_ENCODE,
  hasVariants,
  variantBaseKey,
  variantFiles,
} from "@/lib/image-variants";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string) =>
  argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const CDN = process.env.NEXT_PUBLIC_CDN_DOMAIN?.trim() || "cdn.databayt.org";
const BUCKET = process.env.AWS_S3_BUCKET?.trim() || "databayt-cdn";
const DRY = flag("dry-run");
const LIMIT = Number(opt("limit")) || Infinity;
const ENCODES = Number(opt("concurrency")) || cpus().length;
const HEADS = 32;
const [SHARD, SHARDS] = (opt("shard") ?? "0/1").split("/").map(Number);

const MARKER = variantFiles().at(-1)!; // lg.avif: present ⇒ the whole set is

// ── sources ─────────────────────────────────────────────────────────────────

type Item = { url: string; tier: number };

/** Every listing photo, published covers first: what visitors see soonest. */
async function listingItems(): Promise<Item[]> {
  const { db } = await import("@/lib/db");
  // Neon suspends when idle and a scheduled job has no warm-up — knock first.
  for (let attempt = 1; ; attempt++) {
    try {
      await db.$queryRaw`SELECT 1`;
      break;
    } catch (e) {
      if (attempt === 5) throw e;
      await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
    }
  }
  const since = Number(opt("since"));
  const listing = opt("listing");
  const rows = await db.listing.findMany({
    where: {
      photoUrls: { isEmpty: false },
      ...(since ? { updatedAt: { gte: new Date(Date.now() - since * 3_600_000) } } : {}),
      ...(listing ? (/^\d+$/.test(listing) ? { id: Number(listing) } : { code: listing }) : {}),
    },
    select: { isPublished: true, photoUrls: true },
    orderBy: [{ isPublished: "desc" }, { createdAt: "desc" }],
  });
  await db.$disconnect();
  // Tier: the cover, then what a card's carousel and the gallery show next.
  return rows.flatMap((r) =>
    r.photoUrls.map((url, i) => ({
      url,
      tier: (r.isPublished ? 0 : 3) + (i === 0 ? 0 : i <= 4 ? 1 : 2),
    })),
  );
}

/** mkan's own art (every `cdn.product("…")` raster in src/) plus the stock pool. */
async function assetItems(): Promise<Item[]> {
  const urls = new Set<string>();
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx?|jsx?)$/.test(e.name)) {
        const text = readFileSync(p, "utf8");
        for (const m of text.matchAll(/cdn\.product\(\s*["'`]([^"'`$]+\.(?:jpe?g|png|webp))["'`]/g)) {
          urls.add(`https://${CDN}/mkan/${m[1]}`);
        }
        for (const m of text.matchAll(/https:\/\/cdn\.databayt\.org\/mkan\/[^"'`\s)]+\.(?:jpe?g|png|webp)/g)) {
          if (!m[0].includes("/uploads/")) urls.add(m[0]);
        }
      }
    }
  };
  walk(join(process.cwd(), "src"));
  const { STOCK_BLUR } = await import("@/lib/stock-blur-map");
  for (const url of Object.keys(STOCK_BLUR)) urls.add(url);
  return [...urls].map((url) => ({ url, tier: 0 }));
}

// FNV-1a: a stable shard for each URL, whatever order the rows come back in.
function shardOf(url: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) h = Math.imul(h ^ url.charCodeAt(i), 0x01000193);
  return (h >>> 0) % SHARDS;
}

// ── work ────────────────────────────────────────────────────────────────────

async function fetchRetry(url: string, init?: RequestInit, tries = 3): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
      if (res.status < 500 || attempt === tries) return res;
    } catch (e) {
      if (attempt === tries) throw e;
    }
    await new Promise((r) => setTimeout(r, attempt * 1500));
  }
}

const markerUrl = (url: string) =>
  `https://${CDN}/${variantBaseKey(url)}-${MARKER.suffix}.${MARKER.format}`;

async function isDone(url: string): Promise<boolean> {
  const res = await fetchRetry(markerUrl(url), { method: "HEAD" });
  return res.status === 200;
}

function s3Key(url: string, suffix: string, format: string): string {
  const base = variantBaseKey(url);
  let key = base;
  try {
    key = decodeURIComponent(base); // S3 keys are stored unescaped
  } catch {}
  return `${key}-${suffix}.${format}`;
}

type Outcome = "made" | "missing" | "denied";

async function makeVariants(s3: S3Client, url: string): Promise<Outcome> {
  const res = await fetchRetry(url);
  if (res.status === 403 || res.status === 404) return "missing"; // original gone
  if (!res.ok) throw new Error(`GET ${res.status}`);
  const source = sharp(Buffer.from(await res.arrayBuffer()), { failOn: "none" }).rotate();
  for (const f of variantFiles()) {
    const resized = source.clone().resize({ width: f.width, withoutEnlargement: true });
    const body =
      f.format === "avif"
        ? await resized.avif(VARIANT_ENCODE.avif).toBuffer()
        : await resized.webp(VARIANT_ENCODE.webp).toBuffer();
    if (DRY) continue;
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: s3Key(url, f.suffix, f.format),
          Body: body,
          ContentType: `image/${f.format}`,
          CacheControl: VARIANT_CACHE_CONTROL,
        }),
      );
    } catch (e) {
      if ((e as { name?: string }).name === "AccessDenied") return "denied";
      throw e;
    }
  }
  return "made";
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

// ── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const modes = ["all", "since", "listing", "assets"].filter((m) => flag(m) || opt(m));
  if (modes.length !== 1) {
    console.error("Pick one: --all | --since=<hours> | --listing=<code|id> | --assets");
    process.exit(2);
  }
  const profile = opt("profile");
  if (profile) {
    // Use ~/.aws credentials instead of the app key that .env carries.
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_SESSION_TOKEN;
    process.env.AWS_PROFILE = profile;
  }
  sharp.concurrency(1); // one thread per photo; the pool runs one photo per core
  sharp.cache(false);
  const s3 = new S3Client({ region: process.env.AWS_REGION?.trim() || "us-east-1" });

  const raw = modes[0] === "assets" ? await assetItems() : await listingItems();
  const best = new Map<string, number>();
  for (const { url, tier } of raw) {
    if (hasVariants(url, CDN) && tier < (best.get(url) ?? Infinity)) best.set(url, tier);
  }
  const items = [...best.entries()]
    .map(([url, tier]) => ({ url, tier }))
    .filter((it) => shardOf(it.url) === SHARD)
    .sort((a, b) => a.tier - b.tier)
    .slice(0, LIMIT);
  const label = `[${modes[0]} ${SHARD}/${SHARDS}]`;
  console.log(`${label} ${items.length} photos (of ${best.size}) · ${ENCODES} encoders${DRY ? " · DRY RUN" : ""}`);

  const todo: string[] = [];
  let checked = 0;
  await pool(items, HEADS, async ({ url }) => {
    if (!(await isDone(url).catch(() => false))) todo.push(url);
    if (++checked % 2000 === 0) console.log(`${label} checked ${checked}/${items.length} · ${todo.length} to make`);
  });
  // The pool finishes out of order; keep visitors' order (covers first).
  const order = new Map(items.map((it, i) => [it.url, i]));
  todo.sort((a, b) => order.get(a)! - order.get(b)!);
  console.log(`${label} ${items.length - todo.length} already done · ${todo.length} to make`);

  const count: Record<Outcome | "failed", number> = { made: 0, missing: 0, denied: 0, failed: 0 };
  const started = Date.now();
  let finished = 0;
  await pool(todo, ENCODES, async (url) => {
    try {
      count[await makeVariants(s3, url)]++;
    } catch (e) {
      count.failed++;
      if (count.failed <= 20) console.warn(`${label} ✗ ${url} — ${(e as Error).message}`);
    }
    if (++finished % 100 === 0 || finished === todo.length) {
      const rate = finished / ((Date.now() - started) / 1000);
      const eta = Math.round((todo.length - finished) / rate / 60);
      console.log(`${label} ${finished}/${todo.length} · ${JSON.stringify(count)} · ${rate.toFixed(1)}/s · eta ${eta}m`);
    }
  });

  const summary = { mode: modes[0], shard: `${SHARD}/${SHARDS}`, photos: items.length, done: items.length - todo.length, ...count };
  console.log(`${label} summary ${JSON.stringify(summary)}`);
  if (count.denied) console.log(`${label} ${count.denied} sit outside mkan/uploads/* — run --assets --profile=default on the Mac`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `| shard | photos | already done | made | missing | denied | failed |\n|---|---|---|---|---|---|---|\n` +
        `| ${summary.shard} | ${summary.photos} | ${summary.done} | ${count.made} | ${count.missing} | ${count.denied} | ${count.failed} |\n`,
    );
  }
  // Transient failures retry on the next run; a wall of them is a real fault.
  if (count.failed > Math.max(10, todo.length * 0.05)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
