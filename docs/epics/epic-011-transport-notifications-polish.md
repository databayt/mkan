# Epic 11 — Transport Notifications & Polish

> **Priority**: P1 · **Owner**: Backend · **Status**: To Do · **Phase**: D

## Goal

Close transport-side TODOs (cancel-trip notifications, confirmation emails) and align transport data with the project i18n single-language rule (drop `nameAr`/`descriptionAr` DB fields). Add missing test coverage for ticket validate and seat-release sweeper.

## Background

Current state:
- `src/lib/actions/transport-actions.ts:1050` — `// TODO: Send notifications to booked passengers` inside `cancelTrip`. When an operator cancels a trip, passengers don't get notified.
- `confirmBooking` doesn't send a confirmation email (audit found this).
- `TransportOffice` and `AssemblyPoint` have `nameAr` and `descriptionAr` columns. The project rule is single-language source of truth in dictionaries; bilingual DB fields conflict.
- No tests for ticket QR validate (admin scans → marks used) or seat-release sweeper (`releaseExpiredSeatHolds` cron).

## Stories

| ID | Title | Files |
|---|---|---|
| 11.1 | `cancelTrip` notifies booked passengers (email + status) | `transport-actions.ts:1050`, `mail.ts` |
| 11.2 | `confirmBooking` sends booking confirmation email | actions, templates |
| 11.3 | Drop `nameAr`/`descriptionAr` from `TransportOffice`/`AssemblyPoint`; move to dictionaries | schema migration, components |
| 11.4 | E2E: ticket-validate (admin scans QR → marks used) | `tests/transport/ticket-validate.spec.ts` |
| 11.5 | E2E: seat-release sweeper TTL test | `tests/transport/seat-release.spec.ts` |

## Epic Acceptance Criteria

- [ ] Cancelling a trip emails every booked passenger and updates each booking to `CANCELLED_BY_OPERATOR`.
- [ ] Confirming a booking sends a confirmation email with QR ticket link.
- [ ] No `nameAr`/`descriptionAr` columns exist in DB; UI reads from dictionaries; existing data migrated to dictionary keys.
- [ ] Ticket validate test passes (admin marks ticket used → cannot be reused).
- [ ] Seat-release test passes (held seat after 30 min TTL becomes Available).

## Dependencies

- Epic 1 (env validation includes Resend key).
- Existing `mail.ts` Resend wrapper.

## Out of scope

- SMS notifications (Twilio etc.) — email-only for v1.0.
- Push notifications.

## Technical notes

- For 11.3, migration: add temporary `name_key`/`description_key` columns; backfill from current `nameAr`/`name`/etc. into dictionaries; drop old columns. Keep `name` (English/canonical) as the slug source.
- Email templates: lightweight HTML in `src/lib/mail-templates/`. Subject + body parameterized.
- Ticket validate test uses Playwright to scan QR via simulated input (the QR encodes `bookingId + token`).
- Seat-release: trigger via the actual cron path `/api/cron/release-seats` with a test secret; verify the seat record flips state.
