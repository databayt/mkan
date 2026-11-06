import type { Metadata } from "next";

import { i18n, type Locale } from "@/components/internationalization/config";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { MonetizeContent } from "@/components/monetize/content";
import type { MonetizeLabels } from "@/components/monetize/format";
import { loadMonetize } from "@/lib/monetize/load";
import { toPublic } from "@/lib/monetize/public";
import { auth, isAdminNow } from "@/lib/auth";
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
  const [raw, session] = await Promise.all([loadMonetize(days === "30" ? 30 : 7), auth()]);
  const canEdit = !!session?.user?.id && (await isAdminNow(session));
  // Anyone may read the numbers; only an admin sees the people behind them (src/lib/monetize/public.ts).
  // Masked here, on the server, so nothing personal reaches the HTML or the client components' props.
  const data = canEdit ? raw : toPublic(raw);
  return <MonetizeContent data={data} labels={labels} locale={locale} lang={lang} canEdit={canEdit} />;
}
