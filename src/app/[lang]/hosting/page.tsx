import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { BookingStatus } from "@prisma/client";
import HostingContent, { type HostReservation } from "./content";

// Disable static generation for this page
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  return createMetadata({
    title: dict?.pages?.hosting?.metadata?.title ?? "Hosting",
    description:
      dict?.pages?.hosting?.metadata?.description ??
      "Manage your reservations and hosting",
    locale: lang,
    path: "/hosting",
  });
}

export default async function HostingPage() {
  // Live reservations for the Today/Upcoming tabs. An anonymous visit just
  // renders the client-side auth redirect inside HostingContent.
  const session = await auth();
  let reservations: HostReservation[] = [];

  if (session?.user?.id) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const bookings = await db.booking
      .findMany({
        where: {
          listing: { hostId: session.user.id },
          status: { in: [BookingStatus.Pending, BookingStatus.Confirmed] },
          checkOut: { gte: startOfToday },
        },
        include: {
          listing: { select: { id: true, title: true, photoUrls: true } },
          guest: { select: { id: true, username: true, image: true } },
        },
        orderBy: { checkIn: "asc" },
        take: 50,
      })
      .catch(() => []);

    reservations = bookings.map((b) => ({
      id: b.id,
      status: b.status,
      checkIn: b.checkIn.toISOString(),
      checkOut: b.checkOut.toISOString(),
      guestCount: b.guestCount,
      totalPrice: b.totalPrice,
      listingTitle: b.listing.title ?? "",
      listingPhoto: b.listing.photoUrls?.[0] ?? null,
      guestName: b.guest.username ?? "Guest",
      guestImage: b.guest.image ?? null,
    }));
  }

  return <HostingContent reservations={reservations} />;
}