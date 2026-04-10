import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import HostingListingsContent from "./content";

// Disable static generation for this page
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  return createMetadata({
    title: lang === "ar" ? "إعلاناتي" : "My Listings",
    description:
      lang === "ar"
        ? "عرض وإدارة إعلاناتك"
        : "View and manage your listings",
    locale: lang,
    path: "/hosting/listings",
  });
}

export default function HostingListingsPage() {
  return <HostingListingsContent />;
}
