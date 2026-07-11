import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";
import OfficesListContent from "./content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const t = (await getDictionary(lang as Locale))?.travel;
  return createMetadata({
    title: t?.meta?.officesTitle ?? "Transport Offices",
    description: t?.meta?.officesDescription ?? "Browse available transport offices",
    locale: lang,
    path: "/travel/offices",
  });
}

export default function OfficesListPage() {
  return <OfficesListContent />;
}
