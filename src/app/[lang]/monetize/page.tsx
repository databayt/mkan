import type { Metadata } from "next";

import { i18n, type Locale } from "@/components/internationalization/config";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { MonetizeContent } from "@/components/monetize/content";
import type { MonetizeLabels } from "@/components/monetize/format";
import { loadMonetize } from "@/lib/monetize/load";
import { auth, isAdminOrSuper } from "@/lib/auth";
import { NOINDEX_METADATA } from "@/lib/metadata";

// Dynamic: the point of the page is that the number is current.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  return { ...NOINDEX_METADATA, title: (dict as { monetize?: MonetizeLabels }).monetize?.metaTitle };
}

export default async function MonetizePage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { lang } = await params;
  const { days } = await searchParams;
  const locale: Locale = (i18n.locales as readonly string[]).includes(lang) ? (lang as Locale) : "en";
  const dict = await getDictionary(locale);
  const labels = (dict as unknown as { monetize: MonetizeLabels }).monetize;
  const [data, session] = await Promise.all([loadMonetize(days === "30" ? 30 : 7), auth()]);
  const canEdit = !!session?.user?.id && isAdminOrSuper(session);
  return <MonetizeContent data={data} labels={labels} locale={locale} lang={lang} canEdit={canEdit} />;
}
