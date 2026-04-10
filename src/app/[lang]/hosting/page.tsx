import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import HostingContent from "./content";

// Disable static generation for this page
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  return createMetadata({
    title: lang === "ar" ? "الاستضافة" : "Hosting",
    description:
      lang === "ar"
        ? "إدارة حجوزاتك واستضافتك"
        : "Manage your reservations and hosting",
    locale: lang,
    path: "/hosting",
  });
}

export default function HostingPage() {
  return <HostingContent />;
}