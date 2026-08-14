/**
 * Phase-1 launch flags — the single source of truth for what is VISIBLE this phase.
 *
 * Philosophy (Port Sudan launch): honest, simple, contact-only. We HIDE mock /
 * fabricated / not-yet-wired UI behind these flags instead of deleting it, so a later
 * phase can flip a flag back on (a one-line change) once the feature is real.
 *
 * Usage:
 *   import { PHASE1 } from "@/config/phase-flags";
 *   {PHASE1.showWhereYouSleep && <WhereYouSleep ... />}
 *
 * Keep this file as the register: every hidden section maps to exactly one flag, with a
 * comment stating what it needs before it can be turned on. See the phase-1 plan §1/§10.
 */
export const PHASE1 = {
  /** Desktop reserve widget, availability calendar, price breakdown, checkout→Stripe.
   *  OFF = contact-only (call the host). Phase 2: flip on when online payments are live. */
  enableOnlineBooking: false,

  /** Amenities section on the detail page. WIRED to real `listing.amenities` (enum + AR/EN
   *  labels already exist under `rental.property.amenities.*`). The component still renders
   *  only when `amenities.length > 0` — an empty list hides the section, never an empty block. */
  showListingAmenities: true,

  /** Highlights section. WIRED to real `listing.highlights`; renders only when non-empty. */
  showListingHighlights: true,

  /** "Where you'll sleep" beds. Fabricated per-room "1 bed"; schema has no per-room bed data.
   *  Phase 2: wire real bed data when the model supports it. */
  showWhereYouSleep: false,

  /** "Things to know" (house rules / safety / cancellation). Currently fabricated (invented
   *  smoke/CO alarms, "Check-in after 3:00 PM"). Phase 2: wire real houseRules +
   *  cancellationPolicy enum (needs new `cancellationPolicy` dictionary value-labels). */
  showThingsToKnow: false,

  /** Mobile "info" cards ("Fast wifi 100 Mbps", "Free cancellation before Aug 7", "Park for
   *  free"). Fabricated / misleading refund claim — no backing data. Phase 2: only if real. */
  showMobileInfoCards: false,

  /** Square-footage spec. Imperial unit, almost always null, wrong unit for Sudan.
   *  Phase 2: convert to m² if the data is populated. */
  showSqFt: false,

  /** "Message host" buttons (desktop + mobile). WIRED as of 2026-08-14: `createConversation`
   *  in `message-actions.ts` opens a guest-initiated thread (one per guest x listing) and
   *  records a CONTACT_MESSAGE funnel event. Before it existed only a seed script could
   *  create a Conversation, so this button had nothing to call. */
  showMessageHost: true,

  /** Footer currency/language switcher buttons. Non-functional (no onClick) and mislabelled.
   *  OFF until they actually switch. Currency/locale already work via the URL locale prefix. */
  showFooterLocaleSwitcher: false,

  /** `/search` mobile map: when TRUE the top-strip preview map is replaced by a gray
   *  "Show map" placeholder and the real map mounts only on tap (saves shipping
   *  mapbox-gl ~200 KB+ to every mobile visitor, and avoids a map-canvas flash when
   *  navigating back from a listing — reported 2026-07-02).
   *  Set back to FALSE on 2026-07-04 per owner request: the top-section preview map
   *  (the one the homes list scrolls up over) had disappeared and is wanted back.
   *  Trade-off accepted: mapbox-gl loads on every mobile /search again, and the
   *  back-nav canvas flash may return (address separately if it regresses). */
  deferSearchMapMobile: false,

  /** Owners are nudged to reconfirm each home's Available/Busy status after this many days
   *  of no availability confirmation (§5 D2 — the Availability Check dialog). */
  availabilityReminderDays: 14,

  // ── Transport vertical ──────────────────────────────────────────────────

  /** Transport landing testimonials. Fabricated reviewers with full names, routes and
   *  quotes, under "Thousands of travelers trust Mkan". Phase 2: wire real traveler
   *  reviews once completed bookings generate them. */
  showTransportTestimonials: false,

  /** Transport landing operator-logo carousel. The 9 brands shown (Tirhal, Musafir, …)
   *  are NOT the operators seeded/onboarded on the platform, the caption claims
   *  "trusted operators on our platform", and every logo links to a dead `?ref=arc`.
   *  Phase 2: rebuild from real verified TransportOffice logos, or sign partnerships. */
  showTransportOperatorLogos: false,

  // NOTE: reviews are gated on REAL data, not a flag — render the rating/reviews chip only
  // when `numberOfReviews > 0` (never the fabricated "★ 4.8 · 128 reviews").
} as const;

export type Phase1Flags = typeof PHASE1;
