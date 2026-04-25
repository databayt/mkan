# Epic 2 — Type Safety & DTO Layer

> **Priority**: P0 · **Owner**: Architect · **Status**: In Progress · **Phase**: B

## Goal

Eliminate every `as unknown as Type[]` cast at the server-action ↔ client boundary by deriving types from action return values. Make the type checker the source of truth for data shapes that cross process boundaries.

## Background

Audit found 15 `as unknown as` casts across 7 host/passenger pages:
- `transport-host/[id]/routes/page.tsx` (3)
- `transport-host/[id]/schedule/page.tsx` (4)
- `transport-host/[id]/buses/page.tsx` (3)
- `trips/[id]/page.tsx` (2)
- `booking/checkout/content.tsx` (1)
- `booking/[id]/page.tsx` (1)
- `booking/[id]/ticket/page.tsx` (1)

Root cause: server actions return Prisma payloads (`findMany` with deep `include`), but page-local interfaces are narrower hand-rolled shapes. The two diverge over time. Casts hide real shape drift.

## Stories

| ID | Title | Files |
|---|---|---|
| 2.1 | Document `Awaited<ReturnType<typeof X>>` DTO pattern | `docs/architecture.md` (already done in §4.1 + §15) |
| 2.2 | Fix `transport-host/[id]/routes/page.tsx` | that file |
| 2.3 | Fix `transport-host/[id]/schedule/page.tsx` | that file |
| 2.4 | Fix `transport-host/[id]/buses/page.tsx` | that file |
| 2.5 | Fix passenger pages (4 files) | trips/[id], booking/checkout, booking/[id], booking/[id]/ticket |
| 2.6 | ESLint rule banning `as unknown as` in `src/app/**` | `eslint.config.mjs` |

## Epic Acceptance Criteria

- [ ] Zero `as unknown as` casts in `src/app/**`.
- [ ] All page-local DTO interfaces removed; types derived from action return.
- [ ] ESLint rule blocks new `as unknown as` introductions.
- [ ] Strict tsc still passes.

## Dependencies

- Epic 1 in place (CI gates lint).

## Out of scope

- Refactoring action return shapes (separate work).
- Replacing Prisma `Decimal` with `number` in DB — DTOs map at the action boundary via `.toNumber()`.

## Technical notes

DTO derivation pattern:

```ts
// in page.tsx
import { getRoutesByOffice } from "@/lib/actions/transport-actions";

type RoutesResult = Awaited<ReturnType<typeof getRoutesByOffice>>;
type RouteData = RoutesResult extends { ok: true; data: infer D } ? D[number] : never;
```

When the action returns `Decimal` fields, map them inside the action before returning:

```ts
return { ok: true, data: rows.map(r => ({ ...r, price: r.price.toNumber(), duration: r.duration.toNumber() })) };
```

The page receives plain numbers; no client-side `.toNumber()` is needed.
