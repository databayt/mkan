import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/metadata";

/**
 * SEO-tool crawlers: no search traffic comes from them, and one sweep held the
 * one container's CPU for minutes (AhrefsBot, 2026-10-21: 251 image resizes in
 * 40 s; the /find chat stalled behind it). The Worker answers them 403 too
 * (cf/worker.js), since a crawler re-reads robots.txt only about once a day.
 */
const SEO_CRAWLERS = ["AhrefsBot", "SemrushBot", "DotBot", "MJ12bot", "DataForSeoBot", "PetalBot", "BLEXBot", "Barkrowler"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: SEO_CRAWLERS, disallow: "/" },
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/*/dashboard/",
          "/*/managers/",
          "/*/tenants/",
          "/*/hosting/",
          "/*/host/",
          "/*/travel-host/",
          "/*/admin/",
          "/*/bookings/",
          "/*/multicalendar/",
          "/*/profile/",
          "/*/dev/",
          "/*/travel/booking/",
          "/*/login",
          "/*/register",
          "/*/join",
          "/*/reset",
          "/*/new-password",
          "/*/new-verification",
          "/*/error",
          "/*/verify-listing/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
