# Image mastering — ORIGINAL → professional, per photo

Host photos are often taken on a bad camera in bad light. This pipeline turns
each eligible listing photo into what a professional real-estate photographer
would have produced in the same room — **same property, same reality,
dramatically better photography** — with per-image state, a frozen prompt per
attempt, a Slack cockpit, and no silent failures.

> **Status: 🟢 loop PROVEN end-to-end (2026-08-22).** Photo 2 of Listing #1051
> went ORIGINAL → UPDATED through the human Gemini lane: mastered WebP live on
> the CDN, `photoUrls` slot swapped, Twenty shows 1/5 mastered + new cover,
> Slack thread carries the before/after. Photos 1/3/4 remain in the acceptance
> batch. **Phase-3 API billing: deferred by Abdout (2026-08-22)** — until the
> `/decide` flips it, `master:prep` is the interim floor (~20s of human per
> photo). Storage/serving details: [image-pipeline.md](./image-pipeline.md);
> plan of record:
> `~/.claude/plans/read-downloads-mastering-workflow-txt-do-reflective-wreath.md`.

## The honesty rule (outranks everything)

The model improves the **photograph**, never the **property**. Never invent or
remove rooms, furniture, windows, doors, views, amenities; never hide real
defects; never make the space look bigger, newer, or more luxurious. The
`master:done` step opens original and candidate side-by-side and asks exactly
that question before anything goes live. When in doubt, `master:reject`.

**The eyeball also owns IDENTITY, not just fidelity.** `done` proves the
candidate differs from the run's original (hash) and meets size/ratio — it
cannot know the render depicts the RIGHT room. The first real return arrived
labeled "photo 1" but depicted photo 2's living room; the visual match against
the five originals caught it and it was ingested under its true run. Always
confirm the render matches THIS run's original before applying.

## Architecture

```
Twenty Home (photoStage=POOR_QUALITY Kanban)      CLI --listing
        └────────────┬─────────────────────────────────┘
                     ▼
   master:queue   → MasteringRun rows (Prisma, QUEUED; prompt v1 FROZEN on the row)
   master:dispatch→ Slack #mkan task (original unfurls + prompt + command) → ASSIGNED
   master:prep    → prompt→clipboard · original revealed in Finder · Gemini opened
   HUMAN          → Gemini (Nano Banana) → ⌘V → Enter → RETURN the render, either:
                      a) reply in the run's Slack thread with it attached  (phone-friendly)
                      b) download it on this Mac                           (~/Downloads)
   master:done    → (a) --from-slack: pull the thread's image · (b) newest ~/Downloads
                  → validate → sharp ≤2048w WebP → S3 mkan/uploads/mastered/<runId>.webp   → MASTERED
                  → swap into Listing.photoUrls BY URL MATCH (transaction)                 → UPDATED
                  → Twenty rollup (photosMastered, photoStage, photo URLs) + Slack thread ✅
   master:reject  → REJECTED + fresh attempt row · master:revert → original back live
   master:reconcile → stall clock (QUEUED>7d, ASSIGNED>48h, MASTERED>24h) → Slack alert
```

- **State truth = mkan Prisma** (`MasteringRun`, additive migration
  `20260822000000_add_mastering_runs`). **Twenty `home` is the ops mirror**:
  `photoStage` gained `MASTERED`, plus new `photosMastered` / `lastMasteredAt`
  (declared in `scripts/crm/twenty-schema.ts`, applied via `crm:seed-objects` +
  `crm:sync-options`). **CDN is canonical** for image bytes; originals are never
  deleted (nothing in this pipeline calls `deleteObjectByUrl`).
- A photo with **no run rows is ORIGINAL** — absence is the state. Retries are
  new rows (`attempt+1`); history is never overwritten.
- Idempotent: `@@unique([listingId, originalUrl, attempt])` + an active-run
  check; a URL that *is* a mastered output is never re-queued; an UPDATED run
  with the same prompt version blocks re-queueing without `--force`.
