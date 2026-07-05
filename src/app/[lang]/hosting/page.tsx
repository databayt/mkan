import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { BookingStatus } from "@prisma/client";
import HostingContent, {
  type HostReservation,
  type HostingAttention,
} from "./content";

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
  let attention: HostingAttention | null = null;

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

    // "Actions need your attention" bottom card: count the required-to-publish
    // steps still missing on the host's in-progress drafts, using the same
    // gate as publishListing() (photos deliberately excluded — phase 1).
    const drafts = await db.listing
      .findMany({
        where: { hostId: session.user.id, draft: true, isPublished: false },
        select: {
          id: true,
          title: true,
          description: true,
          pricePerNight: true,
          propertyType: true,
          bedrooms: true,
          bathrooms: true,
          photoUrls: true,
          locationId: true,
        },
        orderBy: { id: "desc" },
        take: 10,
      })
      .catch(() => []);

    const required = [
      "title",
      "description",
      "pricePerNight",
      "propertyType",
      "bedrooms",
      "bathrooms",
    ] as const;
    const count = drafts.reduce(
      (sum, d) =>
        sum +
        required.filter((f) => !d[f]).length +
        (d.locationId ? 0 : 1),
      0,
    );

    if (drafts.length > 0 && count > 0) {
      attention = {
        count,
        photos: drafts.slice(0, 2).map((d) => d.photoUrls?.[0] ?? null),
      };
    }
  }

  return <HostingContent reservations={reservations} attention={attention} />;
}