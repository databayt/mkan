import type { Metadata } from "next";

const SITE_URL = process.env.NEXTAUTH_URL || "https://mkan.io";
const SITE_NAME = "Mkan";

interface CreateMetadataParams {
  title: string;
  description: string;
  locale?: string;
  path?: string;
  image?: string;
}

export function createMetadata({
  title,
  description,
  locale = "en",
  path = "",
  image,
}: CreateMetadataParams): Metadata {
  const url = `${SITE_URL}/${locale}${path}`;
  const ogImage = image || `${SITE_URL}/og-default.png`;

  return {
    title: `${title} | ${SITE_NAME}`,
    description,
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      siteName: SITE_NAME,
      locale: locale === "ar" ? "ar_SA" : "en_US",
      type: "website",
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${SITE_NAME}`,
      description,
      images: [ogImage],
    },
    alternates: {
      languages: {
        en: `${SITE_URL}/en${path}`,
        ar: `${SITE_URL}/ar${path}`,
      },
    },
  };
}
