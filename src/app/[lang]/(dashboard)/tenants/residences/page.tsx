import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import ResidencesContent from "./content";

// Disable static generation for this page
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  return createMetadata({
    title: lang === "ar" ? "مساكني" : "My Residences",
    description:
      lang === "ar"
        ? "عرض وإدارة مساكنك الحالية"
        : "View and manage your current living spaces",
    locale: lang,
    path: "/tenants/residences",
  });
}

export default function ResidencesPage() {
  return <ResidencesContent />;
}
