import { Metadata } from "next";
import { getHomeListings } from "@/lib/actions/search-actions";
import { createMetadata } from "@/lib/metadata";
import { JsonLd, organizationJsonLd, webSiteJsonLd } from "@/components/seo/json-ld";
import { Listing } from "@/types/listing";
import HomeContent from "./home-content";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { localize, localizeNested } from "@/components/translation/localize";
import { LoadingWrapper } from "@/components/home-loader";

// ISR: prerender /en + /ar (params from the layout's generateStaticParams) and
// regenerate at most every 5 minutes — the same window as getHomeListings'
// unstable_cache. Serving the homepage from the CDN instead of per-request
// origin compute is the difference between ~100ms and ~500-1000ms TTFB.
export const revalidate = 300;
// Assert static: without this Next auto-classified the route dynamic (ƒ) and
// every visit paid origin compute. Nothing here may read cookies()/headers()/
// searchParams — the HTML is identical for every visitor (session, favorites,
// and ?category deep-links all resolve client-side). "error" (not
// "force-static") so a future dynamic-API regression fails the build loudly
// instead of silently un-caching the homepage.
export const dynamic = "error";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: "en" | "ar" }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const d = await getDictionary(lang);
  return createMetadata({
    title: d.home?.metadata?.title ?? "Mkan - Rentals & Housing",
    description: d.home?.metadata?.description ?? "Discover the best properties and furnished apartments for rent",
    locale: lang,
  });
}

async function getPublishedListings(lang: "en" | "ar"): Promise<Listing[]> {
  try {
    const listings = await getHomeListings();
    if (!Array.isArray(listings)) return [];
    // Translate Arabic-stored listing copy (title/description) into the viewer's
    // locale, the same way the search and detail pages do. Runs on the raw
    // Prisma payload (before the Listing[] cast) and reads the translation cache
    // — manual/curated rows apply even with the live Google flag off, and it
    // falls back to the source text when no translation exists. Without this the
    // homepage cards rendered Arabic titles on `/en`.
    const localized = await localize(listings, ["title", "description"], lang);
    // City/state/country show on every card — localize the nested location too.
    const withLocation = await localizeNested(localized, "location", ["city", "state", "country"], lang);
    return withLocation as Listing[];
  } catch {
    return [];
  }
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ lang: "en" | "ar" }>;
}) {
  const { lang } = await params;
  const listings = await getPublishedListings(lang);

  return (
    <>
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={webSiteJsonLd(lang)} />
      <LoadingWrapper>
        <HomeContent listings={listings} locale={lang} />
      </LoadingWrapper>
    </>
  );
}
