# Epic 10 — Transport Multi-Gateway Payments

> **Priority**: P0 · **Owner**: Payments · **Status**: To Do · **Phase**: D

## Goal

Same gateway set as Epic 4 (Stripe + Bankak + Cashi + mobile money + bank transfer + cash on arrival), integrated with transport's existing `processPayment` / `verifyPayment` / `confirmBooking` actions. Replace fake `transactionId` with real provider IDs.

## Background

Current state:
- `src/lib/actions/transport-actions.ts:1566-1655` — `processPayment` and `verifyPayment` exist.
- `processPayment` calls `confirmBooking` for non-cash methods (line 1611-1613).
- For cards/bank transfer, it stores a fake `transactionId` (placeholder).
- Checkout UI (`booking/checkout/content.tsx`) supports 4 methods (mobile money, card, bank transfer, cash on arrival).
- Real gateway integration is missing — same gap as homes.

After Epic 4 lands the homes side and the Stripe webhook + reference-based forms exist, this epic reuses those primitives for transport.

## Stories

| ID | Title | Files |
|---|---|---|
| 10.1 | Refactor `processPayment` to dispatch by gateway | `src/lib/actions/transport-actions.ts` |
| 10.2 | Stripe payment intent for transport (reuse Epic 4.2 plumbing) | actions + webhook route |
| 10.3 | `verifyPayment` polls webhook + supports manual admin verify | that file |
| 10.4 | Replace fake `transactionId` with real provider ID | actions |
| 10.5 | Update transport checkout with full method selector (Bankak, Cashi, etc.) | `src/app/[lang]/transport/booking/checkout/content.tsx` |
| 10.6 | Unit + E2E tests for each payment method | tests |

## Epic Acceptance Criteria

- [ ] Passenger can pay for a bus seat via Stripe → webhook → ticket issued.
- [ ] Passenger can pay via Bankak/Cashi/mobile money/bank transfer; payment shows `PENDING_VERIFICATION`; admin verifies → ticket issued.
- [ ] Passenger can pay cash on arrival (existing); booking confirmed but payment status `PENDING`.
- [ ] All `transactionId` values are real (not placeholder strings).
- [ ] Checkout UI shows the same gateway set as homes.
- [ ] Unit + E2E green for each gateway.

## Dependencies

- Epic 4 (Stripe webhook route, reference verification queue, email receipts) must land first.
- `processPayment` calling `confirmBooking` already noted in memory: don't double-call from clients.

## Out of scope

- Per-trip dynamic pricing (post-v1.0).
- Group bookings with split payment (post-v1.0).

## Technical notes

- The Stripe webhook route from Epic 4.3 dispatches by `metadata.kind` (`booking` for homes, `transport_booking` for transport).
- The `PaymentReference` model from Epic 4.1 is gateway-agnostic and stores both homes and transport refs.
- Reuse the form components from Epic 4.5-4.8 (`bankak-form.tsx`, etc.) — they accept `bookingId` + `kind` and submit to the same action.
- Admin verification queue (Epic 4.10) shows both homes and transport refs in one table.
