import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import ReferContent from "./content";

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
  return createMetadata({
    title: "Refer a host, earn cash",
    description: "Refer a host to Mkan and earn cash rewards.",
    locale: lang,
    path: "/refer",
  });
}

export default function ReferPage() {
  return <ReferContent />;
}
