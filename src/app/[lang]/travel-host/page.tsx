import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import TransportHostContent from "./content";

// Static prose/marketing shells — prerender both locales, refresh hourly.
// dynamic = "error" turns any accidental dynamic-API use into a build error
// instead of silently degrading the page back to per-request rendering.
export const revalidate = 3600;
export const dynamic = "error";

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
    path: "/travel-host",
  });
}

export default function TransportHostPage() {
  return <TransportHostContent />;
}
