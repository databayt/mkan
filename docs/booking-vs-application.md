# Booking vs Application — Dual-Track Rental Flow

> mkan supports two parallel paths against the same `Listing` model. They look
> similar at the data layer but serve very different user intents. Mixing them
> in the same UI flow has been a recurring source of confusion — this doc is
> the canonical reference.

## TL;DR

| Path | Use case | Duration | Trigger | Models touched |
|------|----------|----------|---------|----------------|
| **Booking** (Airbnb-style) | Short-term stay | nights / weeks | Guest hits "Reserve" with check-in/check-out dates | `Listing` → `Booking` → `Payment` (Stripe) → `Review` |
| **Application** (lease-style) | Long-term rental | months+ | Guest hits "Apply to rent" with personal info + lease term | `Listing` → `Application` → (host approves) → `Lease` → recurring `Payment` rows |

Both paths produce a paid relationship between the host and the tenant. They
do not interoperate: a `Booking` is never converted into a `Lease`, and an
`Application` never produces a `Booking`.

## When to render which

- The listing detail page reads `Listing.rentalType` to decide which CTA the
  reserve widget shows. Today the field is implicit (defaults to short-term
  Booking); a future migration will make it explicit on every row.
- Hosts pick the type at listing creation time. Hosts can have a mix.

## Why both exist

mkan operates in markets (Sudan, Saudi Arabia) where Airbnb-style nightly
rentals and traditional yearly leases coexist for the same kind of property.
Forcing the two into one flow drops one or the other:

- Airbnb-style booking has no application step. Pushing tenants through one
  kills conversion on weekend trips.
- Long-term lease has signed paperwork, security deposit, monthly invoicing,
  and the host's right to decline. Trying to model it as a many-night
  Booking loses all of that.

## Codebase entry points

| Surface | File |
|--------|------|
| Booking server actions | `src/lib/actions/booking-actions.ts` |
| Application server actions | `src/lib/actions/application-actions.ts` |
| Lease server actions | `src/lib/actions/user-actions.ts` (`getListingLeases`) |
| Payment server actions | `src/lib/actions/payment-actions.ts` |
| Review server actions | `src/lib/actions/review-actions.ts` (only the Booking path emits Reviews today) |
| Booking UI (guest) | `src/app/[lang]/bookings/[id]/...` |
| Application UI (guest) | `src/app/[lang]/(dashboard)/tenants/applications/...` |
| Lease UI (tenant) | `src/app/[lang]/(dashboard)/tenants/residences/[id]/...` |
| Manager UI | `src/app/[lang]/(dashboard)/managers/{applications,properties}/...` |

## What NOT to do

- ❌ Don't add a `bookingId` foreign key to `Application` or vice versa.
- ❌ Don't render both reserve widgets on the same listing detail page.
- ❌ Don't migrate one set of rows into the other "to clean up". They're not
  duplicates — they're different relationships.
- ❌ Don't write a single `cancel()` action that handles both. The
  cancellation policies differ (Stripe partial refund for Booking; lease
  break-fee + remaining balance for Application).

## Followups

- **Make `rentalType` explicit on `Listing`** so the reserve widget doesn't
  have to infer. Tracked in EPICS.
- **Notification model** so the host gets pinged on a new Application or a
  new Booking with one event source. Tracked in EPICS.
- **Conversation/Message model** for guest↔host chat — both flows need it.
  Tracked in EPICS.
