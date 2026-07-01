import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// The "Calendar" host-nav tab resolves here, then forwards to the multicalendar
// for the host's first listing — mirroring Airbnb, where /hosting's Calendar tab
// deep-links into /multicalendar/{listingId}. Hosts with no listings yet are
// sent to the listings page to create one.
export default async function HostingCalendarPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/${lang}/login`);

  const first = await db.listing.findFirst({
    where: { hostId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  redirect(first ? `/${lang}/multicalendar/${first.id}` : `/${lang}/hosting/listings`);
}
