import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import GiftCardsContent from "./content";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  return createMetadata({
    title: "Mkan gift cards",
    description: "Give the gift of travel. Mkan gift cards never expire.",
    locale: lang,
    path: "/giftcards",
  });
}

export default function GiftCardsPage() {
  return <GiftCardsContent />;
}
