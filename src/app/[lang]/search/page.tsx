import { Metadata } from "next";
import DetailCard from "@/components/listings/detial-card"
import SearchHeader from "@/components/listings/search-header"
import SearchMapLoader from "@/components/listings/search-map-loader"
import { Button } from "@/components/ui/button"
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { searchListings } from "@/lib/actions/search-actions";
import { type SearchFilters } from "@/lib/schemas/search-schema";
import { formatCurrency } from "@/lib/i18n/formatters";
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

// ISR: Revalidate every 5 minutes (search results can be cached briefly)
export const revalidate = 300;

// Safe int parser: blocks NaN / negatives / absurd values at the page edge.
function toInt(v: string | undefined, max?: number) {
  if (!v) return undefined;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return max !== undefined ? Math.min(n, max) : n;
}

// DB-level filtering via the canonical searchListings action — the SAME path
// /listings uses. Replaces the old "load every published listing then filter
// in JS" implementation (unbounded + did its work in the wrong layer).
async function getFilteredListings(searchParams?: {
  location?: string
  checkIn?: string
  checkOut?: string
  guests?: string
}): Promise<Listing[]> {
  const filters: SearchFilters = {
    location: searchParams?.location,
    checkIn: searchParams?.checkIn,
    checkOut: searchParams?.checkOut,
    guests: toInt(searchParams?.guests, 16),
    take: 50,
    skip: 0,
  };
  const result = await searchListings(filters);
  return (result.success ? result.data : []) as Listing[];
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
  }>
}) {
  const { lang } = await pageParams;
  const d = await getDictionary(lang);
  const sp = d.rental?.searchPage as Record<string, string> | undefined;
  const resolvedSearchParams = await searchParams;
  const listings = await getFilteredListings(resolvedSearchParams);

  // Real coordinates for the map's price bubbles
  const mapMarkers = listings
    .filter((l) => l.location?.latitude != null && l.location?.longitude != null)
    .map((l) => ({
      id: l.id,
      price: l.pricePerNight ?? null,
      lat: l.location!.latitude,
      lng: l.location!.longitude,
      title: l.title ?? undefined,
    }));

  // Build search summary
  const searchSummary = [];
  if (resolvedSearchParams?.location) searchSummary.push(resolvedSearchParams.location);
  if (resolvedSearchParams?.checkIn) searchSummary.push(`${sp?.checkIn} ${resolvedSearchParams.checkIn}`);
  if (resolvedSearchParams?.checkOut) searchSummary.push(`${sp?.checkOut} ${resolvedSearchParams.checkOut}`);
  if (resolvedSearchParams?.guests) searchSummary.push(`${resolvedSearchParams.guests} ${sp?.guests}`);

  return (
    <div className="min-h-screen bg-background">
      <SearchHeader />
      <div className="flex">
        {/* Left side - Property listings */}
        <div className="flex-1 min-h-screen">
          {/* Header with search results count */}
          <div className="p-10 border-b border-border">
            <h1 className="text-base font-normal text-muted-foreground mb-6">
              {listings.length}+ {sp?.luxeStays}
              {resolvedSearchParams?.location
                ? ` ${sp?.in} ${resolvedSearchParams.location}`
                : ""}
              {searchSummary.length > 0 && (
                <span className="text-sm text-muted-foreground ms-2">
                  • {searchSummary.join(" • ")}
                </span>
              )}
            </h1>

            {/* Filters */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="rounded-full px-3 py-1.5 text-sm font-normal shadow-sm">
                {sp?.freeCancellation}
              </Button>
              <Button variant="outline" size="sm" className="rounded-full px-3 py-1.5 text-sm font-normal shadow-sm">
                {sp?.typeOfPlace}
              </Button>
              <Button variant="outline" size="sm" className="rounded-full px-3 py-1.5 text-sm font-normal shadow-sm">
                {sp?.price}
              </Button>
              <Button variant="outline" size="sm" className="rounded-full px-3 py-1.5 text-sm font-normal shadow-sm">
                {sp?.instantBook}
              </Button>
              <Button variant="outline" size="sm" className="rounded-full px-3 py-1.5 text-sm font-normal shadow-sm">
                {sp?.moreFilters}
              </Button>
            </div>
          </div>

          {/* Listings (server-filtered) */}
          <div className="p-10">
            {listings.length === 0 ? (
              <div className="text-center py-12">
                <h2 className="text-xl font-medium mb-2">
                  {sp?.noExactMatches ?? "No exact matches"}
                </h2>
                <p className="text-muted-foreground">
                  {sp?.tryAdjusting ??
                    "Try adjusting your search — change your dates, remove filters, or search a different location."}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {listings.map((listing, index) => (
                  <div key={listing.id}>
                    <DetailCard
                      title={listing.title ?? ""}
                      location={`${sp?.entireHome ?? ""} ${listing.location?.city ?? ""}`.trim()}
                      guests={`${listing.guestCount ?? 0} ${sp?.guestsSuffix ?? ""}`}
                      beds={`${listing.bedrooms ?? 0} ${sp?.bedsSuffix ?? ""}`}
                      baths={`${listing.bathrooms ?? 0} ${sp?.bathSuffix ?? ""}`}
                      amenities={listing.amenities?.join(" · ") ?? ""}
                      rating={listing.averageRating?.toString() ?? ""}
                      reviews={listing.numberOfReviews?.toString() ?? "0"}
                      price={formatCurrency(listing.pricePerNight ?? 0, lang)}
                      image={listing.photoUrls?.[0] || "/placeholder.svg?height=200&width=300"}
                      isFavorited={false}
                    />
                    {index < listings.length - 1 && (
                      <div className="h-px bg-border mt-6"></div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right side - Search Map Component */}
        <SearchMapLoader markers={mapMarkers} searchAsIMoveLabel={sp?.searchAsIMove} />
      </div>
    </div>
  )
}
