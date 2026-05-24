# Epic 6 — Homes Editor Completeness

> **Priority**: P1 · **Owner**: Frontend · **Status**: To Do · **Phase**: C

## Goal

Replace 9 "Coming Soon" stubs in the host editor with real, tested, i18n-keyed UIs. Every editor sub-page becomes a first-class form that updates the listing.

## Background

Current state — 9 stub pages all rendering `<h1>Coming Soon</h1>`:

**Details (2)**
- `details/number-of-guests/page.tsx`
- `details/availability/page.tsx` (also has `"Calendar view coming soon"` placeholder text mid-content)

**Travel (7)**
- `travel/check-in-method/page.tsx`
- `travel/checkout-instructions/page.tsx`
- `travel/directions/page.tsx`
- `travel/house-rules/page.tsx`
- `travel/guidebooks/page.tsx`
- `travel/house-manual/page.tsx`
- `travel/interaction-preferences/page.tsx`

The `Listing` schema already supports most of these fields (or accommodates extension via JSON). Only the UI is missing.

## Stories

| ID | Title | Files |
|---|---|---|
| 6.1 | `details/number-of-guests` — guest/bedroom/bed/bath capacity controls | that page |
| 6.2 | `details/availability` — full month-grid calendar with date blocking + season pricing entry | that page |
| 6.3 | `travel/check-in-method` — `CheckInMethod` enum select + custom instructions | that page |
| 6.4 | `travel/checkout-instructions` — TipTap rich-text editor with sanitization | that page |
| 6.5 | `travel/directions` — text + optional Mapbox pin | that page |
| 6.6 | `travel/house-rules` — toggle list (smoking / pets / parties / quiet hours / events) + custom rules | that page |
| 6.7 | `travel/guidebooks` — CRUD list of recommendations (name + address + note) | that page |
| 6.8 | `travel/house-manual` — TipTap rich-text manual | that page |
| 6.9 | `travel/interaction-preferences` — host-availability toggles + response time | that page |
| 6.10 | i18n keys (en + ar) + unit tests for all 9 pages | dictionaries + tests |

## Epic Acceptance Criteria

- [ ] No `<h1>Coming Soon</h1>` anywhere in the editor.
- [ ] Each of the 9 pages has a working form that persists to the listing.
- [ ] All save actions are auth + validation gated, follow the canonical action shape.
- [ ] All UI strings come from dictionaries; both en + ar populated.
- [ ] Unit tests for action validation logic; component tests for form rendering.

## Dependencies

- Epic 1 (env validation for ImageKit on photo-related pages).
- Epic 2 (clean DTOs for editor pages).
- TipTap dep already installed (`@tiptap/react`).

## Out of scope

- "Photo tour" page redesign (currently a thin client wrapper — keep as-is).
- "Number of guests" sub-flow changes that affect pricing model (just capacity controls).

## Technical notes

- Schema additions (if needed) live in Story 6.10 alongside i18n. Most fields exist already on `Listing`:
  - `maxGuests`, `bedrooms`, `beds`, `bathrooms` — exist.
  - `checkInMethod` (enum), `checkInInstructions` — likely exist; verify.
  - `houseRules` — JSON or array; verify; add if missing.
  - `houseManual`, `directions`, `guidebooks` — may need new columns or JSON column.
- Rich text: sanitize with `sanitize-html` before save.
- Calendar: use existing `react-day-picker` (transpiled) for month grid; show blocked dates from `BlockedDate` model + booked dates from `Booking`.
- Each page reuses the existing `useListing()` context for in-progress state; persists via existing `updateListing` action with field whitelist.
