import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";
import OfficesListContent from "./content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const m = (await getDictionary(lang)).pageMetadata.transportOffices;
  return createMetadata({
    title: m.title,
    description: m.description,
    locale: lang,
    path: "/transport/offices",
  });
}

export default function OfficesListPage() {
  return <OfficesListContent />;
}
