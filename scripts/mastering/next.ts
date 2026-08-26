/**
 * Serial mode — one photo through the whole loop before the next one starts.
 *
 *   pnpm master:next                         # promote the next photo anywhere
 *   pnpm master:next --listing=1180          # …within one listing
 *   pnpm master:next --no-prep
 *   pnpm master:next --force                 # promote even though one is in flight
 *
 * The batch lane stages a listing's whole set at once and lets the human pick
 * an order. That is efficient and completely opaque: with nine tasks open,
 * nothing tells you which photo is actually moving. Serial mode keeps exactly
 * ONE run in flight per listing — promote, generate, apply, then promote the
 * next — so `master:status` reads as a position rather than a pile.
 *
 * With no --listing it works the whole queue, oldest first. That is the normal
 * mode now: every photo in the CRM that has never been mastered is queued, so
 * there are ~1000 of them and they take turns. `--listing` narrows it to one
 * home when you want to finish that home.
 *
 * Two decisions worth knowing:
 *
 *   - **The global gate is a cap, not a lock.** `MASTERING_IN_FLIGHT` (default
 *     1) is how many photos may be waiting on a human at once. The old warning
 *     against a global gate — one parked run blocks the whole backlog — was
 *     right when nothing watched for a parked run. The stall clock does now:
 *     an ASSIGNED run past 48h alarms in #mkan, so a stuck photo blocks the
 *     line loudly rather than silently.
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
import { PROMPT_VERSION } from "./prompt";
import { roomHintFrom } from "./pure";

const LISTING = parseInt(argv("listing", ""), 10);
const FORCE = flag("force");
/** How many photos may sit with a human at once, across every listing. */
const IN_FLIGHT_CAP = Math.max(1, parseInt(trim(process.env.MASTERING_IN_FLIGHT) || "1", 10));
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
  listingId: number | null,
  opts: { prep: boolean; force: boolean },
): Promise<string | null> {
  const db = await getDb();
  const scope = listingId ? { listingId } : {};
  const where = listingId ? `#${listingId}` : "the queue";

  if (!opts.force) {
    const busy = await db.masteringRun.findMany({
      where: { ...scope, status: { in: [...IN_FLIGHT] } },
      orderBy: [{ listingId: "asc" }, { photoIndex: "asc" }, { attempt: "asc" }],
      select: { id: true, listingId: true, photoIndex: true, status: true },
    });
    // Per listing the cap is 1 — finishing a home beats spreading across homes.
    const cap = listingId ? 1 : IN_FLIGHT_CAP;
    if (busy.length >= cap) {
      const shown = busy
        .slice(0, 3)
        .map((b) => `${shortId(b.id)} (#${b.listingId} photo ${b.photoIndex + 1}, ${b.status})`)
        .join(", ");
      console.log(
        `\n⏸  ${where} is busy — ${busy.length}/${cap} in flight: ${shown}${busy.length > 3 ? ", …" : ""}.` +
          `\n   Finish one, or pass --force.\n`,
      );
      return null;
    }
  }

  const next = await db.masteringRun.findFirst({
    where: { ...scope, status: "QUEUED" },
    // Within a photo: attempt order, so a retry goes first. Across the queue:
    // oldest first, so a photo queued in the sweep waits its actual turn.
    orderBy: listingId
      ? [{ photoIndex: "asc" }, { attempt: "asc" }]
      : [{ queuedAt: "asc" }, { attempt: "asc" }],
    select: {
      id: true, listingId: true, photoIndex: true, attempt: true,
      originalUrl: true, promptVersion: true,
    },
  });
  if (!next) {
    const swept = tidyInbox();
    console.log(
      `\n✅ ${where} — nothing QUEUED. Everything is live, or nothing is waiting.` +
        (swept ? `\n   inbox tidied (${swept} file(s) removed)` : "") +
        "\n",
    );
    return null;
  }

  // A photo queued months ago carries the prompt of that day, frozen and
  // unchangeable — which is right for the record and wrong for the render. The
  // sweep stamps a thousand rows at once, so by the time most of them are
  // promoted the canonical prompt has probably moved on. Supersede rather than
  // rewrite: the old row is REJECTED with the reason, and reject mints a fresh
  // attempt carrying today's prompt. Nothing is edited, nothing is lost.
  if (next.promptVersion !== PROMPT_VERSION) {
    console.log(
      `\n↻ ${shortId(next.id)} was queued under prompt ${next.promptVersion}; the canonical prompt is ` +
        `${PROMPT_VERSION} — superseding it before anyone renders from stale words.`,
    );
    const superseded = spawnSync(
      "pnpm",
      ["master:reject", shortId(next.id), `--note=superseded by prompt ${PROMPT_VERSION}`],
      { stdio: "inherit" },
    );
    if (superseded.status !== 0) {
      console.log(`\n✗ could not supersede ${shortId(next.id)} — leaving it QUEUED.\n`);
      return null;
    }
    return promoteNext(listingId, opts);
  }

  const ref = shortId(next.id);
  console.log(
    `\n▶ promoting ${ref} — photo ${next.photoIndex + 1} (attempt ${next.attempt}) of #${next.listingId}`,
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
  await promoteNext(Number.isFinite(LISTING) ? LISTING : null, { prep: !NO_PREP, force: FORCE });
}

// Only run as a CLI — done.ts imports promoteNext directly.
if (process.argv[1]?.endsWith("next.ts")) {
  main().catch((e: unknown) => {
    console.error(`\n❌ ${(e as Error).message}\n`);
    process.exit(1);
  });
}
