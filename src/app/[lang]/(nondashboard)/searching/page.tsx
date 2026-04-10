export const dynamic = 'force-dynamic';

import { Metadata } from "next";
import { getListings } from '@/components/host/actions';
import { PropertyContent } from "@/components/site/property/content";
import { createMetadata } from "@/lib/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  return createMetadata({
    title: lang === "ar" ? "البحث عن عقارات" : "Search Properties",
    description:
      lang === "ar"
        ? "ابحث وتصفح العقارات المتاحة"
        : "Search and browse available properties",
    locale: lang,
    path: "/searching",
  });
}

async function getListingsData(filters: any) {
  try {
    const listings = await getListings({ ...filters, publishedOnly: true });
    return listings;
  } catch (error) {
    console.error("Error fetching listings:", error);
    return [];
  }
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  const filters = {
    location: resolvedSearchParams.location as string | undefined,
    priceMin: resolvedSearchParams.priceMin
      ? Number(resolvedSearchParams.priceMin)
      : undefined,
    priceMax: resolvedSearchParams.priceMax
      ? Number(resolvedSearchParams.priceMax)
      : undefined,
    beds: resolvedSearchParams.beds ? Number(resolvedSearchParams.beds) : undefined,
    baths: resolvedSearchParams.baths ? Number(resolvedSearchParams.baths) : undefined,
    propertyType: resolvedSearchParams.propertyType as string | undefined,
    amenities: resolvedSearchParams.amenities as string | undefined,
  };

  const listings = await getListingsData(filters);

  return (
    <div className="bg-background">
      <PropertyContent properties={listings} />
    </div>
  );
}
