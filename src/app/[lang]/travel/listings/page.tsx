import { Metadata } from "next";
import { BusFront } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import TravelSearchHeader from "@/components/travel/search/travel-search-header";
import { InfiniteTrips } from "@/components/travel/listings/infinite-trips";
import { getAssemblyPoints, browseTrips } from "@/lib/actions/travel-actions";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { createMetadata } from "@/lib/metadata";
import { prerenderSafe } from "@/lib/prerender-safe";
import type { Locale } from "@/components/internationalization/config";
import { formatNumber } from "@/lib/i18n/formatters";
import Footer from "@/components/site/footer";

// ISR like /travel and the homepage: page 1 is the same for every visitor and
// both reads sit behind unstable_cache, so serving it from the CDN and
// regenerating every 5 minutes beats per-request origin compute. Pages 2+ come
// from the infinite-scroll action, which is unaffected.
export const revalidate = 300;
// Assert static — nothing here reads cookies()/headers()/searchParams.
export const dynamic = "error";

const PAGE_SIZE = 20;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  const t = dict?.travel;
  return createMetadata({
    title: t?.listings?.title ?? "Browse Trips",
    description: t?.listings?.subtitle ?? "Browse upcoming intercity bus trips across Sudan",
    locale: lang,
    path: "/travel/listings",
  });
}

interface TravelListingsPageProps {
  params: Promise<{ lang: Locale }>;
}

export default async function TravelListingsPage({ params }: TravelListingsPageProps) {
  const { lang } = await params;

  const [dictionary, assemblyPoints, result] = await Promise.all([
    getDictionary(lang),
    prerenderSafe(getAssemblyPoints(), []),
    prerenderSafe(browseTrips({ page: 1, limit: PAGE_SIZE }), {
      trips: [],
      total: 0,
      page: 1,
      pageCount: 1,
      limit: PAGE_SIZE,
    }),
  ]);

  const t = dictionary?.travel;
  const { trips, total } = result;

  const cardDictionary = {
    selectSeats: t?.trip?.selectSeats ?? "Select Seats",
    seatsAvailable: t?.trip?.seatsAvailable ?? "seats available",
    duration: t?.trip?.duration ?? "Duration",
    verified: t?.office?.verified ?? "Verified",
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Same expanding search header as /travel/search — collapsed pill shows
          the browse defaults (Where to? · Any date · Seats). */}
      <TravelSearchHeader lang={lang} assemblyPoints={assemblyPoints} />

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{t?.listings?.title ?? "Browse trips"}</h1>
          <p className="text-muted-foreground">
            {(t?.listings?.count ?? "{count} upcoming trips").replace(
              "{count}",
              formatNumber(total, lang),
            )}
          </p>
        </div>

        {trips.length > 0 ? (
          <InfiniteTrips
            initialTrips={trips}
            total={total}
            pageSize={PAGE_SIZE}
            lang={lang}
            cardDictionary={cardDictionary}
          />
        ) : (
          <div className="text-center py-16 px-4">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <BusFront className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">
              {t?.listings?.empty ?? "No upcoming trips"}
            </h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              {t?.listings?.emptyHint ??
                "There are no upcoming trips right now. Check back soon."}
            </p>
            <Link href={`/${lang}/travel`}>
              <Button>{t?.listings?.backToTravel ?? "Back to travel"}</Button>
            </Link>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
