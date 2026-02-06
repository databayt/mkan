import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXTAUTH_URL || "https://mkan.io";

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
          "/*/transport-host/",
          "/*/login",
          "/*/register",
          "/*/error",
          "/*/verify-listing/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
