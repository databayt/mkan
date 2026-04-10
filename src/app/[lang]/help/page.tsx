import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import HelpContent from "./content";

// Disable static generation for this page
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  return createMetadata({
    title: lang === "ar" ? "مركز المساعدة" : "Help Center",
    description:
      lang === "ar"
        ? "احصل على المساعدة والدعم"
        : "Get help and support",
    locale: lang,
    path: "/help",
  });
}

export default function HelpPage() {
  return <HelpContent />;
}