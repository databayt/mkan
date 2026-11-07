# mkan off the container — the plan (2026-11-07)

Abdout (11-07): "make it as free and low as possible", then "plan a move off containers". This is
that plan. Nothing in it is built yet.

## Why

mkan's biggest bill is its always-on Cloudflare Container: `standard-1` (½ vCPU, 4 GiB, 8 GB) costs
**≈ $29.24 a month**, almost all of it for memory that is reserved around the clock
([costs-2026-11.md](costs-2026-11.md)). food, marketing, codebase and kun left their containers on
10-25 for OpenNext on a plain Worker, which costs nothing extra on the $5 Workers Paid plan the
account already pays. Only hogwarts (too big for a Worker) and mkan still run a container.

| | Today | After the move |
|---|---|---|
| Cloudflare for mkan | $1 share of the $5 plan + **$29.24** container | $1 share of the $5 plan + about $0–1 of usage |
| Break-even on /monetize | ≈ $37 / month | ≈ $8 / month |

At mkan's traffic, the extra Worker usage stays inside what the plan includes. That covers
requests, CPU, Durable Objects, Queues, KV/R2 for the page cache, and Hyperdrive. Phase 2 measures
the real numbers.

## What was measured (11-07)

- **Bundle:** about 28 MiB of server code (6.1 MB gzipped) plus Next's runtime, the 3.7 MB Prisma
  query compiler and the dependencies. That comes to an estimated 40–50 MiB. Cloudflare's limit has
  been 64 MiB uncompressed since 2026-09-04 (the old 10 MB gzip cap is gone). What to watch instead
  is the 1-second startup and the 128 MB of memory per isolate.
- **Memory:** the container used 275 MiB idle and about 750 MiB after a burst of 48 page loads,
  against 128 MB per Worker isolate. A Worker runs many small isolates, so the per-request working
  set matters, not the total.
- **Database distance:** a /find turn makes about 20 queries one after another. The container sits
  in ENAM, next to Neon us-east-1. A Worker has to be placed there too
  (`placement.region: "aws:us-east-1"`); otherwise every query crosses from Kigali to Virginia.
- **Not a problem:**
  - no runtime `fs`, `child_process`, sockets or `sharp` imports in `src/`
  - uploads are presigned PUTs straight to S3
  - no SSE or streamed responses
  - every LLM call times out within 2.5–5 s
  - `bcryptjs` is pure JS
  - no `public/` file is over 25 MiB

## Decisions

- **OpenNext, not vinext.** It is the in-house recipe already proven on food, marketing, codebase,
  kun and space (`food/scripts/deploy-cloudflare.sh` is the template). OpenNext ≥ 1.20.3 runs mkan's
  Node `proxy.ts`, with the same `scripts/cf-trace-otel.mjs` that food and kun use.
- **Database:**
  - Hyperdrive with caching off, pointed at Neon's direct host. Caching has to be off because
    Hyperdrive does not invalidate on writes, which would break the lease and claim logic and the
    task polling.
  - A new Prisma client for each request (`PrismaPg`, `maxUses: 1`) behind the existing `db` Proxy,
    so the 88 importing files don't change.
  - The 9 interactive `$transaction` calls rule out Neon's HTTP mode.
- **Placement:** `"placement": { "region": "aws:us-east-1" }`. Crons call the app through a fetch
  so that they run there too, because placement applies only to fetch handlers.
- **Images:** `images.unoptimized` on the Worker, keeping `cf/worker.js`'s `variantResponse`. Listing
  photos already have pre-made AVIF/WebP variants on the CDN. No Cloudflare Images bill.
- **Page cache:** OpenNext's KV (or R2) incremental cache plus `DOShardedTagCache`. That serves the 29
  revalidating pages, the 14 `unstable_cache` wrappers and the ~200 `revalidatePath`/`updateTag` calls.
- **WhatsApp background work moves to Durable Objects and a Queue.** This is the real work; see
  phase 1.
- **The 10-25 attempt is reference only.** That shelved migration lives in `git stash list`
  (`stash@{1}` "wip-10-25-prisma7-lid-opennext", plus `~/mkan-wip-2026-10-25.patch`). It mixes in
  unrelated WhatsApp changes, uses the old `*/2` cron and was never built. Copy pieces from it; do not
  apply it.

## The work

Each phase ships on its own. The container keeps serving until phase 3.

### Phase 0 — measure (½ day)

Build with OpenNext in `~/.cache/cf-build/mkan-next` (a `git archive` copy, never `$TMPDIR`), then
run `wrangler deploy --dry-run --outdir` for the real size and startup time.
- If startup is near 1 s: load the mapbox components with `ssr: false` (a 1.7 MB chunk pulled into
  the server), remove the duplicated Anthropic SDK chunk, and set Prisma `compilerBuild = "small"`.
- Done when the size and startup are known and fit.

### Phase 1 — make the code Worker-safe, still on the container (2–3 days)

Every change works in both runtimes and goes out through the normal container deploys.

1. **WhatsApp outbox → a Durable Object alarm.**
   - Today: `passScheduler`/`kickOutbox` (`scripts/wa/outbox-pure.ts:388`,
     `src/components/agent/wa-outbox.ts:84-95,197`) are `setTimeout` timers in the process. That
     includes the broker gap, which can wait minutes.
   - New: an `OutboxDO` in `cf/worker.js` sets an alarm and runs the pass when it fires; one object
     also replaces the WaState lease.
   - On the container, the app kicks the object through a guarded Worker route. On the Worker, it
     calls the binding.