- **Why the human runs Nano Banana** (Phase 1): the Gemini web app is covered
  by the Google AI Pro subscription; the API key on this machine has image
  quota `limit: 0` (kun: "the Google lane is blocked on billing, not a missing
  key"). The automated flip is Phase 3, gated on a billing `/decide` — the
  wired CLI is `kun/scripts/gemini-media.mjs image --ref …`, and only the
  generate step changes. **Billing deferred by Abdout 2026-08-22**; census
  prices the whole backlog (779 low photos) at ~$30 on `legacy`, ~$79 on
  `flash`-2K, ~$134 on `pro`-2K.
- **Non-API automation, settled 2026-08-22**: there is NO Gemini desktop app
  to drive. Browser automation of gemini.google.com is technically possible
  (Playwright profiles + Hermes' browser tool both exist) and deliberately
  DECLINED: the spec's own rule ("do not automate Nano Banana through an
  unofficial browser workaround"), consumer-ToS/bot-detection risk on the main
  Google account carrying the subscription, and UI fragility. Revisit only as
  a supervised, low-volume prototype on Abdout's explicit override — it dies
  the day billing flips.
- **Slack posts directly via the Web API** as the workspace `kun` bot (token:
  env `SLACK_BOT_TOKEN` → Keychain `databayt/SLACK_BOT_TOKEN` → Hermes'
  `~/.hermes/.env`). Hermes' agentic chat lane is NOT in the loop yet (known
  gateway bug: chat replies fail while cron/webhook delivery works); Hermes
  gets the operator skill + reconcile cron in Phase 2.
- Output spec: **4:3 landscape, ≤2048px wide, WebP q82** — the site renders
  `aspect-[4/3]` + `object-cover` everywhere that matters.

## Lifecycle

| State | Meaning | Set by |
|---|---|---|
| *(no row)* | ORIGINAL — untouched host photo | — |
| `QUEUED` | needs mastering; prompt frozen on the row | `master:queue` |
| `ASSIGNED` | Slack task posted (`slackTs`/`slackUrl` on the row) | `master:dispatch` |
| `MASTERED` | validated result uploaded to CDN (`masteredUrl`) | `master:done` |
| `UPDATED` | **the finished state** — live in `photoUrls`, Twenty mirrored | `master:done` |
| `REJECTED` | human said no (note required) — spawns attempt n+1 | `master:reject` / `revert` |
| `FAILED` | technical failure, reason recorded, Slack alerted | `master:done` |

STALLED is **computed, not stored**: `master:reconcile` flags state-age
breaches (`MASTERING_STALE_{QUEUED,ASSIGNED,MASTERED}_H` to tune).

## Runbook — process a batch

```bash
pnpm master:census                  # photo-quality census: REHOST/QUEUE/OK lanes,
                                    #   artifact .data/photo-census.json + originals cache
pnpm master:queue --listing=1051 --photos=1,2,3,4 --apply   # or --from-twenty
pnpm master:dispatch --apply                                # tasks → Slack
pnpm master:pull --apply            # Twenty→queue: images dropped on a Home record
                                    #   become runs; originals staged in ~/mkan/inbox/originals/
pnpm master:prep --setup-chatgpt    # ONE-TIME: print the standing instructions for the
                                    #   "mkan mastering" ChatGPT Project — after that,
                                    #   per image = drag → Enter → save to ~/mkan/inbox/
pnpm master:prep                    # oldest waiting task: prompt→clipboard,
                                    #   original→Finder, Gemini opens
# drag the image into Gemini → ⌘V → Enter → then return the render:
pnpm master:done <runId> --from-slack   # human attached it in the run's Slack thread
pnpm master:relay                       # or: the human saved it into ~/mkan/inbox
pnpm master:done <runId>                # or: newest image in ~/Downloads
                                        # both: eyeball side-by-side → confirm → live
pnpm master:status                  # where is every image, and why
# NOTE: unpublished (busy) listings 404 on the public URL — verify those via
#       master:status / the hosting dashboard; the public page applies once live.
pnpm master:reconcile --apply       # stall + drift alerts (runs daily 10:00 via launchd)
```

Bad result: `pnpm master:reject <runId> --note="invented a window"` (note is
mandatory — rejected-because is what improves prompt v2). Undo a live swap:
`pnpm master:revert <runId>`. Redo a finished photo: `master:queue --force`.

## The return lane (spec §13)

The human returns the render **in Slack** — reply in the run's task thread with
the image attached — and `master:done --from-slack` pulls it. This is the lane
the spec asked for ("attach mastered image in Slack → say DONE → automation
takes over") and the only one that works when the render was made on a phone:
nothing ever lands in `~/Downloads`. The `~/Downloads` lane stays as the
Mac-side default.

Matching a returned image to a run, in order:

1. attached **in the run's task thread** — unambiguous, always prefer this;
2. in the channel with the run id in the message text — `DONE kbbvvatd`;
3. newest human image in the channel — accepted **only** when exactly one run
   is waiting; otherwise `done` refuses rather than master the wrong photo.

Matching is not identity: the side-by-side eyeball still owns "is this the
right room" (the mislabeled-return lesson above).

**Scopes.** The kun bot posts with `chat:write`, but reading the channel and
downloading a file need **`groups:history`** (private channel) and
**`files:read`**. Without them `--from-slack` fails with a `missing_scope`
error naming the fix: api.slack.com/apps → the app behind @kun → OAuth &
Permissions → Bot Token Scopes → add both → **Reinstall to Workspace**. If the
reinstall rotates the token, update `~/.hermes/.env` — the gateway shares it.

## Choosing the generator

Nothing about this loop is Gemini-shaped. Any model that takes an image plus a
prompt can do the work, they leapfrog each other every few months, and the
operator picks per run:

```bash
pnpm master:queue --listing=1180 --photos=2 --model=chatgpt-image --apply
pnpm master:queue --listing=1180 --model=nano-banana-2 --apply      # whole listing
MASTERING_MODEL=chatgpt-image pnpm master:queue --listing=1180 --apply   # or set the default
```

Registry: `scripts/mastering/models.ts` — today `nano-banana`, `nano-banana-2`,
`chatgpt-image`, `chatgpt-image-2`, `codex`, plus the obvious aliases (`gemini`,
`chatgpt`, `nb2`, `gpt-image`, `gpt-image-2`). Versions get their own id rather
than an alias — `nano-banana-2` and `chatgpt-image-2` share a download name with
their predecessors, which is exactly why detection never overrides inside a
family and the operator's declaration stands. **Unregistered ids are accepted**, recorded verbatim, and simply
have no web app for `prep` to open — a new tool needs a registry entry to be
*recognised*, never to be *used*. The choice is frozen onto the row beside the
prompt, so `prep` opens that model's app and the Slack task names it.

**The record follows the file, not the plan.** `model` is what was asked for at
queue time; the returned filename is what actually happened. When the name
proves a different vendor family — `Codex Image ….png` against a run queued for
Gemini — `done` records the generator that really made the picture. Within a
family it does not second-guess you: a `Gemini_Generated_Image_*` file returned
against `nano-banana-2` stays `nano-banana-2`, because a filename cannot tell
the two apart and your declaration is the more specific truth. Run `kbbvvatd`
is why this exists: queued for Nano Banana, rendered by Codex, corrected by hand.

## The inbox lane — save the file, that is the whole job

`~/mkan/inbox` (gitignored; `$MASTERING_INBOX` moves it). Save the render there
from Gemini — the browser's "Save image as…" remembers the folder, so after the
first pick the human's entire remaining job is ⌘S — and a launchd **WatchPaths**
agent runs `master:relay` the moment the file lands: it resolves the run,
applies through the same `done` core, and moves the file to `inbox/consumed/`.
Nothing is deleted; drag a file back out to redo it.

```bash
bash scripts/mastering/install-relay-watch.sh   # one-time; log: ~/Library/Logs/mkan-mastering-relay.log
pnpm master:relay --dry                         # what would be ingested, and to which run
```

**Which run gets the file.** Prefix it with the run id and leave the tool's own
name in place — `kbbvvatd Codex Image ….png` — and it goes there. The download
name is the only evidence of which generator rendered the photo, so the relay
reads it off the dropped file and asserts it to `done`; renaming to a bare
`kbbvvatd.png` still works and simply leaves the queued model standing. With no hint the relay takes the one waiting run; when several are
waiting it **refuses**, leaves the file, and says so in #mkan with the run ids
to choose from. Dropping a file in the inbox stands in for the approve click —
the human looked at the render in Gemini before saving it — but it never stands
in for knowing which photo it is: this pipeline's first real return depicted the
wrong room. Set `MASTERING_RELAY_CONFIRM=1` to keep the side-by-side eyeball;
the relay then only reports the match and leaves `master:done` to the human.

An ingest that fails leaves the file in the inbox and posts why to #mkan — a
silent drop is the one outcome this lane must never produce.

## One-time setup (manual checkpoints)

1. Private channel **#mkan** (`C0BS2NZE2AY`) — created with the kun bot as a
   member, `SLACK_MASTERING_CHANNEL` set in `.env`. (First attempt was
   `#makan-image-mastering`/`C0BRSQ3EFNX` — renamed per Abdout by recreating;
   the old channel is dead, archive freely. A bot must be a MEMBER of a
   private channel or dispatch fails `channel_not_found` — invite it at
   creation, or `/invite @kun`.)
2. Twenty metadata — **applied** (`photoStage`+`MASTERED`, `photosMastered`,
   `lastMasteredAt`).
3. Bot scopes for the return lane — `groups:history` + `files:read` on the @kun
   app, then Reinstall to Workspace (see "The return lane" above). Verify with
   `curl -H "Authorization: Bearer $SLACK_BOT_TOKEN" 'https://slack.com/api/conversations.history?channel=C0BS2NZE2AY&limit=1'`.

4. Stall clock — **installed**: launchd `com.databayt.mkan-mastering-reconcile`
   runs `master:reconcile --apply` daily at 10:00 (log:
   `~/Library/Logs/mkan-mastering-reconcile.log`); re-install after edits with
   `bash scripts/mastering/install-reconcile-cron.sh`. Deliberately launchd,
   not a Hermes agent-cron: the task is deterministic shell, no LLM belongs in
   it (weekly-digest precedent).

## Failure playbook

| Symptom | Meaning | Move |
|---|---|---|
| dispatch: `channel_not_found` | bot not in the private channel | `/invite @kun` in #mkan, re-run |
| done: "candidate is byte-identical" | grabbed the original, not the render | pass `--file=` |
| done: "no image newer than 120min" | download older than the window | `--file=` or `--window=480` |
| done: `missing_scope` (files:read / groups:history) | bot can post but not read Slack | add both scopes + reinstall (see "The return lane") |
| done --from-slack: "N runs are waiting and the newest image names none" | return landed loose in the channel | reply with it **in the task thread**, or `DONE <runId>`, or `--file=` |
| done --from-slack: "slack returned HTML, not the image" | download hit the sign-in page — token lacks `files:read` | same scope fix |
| done: FAILED "CDN upload failed" | S3 creds/network | fix creds, `master:reconcile --requeue-failed --apply` |
| done: "MASTERED but NOT applied" | host removed that photo mid-run | nothing lost — decide manually |
| render depicts a different room | wrong original attached in Gemini / mislabeled return | match against `photo-cache/<listingId>/` originals, ingest under the TRUE run |
| status/reconcile: 🫥 DRIFTED | host replaced/removed photos AFTER apply — run says UPDATED but isn't live | human call: `master:queue --force` the new photo, or let it stand |
| ASSIGNED task lost / thread stale | Slack message deleted or buried | `master:dispatch --run=<ref> --repost --apply` (old thread gets a pointer) |
| Twenty rollup "failed (non-fatal)" | CRM down (laptop asleep, wrong port) | re-run `master:done`? No — rollup repeats on next apply, or PATCH via `crm:sync-photos` idiom |
| run parked forever | see `master:status` ⏰ flags | `master:reconcile --apply` alerts; act on the thread |

## Invariants under test

`tests/mastering.test.ts` pins the load-bearing pure logic
(`scripts/mastering/pure.ts`): swap is by VALUE never index, UUID basenames
never become room "hints" (every scraped re-host is uuid-named), DRIFTED =
UPDATED-but-not-live, and the Slack return parser trusts only human-attached
images. `master:done`'s state claim is race-guarded (a concurrent done/reject
rolls back instead of regressing a finished run). Run: `pnpm test`.

## Audit (doc §17 answers)

Every question — when queued, which prompt version, which model, who returned
what, when it went live, why it failed, how many attempts — reads off the
`MasteringRun` rows (`master:status`) plus the Slack thread each row links
(`slackUrl`). Originals stay at their CDN URLs on the run rows forever.

## Phase 2 / 3 (after the 4-image proof)

Census ground truth (2026-08-22): 147 listings — QUEUE 112 (779 low-quality
photos), OK 9, NO_PHOTOS 26 (24 of them published — a lane of its own),
REHOST 0. Next queue after the 1051 proof: **1127** (host 1004) and **1161**
(host 1006) — both hosts have phones, and `scripts/crm/gift-handover.ts`
renders its mastered-photos gift line from live `MasteringRun` UPDATED rows.
Deliberately not queued yet: 1051's reject notes settle prompt v1 vs v2 first
(the prompt freezes onto each row at queue time).

Phase 2: `/admin/mastering` UI (photo grid, statuses, before/after — the
census photo cache feeds it), Twenty webhook auto-queue on
`photoStage=POOR_QUALITY`, Hermes operator skill
(`~/.hermes/skills/databayt/makan-image-mastering/`) + reconcile cron, kun
vocabulary spell `mastering`. Phase 3 (billing deferred, see status): the
`/decide` with measured Phase-1 numbers, then `master:auto` swaps only the
generate step — the human gate becomes approve-only, the state machine
unchanged.
