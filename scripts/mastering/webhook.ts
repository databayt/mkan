/**
 * Box 2 — the Twenty trigger. A photo dropped on a Home becomes a queued run
 * within seconds, with nothing polling and nobody running a command.
 *
 *   pnpm master:webhook              # foreground, for watching it work
 *   bash scripts/mastering/install-webhook.sh   # launchd + register in Twenty
 *
 * Twenty (in Docker on this Mac) POSTs `attachment.created` here through
 * `host.docker.internal`; this process answers immediately and then runs
 * `master:pull --apply`, which does the real work — download, re-host, queue,
 * stage in the inbox, one Slack digest.
 *
 * Three things shape the design, all of them learned rather than assumed:
 *
 *   1. **Twenty allows 5 seconds and never retries** (the mkan webhook route
 *      documents this the hard way). A delivery we are slow to answer is a
 *      permanently lost event, so the response goes out BEFORE the pull runs,
 *      never after it.
 *   2. **A batch drag fires one delivery per photo.** Running six pulls at once
 *      would race the same cursor file six ways, so deliveries are coalesced:
 *      each one re-arms a short timer, and the pull runs once after the last.
 *   3. **A lost delivery must not lose the photo.** The pull keeps its own
 *      cursor, so the next delivery — or any manual run — sweeps up whatever a
 *      missed one left behind. This trigger is an accelerator, not the system
 *      of record.
 */
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { trim } from "./lib";
import { verifyTwentySignature } from "@/lib/twenty-webhook";

const PORT = Number(trim(process.env.MASTERING_WEBHOOK_PORT)) || 8646;
const SECRET = trim(process.env.MASTERING_WEBHOOK_SECRET) || undefined;
/** Coalescing window — long enough to swallow a multi-photo drag, short enough to feel instant. */
const DEBOUNCE_MS = Number(trim(process.env.MASTERING_WEBHOOK_DEBOUNCE_MS)) || 8_000;
const REPO = join(homedir(), "mkan");
const LOG = join(homedir(), "Library", "Logs", "mkan-mastering-webhook.log");

/**
 * stdout only — launchd redirects it into LOG, and writing to both put every
 * line in that file twice.
 */
function log(msg: string): void {
  process.stdout.write(`${new Date().toISOString()} ${msg}\n`);
}

let timer: NodeJS.Timeout | null = null;
let running = false;
/** A delivery that lands mid-pull must not be swallowed — it re-arms once the run finishes. */
let again = false;

function runPull(): void {
  if (running) {
    again = true;
    return;
  }
  running = true;
  log("▶ master:pull --apply");
  const child = spawn("pnpm", ["master:pull", "--apply"], {
    cwd: REPO,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tail: string[] = [];
  const keep = (b: Buffer): void => {
    const s = b.toString();
    tail.push(s);
    if (tail.length > 40) tail.shift();
  };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  child.on("close", (code) => {
    running = false;
    const summary = tail
      .join("")
      .split("\n")
      .map((l) => l.trim())
      // Only the pull's own report lines. Loose word matching swept in prisma
      // query logs — "queuedAt" inside an INSERT is not a summary.
      .filter((l) => /^(📡|✓|✅|!|✗)/.test(l));
    log(`◀ pull exit ${code}${summary.length ? ` — ${summary.join(" | ").slice(0, 300)}` : ""}`);
    if (again) {
      again = false;
      schedule("a delivery arrived mid-pull");
    }
  });
}

function schedule(why: string): void {
  if (timer) clearTimeout(timer);
  log(`⏳ ${why} — pulling in ${DEBOUNCE_MS / 1000}s`);
  timer = setTimeout(() => {
    timer = null;
    runPull();
  }, DEBOUNCE_MS);
}

const IMAGE = /\.(png|jpe?g|webp|heic)$/i;

function handle(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== "POST") {
    res.writeHead(405).end();
    return;
  }
  let raw = "";
  req.on("data", (c) => {
    raw += c;
    // A body this large is not a Twenty event; refuse rather than buffer it.
    if (raw.length > 1_000_000) req.destroy();
  });
  req.on("end", () => {
    const verdict = verifyTwentySignature({
      rawBody: raw,
      signature: (req.headers["x-twenty-webhook-signature"] as string | undefined) ?? null,
      timestamp: (req.headers["x-twenty-webhook-timestamp"] as string | undefined) ?? null,
      secret: SECRET,
    });
    if (!verdict.ok) {
      log(`✗ rejected: ${verdict.reason}`);
      res
        .writeHead(401, { "content-type": "application/json" })
        .end(JSON.stringify({ error: verdict.reason }));
      return;
    }

    // Answer FIRST — everything below this line is off Twenty's 5-second clock.
    res
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ received: true }));

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      log("✗ unparseable body (answered 200 — a retry would not help)");
      return;
    }
    const evt = body as { eventName?: string; record?: { name?: string } };
    const name = trim(evt?.record?.name);
    // Only image attachments matter. Everything else is answered and dropped:
    // a note or a PDF on a Home is not this pipeline's business.
    if (!IMAGE.test(name)) {
      log(`· ignored ${evt?.eventName ?? "event"} (${name || "no name"})`);
      return;
    }
    schedule(`${evt?.eventName ?? "event"} ${name}`);
  });
}

createServer(handle).listen(PORT, () => {
  log(
    `👂 mastering webhook on :${PORT} — secret ${SECRET ? "set" : "MISSING (every delivery will 401)"} — log ${LOG}`,
  );
});
