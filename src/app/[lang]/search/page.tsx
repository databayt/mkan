import { Metadata } from "next";
import DetailCard from "@/components/listings/detial-card"
import SearchHeader from "@/components/listings/search-header"
import SearchMap from "@/components/listings/search-map"
import { db } from "@/lib/db"
import { Listing } from "@/types/listing"
import { Button } from "@/components/ui/button"
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";

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

async function getPublishedListings(searchParams?: {
  location?: string
  checkIn?: string
  checkOut?: string
  guests?: string
}) {
  try {
    const listings = await db.listing.findMany({
      where: {
        isPublished: true,
        draft: false,
      },
      include: {
        location: true,
        host: {
          select: {
            id: true,
            email: true,
            username: true,
          }
        },
      },
      orderBy: {
        postedDate: 'desc'
      }
    });

    let filteredListings = listings as Listing[];

    // Apply filters based on search parameters
    if (searchParams?.location) {
      filteredListings = filteredListings.filter(listing =>
        listing.location?.city?.toLowerCase().includes(searchParams.location!.toLowerCase()) ||
        listing.location?.country?.toLowerCase().includes(searchParams.location!.toLowerCase()) ||
        listing.title?.toLowerCase().includes(searchParams.location!.toLowerCase())
      );
    }

    if (searchParams?.guests) {
      const guestCount = parseInt(searchParams.guests);
      filteredListings = filteredListings.filter(listing =>
        (listing.guestCount || 0) >= guestCount
      );
    }

    return filteredListings;
  } catch (error) {
    console.error("Error fetching published listings:", error);
    return [];
  }
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
  const listings = await getPublishedListings(resolvedSearchParams);

  // Build search summary
  const searchSummary = [];
  if (resolvedSearchParams?.location) searchSummary.push(resolvedSearchParams.location);
  if (resolvedSearchParams?.checkIn) searchSummary.push(`${sp?.checkIn} ${resolvedSearchParams.checkIn}`);
  if (resolvedSearchParams?.checkOut) searchSummary.push(`${sp?.checkOut} ${resolvedSearchParams.checkOut}`);
  if (resolvedSearchParams?.guests) searchSummary.push(`${resolvedSearchParams.guests} ${sp?.guests}`);

  return (
    <div className="min-h-screen bg-white">
      <SearchHeader />
      <div className="flex">
        {/* Left side - Property listings */}
        <div className="flex-1 min-h-screen">
          {/* Header with search results count */}
          <div className="p-10 border-b border-gray-200">
            <h1 className="text-base font-normal text-gray-500 mb-6">
              {listings.length}+ {sp?.luxeStays}
              {resolvedSearchParams?.location
                ? ` ${sp?.in} ${resolvedSearchParams.location}`
                : ""}
              {searchSummary.length > 0 && (
                <span className="text-sm text-gray-400 ms-2">
                  • {searchSummary.join(" • ")}
                </span>
              )}
            </h1>

            {/* Filters */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="rounded-full px-3 py-1.5 text-sm font-normal border-gray-200 shadow-sm">
                {sp?.freeCancellation}
              </Button>
              <Button variant="outline" size="sm" className="rounded-full px-3 py-1.5 text-sm font-normal border-gray-200 shadow-sm">
                {sp?.typeOfPlace}
              </Button>
              <Button variant="outline" size="sm" className="rounded-full px-3 py-1.5 text-sm font-normal border-gray-200 shadow-sm">
                {sp?.price}
              </Button>
              <Button variant="outline" size="sm" className="rounded-full px-3 py-1.5 text-sm font-normal border-gray-200 shadow-sm">
                {sp?.instantBook}
              </Button>
              <Button variant="outline" size="sm" className="rounded-full px-3 py-1.5 text-sm font-normal border-gray-200 shadow-sm">
                {sp?.moreFilters}
              </Button>
            </div>
          </div>

          {/* Scrollable listings - no local scrollbar */}
          <div className="p-10">
            <div className="space-y-6">
              {listings.map((listing, index) => (
                <div key={listing.id}>
                  <DetailCard
                    title={listing.title || "Bordeaux Getaway"}
                    location={`${sp?.entireHome} ${listing.location?.city || "Bordeaux"}`}
                    guests={`${listing.guestCount || 4}-${(listing.guestCount || 4) + 2} ${sp?.guestsSuffix}`}
                    beds={`${listing.bedrooms || 2} ${sp?.bedsSuffix}`}
                    baths={`${listing.bathrooms || 1} ${sp?.bathSuffix}`}
                    amenities={listing.amenities?.join(" · ") || "Wifi · Kitchen · Free Parking"}
                    rating={listing.averageRating?.toString() || "5.0"}
                    reviews={listing.numberOfReviews?.toString() || "318"}
                    price={`$${listing.pricePerNight || 325}`}
                    image={listing.photoUrls?.[0] || "/placeholder.svg?height=200&width=300"}
                    isFavorited={false}
                  />
                  {index < listings.length - 1 && (
                    <div className="h-px bg-gray-200 mt-6"></div>
                  )}
                </div>
              ))}

              {/* Fallback cards if no listings */}
              {listings.length === 0 && (
                <>
                  <DetailCard
                    title="Bordeaux Getaway"
                    price="$325"
                    isFavorited={false}
                  />
                  <div className="h-px bg-gray-200"></div>
                  <DetailCard
                    title="Charming Waterfront Condo"
                    price="$200"
                    isFavorited={true}
                  />
                  <div className="h-px bg-gray-200"></div>
                  <DetailCard
                    title="Historic City Center Home"
                    price="$125"
                    guests="4-6 guests"
                    beds="5 beds"
                    baths="3 bath"
                    isFavorited={false}
                  />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right side - Search Map Component */}
        <SearchMap />
      </div>
    </div>
  )
}
