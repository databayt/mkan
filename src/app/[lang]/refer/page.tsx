import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import ReferContent from "./content";

export const dynamic = "force-dynamic";

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
