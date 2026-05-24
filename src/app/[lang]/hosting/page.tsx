import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";
import HostingContent from "./content";

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
    title: dict?.pages?.hosting?.metadata?.title ?? "Hosting",
    description:
      dict?.pages?.hosting?.metadata?.description ??
      "Manage your reservations and hosting",
    locale: lang,
    path: "/hosting",
  });
}

export default function HostingPage() {
  return <HostingContent />;
}