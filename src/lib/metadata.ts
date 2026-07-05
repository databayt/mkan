import type { Metadata } from "next";

// Canonical production origin. NEXTAUTH_URL is authoritative — it always
// carries the protocol and must match the served origin or OAuth breaks.
// (NEXT_PUBLIC_APP_URL is stored without a protocol in prod — don't use it.)
export const SITE_URL = process.env.NEXTAUTH_URL || "https://mk.databayt.org";
export const SITE_NAME = "Mkan";

/** Collapse whitespace and cap text for meta descriptions (~160 chars). */
export function truncateDescription(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** Resolve a possibly-relative image path against the site origin. */
export function absoluteImageUrl(image?: string | null): string | undefined {
  if (!image) return undefined;
  return image.startsWith("http") ? image : `${SITE_URL}${image}`;
}

/**
 * Shared metadata for private surfaces (dashboards, editors, auth pages).
 * robots.txt disallow alone doesn't stop externally-linked URLs from being
 * indexed — the meta robots tag does.
 */
export const NOINDEX_METADATA: Metadata = {
  robots: { index: false, follow: false },
};

interface CreateMetadataParams {
  title: string;
  description: string;
  locale?: string;
  path?: string;
  image?: string;
  /** Keep the page out of search indexes (drafts, private surfaces). */
  noIndex?: boolean;
}

export function createMetadata({
  title,
  description,
  locale = "ar",
  path = "",
  image,
  noIndex = false,
}: CreateMetadataParams): Metadata {
  const url = `${SITE_URL}/${locale}${path}`;
  const ogImage = absoluteImageUrl(image) || `${SITE_URL}/og-default.png`;
  const metaDescription = truncateDescription(description);

  // NOTE: do NOT append " | Mkan" here — the root layout's `title.template`
  // ('%s | Mkan') already wraps this value, so appending would yield
  // "Listings | Mkan | Mkan" on every page.
  return {
    title,
    description: metaDescription,
    ...(noIndex ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description: metaDescription,
      url,
      siteName: SITE_NAME,
      locale: locale === "ar" ? "ar_SD" : "en_US",
      alternateLocale: locale === "ar" ? ["en_US"] : ["ar_SD"],
      type: "website",
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${SITE_NAME}`,
      description: metaDescription,
      images: [ogImage],
    },
    alternates: {
      // Self-referencing canonical — with several hosts serving this app
      // (mk.databayt.org, stale aliases, *.vercel.app deploys) this is what
      // consolidates them for crawlers.
      canonical: url,
      languages: {
        en: `${SITE_URL}/en${path}`,
        ar: `${SITE_URL}/ar${path}`,
        // Arabic is the app's default locale (i18n.defaultLocale).
        "x-default": `${SITE_URL}/ar${path}`,
      },
    },
  };
}
