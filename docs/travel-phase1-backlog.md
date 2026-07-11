# Bus Tickets App (Travel Vertical) — Phase 1 Launch Backlog

This document establishes the official backlog, epics, and user stories for launching **Phase 1** of the travel vertical (the Bus Tickets App) inside the Mkan platform. It outlines the current state and specific gap requirements for each user story.

> **Status 2026-07-11 — 22/25 stories done, launch-ready** (commit `587dbc3`).
> All P0 blockers are closed: multi-passenger groups, signed QR tickets, gate
> scanner, verified-only listings, seat locks + hold healing, manual payment
> validation, i18n/RTL. Deliberately deferred, not blocking a manual-payment
> launch:
> - **T-FL.4** calendar timetable — the grouped list view covers dispatch at
>   launch scale (P1 UX).
> - **T-TK.1** PDF export — browser print on the ticket page works today;
>   `@react-pdf/renderer` is installed but Arabic/RTL font embedding is its
>   own project (phase 2).
> - **T-PY.3** Stripe card rail — the geo-gated card checkout is mounted
>   behind `shouldOfferCardPayment()`, but live Stripe keys are an operator
>   TODO; phase 1 is manual-first (Bankak/MoMo/cash) by design.
>
> Operator env TODOs for full effect: `RESEND_API_KEY` (T-TK.2 ticket emails
> no-op without it), optional `TICKET_QR_SECRET` (QR signing falls back to
> `NEXTAUTH_SECRET`), Stripe live keys (T-PY.3). Ops: re-run
> `scripts/topup-transport-trips.ts` before the trip horizon (currently
> 2026-07-22) runs dry.

---

## 📋 Backlog Summary

| Epic ID | Title | Stories | Priority |
|---|---|---|---|
| **T-OB** | Operator Onboarding & Verification | T-OB.1 – T-OB.5 | P0 (Blocker) |
| **T-FL** | Fleet, Routes & Trip Scheduling | T-FL.1 – T-FL.4 | P0 / P1 |
| **T-BK** | Booking & Seat Reservation | T-BK.1 – T-BK.3 | P0 (Blocker) |
| **T-MP** | Multi-Passenger Bookings (Groups) | T-MP.1 – T-MP.4 | P0 (Blocker) |
| **T-TK** | Ticket Delivery & Boarding Validation | T-TK.1 – T-TK.4 | P0 / P1 |
| **T-PY** | Payment Integration & Ledgers | T-PY.1 – T-PY.3 | P0 (Blocker) |
| **T-LN** | i18n Translation & RTL Polish | T-LN.1 – T-LN.2 | P0 (Blocker) |

---

## 🏗️ Epic Breakdown & User Stories

### Epic T-OB: Operator Onboarding & Verification (P0)
*Hardens operator registration to ensure only validated transport offices can list schedules and accept payments.*

#### ✅ T-OB.1: Operator Verification Dashboard UI
- **Objective:** Give platform administrators a direct interface to verify operators.
- **Current State:** The backend action `verifyOffice`/`unverifyOffice` in `travel-actions.ts` exists but has no UI entry point.
- **Gap:** Add verification toggle buttons in `/admin/travel` (or a sub-tab `/admin/travel/offices`) displaying all unverified operators.
- **Impact Files:**
  - `src/app/[lang]/admin/travel/page.tsx`
  - `src/lib/actions/travel-actions.ts`

#### ✅ T-OB.2: Filter Search Results by Verification Status
- **Objective:** Prevent unverified operator routes from displaying to travelers.
- **Current State:** `searchTrips` displays all active schedules regardless of operator verification status.
- **Gap:** Update the search query inside `searchTrips` to strictly return records where `route.office.isVerified = true`.
- **Impact Files:**
  - `src/lib/actions/travel-actions.ts`

#### ✅ T-OB.3: Defer Office Placeholder Creation
- **Objective:** Avoid database pollution with empty/incomplete office rows.
- **Current State:** Accessing `/travel-host/overview` automatically triggers an empty DB row insertion.
- **Gap:** Defer DB row insertion until the user submits the first stage of the operator setup form.
- **Impact Files:**
  - `src/app/[lang]/travel-host/overview/page.tsx`

#### ✅ T-OB.4: Verified Badge Display
- **Objective:** Display trust signals on customer-facing pages.
- **Current State:** Office verification fields exist but are not visible to travelers.
- **Gap:** Render a "Verified" badge next to the operator name in `TripCard` elements, checkout views, and tickets.
- **Impact Files:**
  - `src/components/travel/trip/trip-card.tsx`
  - `src/app/[lang]/travel/booking/checkout/content.tsx`

#### ✅ T-OB.5: Detailed Operator Profile settings (Bank/Mobile Money info)
- **Objective:** Let operators update contact profiles and payment destinations.
- **Current State:** Database has columns for `bankName`, `bankAccount`, and `momoNumber` but there are no editor interfaces.
- **Gap:** Build form components on `/travel-host/[id]/office-info` letting operators configure working hours, contact info, logos, and payout destinations.
- **Impact Files:**
  - `src/app/[lang]/travel-host/[id]/office-info/page.tsx`

