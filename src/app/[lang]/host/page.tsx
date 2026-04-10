import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import BecomeAHostContent from "./content";

// Disable static generation for this page
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  return createMetadata({
    title: lang === "ar" ? "كن مضيفاً" : "Become a Host",
    description:
      lang === "ar"
        ? "ابدأ باستضافة الضيوف وكسب الدخل"
        : "Start hosting guests and earning income",
    locale: lang,
    path: "/host",
  });
}

export default function BecomeAHostPage() {
  return <BecomeAHostContent />;
}
