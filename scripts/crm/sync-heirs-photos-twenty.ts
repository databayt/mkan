/**
 * Mirror host 0001's new heirs photos into Twenty (ops view of the same truth).
 *
 * mkan Prisma is the source — `Listing.photoUrls` as it stands right now, so a
 * slot the mastering loop has already swapped mirrors as the MASTERED image
 * rather than the still it replaced. (It reads the manifest only to know which
 * units have photos at all.) This patches, per covered unit:
 *
 *   home       → photoUrls, coverPhotoUrl, photoCount, photosRehosted,
 *                photoStage = POOR_QUALITY, mkanListingId
 *   portSudan  → photoStage = FOUND_POOR     (that object carries no photo links,
 *                and its stage enum is the older one — same meaning, other word)
 *
 * POOR_QUALITY and not ACCEPTABLE on purpose: these are stills off compressed
 * phone video (358–1024px wide). They are real and honest, and they are exactly
 * what the mastering pipeline exists to improve — this stage is the flag it
 * queues on.
 *
 *   npx tsx scripts/crm/sync-heirs-photos-twenty.ts            # dry (prints the plan)
 *   npx tsx scripts/crm/sync-heirs-photos-twenty.ts --apply    # PATCH Twenty
 *
 * `mkanListingId` matters more than it looks: it is the ONLY key the mastering
 * rollup (`scripts/mastering/lib.ts → twentyRollup`) uses to find a home, and
 * `seed:heirs` mints new listing ids every time it rebuilds — so after a
 * re-seed the CRM points at ids that no longer exist and every rollup skips
 * silently with "no Twenty home carries mkanListingId=N". Re-run this after any
 * re-seed.
 *
 * Needs the CRM backend up (Docker on the Mac, port 3100 — never 3000) and the
 * mkan workspace token in the Keychain (`databayt-twenty` / `mkan`).
 */
import { config } from "dotenv";
config({ override: true });

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const ACCOUNT = "0001";
const MANIFEST = "scripts/data/heirs-photos.json";

/**
 * The two objects carry DIFFERENT photo-stage enums — `home` was rebuilt with
 * the current vocabulary, `portSudan` still has the original one. Same meaning,
 * different word; sending the home value to portSudan is a 400.
 */
const HOME_STAGE = "POOR_QUALITY";
const PORT_SUDAN_STAGE = "FOUND_POOR";

const API_URL = (process.env.TWENTY_API_URL ?? "http://localhost:3100").replace(/\/+$/, "");
const API_KEY =
  process.env.TWENTY_API_KEY ??
  execSync("security find-generic-password -s databayt-twenty -a mkan -w", {
    encoding: "utf8",
  }).trim();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rest(method: "GET" | "PATCH", path: string, body?: unknown): Promise<any> {
  await sleep(250);
  const res = await fetch(`${API_URL}/rest/${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `REST ${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 300)}`,
    );
  }
  return json;
}

const records = (res: any, plural: string): any[] => {
  const d = res?.data ?? res;
  const v = d?.[plural] ?? d;
  return Array.isArray(v) ? v : [];
};

// Twenty LINKS composites (same shapes as twenty-upsert.ts / sync-rehosted-photos.ts).
const linkOne = (url: string) => ({
  primaryLinkUrl: url,
  primaryLinkLabel: "",
  secondaryLinks: [],
});
const linkMany = (urls: string[]) => ({
  primaryLinkUrl: urls[0],
  primaryLinkLabel: "",
  secondaryLinks: urls.slice(1).map((u) => ({ label: "", url: u })),
});

type Manifest = Record<string, { heirsLabel: string; titleMatch: string; photoUrls: string[] }>;

async function main(): Promise<void> {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest;
  const covered = Object.values(manifest).filter((u) => u.photoUrls.length > 0);

  // Live truth for the photos, not the manifest's original stills.
  const prisma = (await import("@/lib/db")).db;
  const host = await prisma.user.findUnique({
    where: { email: `${ACCOUNT}@mkan.org` },
    select: { id: true },
  });
  if (!host) throw new Error(`host ${ACCOUNT}@mkan.org not found`);

  const units: Array<{
    heirsLabel: string;
    titleMatch: string;
    photoUrls: string[];
    listingId: number;
  }> = [];
  for (const u of covered) {
    const matches = await prisma.listing.findMany({
      where: { hostId: host.id, title: { contains: u.titleMatch } },
      select: { id: true, photoUrls: true },
    });
    if (matches.length !== 1) {
      console.warn(`  ! "${u.titleMatch}" matched ${matches.length} mkan listings — skipped`);
      continue;
    }
    units.push({ ...u, photoUrls: matches[0]!.photoUrls, listingId: matches[0]!.id });
  }
  console.log(
    `\n🔗 Heirs photos → Twenty — account ${ACCOUNT}, ${units.length} unit(s)  (${APPLY ? "APPLY" : "dry"})\n`,
  );

  const homes = records(await rest("GET", "homes?limit=200&depth=0"), "homes").filter(
    (h) => h.account === ACCOUNT,
  );
  const ports = records(await rest("GET", "portSudans?limit=200&depth=0"), "portSudans").filter(
    (p) => p.account === ACCOUNT,
  );

  for (const unit of units) {
    // Match on the title substring, and patch EVERY match: account 0001 has
    // duplicate `home` rows for some units (0001-01/03/05), and leaving one
    // copy claiming NOT_FOUND is how a stale view outlives the fix.
    const hits = homes.filter((h) => String(h.name ?? "").includes(unit.titleMatch));
    const portHits = ports.filter((p) => String(p.name ?? "").includes(unit.titleMatch));
    if (!hits.length && !portHits.length) {
      console.warn(`  ! "${unit.titleMatch}" matched no Twenty record — skipped`);
      continue;
    }

    const body = {
      photoUrls: linkMany(unit.photoUrls),
      coverPhotoUrl: linkOne(unit.photoUrls[0]!),
      photoCount: unit.photoUrls.length,
      photosRehosted: true,
      photoStage: HOME_STAGE,
      mkanListingId: unit.listingId,
    };

    for (const h of hits) {
      if (APPLY) await rest("PATCH", `homes/${h.id}`, body);
      console.log(
        `  ${APPLY ? "✓" : "·"} home ${h.listingId} ← ${unit.photoUrls.length} photos · mkanListingId=${unit.listingId}` +
          `${h.mkanListingId && h.mkanListingId !== unit.listingId ? ` (was ${h.mkanListingId} — stale)` : ""}  (${unit.heirsLabel})`,
      );
    }
    for (const p of portHits) {
      if (APPLY) await rest("PATCH", `portSudans/${p.id}`, { photoStage: PORT_SUDAN_STAGE });
      console.log(`  ${APPLY ? "✓" : "·"} portSudan ${p.listingId} ← photoStage=${PORT_SUDAN_STAGE}`);
    }
  }

  console.log(
    APPLY
      ? "\n✅ Twenty mirrors the listings.\n"
      : "\nDRY — nothing patched. Re-run with --apply.\n",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
