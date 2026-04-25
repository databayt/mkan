import Link from "next/link";
import Image from "next/image";
import { Heart, MapPin } from "lucide-react";

import Header from "@/components/Header";
import { getTenantFavorites } from "@/lib/actions/user-actions";
import { getDictionary } from "@/components/internationalization/dictionaries";

interface FavoritesContentProps {
  lang: string;
}

/**
 * Tenant-facing favorites page. Server component so hearts appear the
 * moment the tenant clicks one on another page — no client-side refetch
 * cycle. Unheart happens through the card component's server action;
 * a revalidateTag in that action will re-render this page with the
 * updated list.
 */
export default async function FavoritesContent({ lang }: FavoritesContentProps) {
  const dict = (await getDictionary(lang as "en" | "ar")) as unknown as Record<string, Record<string, string>>;
  const t = (dict.dashboard as Record<string, Record<string, string>> | undefined)?.favorites ?? {};
  const currency = dict.common?.currency ?? "$";
  const favorites = (await getTenantFavorites()) as Array<{
    id: number;
    title: string | null;
    pricePerNight: number | null;
    photoUrls: string[];
    location: { city: string; country: string } | null;
  }>;

  return (
    <div className="dashboard-container p-6 space-y-6">
      <Header
        title={t.title ?? (lang === "ar" ? "المفضلة" : "Favorites")}
        subtitle={t.subtitle ?? (lang === "ar" ? "تصفح وإدارة العقارات المحفوظة" : "Browse and manage your saved properties")}
      />

      {favorites.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Heart className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">
            {t.empty ?? "You don't have any saved properties yet."}
          </p>
          <p className="text-sm text-muted-foreground">
            {t.emptyHint ?? "Click the heart icon on any listing to save it here."}
          </p>
          <Link
            href={`/${lang}/listings`}
            className="inline-block rounded-md bg-[#E91E63] hover:bg-[#D81B60] text-white px-4 py-2 text-sm"
          >
            {t.browse ?? "Browse listings"}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {favorites.map((listing) => (
            <Link
              key={listing.id}
              href={`/${lang}/listings/${listing.id}`}
              className="group space-y-2"
            >
              <div className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                {listing.photoUrls?.[0] && (
                  <Image
                    src={listing.photoUrls[0]}
                    alt={listing.title ?? ""}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform group-hover:scale-105"
                  />
                )}
                <div className="absolute top-2 end-2 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center">
                  <Heart className="w-4 h-4 fill-[#E91E63] text-[#E91E63]" />
                </div>
              </div>
              <div className="space-y-1">
                <div className="font-medium text-sm line-clamp-1">{listing.title}</div>
                {listing.location && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="w-3 h-3" />
                    {listing.location.city}, {listing.location.country}
                  </div>
                )}
                <div className="text-sm">
                  <span className="font-medium">
                    {currency}
                    {listing.pricePerNight ?? 0}
                  </span>
                  <span className="text-muted-foreground"> / {t.perNight ?? "night"}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
