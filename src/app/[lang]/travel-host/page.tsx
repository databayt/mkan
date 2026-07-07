import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import TransportHostContent from "./content";

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang as "en" | "ar");
  const t = dict?.transportHost?.metadata;
  return createMetadata({
    title: t?.title ?? "Transport Host",
    description: t?.description ?? "Manage your transport offices and bookings",
    locale: lang,
    path: "/transport-host",
  });
}

export default function TransportHostPage() {
  return <TransportHostContent />;
}
