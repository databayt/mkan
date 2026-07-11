import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";
import { shouldOfferCardPayment } from "@/lib/geo";
import { getBooking } from "@/lib/actions/travel-actions";
import CheckoutContent from "./content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const t = (await getDictionary(lang as Locale))?.travel;
  return createMetadata({
    title: t?.meta?.checkoutTitle ?? "Checkout",
    description: t?.meta?.checkoutDescription ?? "Complete your booking and pay",
    locale: lang,
    path: "/travel/booking/checkout",
  });
}

interface CheckoutPageProps {
  searchParams: Promise<{ bookingId?: string }>;
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const { bookingId } = await searchParams;
  const id = Number(bookingId);

  // Stripe can't serve Sudan — only offer the card rail to diaspora (non-SD geo).
  // getBooking enforces auth + ownership server-side.
  const [showCard, booking] = await Promise.all([
    shouldOfferCardPayment(),
    Number.isFinite(id) && id > 0
      ? getBooking(id).catch(() => null)
      : Promise.resolve(null),
  ]);

  return <CheckoutContent showCard={showCard} booking={booking} />;
}
