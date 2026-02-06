import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

const SITE_URL = process.env.NEXTAUTH_URL || "https://mkan.io";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages
  const staticPages = [
    "",
    "/listings",
    "/transport",
    "/transport/offices",
    "/transport/search",
    "/login",
    "/register",
    "/privacy",
    "/terms",
    "/cookies",
    "/accessibility",
  ];

  const staticEntries = staticPages.flatMap((path) =>
    ["en", "ar"].map((locale) => ({
      url: `${SITE_URL}/${locale}${path}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: path === "" ? 1.0 : 0.8,
    }))
  );

  // Dynamic listing pages
  let listingEntries: MetadataRoute.Sitemap = [];
  try {
    const listings = await db.listing.findMany({
      where: { isPublished: true, draft: false },
      select: { id: true, updatedAt: true },
    });

    listingEntries = listings.flatMap((listing) =>
      ["en", "ar"].map((locale) => ({
        url: `${SITE_URL}/${locale}/listings/${listing.id}`,
        lastModified: listing.updatedAt,
        changeFrequency: "daily" as const,
        priority: 0.7,
      }))
    );
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
      ["en", "ar"].map((locale) => ({
        url: `${SITE_URL}/${locale}/transport/offices/${office.id}`,
        lastModified: office.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }))
    );
  } catch {
    // DB unavailable during build
  }

  return [...staticEntries, ...listingEntries, ...officeEntries];
}
