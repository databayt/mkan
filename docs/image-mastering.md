# Image mastering — ORIGINAL → professional, per photo

Host photos are often taken on a bad camera in bad light. This pipeline turns
each eligible listing photo into what a professional real-estate photographer
would have produced in the same room — **same property, same reality,
dramatically better photography** — with per-image state, a frozen prompt per
attempt, a Slack cockpit, and no silent failures.

> **Status: 🟢 loop live (2026-08-22), Phase 1 human-in-the-loop.** Four runs
> for Listing #1051 queued as the acceptance batch. Storage/serving details
> live in [image-pipeline.md](./image-pipeline.md); the plan of record is
> `~/.claude/plans/read-downloads-mastering-workflow-txt-do-reflective-wreath.md`.

## The honesty rule (outranks everything)

The model improves the **photograph**, never the **property**. Never invent or
remove rooms, furniture, windows, doors, views, amenities; never hide real
defects; never make the space look bigger, newer, or more luxurious. The
`master:done` step opens original and candidate side-by-side and asks exactly
that question before anything goes live. When in doubt, `master:reject`.

## Architecture

```
Twenty Home (photoStage=POOR_QUALITY Kanban)      CLI --listing
        └────────────┬─────────────────────────────────┘
                     ▼
   master:queue   → MasteringRun rows (Prisma, QUEUED; prompt v1 FROZEN on the row)
   master:dispatch→ Slack #mkan task (original unfurls + prompt + command) → ASSIGNED
   HUMAN          → Gemini web UI (Nano Banana): attach original, paste prompt, generate, download
   master:done    → validate → sharp ≤2048w WebP → S3 mkan/uploads/mastered/<runId>.webp   → MASTERED
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
  generate step changes.
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
pnpm master:queue --listing=1051 --photos=1,2,3,4 --apply   # or --from-twenty
pnpm master:dispatch --apply                                # tasks → Slack
# per Slack task: open Gemini (Nano Banana) → attach original → paste prompt
#                 → generate → download → then:
pnpm master:done <runId>            # eyeball side-by-side → confirm → live
pnpm master:status                  # where is every image, and why
# NOTE: unpublished (busy) listings 404 on the public URL — verify those via
#       master:status / the hosting dashboard; the public page applies once live.
pnpm master:reconcile --apply       # stall alerts (Hermes cron in Phase 2)
```

Bad result: `pnpm master:reject <runId> --note="invented a window"` (note is
mandatory — rejected-because is what improves prompt v2). Undo a live swap:
`pnpm master:revert <runId>`. Redo a finished photo: `master:queue --force`.

## One-time setup (manual checkpoints)

1. Private channel **#mkan** (`C0BS2NZE2AY`) — created with the kun bot as a
   member, `SLACK_MASTERING_CHANNEL` set in `.env`. (First attempt was
   `#makan-image-mastering`/`C0BRSQ3EFNX` — renamed per Abdout by recreating;
   the old channel is dead, archive freely. A bot must be a MEMBER of a
   private channel or dispatch fails `channel_not_found` — invite it at
   creation, or `/invite @kun`.)
2. Twenty metadata — **applied** (`photoStage`+`MASTERED`, `photosMastered`,
   `lastMasteredAt`).

## Failure playbook

| Symptom | Meaning | Move |
|---|---|---|
| dispatch: `channel_not_found` | bot not in the private channel | `/invite @kun` in #mkan, re-run |
| done: "candidate is byte-identical" | grabbed the original, not the render | pass `--file=` |
| done: "no image newer than 120min" | download older than the window | `--file=` or `--window=480` |
| done: FAILED "CDN upload failed" | S3 creds/network | fix creds, `master:reconcile --requeue-failed --apply` |
| done: "MASTERED but NOT applied" | host removed that photo mid-run | nothing lost — decide manually |
| Twenty rollup "failed (non-fatal)" | CRM down (laptop asleep, wrong port) | re-run `master:done`? No — rollup repeats on next apply, or PATCH via `crm:sync-photos` idiom |
| run parked forever | see `master:status` ⏰ flags | `master:reconcile --apply` alerts; act on the thread |

## Audit (doc §17 answers)

Every question — when queued, which prompt version, which model, who returned
what, when it went live, why it failed, how many attempts — reads off the
`MasteringRun` rows (`master:status`) plus the Slack thread each row links
(`slackUrl`). Originals stay at their CDN URLs on the run rows forever.

## Phase 2 / 3 (after the 4-image proof)

Phase 2: `/admin/mastering` UI (photo grid, statuses, before/after), Twenty
webhook auto-queue on `photoStage=POOR_QUALITY`, Hermes operator skill
(`~/.hermes/skills/databayt/makan-image-mastering/`) + reconcile cron, kun
vocabulary spell `mastering`. Phase 3: billing `/decide` with measured Phase-1
numbers (legacy Nano Banana $0.039/img, flash-2K $0.101, pro-2K $0.134), then
`master:auto` swaps only the generate step — the human gate becomes
approve-only, the state machine unchanged.
