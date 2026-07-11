import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/metadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
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
