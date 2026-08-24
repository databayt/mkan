import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { SITE_URL } from "@/lib/metadata";
import { listingSegment } from "@/lib/listing-code";

// Regenerate hourly so newly published listings/offices surface without a
// redeploy (the file otherwise prerenders once at build).
export const revalidate = 3600;

// Per-URL hreflang: tells crawlers /en/... and /ar/... are the same page in
// two languages instead of two competing pages.
function languageAlternates(path: string) {
  return {
    languages: {
      en: `${SITE_URL}/en${path}`,
      ar: `${SITE_URL}/ar${path}`,
    },
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static public pages (locale-prefixed). Auth, dashboards, and checkout
  // surfaces are intentionally excluded — they're noindexed/disallowed.
  const staticPages = [
    "",
    "/listings",
    "/search",
    "/travel",
    "/travel/offices",
    "/travel/search",
    "/help",
    "/co-hosts",
    "/refer",
    "/giftcards",
    "/privacy",
    "/terms",
    "/cookies",
    "/accessibility",
  ];

  const staticEntries: MetadataRoute.Sitemap = staticPages.flatMap((path) =>
    (["en", "ar"] as const).map((locale) => ({
      url: `${SITE_URL}/${locale}${path}`,
      changeFrequency: "weekly" as const,
      priority: path === "" ? 1.0 : 0.8,
      alternates: languageAlternates(path),
    }))
  );

  // Dynamic listing pages
  let listingEntries: MetadataRoute.Sitemap = [];
  try {
    const listings = await db.listing.findMany({
      where: { isPublished: true, draft: false },
      select: { id: true, code: true, sourceListingId: true, updatedAt: true },
    });

    // Submit the code, not the row id. The sitemap used to hand Google
    // `/listings/1180` while the CRM and every WhatsApp message handed hosts
    // `/listings/0001-01` — the same room, indexed as two.
    listingEntries = listings.flatMap((listing) => {
      const path = `/listings/${listingSegment(listing)}`;
      return (["en", "ar"] as const).map((locale) => ({
        url: `${SITE_URL}/${locale}${path}`,
        lastModified: listing.updatedAt,
        changeFrequency: "daily" as const,
        priority: 0.7,
        alternates: languageAlternates(path),
      }));
    });
  } catch {
    // DB unavailable during build, return static only
  }

  // Dynamic transport office pages
  let officeEntries: MetadataRoute.Sitemap = [];
  try {
    const offices = await db.transportOffice.findMany({
      where: { isActive: true },
      select: { id: true, updatedAt: true },
    });

    officeEntries = offices.flatMap((office) =>
      (["en", "ar"] as const).map((locale) => ({
        url: `${SITE_URL}/${locale}/travel/offices/${office.id}`,
        lastModified: office.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.6,
        alternates: languageAlternates(`/travel/offices/${office.id}`),
      }))
    );
  } catch {
    // DB unavailable during build
  }

  return [...staticEntries, ...listingEntries, ...officeEntries];
}
