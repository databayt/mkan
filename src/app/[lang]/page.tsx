import { Suspense } from "react";
import { Metadata } from "next";
import { getListings } from "@/components/host/actions";
import { createMetadata } from "@/lib/metadata";
import { Listing } from "@/types/listing";
import HomeContent from "./home-content";
import { getDictionary } from "@/components/internationalization/dictionaries";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: "en" | "ar" }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const d = await getDictionary(lang);
  return createMetadata({
    title: d.home?.metadata?.title ?? "Mkan - Rentals & Housing",
    description: d.home?.metadata?.description ?? "Discover the best properties and furnished apartments for rent",
    locale: lang,
  });
}

async function getPublishedListings(): Promise<Listing[]> {
  try {
    const listings = await getListings({ publishedOnly: true });
    return Array.isArray(listings) ? (listings as Listing[]) : [];
  } catch {
    return [];
  }
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ lang: "en" | "ar" }>;
}) {
  const { lang } = await params;
  const listings = await getPublishedListings();

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" role="status" aria-label="Loading">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900" aria-hidden="true"></div>
        </div>
      }
    >
      <HomeContent listings={listings} locale={lang} />
    </Suspense>
  );
}