2. **WhatsApp webhook → a Queue.**
   - Today: `after()` in `src/app/api/whatsapp/hook/[token]/route.ts:110` can run well past 30 s: a
     10 s echo wait, waiting on the turn, the pick, then the sends. On a Worker `waitUntil` is cut at
     30 s, so the claim would be stranded until a later cron.
   - New: the hook queues the payload and returns 200. The consumer has 15 minutes.
3. **Per-phone order and shared state.**
   - The module-level `chains` Map (`wa-tenant.ts:54`) only orders messages inside one process.
     Replace it with a per-phone Durable Object or `pg_advisory_xact_lock(hashtext(phone))`.
   - The `mutateState` mutex (`wa-state.ts:29-39`) becomes single-statement SQL updates, like
     `addToList` already is.
4. **WhatsApp sends through the binding.**
   - `src/lib/whatsapp/evolution.ts:24,55` calls `https://www.mkan.sd/__wa`. A Worker's fetch to its
     own zone skips the Worker, so on a Worker every send, read and typing notice would fail.
   - Call `env.WHATSAPP.fetch()` (the hogwarts bridge binding) with the same path allowlist.
5. **Database.**
   - Make the client request-scoped behind the Proxy (food's `WeakMap` on the request context).
   - `auth.ts:180` `PrismaAdapter(db)` goes through the Proxy.
   - Drop the top-level `import ws`.
   - Switch the generator to `prisma-client` with `output = "../src/generated/prisma"`. That means
     72 files move to `@/generated/prisma/client`, and 16 client files take enum values from
     `/enums`.
   - Await the floating writes: `recordSpend` in `reader.ts:314` and `writer.ts:203`. A lost write
     undercounts the $15 API cap.
6. **Small but required:**
   - `src/app/api/health/route.ts`: drop `monitorEventLoopDelay` (it throws on workerd, so the route
     and the deploy gate would 500) and the `os`/`process.memoryUsage` metrics.
   - `BUILD_SHA` moves to a var or `version_metadata`.
   - Stripe moves to `constructEventAsync` (`payment-actions.ts:700`).
   - The cache headers in `next.config.ts` move to `public/_headers`.

Done when wa:e2e and deal:e2e pass on the container with the new paths, and the outbox runs from the
Durable Object.

### Phase 2 — a trial Worker, `mkan-next` on workers.dev (1 day)

1. **Deploy script:** copy `food/scripts/deploy-cloudflare.sh` (build, preview, deploy).
   - Never copy `.env` into the build: OpenNext bundles it into the Worker (the leader leak).
   - Push secrets with `wrangler secret bulk`. Every runtime var has to exist as a var or secret,
     because `env.json` goes away.
2. **`wrangler.jsonc`:**
   - `nodejs_compat`
   - `placement.region`
   - assets
   - Hyperdrive with caching off
   - KV and `DOShardedTagCache`
   - the `OutboxDO` and the Queue
   - the `WHATSAPP` service binding
   - no routes or crons
3. **Checks:**
   - health, /en|ar|rw/find, /en/k/K…, /en/monetize and login (a credentials probe reaches the database)
   - a real /find turn, comparing p50/p90 with the container (0.74 s / 3.8 s)
   - a WhatsApp turn through the queue
   - 128 MB memory on the sitemap (6 MB), the 2,000-row wide pool and /monetize (about 70 queries)

### Phase 3 — cutover with a way back (½ day + 48 h)

Deploy the Worker as `mkan`, in place, so routes and crons keep firing. New cron triggers have taken
up to 19 h to start on a renamed Worker.
- **Rollback window:** keep the `MkanContainer` class and the container application for 48 h, so
  `wrangler rollback` can return to the container version.
- **Watch:** latency, errors, the outbox, chats and Neon compute.

### Phase 4 — clean up (½ day)

After 48 h clean:
- Deploy with `deleted_classes: ["MkanContainer"]` and delete the container application.
- Remove `Dockerfile.cf`, `cf/entry.cjs`, `cf/env-split.mjs` and `@cloudflare/containers`.
- Move `sharp` to devDependencies; only the Mac scripts use it.
- Teach the sprint loop's `scripts/crm/hermes/ship.sh` the new build, plus `wrangler rollback` in
  place of the registry-image re-pin.
- Set the `cloudflare` line in `src/lib/monetize/costs.ts` to $1.

**Total: about 4–5 working days.** The WhatsApp redesign in phase 1 is the bulk of it.

## Risks

| Risk | Mitigation |
|---|---|
| Slower /find (20 sequential queries) | `placement.region` near Neon, Hyperdrive; measured in phase 2 before any cutover |
| A WhatsApp message lost or doubled in the redesign | The claim-once model stays; the queue and Durable Object replace only timers and ordering; wa:e2e on the container first, then the trial |
| 128 MB per isolate | Phase 2 exercises the heaviest pages; trims from phase 0 |
| Startup over 1 s | Phase 0 measures it first |
| A cutover that can't roll back | The container stays for 48 h; `deleted_classes` comes last |
| Cron triggers slow to start | In-place deploy keeps the Worker name; the outbox no longer needs the crons to be prompt |

## Not doing

- **Neon's free plan.** The database fits (207 MB of 1 GB), but it sends 200–380 MB a day, about
  10 GB a month, against the free 5 GB. Hitting that cap suspends the database. Stay on Launch, which
  should cost ≈ $7–9 once compute sleeps.
- **A smaller container (`basic`, 1 GiB, ≈ $9).** It was considered on 11-07; Abdout chose this move
  instead.
