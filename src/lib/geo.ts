import { headers } from "next/headers";

/**
 * ISO-3166 alpha-2 country for the current request, read from the edge.
 * Vercel injects `x-vercel-ip-country` on every request; returns `null`
 * off-Vercel, in local dev, or if an upstream proxy strips the header.
 */
export async function getRequestCountry(): Promise<string | null> {
  const h = await headers();
  return h.get("x-vercel-ip-country");
}

/**
 * Sudan-first card-payment gate.
 *
 * Stripe cannot serve Sudan (OFAC sanctions) and Sudan-issued cards are
 * declined, so showing a card field to a Sudanese user only yields failed
 * charges and broken booking confirmations. The card option is therefore
 * offered ONLY when we can positively place the request OUTSIDE Sudan
 * (diaspora booking for family). Unknown geo — local dev, non-Vercel host, or
 * a stripped header — is treated as Sudan and the card option is hidden. The
 * reference rails (Bankak / Cashi / mobile money / bank transfer) and cash are
 * the primary, always-available money path and never depend on this flag.
 */
export async function shouldOfferCardPayment(): Promise<boolean> {
  const country = await getRequestCountry();
  return country !== null && country !== "SD";
}
