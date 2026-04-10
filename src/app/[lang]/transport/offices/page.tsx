import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import OfficesListContent from "./content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  return createMetadata({
    title: lang === "ar" ? "مكاتب النقل" : "Transport Offices",
    description:
      lang === "ar"
        ? "تصفح مكاتب النقل المتاحة"
        : "Browse available transport offices",
    locale: lang,
    path: "/transport/offices",
  });
}

export default function OfficesListPage() {
  return <OfficesListContent />;
}
