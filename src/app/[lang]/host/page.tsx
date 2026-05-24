import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";
import BecomeAHostContent from "./content";

// Disable static generation for this page
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  return createMetadata({
    title: dict?.pages?.host?.metadata?.title ?? "Become a Host",
    description:
      dict?.pages?.host?.metadata?.description ??
      "Start hosting guests and earning income",
    locale: lang,
    path: "/host",
  });
}

export default function BecomeAHostPage() {
  return <BecomeAHostContent />;
}
