import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Clock, MapPin, Users } from "lucide-react";

import { getBooking } from "@/lib/actions/booking-actions";
import { getDictionary } from "@/components/internationalization/dictionaries";
import CancelBookingButton from "./cancel-button";

export default async function BookingConfirmationPage({
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

  const dict = (await getDictionary(lang as "en" | "ar")) as unknown as Record<string, Record<string, string>>;
  const t = dict.booking ?? {};
  const currency = dict.common?.currency ?? "$";

  const b = booking as unknown as {
    id: number;
    checkIn: Date;
    checkOut: Date;
    guestCount: number;
    nightsCount: number;
    totalPrice: number;
    status: string;
    listing: {
      id: number;
      title: string | null;
      photoUrls: string[];
      location: { city: string; country: string; address: string } | null;
    };
  };

  const isPending = b.status === "Pending";
  const isCancelled = b.status === "Cancelled";
  const isConfirmed = b.status === "Confirmed";

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-6">
        <div
          className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
            isConfirmed
              ? "bg-green-100 text-green-800"
              : isPending
                ? "bg-amber-100 text-amber-800"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {isConfirmed ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
          <span>
            {t.status ?? "Status"}: {b.status}
          </span>
        </div>
      </div>

      <h1 className="text-2xl font-semibold mb-2">
        {isCancelled
          ? (t.cancelled ?? "Booking cancelled")
          : (t.confirmation ?? "Booking confirmed")}
      </h1>
      <p className="text-muted-foreground mb-8">
        {isPending
          ? (t.pendingMessage ?? "Your booking is awaiting host confirmation.")
          : isConfirmed
            ? (t.confirmationMessage ?? "Your stay is booked.")
            : ""}
      </p>

      <div className="rounded-xl border overflow-hidden mb-8">
        {b.listing.photoUrls?.[0] && (
          <div className="relative w-full aspect-[16/9]">
            <Image
              src={b.listing.photoUrls[0]}
              alt={b.listing.title ?? ""}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover"
            />
          </div>
        )}
        <div className="p-4 space-y-3">
          <div className="text-lg font-medium">{b.listing.title}</div>
          {b.listing.location && (
            <div className="flex items-center text-sm text-muted-foreground">
              <MapPin className="w-4 h-4 me-1" />
              {b.listing.location.city}, {b.listing.location.country}
            </div>
          )}
          <div className="grid grid-cols-3 gap-4 pt-3 border-t">
            <div>
              <div className="text-xs text-muted-foreground">{t.checkIn ?? "Check-in"}</div>
              <div className="text-sm font-medium">{new Date(b.checkIn).toLocaleDateString()}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t.checkOut ?? "Check-out"}</div>
              <div className="text-sm font-medium">{new Date(b.checkOut).toLocaleDateString()}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                <Users className="w-3 h-3 inline me-1" />
                {t.guests ?? "Guests"}
              </div>
              <div className="text-sm font-medium">{b.guestCount}</div>
            </div>
          </div>
          <div className="pt-3 border-t flex justify-between">
            <span className="text-sm font-medium">{t.total ?? "Total"}</span>
            <span className="text-sm font-medium">
              {currency}
              {b.totalPrice}
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Link
          href={`/${lang}/tenants/trips`}
          className="inline-flex items-center justify-center rounded-md bg-[#E91E63] hover:bg-[#D81B60] text-white px-4 py-2 text-sm font-medium"
        >
          {t.viewMyTrips ?? "View my trips"}
        </Link>
        {(isPending || isConfirmed) && (
          <CancelBookingButton bookingId={b.id} lang={lang} dict={dict} />
        )}
        <Link
          href={`/${lang}/listings/${b.listing.id}`}
          className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm"
        >
          {t.viewListing ?? "View listing"}
        </Link>
      </div>
    </div>
  );
}
