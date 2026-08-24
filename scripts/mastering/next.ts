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
import { argv, flag, getDb, shortId, trim } from "./lib";

const LISTING = parseInt(argv("listing", ""), 10);
const FORCE = flag("force");
const NO_PREP = flag("no-prep") || trim(process.env.MASTERING_SERIAL_PREP) === "0";

/** Waiting on a human, or returned but not yet live — either way, the slot is taken. */
const IN_FLIGHT = ["ASSIGNED", "MASTERED"] as const;

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
    select: { id: true, photoIndex: true, attempt: true },
  });
  if (!next) {
    console.log(
      `\n✅ #${listingId} — nothing QUEUED. The listing is done, or every photo is already live.\n`,
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
