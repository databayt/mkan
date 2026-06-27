import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import CoHostsContent from "./content";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  return createMetadata({
    title: "Find a co-host",
    description: "Find a trusted co-host near you to help manage your place.",
    locale: lang,
    path: "/co-hosts",
  });
}

export default function CoHostsPage() {
  return <CoHostsContent />;
}
