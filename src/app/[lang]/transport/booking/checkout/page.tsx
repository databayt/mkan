import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import CheckoutContent from "./content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  return createMetadata({
    title: lang === "ar" ? "الدفع" : "Checkout",
    description:
      lang === "ar"
        ? "أكمل حجزك وادفع"
        : "Complete your booking and pay",
    locale: lang,
    path: "/transport/booking/checkout",
  });
}

export default function CheckoutPage() {
  return <CheckoutContent />;
}
