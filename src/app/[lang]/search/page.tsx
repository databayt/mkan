import { Metadata } from "next";
import SearchHeader from "@/components/listings/search-header"
import { SearchProvider } from "@/components/listings/search-provider"
import { SearchResultsArea } from "@/components/listings/search-results-area"
import HotelCreditDialog from "@/components/template/search/hotel-credit-dialog"
import Footer from "@/components/site/footer"
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { searchListings } from "@/lib/actions/search-actions";
import { type SearchFilters } from "@/lib/schemas/search-schema";
import { parseCoords } from "@/lib/distance";
import { Listing } from "@/types/listing"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: "en" | "ar" }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const d = await getDictionary(lang);
  return createMetadata({
    title: d.common?.search,
    description: d.rental?.hero?.subtitle,
    locale: lang,
    path: "/search",
  });
}

// ISR: the initial (anonymous) render is cached; client-side map/filter
// searches run through the server action and are not part of this cache.
export const revalidate = 300;

function toInt(v: string | undefined, max?: number) {
  if (!v) return undefined;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return max !== undefined ? Math.min(n, max) : n;
}

// Resolve a trip-length + a short "Jul 1 – 6" label from the date params.
function resolveDates(
  checkIn: string | undefined,
  checkOut: string | undefined,
  lang: "en" | "ar"
): { nights?: number; label?: string } {
  if (!checkIn || !checkOut) return {};
  const inD = new Date(checkIn);
  const outD = new Date(checkOut);
  if (Number.isNaN(inD.getTime()) || Number.isNaN(outD.getTime())) return {};
  const nights = Math.round((outD.getTime() - inD.getTime()) / 86_400_000);
  if (nights <= 0) return {};
  const fmt = new Intl.DateTimeFormat(lang, { month: "short", day: "numeric" });
  const sameMonth = inD.getMonth() === outD.getMonth() && inD.getFullYear() === outD.getFullYear();
  const label = sameMonth
    ? `${fmt.format(inD)} – ${new Intl.DateTimeFormat(lang, { day: "numeric" }).format(outD)}`
    : `${fmt.format(inD)} – ${fmt.format(outD)}`;
  return { nights, label };
}

async function getInitialListings(
  searchParams?: {
    location?: string
    checkIn?: string
    checkOut?: string
    guests?: string
    lat?: string
    lng?: string
  },
  lang?: "en" | "ar",
): Promise<{ listings: Listing[]; total: number }> {
  // "Nearby" arrives as a coordinate pair, not a place name. parseCoords
  // returns null unless BOTH halves are valid, so a truncated link degrades to
  // an ordinary unscoped search instead of a nonsense band around a latitude.
  const coords = parseCoords(searchParams?.lat, searchParams?.lng);
  const filters: SearchFilters = {
    location: searchParams?.location,
    checkIn: searchParams?.checkIn,
    checkOut: searchParams?.checkOut,
    guests: toInt(searchParams?.guests, 16),
    ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
    take: 24,
    skip: 0,
  };
  const result = await searchListings(filters, lang);
  return {
    listings: (result.success ? result.data : []) as Listing[],
    total: result.success ? result.total ?? result.data.length : 0,
  };
}

export default async function SearchPage({
  params: pageParams,
  searchParams,
}: {
  params: Promise<{ lang: "en" | "ar" }>
  searchParams?: Promise<{
    location?: string
    checkIn?: string
    checkOut?: string
    guests?: string
    lat?: string
    lng?: string
  }>
}) {
  const { lang } = await pageParams;
  const resolvedSearchParams = await searchParams;
  const { listings, total } = await getInitialListings(resolvedSearchParams, lang);
  const { nights, label: datesLabel } = resolveDates(
    resolvedSearchParams?.checkIn,
    resolvedSearchParams?.checkOut,
    lang
  );

  const coords = parseCoords(resolvedSearchParams?.lat, resolvedSearchParams?.lng);

  // Carried in baseFilters so the Filters dialog and "search as I move the map"
  // re-queries stay inside the Nearby radius instead of silently widening back
  // to the whole catalog on the first filter change.
  const baseFilters: Pick<
    SearchFilters,
    "location" | "checkIn" | "checkOut" | "guests" | "lat" | "lng"
  > = {
    location: resolvedSearchParams?.location,
    checkIn: resolvedSearchParams?.checkIn,
    checkOut: resolvedSearchParams?.checkOut,
    guests: toInt(resolvedSearchParams?.guests, 16),
    ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
  };

  return (
    <div className="min-h-screen bg-background">
      <SearchProvider
        initialListings={listings}
        initialTotal={total}
        baseFilters={baseFilters}
        lang={lang}
        nights={nights}
        datesLabel={datesLabel}
      >
        {/* Header (sticky) — its SmallSearch is untouched; a Filters pill sits
            beside it and opens the Filters dialog. */}
        <SearchHeader />

        {/* The listings column scrolls (window scroll); the map inside stays
            pinned. The footer below is full-width, like the reference. */}
        <SearchResultsArea />

        <Footer />

        {/* Airbnb-style hotel-credit promo — auto-surfaces once per browser. */}
        <HotelCreditDialog />
      </SearchProvider>
    </div>
  )
}
