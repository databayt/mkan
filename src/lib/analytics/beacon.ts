/**
 * Browser side of the marketplace funnel.
 *
 * Kept free of any `@prisma/client` or `node:` import so it can be pulled into
 * a client bundle without dragging the Prisma runtime with it — the event names
 * are mirrored as a string union instead. They must stay in sync with the
 * `ListingEventType` enum in prisma/schema.prisma (which is append-only).
 */

export type TrackableEvent =
  | "VIEW"
  | "CONTACT_PHONE_REVEAL"
  | "CONTACT_PHONE_CLICK";

/**
 * Fire-and-forget. `sendBeacon` is the right primitive here: it survives the
 * page teardown that a `tel:` link causes on mobile, where a plain `fetch`
 * would be cancelled as the dialer takes over and the inquiry would vanish
 * exactly on the interaction we most want to count.
 *
 * The payload is a text/plain Blob carrying JSON so the request stays a simple
 * request with no preflight; the route reads it as text and parses it.
 *
 * Never throws and never reports failure — a dropped analytics event is not
 * worth a broken interaction.
 */
export function trackEvent(listingId: number, type: TrackableEvent): void {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(listingId) || listingId <= 0) return;

  const payload = JSON.stringify({ listingId, type });

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "text/plain;charset=UTF-8" });
      if (navigator.sendBeacon("/api/track", blob)) return;
    }
    // sendBeacon returns false when the user-agent's queue is full, and is
    // absent on some older browsers. keepalive gives the fetch the same
    // survive-the-unload behaviour.
    void fetch("/api/track", {
      method: "POST",
      body: payload,
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
  } catch {
    // Ignore — analytics must never surface to the visitor.
  }
}
