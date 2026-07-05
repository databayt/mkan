import { notFound } from "next/navigation";
import { getBooking } from "@/lib/actions/booking-actions";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { localizeListing } from "@/components/translation/localize";
import { shouldOfferCardPayment } from "@/lib/geo";
import BookingCheckoutContent from "./content";

export default async function BookingCheckoutPage({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  const bookingId = Number(id);
  if (!Number.isFinite(bookingId) || bookingId <= 0) notFound();

  let booking;
  try {
    booking = await getBooking(bookingId);
  } catch {
    notFound();
  }
  if (!booking) notFound();

  const payload = booking as unknown as BookingPayload;
  // Localize the listing's stored free-text (title + location) for the viewer.
  payload.listing = (await localizeListing(
    payload.listing as unknown as Record<string, unknown>,
    lang as "en" | "ar",
  )) as unknown as BookingPayload["listing"];

  const dict = await getDictionary(lang as "en" | "ar");
  // Stripe can't serve Sudan — only offer the card rail to diaspora (non-SD geo).
  const showCard = await shouldOfferCardPayment();

  return (
    <BookingCheckoutContent
      lang={lang}
      booking={payload}
      dict={dict as unknown as Record<string, Record<string, string>>}
      showCard={showCard}
    />
  );
}

export type BookingPayload = {
  id: number;
  checkIn: Date;
  checkOut: Date;
  guestCount: number;
  nightsCount: number;
  nightlyRate: number;
  cleaningFee: number;
  serviceFee: number;
  taxes: number;
  subtotal: number;
  totalPrice: number;
  status: string;
  listing: {
    id: number;
    title: string | null;
    photoUrls: string[];
    location: {
      city: string;
      state: string;
      country: string;
    } | null;
  };
};
