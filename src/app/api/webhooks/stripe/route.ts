import { NextResponse } from "next/server";
import { handleStripeWebhook } from "@/lib/actions/payment-actions";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  // Stripe requires the raw body to verify the signature; reading text()
  // before any JSON parsing keeps the bytes intact.
  const payload = await req.text();

  const result = await handleStripeWebhook(payload, signature);
  if (!result.ok) {
    logger.warn("stripe_webhook_rejected", { error: result.error });
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ received: true });
}