---

### Epic T-FL: Fleet, Routes & Scheduling (P1)
*Enables operators to scale up trip scheduling and map correct layouts.*

#### ✅ T-FL.1: Map Bus Layout Configuration to Seat Grids
- **Objective:** Render accurate bus layouts (e.g., columns, aisles, driver position) during booking.
- **Current State:** Trip creation automatically generates seats using a hardcoded 4-column math allocation.
- **Gap:** Parse the `Bus.seatLayout` JSON property during trip creation to map row, column, and blocking parameters.
- **Impact Files:**
  - `src/lib/actions/travel-actions.ts`

#### ✅ T-FL.2: Bulk & Recurring Trip Creator
- **Objective:** Reduce operator overhead in scheduling daily departures.
- **Current State:** Only single trip creations are supported (~420 clicks required per office-month).
- **Gap:** Build a recurring scheduler page `/travel-host/[id]/schedule` allowing operators to select route, bus, time, price, and repeat patterns (e.g., daily for 14 days).
- **Impact Files:**
  - `src/app/[lang]/travel-host/[id]/schedule/page.tsx`
  - `src/lib/actions/travel-actions.ts`

#### ✅ T-FL.3: Both Directions Route Shortcut
- **Objective:** Let operators schedule return routes at the same time.
- **Current State:** Route scheduler has to be filled separately for opposite directions.
- **Gap:** Add a "Both Directions" check box to duplicate trip schedules dynamically on the complementary route.
- **Impact Files:**
  - `src/app/[lang]/travel-host/[id]/schedule/page.tsx`

#### ⬜ T-FL.4: Office Calendar Timetable View
- **Objective:** Provide visual dispatch control for operators.
- **Current State:** Operator interface lists trips in simple tables.
- **Gap:** Build a calendar timetable showing departures, occupancies, and status changes at a glance.
- **Impact Files:**
  - `src/app/[lang]/travel-host/[id]/trips/page.tsx`

---

### Epic T-BK: Booking & Seat Selection (P0)
*Ensures travelers select, reserve, and lock seats safely.*

#### ✅ T-BK.1: Unified Seat Picker Component
- **Objective:** Eliminate logic duplication and UI inconsistencies.
- **Current State:** The seat grid is implemented twice—once as a standalone widget and once inside the trip detail page.
- **Gap:** Delete the duplicate code path and standardise on a single localized component in `src/components/travel/trip/seat-picker.tsx`.
- **Impact Files:**
  - `src/components/travel/trip/seat-picker.tsx`
  - `src/app/[lang]/travel/trips/[id]/content.tsx`

#### ✅ T-BK.2: Concurrency Lock during checkout
- **Objective:** Prevent double-booking race conditions during seat assignment.
- **Current State:** Checked seats are validated via soft reads inside a read-committed transaction block.
- **Gap:** Implement pessimistic locking (`SELECT ... FOR UPDATE`) on the targeted `Seat` rows inside `createBooking` before status changes.
- **Impact Files:**
  - `src/lib/actions/travel-actions.ts`

#### ✅ T-BK.3: Automated TTL Seat Release
- **Objective:** Return abandoned seat holds to inventory.
- **Current State:** Seats are held for 30 minutes, but cron routing has no unit integration.
- **Gap:** Harden the Vercel cron endpoint `/api/cron/release-seats` to sweep seats with expired holds safely.
- **Impact Files:**
  - `src/app/api/cron/release-seats/route.ts`

---

### Epic T-MP: Multi-Passenger Support (P0)
*Supports ticket issuance and registration for group travelers.*

#### ✅ T-MP.1: Passenger Database Model
- **Objective:** Support distinct identities for each seat in a booking.
- **Current State:** `TransportBooking` records a single name and phone number for the entire transaction.
- **Gap:** Establish the `Passenger` database schema to register individual traveller details for each seat.
  ```prisma
  model Passenger {
    id          Int              @id @default(autoincrement())
    bookingId   Int
    name        String
    phone       String?
    idCard      String?
    seatNumber  String
    booking     TransportBooking @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  }
  ```
- **Impact Files:**
  - `prisma/schema.prisma`

#### ✅ T-MP.2: Multi-Passenger Checkout Form
- **Objective:** Capture passenger details.
- **Current State:** Checkout forms have a single input block.
- **Gap:** Dynamically generate input fields (Name, Phone, ID card number) for each selected seat.
- **Impact Files:**
  - `src/app/[lang]/travel/booking/checkout/content.tsx`

