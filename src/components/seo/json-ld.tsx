import { SITE_NAME, SITE_URL } from "@/lib/metadata";

/**
 * schema.org JSON-LD helpers. Every builder returns a plain object; render it
 * with <JsonLd data={...} /> from a Server Component. No rich-result program
 * membership is assumed — these are the standard semantic signals crawlers
 * read regardless (entity understanding, knowledge panel, sitelinks).
 */

// Escape `<` so DB-sourced strings can't close the script tag (XSS).
function serialize(data: object): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialize(data) }}
    />
  );
}

export function organizationJsonLd(): object {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/og-default.png`,
  };
}

export function webSiteJsonLd(locale: string): object {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: `${SITE_URL}/${locale}`,
    inLanguage: locale,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/${locale}/search?location={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbJsonLd(
  items: Array<{ name: string; url: string }>
): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

// Prisma PropertyType → closest schema.org accommodation type.
const PROPERTY_TYPE_SCHEMA: Record<string, string> = {
  Rooms: "Room",
  Tinyhouse: "House",
  Apartment: "Apartment",
  Villa: "House",
  Townhouse: "House",
  Cottage: "House",
};

interface ListingJsonLdInput {
  id: number;
  title: string;
  description: string;
  url: string;
  locale: string;
  photoUrls: string[];
  propertyType?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  guestCount?: number | null;
  isPetsAllowed?: boolean;
  location?: {
    address?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
}

export function listingJsonLd(listing: ListingJsonLdInput): object {
  const schemaType =
    PROPERTY_TYPE_SCHEMA[listing.propertyType ?? ""] ?? "Accommodation";

  return {
    "@context": "https://schema.org",
    "@type": schemaType,
    "@id": listing.url,
    name: listing.title,
    description: listing.description,
    url: listing.url,
    inLanguage: listing.locale,
    ...(listing.photoUrls.length > 0 && { image: listing.photoUrls }),
    ...(listing.bedrooms != null && { numberOfBedrooms: listing.bedrooms }),
    ...(listing.bathrooms != null && {
      numberOfBathroomsTotal: listing.bathrooms,
    }),
    ...(listing.guestCount != null && {
      occupancy: {
        "@type": "QuantitativeValue",
        maxValue: listing.guestCount,
      },
    }),
    petsAllowed: listing.isPetsAllowed ?? false,
    ...(listing.location && {
      address: {
        "@type": "PostalAddress",
        ...(listing.location.address && {
          streetAddress: listing.location.address,
        }),
        ...(listing.location.city && {
          addressLocality: listing.location.city,
        }),
        ...(listing.location.state && {
          addressRegion: listing.location.state,
        }),
        ...(listing.location.country && {
          addressCountry: listing.location.country,
        }),
      },
      ...(listing.location.latitude != null &&
        listing.location.longitude != null && {
          geo: {
            "@type": "GeoCoordinates",
            latitude: listing.location.latitude,
            longitude: listing.location.longitude,
          },
        }),
    }),
  };
}

interface OfficeJsonLdInput {
  name: string;
  description?: string | null;
  url: string;
  phone?: string | null;
  logoUrl?: string | null;
  rating?: number | null;
  reviewCount?: number;
}

export function transportOfficeJsonLd(office: OfficeJsonLdInput): object {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: office.name,
    url: office.url,
    ...(office.description && { description: office.description }),
    ...(office.phone && { telephone: office.phone }),
    ...(office.logoUrl && { image: office.logoUrl }),
    // Only emit a rating when reviews actually exist — fabricated aggregate
    // ratings are a structured-data policy violation.
    ...(office.rating != null &&
      (office.reviewCount ?? 0) > 0 && {
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: office.rating,
          reviewCount: office.reviewCount,
        },
      }),
  };
}
