import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";
import ResidencesContent from "./content";

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
    title: dict?.pages?.tenantResidences?.metadata?.title ?? "My Residences",
    description:
      dict?.pages?.tenantResidences?.metadata?.description ??
      "View and manage your current living spaces",
    locale: lang,
    path: "/tenants/residences",
  });
}

export default function ResidencesPage() {
  return <ResidencesContent />;
}
