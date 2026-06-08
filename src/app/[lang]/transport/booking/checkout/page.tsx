import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";
import { shouldOfferCardPayment } from "@/lib/geo";
import CheckoutContent from "./content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const t = (await getDictionary(lang as Locale))?.transport;
  return createMetadata({
    title: t?.meta?.checkoutTitle ?? "Checkout",
    description: t?.meta?.checkoutDescription ?? "Complete your booking and pay",
    locale: lang,
    path: "/transport/booking/checkout",
  });
}

export default async function CheckoutPage() {
  // Stripe can't serve Sudan — only offer the card rail to diaspora (non-SD geo).
  const showCard = await shouldOfferCardPayment();
  return <CheckoutContent showCard={showCard} />;
}
