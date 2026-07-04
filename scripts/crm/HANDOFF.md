# Run the growth pipeline on the Twenty machine

The Twenty backend + OpenClaw run on **this machine**, so run the CRM pipeline here where
they're reachable at `localhost`. The whole pipeline (Epic G1.1–G1.7) is already built in
`scripts/crm/` — this is the operator runbook. A Claude Code session here can follow it
directly ("run the growth pipeline per `scripts/crm/HANDOFF.md`").

Design: [`docs/growth.md`](../../docs/growth.md) · per-script detail: [`README.md`](./README.md)

## 0. Setup

```bash
git pull origin main
pnpm install
```

The central `.env` must have mkan's usual secrets (**`DATABASE_URL`** = the mkan Neon DB,
**`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_S3_BUCKET` / `AWS_REGION`** for photo
re-host, `NEXT_PUBLIC_CDN_*`). If this machine doesn't already have mkan's `.env`, copy it
from the scraping machine. Then **append**:

```bash
TWENTY_API_URL=http://localhost:3000      # the local Twenty SERVER (check your backend's port)
TWENTY_API_KEY=<Twenty → Settings → APIs & Webhooks → generate>
OPENCLAW_URL=<local OpenClaw gateway URL>  # only for outreach --apply
OPENCLAW_TOKEN=<...>
```

The Twenty-facing scripts now auto-load `.env`, so `pnpm crm:* --apply` just works.

## 1. Scraped data (gitignored — does NOT travel via git)

`scripts/crm/.data/` is gitignored (scraped content / possible PII). The upsert reads
`scripts/crm/.data/airbnb-scrape.json`. Get it one of two ways:

- **Copy** `scripts/crm/.data/` from the scraping machine (it has the vault Chrome + Airbnb
  login), **or**
- **Re-scrape here** with `pnpm crm:scrape` — but only if this machine has a logged-in
  Airbnb browser on CDP `:9222` (the scraping machine's vault Chrome). Otherwise copy.

So far `.data/airbnb-scrape.json` holds **3 Port Sudan test listings**. For real inventory,
run a full `pnpm crm:scrape` (all ~117 Sudan homes, ~15 min) on the machine with the Airbnb
session first.

## 2. Run — every step is dry-run-first (drop `--apply` to preview)

```bash
# --- CRM structure (writes to the live Twenty workspace) ---
pnpm crm:seed-objects --apply     # Home + Host objects + Opportunity fields (2 obj, 101 fields)
pnpm crm:seed-views   --apply     # 10 saved views

# --- ingest + judge ---
pnpm crm:upsert       --apply     # scraped records → Twenty (Home/Host + 1 Opportunity/host)
pnpm crm:score        --apply     # trust scores / bands / checks written back

# --- enrich (needs AWS creds) ---
pnpm crm:rehost --fx-rate=<SAR→SDG> --apply     # photos → cdn.databayt.org + price SR→SDG

# --- outreach (needs OpenClaw; human-send is the default) ---
pnpm crm:outreach                 # draft WhatsApp to outbox (review + send by hand)
# or automate for hosts with a known number:  OPENCLAW_URL/TOKEN set → pnpm crm:outreach --apply

# --- provision + go live (ONLY for hosts who agreed — see Safety) ---
FORCE_SEED=1 pnpm crm:import  --in=scripts/crm/.data/airbnb-rehosted.json --apply   # → mkan (Busy)
FORCE_SEED=1 pnpm crm:publish --city=PORT_SUDAN --apply                              # Busy→Available
```

Preview any step by dropping `--apply` (and `FORCE_SEED`). Start there.

## 3. Verify

- **Twenty**: open the workspace — `Home`/`Host` objects exist with fields; the 10 views are
  pinned; the scraped records loaded and carry `trustBand` / `overallTrustScore`.
- **mkan** (after import): imported listings exist as **Busy** (`isPublished:false`) under
  `1000@mkan.org`+ hosts; after publish, the eligible ones are Available.

## Safety (read before any `--apply`)

- **Consent gate.** `crm:import` and `crm:publish` must **not** run for a host who hasn't
  agreed to join. With scrape-only data (no host reply) the default `--min-band=MANUAL_REVIEW`
  imports **nothing** and publish flips **nothing** — that's intended. Only raise the band /
  import after a host says yes.
- **Prod guard.** `crm:import` / `crm:publish` need `FORCE_SEED=1` and write to the live mkan
  DB (Busy-only; publish is the deliberate flip). Idempotent via `.data/*-ledger.json`.
- **Reversible-but-tedious.** Twenty objects/views can be deleted in Settings → Data Model;
  preview with a dry run first so you create exactly what you want.
- Everything is **idempotent** — safe to re-run; existing objects/fields/records are skipped.
