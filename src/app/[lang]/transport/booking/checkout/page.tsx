import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";
import CheckoutContent from "./content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const m = (await getDictionary(lang)).pageMetadata.transportCheckout;
  return createMetadata({
    title: m.title,
    description: m.description,
    locale: lang,
    path: "/transport/booking/checkout",
  });
}

export default function CheckoutPage() {
  return <CheckoutContent />;
}
