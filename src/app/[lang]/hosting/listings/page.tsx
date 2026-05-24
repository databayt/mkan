import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";
import HostingListingsContent from "./content";

// Disable static generation for this page
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  return createMetadata({
    title: dict?.pages?.hostingListings?.metadata?.title ?? "My Listings",
    description:
      dict?.pages?.hostingListings?.metadata?.description ??
      "View and manage your listings",
    locale: lang,
    path: "/hosting/listings",
  });
}

export default function HostingListingsPage() {
  return <HostingListingsContent />;
}
