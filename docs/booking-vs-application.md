# Booking vs Application — the two rental flows

Mkan's Homes vertical carries **two parallel, deliberate rental flows**. They
share the `Listing` catalog but have separate models, actions, dashboards and
payment lifecycles. Contributors keep confusing them — this doc is the
canonical distinction. Cross-linked from the headers of
`src/lib/actions/booking-actions.ts` and `src/lib/actions/application-actions.ts`.

## TL;DR

| | **Booking** (short-term stay) | **Application → Lease → Payment** (long-term rental) |
|---|---|---|
| Mental model | Airbnb: pick dates, pay, stay | Classic rental: apply, get approved, sign lease, pay monthly |
| Entry UI | Listing detail `/[lang]/listings/[id]` → `property-reserve.tsx` reserve card | Property pages → `application-modal.tsx` / `contact-widget.tsx` |
| Models | `Booking`, `BookingPayment` | `Application`, `Lease`, `Payment` |
| Actions | `src/lib/actions/booking-actions.ts` (`createBooking`, `cancelBooking`, …) | `src/lib/actions/application-actions.ts` + lease/payment actions |
| Money | Upfront at checkout: Stripe card / reference (Bankak, MoMo, bank) / cash — persisted as `BookingPayment`, webhook or admin `verifyBookingPayment` confirms | Monthly `Payment` rows generated per lease (`/api/cron/generate-monthly`), overdue marked by `/api/cron/mark-overdue` |
| Cancellation | `cancelBooking` computes policy refund (`src/lib/refund.ts`) and fires the Stripe refund | Lease termination — manual/manager-driven, no automated refund path |
| Guest-side UI | `/[lang]/bookings/[id]` + tenant "Trips" tab | `/[lang]/(dashboard)/tenants/applications` + `residences` |
| Host-side UI | `/[lang]/hosting` (today/bookings) | `/[lang]/(dashboard)/managers` (properties, applications, leases) |

## What decides which flow a guest enters

There is **no schema flag** (no `rentalType` column). The flow is decided by
the **surface** the guest uses:

- The Airbnb-style listing detail page (`/listings/[id]`, plus `/search` and
  the home carousels feeding it) renders the **reserve card** → Booking flow.
- The property/dashboard surfaces (manager-listed properties, the
  contact/apply widgets) render the **application modal** → Application flow.

Both flows are intentionally kept (EPICS H10 decision): "Stays" is the
consumer marketplace product; "Rentals" is the property-management product
inherited from the original tenant/manager design.

## Rules of thumb

1. **Never mix models across flows.** A `Booking` is not a `Lease`; a
   `BookingPayment` is not a `Payment`. Cancel actions are flow-specific
   (`cancelBooking` for stays — the tenant Trips tab wires the correct one per
   row type).
2. **New payment features land in the Booking flow first** — it is the
   revenue path that is wired end-to-end (Stripe intent → webhook →
   confirmation, refund calculator, admin verification tabs).
3. **The Transport vertical mirrors the Booking flow**, not the lease flow:
   `TransportBooking`/`TransportPayment` with the same
   card/reference/cash + operator-verify pattern.
