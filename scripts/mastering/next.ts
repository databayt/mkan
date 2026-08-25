/**
 * Serial mode — one photo through the whole loop before the next one starts.
 *
 *   pnpm master:next --listing=1180          # promote the next photo, if the coast is clear
 *   pnpm master:next --listing=1180 --no-prep
 *   pnpm master:next --listing=1180 --force  # promote even though one is in flight
 *
 * The batch lane stages a listing's whole set at once and lets the human pick
 * an order. That is efficient and completely opaque: with nine tasks open,
 * nothing tells you which photo is actually moving. Serial mode keeps exactly
 * ONE run in flight per listing — promote, generate, apply, then promote the
 * next — so `master:status` reads as a position rather than a pile.
 *
 * Two decisions worth knowing:
 *
 *   - **The gate is per LISTING, not global.** A global one-at-a-time rule
 *     would let one listing's parked run block every other listing in the
 *     backlog, which is how a queue becomes a deadlock.
 *   - **Promotion order is (photoIndex, attempt), not queuedAt.** A rejected
 *     photo's retry row is created later, so ordering by time would send it to
 *     the back of the queue — the opposite of "finish this photo first".
 *
 * In flight means ASSIGNED (waiting on the human) or MASTERED (returned, not
 * yet applied). UPDATED, REJECTED and FAILED are all terminal for the gate:
 * REJECTED already spawned its retry row, which is what gets promoted next.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import { argv, flag, getDb, shortId, trim } from "./lib";
import { roomHintFrom } from "./pure";

const LISTING = parseInt(argv("listing", ""), 10);
const FORCE = flag("force");
const NO_PREP = flag("no-prep") || trim(process.env.MASTERING_SERIAL_PREP) === "0";

/** Waiting on a human, or returned but not yet live — either way, the slot is taken. */
const IN_FLIGHT = ["ASSIGNED", "MASTERED"] as const;

const INBOX = trim(process.env.MASTERING_INBOX) || join(homedir(), "mkan", "inbox");
const ORIGINALS = join(INBOX, "originals");
const CONSUMED = join(INBOX, "consumed");

/**
 * Leave the working folders holding exactly the photo in flight, and nothing
 * else. In serial mode these folders answer one question — "what am I working
 * on?" — and an archive of finished work answers it wrongly: a stale original
 * from a reverted run is indistinguishable from the live task.
 *
 * Deleting is safe because neither file is the record. The original lives
 * forever at `MasteringRun.originalUrl` and the render at `masteredUrl`, both
 * on the CDN, so anything swept here is one fetch from coming back. What is
 * never deleted is the CDN object or the run row.
 */
function tidyInbox(keepPrefix?: string): number {
  let removed = 0;
  for (const dir of [ORIGINALS, CONSUMED]) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".")) continue;
      if (keepPrefix && name.startsWith(keepPrefix)) continue;
      try {
        rmSync(join(dir, name));
        removed++;
      } catch {
        // A file we cannot remove is clutter, never a reason to stop the loop.
      }
    }
  }
  return removed;
}

/**
 * Put the run's original in `originals/` under the run id, so the human can
 * drag it straight into the generator and the name carries the id back out on
 * the render. `prep` only reveals a temp copy — that suits the clipboard lane,
 * not the drag lane.
 */
async function stageOriginal(run: { id: string; photoIndex: number; originalUrl: string }): Promise<string | null> {
  try {
    mkdirSync(ORIGINALS, { recursive: true });
    const hint = roomHintFrom(run.originalUrl) || `photo${run.photoIndex + 1}`;
    const ext = extname(new URL(run.originalUrl).pathname) || ".jpg";
    const name = `${shortId(run.id)} ${hint}${ext}`;
    const res = await fetch(run.originalUrl);
    if (!res.ok) return null;
    writeFileSync(join(ORIGINALS, name), Buffer.from(await res.arrayBuffer()));
    return name;
  } catch {
    return null; // the clipboard lane still works; staging is a convenience
  }
}

/** Sweep both folders bare — used when a listing has no next photo to promote. */
export function tidyInboxAll(): number {
  return tidyInbox();
}

export async function promoteNext(
  listingId: number,
  opts: { prep: boolean; force: boolean },
): Promise<string | null> {
  const db = await getDb();

  if (!opts.force) {
    const busy = await db.masteringRun.findFirst({
      where: { listingId, status: { in: [...IN_FLIGHT] } },
      orderBy: [{ photoIndex: "asc" }, { attempt: "asc" }],
      select: { id: true, photoIndex: true, status: true },
    });
    if (busy) {
      console.log(
        `\n⏸  #${listingId} is busy — ${shortId(busy.id)} (photo ${busy.photoIndex + 1}) is ${busy.status}.` +
          `\n   Finish it, or pass --force.\n`,
      );
      return null;
    }
  }

  const next = await db.masteringRun.findFirst({
    where: { listingId, status: "QUEUED" },
    // See the header: photo order, then attempt — a retry belongs at the front.
    orderBy: [{ photoIndex: "asc" }, { attempt: "asc" }],
    select: { id: true, photoIndex: true, attempt: true, originalUrl: true },
  });
  if (!next) {
    const swept = tidyInbox();
    console.log(
      `\n✅ #${listingId} — nothing QUEUED. The listing is done, or every photo is already live.` +
        (swept ? `\n   inbox tidied (${swept} file(s) removed)` : "") +
        "\n",
    );
    return null;
  }

  const ref = shortId(next.id);
  console.log(
    `\n▶ promoting ${ref} — photo ${next.photoIndex + 1} (attempt ${next.attempt}) of #${listingId}`,
  );
  const dispatched = spawnSync("pnpm", ["master:dispatch", `--run=${ref}`, "--apply"], {
    stdio: "inherit",
  });
  if (dispatched.status !== 0) {
    console.log(`\n✗ dispatch failed for ${ref} — it stays QUEUED, nothing is lost.\n`);
    return null;
  }
  const staged = await stageOriginal(next);
  const swept = tidyInbox(ref);
  if (staged) console.log(`   staged for the drag: originals/${staged}`);
  if (swept) console.log(`   inbox tidied (${swept} file(s) removed)`);
  if (opts.prep) spawnSync("pnpm", ["master:prep", "--standing", ref], { stdio: "inherit" });
  return ref;
}

async function main(): Promise<void> {
  if (!Number.isFinite(LISTING)) {
    console.log("\nusage: pnpm master:next --listing=<id> [--no-prep] [--force]\n");
    process.exit(1);
  }
  await promoteNext(LISTING, { prep: !NO_PREP, force: FORCE });
}

// Only run as a CLI — done.ts imports promoteNext directly.
if (process.argv[1]?.endsWith("next.ts")) {
  main().catch((e: unknown) => {
    console.error(`\n❌ ${(e as Error).message}\n`);
    process.exit(1);
  });
}
