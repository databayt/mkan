import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";
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

export default function CheckoutPage() {
  return <CheckoutContent />;
}
