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
  params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const m = (await getDictionary(lang)).pageMetadata.tenantsResidences;
  return createMetadata({
    title: m.title,
    description: m.description,
    locale: lang,
    path: "/tenants/residences",
  });
}

export default function ResidencesPage() {
  return <ResidencesContent />;
}
