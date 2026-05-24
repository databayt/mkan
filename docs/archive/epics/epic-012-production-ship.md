# Epic 12 — Production Ship

> **Priority**: P0 (gate) · **Owner**: Release Manager · **Status**: To Do · **Phase**: F

## Goal

Cross the line. Verified production deployment of mkan v1.0 to Vercel. Tag, release notes, sign-off.

## Background

After Epics 1-11 are Done, the codebase is shippable. This epic is the ceremony of actually deploying and verifying production.

## Stories

| ID | Title | Files |
|---|---|---|
| 12.1 | Run full test matrix (unit + E2E + lint:strict + tsc) — all green | n/a |
| 12.2 | Apply pending Prisma migrations to production (Neon) | `prisma/migrations/*` |
| 12.3 | Verify env vars on Vercel (Stripe live keys, gateway creds, DATABASE_URL, AUTH_SECRET) | Vercel dashboard |
| 12.4 | Merge `ship/v1.0` → `main`; confirm Vercel deploy READY | git + Vercel MCP |
| 12.5 | Post-deploy smoke (`/api/health`, `/`, `/en/listings`, `/en/transport`, `/ar/*`) | manual + script |
| 12.6 | Run `@smoke` E2E subset against prod URL | `pnpm test:e2e --grep @smoke` |
| 12.7 | Tag `v1.0.0`, draft GitHub release notes | git |
| 12.8 | Update `docs/ship-readiness.md` to GREEN | docs |

## Epic Acceptance Criteria

- [ ] All test commands exit 0 on `ship/v1.0` immediately before merge.
- [ ] Vercel deploy of merged `main` reaches state READY without error.
- [ ] Smoke checks pass against the production URL.
- [ ] `v1.0.0` tag exists on `main`.
- [ ] GitHub release notes drafted (does not need to be published).
- [ ] `docs/ship-readiness.md` shows all rows GREEN.

## Dependencies

- Epics 1-11 all Done.
- Stripe live keys provisioned in Vercel.
- Neon production DB reachable.
- Resend API key in Vercel env.

## Out of scope

- Marketing announcement (separate work).
- App-store submission (no native app v1.0).
- Customer comms (separate work).

## Technical notes

- For 12.4: do not force-push, do not skip hooks. If hook fails on merge, fix root cause.
- For 12.6: smoke E2E must be read-only (no test bookings on prod). Use `--grep "@smoke"` tag.
- For 12.7: use semver `v1.0.0`. Release notes auto-generated from `ship/v1.0` commit log + curated highlights.
- For 12.8: ship-readiness.md becomes the historical artifact for the v1.0 release.

## Rollback plan

If 12.5 or 12.6 fails:
1. Revert the merge commit on `main` (do NOT force-push).
2. Vercel will deploy the revert; verify READY.
3. Fix forward on `ship/v1.0` and retry merge.
