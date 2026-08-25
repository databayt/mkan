/**
 * The inbox relay — save a render into a folder, the loop takes it from there.
 *
 *   pnpm master:relay              # ingest whatever is waiting in the inbox
 *   pnpm master:relay --dry        # resolve + report, touch nothing
 *   pnpm master:relay --inbox=<dir>
 *
 * The other return lanes both ask the human to carry the file: `--from-slack`
 * pulls it out of the task thread (the phone lane), `--file=` needs a path
 * typed at a terminal. This one asks for nothing: Gemini's "Save image as…"
 * remembers its last folder, so once the inbox is picked the human's whole
 * remaining job is ⌘S. A launchd WatchPaths agent fires this script the moment
 * a file lands (install-relay-watch.sh); running it by hand does the same work.
 *
 * Inbox: `~/mkan/inbox` (gitignored), or $MASTERING_INBOX. Consumed files move
 * to `<inbox>/consumed/` — kept, never deleted, so a bad ingest can be redone
 * by dragging the file back out.
 *
 * ── Which run does a dropped file belong to? ──────────────────────────────
 *
 * Prefix the file with the run id (`kbbvvatd Codex Image ….png`) and it goes to
 * that run — the rest of the name is left alone on purpose, see below. With
 * no hint, the relay takes the single waiting run — and if several are waiting
 * it refuses, leaves the file, and says so in #mkan. That refusal is the point:
 * this pipeline's first real return depicted the WRONG room and only a human
 * eye caught it (docs §honesty). Dropping a file in the inbox stands in for
 * the approve click — the human already looked at the render in Gemini before
 * saving it — but it must never stand in for knowing which photo it is.
 *
 * Set MASTERING_RELAY_CONFIRM=1 to keep the eyeball: the relay then only
 * reports what it would ingest and leaves `pnpm master:done <run> --file=…`
 * to the human.
 *
 * Keep the tool's own filename when you add the run id — `kbbvvatd Codex Image
 * ….png`. The generator's download name is the only evidence of what actually
 * rendered the photo, and renaming to a bare `kbbvvatd.png` throws it away;
 * the relay reads the signature off the dropped name and asserts it to `done`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join, basename } from "node:path";

import { argv, flag, getDb, shortId, slackPost, slackReady, trim } from "./lib";
import { detectModel } from "./models";

const DRY = flag("dry");
const CONFIRM_ONLY = process.env.MASTERING_RELAY_CONFIRM === "1";
const INBOX = argv("inbox") || process.env.MASTERING_INBOX || join(homedir(), "mkan", "inbox");
const CONSUMED = join(INBOX, "consumed");
/**
 * A second place a render can land: the browser's own download folder, so the
 * human never has to choose a folder in the save dialog. Opt-in, because this
 * folder belongs to the whole machine rather than to this pipeline.
 */
const WATCH_DOWNLOADS = trim(process.env.MASTERING_WATCH_DOWNLOADS) === "1";
const DOWNLOADS = trim(process.env.MASTERING_DOWNLOADS) || join(homedir(), "Downloads");

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
/** A file still being written must not be ingested half-formed. */
const SETTLE_MS = 3_000;

interface Waiting {
  id: string;
  short: string;
  status: string;
  assignedAt: Date | null;
  photoIndex: number;
  listingId: number;
}

/** Settled image files in one directory — partial writes excluded. */
function settledImages(dir: string, accept: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const now = Date.now();
  return readdirSync(dir)
    .filter((f) => !f.startsWith(".") && IMAGE_EXT.has(extname(f).toLowerCase()) && accept(f))
    .map((f) => join(dir, f))
    .filter((p) => {
      try {
        return statSync(p).isFile();
      } catch {
        return false; // vanished between readdir and stat
      }
    })
    .filter((p) => {
      const st = statSync(p);
      if (now - st.mtimeMs < SETTLE_MS) return false; // still landing
      // Second read: a file growing under us changes size between stats.
      return statSync(p).size === st.size && st.size > 0;
    });
}

/**
 * Renders waiting to be ingested, oldest first.
 *
 * The inbox is ours, so anything image-shaped in it is a render meant for us.
 * `~/Downloads` is NOT ours — it is the whole machine's junk drawer, and the
 * sole-waiting-run fallback would happily master an unrelated screenshot into
 * a live listing. So a file there is only considered when its NAME proves a
 * generator produced it (`ChatGPT Image …`, `Gemini_Generated_Image…`), which
 * is the same evidence `done` already uses to record which model really ran.
 */
function inboxFiles(): string[] {
  const all = [
    ...settledImages(INBOX, () => true),
    ...(WATCH_DOWNLOADS ? settledImages(DOWNLOADS, (f) => detectModel(f) !== null) : []),
  ];
  return all.sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
}

/**
 * Resolve the run a file belongs to. Returns the run, or a refusal reason —
 * never a guess.
 */
