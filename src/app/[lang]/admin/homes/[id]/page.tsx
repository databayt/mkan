import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { auth, isAdminOrSuper } from "@/lib/auth";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminListingDetailPage({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  const session = await auth();
  if (!isAdminOrSuper(session)) notFound();

  const listingId = Number(id);
  if (!Number.isInteger(listingId) || listingId <= 0) notFound();

  const listing = await db.listing.findUnique({
    where: { id: listingId },
    include: {
      host: { select: { id: true, email: true, username: true, image: true } },
      location: true,
      _count: { select: { bookings: true, reviews: true, applications: true } },
    },
  });
  if (!listing) notFound();

  const dict = await getDictionary(lang as "en" | "ar");
  const a = (dict as { admin?: Record<string, string> }).admin ?? {};

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground uppercase">{a.listing ?? "Listing"}</p>
          <h1 className="text-2xl font-semibold">{listing.title ?? "Untitled"}</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant={listing.isPublished ? "secondary" : "outline"}>
              {listing.isPublished
                ? a.statusPublished ?? "Published"
                : listing.draft
                  ? a.statusDraft ?? "Draft"
                  : a.statusUnlisted ?? "Unlisted"}
            </Badge>
            <span className="text-sm text-muted-foreground">#{listing.id}</span>
          </div>
        </div>
        <Link
          href={`/${lang}/listings/${listing.id}`}
          target="_blank"
          className="text-sm underline text-muted-foreground"
        >
          {a.viewPublic ?? "View public page"}
        </Link>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{a.host ?? "Host"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>{listing.host.username ?? "—"}</div>
            <div className="text-muted-foreground">{listing.host.email}</div>
            <Link
              href={`/${lang}/admin/users?q=${encodeURIComponent(listing.host.email)}`}
              className="text-xs underline"
            >
              {a.findHostInUsers ?? "Find host in users"}
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{a.location ?? "Location"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>{listing.location?.address ?? "—"}</div>
            <div className="text-muted-foreground">
              {listing.location?.city}, {listing.location?.country}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{a.statsTitle ?? "Stats"}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-2xl font-semibold">{listing._count.bookings}</div>
              <div className="text-xs text-muted-foreground">{a.bookings ?? "Bookings"}</div>
            </div>
            <div>
              <div className="text-2xl font-semibold">{listing._count.reviews}</div>
              <div className="text-xs text-muted-foreground">{a.reviews ?? "Reviews"}</div>
            </div>
            <div>
              <div className="text-2xl font-semibold">{listing._count.applications}</div>
              <div className="text-xs text-muted-foreground">
                {a.applications ?? "Applications"}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{a.pricing ?? "Pricing"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <span className="text-muted-foreground">
                {a.pricePerNight ?? "Per night"}:
              </span>{" "}
              ${(listing.pricePerNight ?? 0).toFixed(0)}
            </div>
            <div>
              <span className="text-muted-foreground">
                {a.cleaningFee ?? "Cleaning fee"}:
              </span>{" "}
              ${(listing.cleaningFee ?? 0).toFixed(0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {listing.description ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{a.description ?? "Description"}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-line">{listing.description}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
