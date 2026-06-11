import Stripe from "stripe";

// Stripe is initialized lazily so a missing key only fails the call sites
// that need it, not module load (which would break unrelated payment
// reads). Throws a clear error at the first call site instead.
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(key, { apiVersion: "2026-04-22.dahlia" });
}
