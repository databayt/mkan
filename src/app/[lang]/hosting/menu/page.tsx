import { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";
import HostingMenuContent from "./content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  return createMetadata({
    title: dict?.hosting?.menuPage?.title ?? "Menu",
    description: "Hosting menu",
    locale: lang,
    path: "/hosting/menu",
  });
}

export default async function HostingMenuPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  return (
    <HostingMenuContent
      lang={lang as Locale}
      dict={dict?.hosting?.menuPage ?? null}
    />
  );
}
