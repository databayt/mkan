# Epic 4 — Homes Multi-Gateway Payments

> **Priority**: P0 · **Owner**: Payments · **Status**: To Do · **Phase**: C

## Goal

Replace cash-only homes checkout with a real multi-gateway payment surface: Stripe (international cards, full intent + webhook + refund), reference-based local rails (Bankak, Cashi, mobile money, bank transfer), plus cash at check-in. Admin verification queue for reference-based payments. Email receipts.

## Background

Current state:
- `src/app/[lang]/bookings/[id]/checkout/content.tsx` shows toast `"Card payment coming soon. Using cash for now."` (line 35) and proceeds with cash.
- `src/lib/actions/payment-actions.ts` has 3 explicit TODOs at lines 637, 650, 677:
  - `createStripePaymentIntent` — stub.
  - `handleStripeWebhook` — stub.
  - `processRefund` — stub.
- No reference-based gateway support.
- No admin verification queue.
- No email receipts on payment.

Sudanese local gateways (Bankak, Cashi) lack public APIs. We use a **reference-based** flow: user pays in their own banking/wallet app off-platform, returns to mkan, enters the transaction reference; admin verifies in queue → booking auto-confirms.

## Stories

| ID | Title | Files |
|---|---|---|
| 4.1 | `PaymentGateway` enum + `PaymentMethod`/`PaymentReference` Prisma models | `prisma/schema.prisma`, migration |
| 4.2 | Implement `createStripePaymentIntent` | `src/lib/actions/payment-actions.ts` |
| 4.3 | Implement `handleStripeWebhook` route | `src/app/api/webhooks/stripe/route.ts` |
| 4.4 | Implement `processRefund` (Stripe) | `src/lib/actions/payment-actions.ts` |
| 4.5 | Bankak reference-based form + action | `src/components/booking/payment/bankak-form.tsx`, action |
| 4.6 | Cashi reference-based form + action | `src/components/booking/payment/cashi-form.tsx`, action |
| 4.7 | Generic mobile money form + action | `src/components/booking/payment/mobile-money-form.tsx`, action |
| 4.8 | Bank transfer form + action (with receipt upload) | `src/components/booking/payment/bank-transfer-form.tsx`, action |
| 4.9 | Replace checkout cash-only toast with method selector | `src/app/[lang]/bookings/[id]/checkout/content.tsx` |
| 4.10 | Admin payment verification queue | `src/app/[lang]/admin/payments/page.tsx` |
| 4.11 | Email receipts via Resend for all gateways | `src/lib/mail.ts`, templates |
| 4.12 | Unit tests for each gateway action | `tests/actions/payment-actions.test.ts` |
| 4.13 | E2E Stripe sandbox happy path | `tests/e2e/homes-stripe-payment.spec.ts` |

## Epic Acceptance Criteria

- [ ] User can pay via Stripe (test card → intent → webhook → confirmed) end-to-end.
- [ ] User can pay via Bankak/Cashi/mobile money/bank transfer by entering a reference; payment shows `PENDING_VERIFICATION`.
- [ ] Admin can verify a reference-based payment in queue; verification triggers booking confirmation + email.
- [ ] User can pay cash at check-in; booking confirmed with payment status `PENDING`.
- [ ] Refund via Stripe API works; admin records refund for reference-based.
- [ ] Email receipt sent on every successful payment (regardless of gateway).
- [ ] No `"Card payment coming soon"` text anywhere.
- [ ] All 13 stories shipped; unit + E2E tests green.

## Dependencies

- Epic 1 (env validation includes Stripe keys).
- Epic 2 (DTO clean checkout content).

## Out of scope

- Real API integration with Bankak/Cashi (no public APIs). Reference-based only.
- Subscription / recurring billing (homes are per-booking).
- Multi-currency at the gateway level (Stripe charges USD; reference-based use SDG; UI displays both).

## Technical notes

- Use `stripe` npm package server-side; no client-side `@stripe/stripe-js` until Story 4.2/4.13.
- Webhook route uses `stripe.webhooks.constructEvent` with raw body; Next.js App Router needs `export const runtime = "nodejs"` and `await req.text()`.
- Reference uniqueness enforced at DB level (`@@unique([gateway, reference])`).
- Verification queue uses existing `/admin/payments` route with new tab "Pending verification".
- Email receipts use Resend; templates in `src/lib/mail-templates/`.
- All payment events go through structured logger for audit.
