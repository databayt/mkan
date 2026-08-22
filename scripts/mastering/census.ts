/**
 * Photo-quality census — which listings can enter mastering, which cannot yet.
 *
 *   pnpm master:census                    # full census, prints table + writes artifact
 *   pnpm master:census --limit=12         # first N listings only
 *   pnpm master:census --no-download      # classify hosts only, skip measuring
 *
 * Read-only against the DB. Downloads each photo once into
 * `.data/photo-cache/<listingId>/` (kept — the mastering grid reuses it) and
 * measures dimensions with `sips` (macOS built-in), then files every listing
 * into one of three lanes:
 *
 *   REHOST  — photos hotlink a0.muscache.com. next.config only allows the CDN,
 *             and muscache URLs rot/block, so these listings cannot enter
 *             mastering (queue.ts skips external URLs) until re-hosted to S3.
 *   QUEUE   — CDN-hosted but low quality (min side < 1080px, or < 80KB) —
 *             ready for `master:queue`.
 *   OK      — CDN-hosted, no photo under the floor.
 *
 * Artifact: `.data/photo-census.json` — the queue/rehost steps read it, and a
 * re-run overwrites it (a census is a measurement, not history).
 */
import { argv, flag, getDb, trim } from "./lib";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const LIMIT = parseInt(argv("limit", "0"), 10) || 0;
const NO_DOWNLOAD = flag("no-download");
const OUT = "scripts/crm/.data/photo-census.json";
const CACHE = "scripts/crm/.data/photo-cache";

const MIN_SIDE = 1080; // below this, a cover photo pixelates on a phone
const MIN_BYTES = 80_000;

type Lane = "REHOST" | "QUEUE" | "OK" | "NO_PHOTOS";

interface PhotoFact {
  index: number; // 1-based, matches master:queue --photos
  url: string;
  host: "cdn" | "muscache" | "other";
  bytes?: number;
  width?: number;
  height?: number;
  lowQuality?: boolean;
  error?: string;
}

const hostOf = (u: string): PhotoFact["host"] => {
  try {
    const h = new URL(u).hostname;
    if (h === "cdn.databayt.org" || h.endsWith(".amazonaws.com") || h.endsWith(".cloudfront.net"))
      return "cdn";
    if (h.endsWith("muscache.com")) return "muscache";
    return "other";
  } catch {
    return "other";
  }
};

async function download(url: string, dest: string): Promise<number> {
  if (existsSync(dest) && statSync(dest).size > 0) return statSync(dest).size;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (mkan photo census)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  return buf.length;
}

function dimensions(file: string): { width: number; height: number } | null {
  try {
    const out = execSync(`sips -g pixelWidth -g pixelHeight "${file}"`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const w = out.match(/pixelWidth: (\d+)/)?.[1];
    const h = out.match(/pixelHeight: (\d+)/)?.[1];
    return w && h ? { width: parseInt(w, 10), height: parseInt(h, 10) } : null;
  } catch {
    return null;
  }
}

async function main() {
  const db = await getDb();
  const listings = await db.listing.findMany({
    select: {
      id: true,
      title: true,
      photoUrls: true,
      source: true,
      sourceListingId: true,
      isPublished: true,
      draft: true,
      claimedAt: true,
      hostId: true,
    },
    orderBy: { id: "asc" },
    ...(LIMIT ? { take: LIMIT } : {}),
  });

  const rows: Array<{
    listingId: number;
    sourceListingId: string | null;
    title: string;
    lane: Lane;
    published: boolean;
    claimed: boolean;
    photos: PhotoFact[];
    lowCount: number;
    muscacheCount: number;
  }> = [];

  for (const l of listings) {
    const photos: PhotoFact[] = [];
    for (let i = 0; i < l.photoUrls.length; i++) {
      const url = l.photoUrls[i];
      const fact: PhotoFact = { index: i + 1, url, host: hostOf(url) };
      if (!NO_DOWNLOAD) {
        const dir = join(CACHE, String(l.id));
        mkdirSync(dir, { recursive: true });
        const ext = extname(new URL(url).pathname) || ".jpg";
        const dest = join(dir, `${i + 1}${ext}`);
        try {
          fact.bytes = await download(url, dest);
          const dim = dimensions(dest);
          if (dim) Object.assign(fact, dim);
          fact.lowQuality =
            (fact.width != null && Math.min(fact.width, fact.height ?? 0) < MIN_SIDE) ||
            (fact.bytes != null && fact.bytes < MIN_BYTES);
        } catch (e) {
          fact.error = e instanceof Error ? e.message : String(e);
        }
      }
      photos.push(fact);
    }

    const muscacheCount = photos.filter((p) => p.host === "muscache").length;
    const lowCount = photos.filter((p) => p.lowQuality).length;
    const lane: Lane = !photos.length
      ? "NO_PHOTOS"
      : muscacheCount > 0
        ? "REHOST"
        : lowCount > 0
          ? "QUEUE"
          : "OK";

    rows.push({
      listingId: l.id,
      sourceListingId: l.sourceListingId,
      title: trim(l.title) || "(untitled)",
      lane,
      published: l.isPublished,
      claimed: !!l.claimedAt,
      photos,
      lowCount,
      muscacheCount,
    });
  }

  const byLane = (lane: Lane) => rows.filter((r) => r.lane === lane);
  console.log(`\n═══ Photo census — ${rows.length} listings ═══`);
  console.log(`  REHOST (muscache hotlinks) ${byLane("REHOST").length}`);
  console.log(`  QUEUE  (cdn, low quality)  ${byLane("QUEUE").length}`);
  console.log(`  OK                         ${byLane("OK").length}`);
  console.log(`  NO_PHOTOS                  ${byLane("NO_PHOTOS").length}\n`);

  for (const r of rows.filter((x) => x.lane !== "OK")) {
    const worst = r.photos
      .filter((p) => p.lowQuality)
      .map((p) => `#${p.index} ${p.width}x${p.height}`)
      .slice(0, 4)
      .join(" · ");
    console.log(
      `  [${r.lane}] ${r.listingId} ${r.sourceListingId ?? ""} ${r.title.slice(0, 44)}` +
        `\n         photos ${r.photos.length} · muscache ${r.muscacheCount} · low ${r.lowCount}` +
        (worst ? ` · ${worst}` : "") +
        ` · published=${r.published} claimed=${r.claimed}`,
    );
  }

  writeFileSync(
    OUT,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), minSide: MIN_SIDE, minBytes: MIN_BYTES, rows },
      null,
      2,
    ),
  );
  console.log(`\n  artifact → ${OUT}`);
  if (!NO_DOWNLOAD)
    console.log(`  photo cache → ${CACHE}/<listingId>/ (reused by the mastering grid)`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
