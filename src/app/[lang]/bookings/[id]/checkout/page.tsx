import { notFound } from "next/navigation";
import { getBooking } from "@/lib/actions/booking-actions";
import { getDictionary } from "@/components/internationalization/dictionaries";
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

  const dict = await getDictionary(lang as "en" | "ar");

  return (
    <BookingCheckoutContent
      lang={lang}
      booking={booking as unknown as BookingPayload}
      dict={dict as unknown as Record<string, Record<string, string>>}
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
