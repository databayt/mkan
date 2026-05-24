# Epic 1 — Build & Deploy Hardening

> **Priority**: P0 (foundation) · **Owner**: Platform · **Status**: In Progress · **Phase**: B

## Goal

Make CI an honest gate that mirrors production. Eliminate silent footguns: Node version drift, stale env vars, unvalidated env, lenient lint, unscoped typecheck, missing pre-commit, formatting drift, gitignore misses.

## Background

Audit found:
- CI runs Node 20; `package.json engines` requires `>= 22.12.0`. Vercel runs Node 22. CI green doesn't guarantee prod green.
- No env validation — build passes with placeholder `DATABASE_URL`. Silent failures at runtime.
- `next.config.ts` lacks `serverExternalPackages`. Memory note flags this as required for Next 16 to avoid `require() of ES Module` regressions.
- `lint:strict` exists but CI runs lenient `lint`. Warnings unbounded.
- `tsconfig.exclude` includes `tests/`. Test code drift goes uncaught.
- No husky / lefthook. No pre-commit checks.
- No Prettier. Style drift across PRs.
- `.env.example` has stale `SENTRY_*` keys (Sentry was removed).
- Stray 1-byte files in repo root (`Drepomkanprismamigrationsadd_performance_indexes.sql`, `Drepomkansrcappapihealthroute.ts`).
- `tsconfig.tsbuildinfo` (568 KB) is committed.

## Stories

| ID | Title | Files |
|---|---|---|
| 1.1 | Bump CI Node to 22 | `.github/workflows/ci.yml` |
| 1.2 | Add zod env validation (`src/lib/env.ts`) | new file + imports |
| 1.3 | Add `serverExternalPackages` to next config | `next.config.ts` |
| 1.4 | Add `lint:strict` to CI | `.github/workflows/ci.yml` |
| 1.5 | Include `tests/` in tsconfig | `tsconfig.json` |
| 1.6 | Add `lefthook.yml` pre-commit | new file |
| 1.7 | Add Prettier config + format pass | `.prettierrc`, `.prettierignore` |
| 1.8 | Clean stale env keys in `.env.example` | that file |
| 1.9 | Remove stray files; gitignore tsbuildinfo | `.gitignore`, repo root |

## Epic Acceptance Criteria

- [ ] CI uses Node 22 in every job.
- [ ] `pnpm build` fails fast if any required env var is missing.
- [ ] `serverExternalPackages` declared in `next.config.ts`.
- [ ] CI fails on any ESLint warning.
- [ ] `pnpm tsc --noEmit` covers both `src/` and `tests/`.
- [ ] `lefthook` runs `tsc + lint + format` on every commit.
- [ ] `prettier` config committed; `pnpm exec prettier --check .` passes.
- [ ] `.env.example` documents only currently-used keys; no Sentry leftovers.
- [ ] Stray 1-byte files deleted; `tsconfig.tsbuildinfo` in `.gitignore`.

## Dependencies

None. This epic is the gate for all subsequent work.

## Out of scope

- Adding Sentry back.
- Switching to Turbopack production builds.
- Replacing pnpm.

## Technical notes

- Prefer `lefthook` over `husky` (binary, no Node startup overhead, configured in YAML).
- For env validation use a small zod schema; do not pull in `@t3-oss/env-nextjs` (we keep deps lean).
- `serverExternalPackages` should include known-trouble libs preemptively even if currently unused: e.g. anything referencing `jsdom` transitively.
