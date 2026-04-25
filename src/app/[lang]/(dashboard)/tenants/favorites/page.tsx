import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import FavoritesContent from "./content";

// Disable static generation for this page
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  return createMetadata({
    title: lang === "ar" ? "المفضلة" : "Favorites",
    description:
      lang === "ar"
        ? "تصفح وإدارة العقارات المفضلة لديك"
        : "Browse and manage your saved property listings",
    locale: lang,
    path: "/tenants/favorites",
  });
}

export default async function FavoritesPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return <FavoritesContent lang={lang} />;
}