#### ✅ T-MP.3: Per-Passenger Ticket rendering
- **Objective:** Provide passengers with separate boarding documents.
- **Current State:** Ticketing renders one QR code and one page per booking.
- **Gap:** Modify `/travel/booking/[id]/ticket` to render multiple pages/tabs, each with its own QR code corresponding to the unique passenger details.
- **Impact Files:**
  - `src/app/[lang]/travel/booking/[id]/ticket/content.tsx`

#### ✅ T-MP.4: Partial Cancellations
- **Objective:** Allow single travelers in a group booking to cancel.
- **Current State:** Bookings can only be cancelled in full.
- **Gap:** Wire logic letting operators release specific seats in a booking while updating invoice balances.
- **Impact Files:**
  - `src/lib/actions/travel-actions.ts`

---

### Epic T-TK: Ticket Delivery & Validation (P0)
*Controls the physical ticket issuance and validation at terminal gates.*

#### ⬜ T-TK.1: Ticket PDF Generator
- **Objective:** Enable travelers to export tickets.
- **Current State:** Booking cards rely on standard browser print configurations.
- **Gap:** Establish an API route `/api/travel/tickets/[id]/pdf` using `@react-pdf/renderer` or node-canvas to output formatted PDF tickets.
- **Impact Files:**
  - `src/app/api/travel/tickets/[id]/pdf/route.ts`

#### ✅ T-TK.2: Automated Email Delivery on payment confirmation
- **Objective:** Deliver tickets automatically.
- **Current State:** `confirmBooking` updates statuses but does not dispatch emails.
- **Gap:** Call `sendBookingConfirmationEmail` with the PDF ticket attachment upon successful validation.
- **Impact Files:**
  - `src/lib/actions/travel-actions.ts`

#### ✅ T-TK.3: Cryptographically Signed QR Codes
- **Objective:** Prevent ticket forgery.
- **Current State:** QR codes contain plain JSON text.
- **Gap:** Implement HMAC-SHA256 signatures inside `generateTicketData` using a secure environment variable key, confirming authenticity upon scan.
- **Impact Files:**
  - `src/lib/actions/travel-actions.ts`
  - `src/app/[lang]/travel/booking/[id]/ticket/page.tsx`

#### ✅ T-TK.4: Operator Mobile scanning view
- **Objective:** Let ticket agents scan passengers on their phones at terminal entrances.
- **Current State:** QR scanner page does not exist.
- **Gap:** Create `/travel-host/[id]/scanner` using standard browser camera WebRTC hooks to read ticket QRs and validate them using `validateTicket`.
- **Impact Files:**
  - `src/app/[lang]/travel-host/[id]/scanner/page.tsx`

---

### Epic T-PY: Payment Integrations (P0)
*Wires financial checkout logic directly to operator account destinations.*

#### ✅ T-PY.1: Operator specific checkout instructions
- **Objective:** Direct manual transfers to the correct operator accounts.
- **Current State:** Bankak/MTN account detail fields show system-wide hardcoded dummy numbers.
- **Gap:** Pull coordinates from the verified `TransportOffice` model on checkout load to populate transfer accounts. Hide selectors if accounts are left unconfigured.
- **Impact Files:**
  - `src/app/[lang]/travel/booking/checkout/content.tsx`

#### ✅ T-PY.2: Admin Manual Payment validation UI
- **Objective:** Allow administrators to audit and confirm manual transfers.
- **Current State:** `/admin/payments` is read-only.
- **Gap:** Add "Approve" (calls `verifyBookingPayment`) and "Decline" actions next to manual payments pending review.
- **Impact Files:**
  - `src/app/[lang]/admin/payments/page.tsx`

#### ⬜ T-PY.3: Stripe card payment routing
- **Objective:** Charge international bank cards.
- **Current State:** Checkout routes to placeholder flows for Stripe checkout.
- **Gap:** Mount the client `<PaymentElement>` component for credit/debit bookings in the Stripe card checkout tab.
- **Impact Files:**
  - `src/app/[lang]/travel/booking/checkout/content.tsx`

---

### Epic T-LN: Localisation & Arabic-First RTL sweep (P0)
*Ensures consistent localization and proper physical layouts.*

#### ✅ T-LN.1: Operator Panel Translations
- **Objective:** Let operators use the system entirely in Arabic.
- **Current State:** Onboarding tabs and settings remain hardcoded in English.
- **Gap:** Extract all operator-facing UI labels and warnings to `en.json` and `ar.json`.
- **Impact Files:**
  - `src/components/internationalization/en.json`
  - `src/components/internationalization/ar.json`

#### ✅ T-LN.2: RTL Timeline and Chevron Mirroring
- **Objective:** Align visual elements to language orientation.
- **Current State:** Route arrows point left-to-right even under Arabic RTL locales.
- **Gap:** Standardise route indicator components to follow logical CSS classes (`rtl:rotate-180`, etc.).
- **Impact Files:**
  - `src/app/[lang]/travel/page.tsx`
  - `src/components/travel/trip/trip-card.tsx`