function resolveRun(file: string, waiting: Waiting[]): { run?: Waiting; refuse?: string } {
  const stem = basename(file, extname(file)).toLowerCase();
  const named = waiting.filter((w) => stem.includes(w.short.toLowerCase()) || stem.includes(w.id));
  if (named.length === 1) return { run: named[0] };
  if (named.length > 1) {
    return { refuse: `the filename names ${named.length} waiting runs — rename it to exactly one` };
  }
  if (!waiting.length) return { refuse: "no run is waiting (nothing QUEUED or ASSIGNED)" };
  // Only a DISPATCHED run can have a render: a QUEUED photo was never handed to
  // anyone, so nobody could have generated for it. Including QUEUED here made
  // the unnamed-file fallback useless the moment a listing had a backlog — a
  // whole queue counted as "waiting" and every drop was refused as ambiguous.
  // An explicit run id in the filename still wins over all of this, above.
  const dispatched = waiting.filter((w) => w.status === "ASSIGNED");
  if (dispatched.length === 1) return { run: dispatched[0] };
  if (!dispatched.length) {
    return {
      refuse:
        `no run is dispatched — ${waiting.length} are QUEUED but none was handed out. ` +
        `Promote one (\`pnpm master:next --listing=<id>\`) or name the run in the filename`,
    };
  }
  return {
    refuse:
      `${dispatched.length} runs are dispatched and the filename names none of them — ` +
      `PREFIX it with the run id and keep the tool's own name ` +
      `(\`kbbvvatd Codex Image ….png\`): ${dispatched.map((w) => w.short).join(", ")}`,
  };
}

async function announce(text: string): Promise<void> {
  console.log(text.replace(/[`*]/g, ""));
  if (!DRY && slackReady()) await slackPost(text).catch(() => undefined);
}

async function main(): Promise<void> {
  mkdirSync(INBOX, { recursive: true });
  const files = inboxFiles();
  console.log(`\n📥 Mastering relay — ${INBOX}  (${files.length} file(s)${DRY ? ", dry" : ""})`);
  if (!files.length) {
    console.log("   nothing waiting\n");
    return;
  }

  const db = await getDb();
  let ingested = 0;

  for (const file of files) {
    const runs = await db.masteringRun.findMany({
      where: { status: { in: ["QUEUED", "ASSIGNED"] } },
      orderBy: { queuedAt: "asc" },
      select: { id: true, photoIndex: true, listingId: true, status: true, assignedAt: true },
    });
    const waiting: Waiting[] = runs.map((r) => ({ ...r, short: shortId(r.id) }));

    const { run, refuse } = resolveRun(file, waiting);
    if (!run) {
      await announce(
        `:inbox_tray: Mastering relay left \`${basename(file)}\` in the inbox — ${refuse}.`,
      );
      continue;
    }

    // A render cannot pre-date the task it answers. Without this, a months-old
    // image sitting in ~/Downloads is a valid candidate for whatever run
    // happens to be dispatched — which is the wrong-photo-in-the-right-slot
    // failure this pipeline exists to prevent, arriving automatically. A file
    // the human explicitly named by run id is trusted regardless: naming it is
    // a deliberate act.
    const namedExplicitly = basename(file).toLowerCase().includes(run.short.toLowerCase());
    if (!namedExplicitly && run.assignedAt && statSync(file).mtimeMs < run.assignedAt.getTime()) {
      await announce(
        `:inbox_tray: Mastering relay left \`${basename(file)}\` alone — it is older than run ` +
          `\`${run.short}\` was dispatched, so it cannot be its render. Prefix it with the run id if it really is.`,
      );
      continue;
    }

    // Read the generator off the dropped name BEFORE done sees it: the human
    // prefixes the run id (or renames outright), which strips the signature.
    const stripped = basename(file).replace(new RegExp(`^${run.short}[\\s_-]*`, "i"), "");
    const generator = detectModel(stripped);

    const label =
      `${basename(file)} → run ${run.short} (listing #${run.listingId}, photo ${run.photoIndex + 1})` +
      `${generator ? ` · rendered by ${generator.label}` : ""}`;
    if (DRY || CONFIRM_ONLY) {
      console.log(
        `   · ${label}${CONFIRM_ONLY ? "  — MASTERING_RELAY_CONFIRM=1, leaving the eyeball to you" : ""}`,
      );
      if (CONFIRM_ONLY && !DRY) {
        console.log(`     pnpm master:done ${run.short} --file=${file}`);
      }
      continue;
    }

    console.log(`   · ${label}`);
    try {
      execFileSync(
        "npx",
        [
          "tsx",
          "scripts/mastering/done.ts",
          run.short,
          `--file=${file}`,
          ...(generator ? [`--model=${generator.id}`] : []),
          "--yes",
          "--no-open",
        ],
        { stdio: "inherit", cwd: process.cwd() },
      );
    } catch {
      // done.ts already recorded FAILED or aborted with no state change, and
      // printed why. The file STAYS in the inbox: a silent drop is the one
      // outcome this relay must never produce.
      await announce(
        `:warning: Mastering relay could not apply \`${basename(file)}\` to run \`${run.short}\` — ` +
          `the file is still in the inbox. See the terminal or \`pnpm master:status\`.`,
      );
      continue;
    }

    // Serial mode keeps the working folders holding only the photo in flight,
    // so a finished render is removed rather than archived. Nothing is lost:
    // the mastered image is already on the CDN at `masteredUrl`, and a redo is
    // `master:queue --force`, never a dig through this folder. Batch mode still
    // archives, where an accumulating trail is the point.
    if (trim(process.env.MASTERING_SERIAL) === "1") {
      rmSync(file, { force: true });
    } else {
      mkdirSync(CONSUMED, { recursive: true });
      renameSync(file, join(CONSUMED, `${run.short}-${basename(file)}`));
    }
    ingested++;
  }

  console.log(
    ingested
      ? `\n✅ relayed ${ingested} render(s) — consumed files in ${CONSUMED}\n`
      : `\n(nothing ingested)\n`,
  );
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
