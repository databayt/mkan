import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import ManagerPropertiesContent from "./content";

// Disable static generation for this page
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  return createMetadata({
    title: lang === "ar" ? "إدارة العقارات" : "Manage Properties",
    description:
      lang === "ar"
        ? "عرض وإدارة عقاراتك"
        : "View and manage your property listings",
    locale: lang,
    path: "/managers/properties",
  });
}

export default function ManagerPropertiesPage() {
  return <ManagerPropertiesContent />;
}
