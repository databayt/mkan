import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";
import ManagerPropertiesContent from "./content";

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
    title: dict?.pages?.managerProperties?.metadata?.title ?? "Manage Properties",
    description:
      dict?.pages?.managerProperties?.metadata?.description ??
      "View and manage your property listings",
    locale: lang,
    path: "/managers/properties",
  });
}

export default function ManagerPropertiesPage() {
  return <ManagerPropertiesContent />;
}
