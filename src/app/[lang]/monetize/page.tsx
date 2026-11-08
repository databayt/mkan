import type { Metadata } from "next";

import { i18n, type Locale } from "@/components/internationalization/config";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { MonetizeContent } from "@/components/monetize/content";
import type { MonetizeLabels } from "@/components/monetize/format";
import { loadDeals, loadHeldIntros } from "@/lib/monetize/deals";
import { loadLive } from "@/lib/monetize/live";
import { publicLive } from "@/lib/monetize/live-shape";
import { loadMonetizeCached } from "@/lib/monetize/load-cached";
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
  // An unknown language falls back to the site's own default (Arabic), as every other page does.
  const locale: Locale = (i18n.locales as readonly string[]).includes(lang) ? (lang as Locale) : i18n.defaultLocale;
  const dict = await getDictionary(locale);
  const labels = (dict as unknown as { monetize: MonetizeLabels }).monetize;
  // The numbers are cached 60 s; the loop is read fresh (its card then polls /api/monetize/live).
  const [raw, liveRaw, session] = await Promise.all([loadMonetizeCached(days === "30" ? 30 : 7), loadLive(), auth()]);
  const canEdit = !!session?.user?.id && (await isAdminNow(session));
  // Anyone may read the numbers; only an admin sees the people behind them (src/lib/monetize/public.ts).
  // Masked here, on the server, so nothing personal reaches the HTML or the client components' props.
  const data = canEdit ? raw : toPublic(raw);
  const live = canEdit ? liveRaw : publicLive(liveRaw);
  // The deals carry phone numbers: read only for an admin, never cached or shown to anyone else.
  const deals = canEdit ? await loadDeals().catch(() => null) : null;
  const heldIntros = canEdit ? await loadHeldIntros().catch(() => []) : [];
  const momoMode = canEdit ? await (await import("@/lib/momo/share")).momoMode() : null;
  return (
    <MonetizeContent
      data={data}
      live={live}
      labels={labels}
      locale={locale}
      lang={lang}
      canEdit={canEdit}
      deals={deals}
      heldIntros={heldIntros}
      momoMode={momoMode}
      payoutSet={!!process.env.MKAN_PAYOUT_MOMO?.trim()}
    />
  );
}
