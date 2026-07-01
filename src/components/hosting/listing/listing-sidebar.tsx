"use client";

import React from "react";
import Image from "next/image";
import { useParams, usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useEditor } from "@/components/hosting/listing/editor-context";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { formatCurrency, formatNumber } from "@/lib/i18n/formatters";
import type { Locale } from "@/components/internationalization/config";
import {
  ChevronLeftIcon,
  GearIcon,
  PhotosGridIcon,
} from "@/components/hosting/listing/editor-icons";

type Section = { slug: string; label: string; value: string };

const fill = (tpl: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
    tpl
  );

const ListingSidebar = () => {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const params = useParams<{ lang: string; id: string }>();
  const lang = (params?.lang ?? "en") as Locale;
  const id = params?.id ?? "";
  const dict = useDictionary();
  const nav = dict?.listingEditor?.nav;
  const { listing } = useEditor();

  const [tab, setTab] = React.useState<"details" | "travel">(() =>
    pathname.includes("/travel/") ? "travel" : "details"
  );

  const base = `/${lang}/hosting/listings/editor/${id}`;
  const t = (k: string, fallback: string) =>
    (nav?.[k as keyof typeof nav] as string) ?? fallback;

  // ---- value sub-lines derived from the real listing ----
  const notSet = t("notSet", "Not set");
  const price =
    listing?.pricePerNight != null
      ? fill(t("valuePerNight", "{price} per night"), {
          price: formatCurrency(listing.pricePerNight, lang),
        })
      : notSet;
  const guests =
    listing?.guestCount != null
      ? fill(t("valueGuests", "{count} guests"), { count: formatNumber(listing.guestCount, lang) })
      : notSet;
  const bedBath = fill(t("valueBedBath", "{bedrooms} bedroom · {beds} bed · {bathrooms} bath"), {
    bedrooms: formatNumber(listing?.bedrooms ?? 1, lang),
    beds: formatNumber(listing?.bedrooms ?? 1, lang),
    bathrooms: formatNumber(listing?.bathrooms ?? 1, lang),
  });
  const amenities = fill(t("valueAmenities", "{count} amenities"), {
    count: listing?.amenities?.length ?? 0,
  });
  const propertyType = listing?.propertyType
    ? fill(t("valueEntirePlace", "Entire place · {type}"), {
        type: listing.propertyType,
      })
    : notSet;
  const locationValue = listing?.location
    ? [listing.location.city, listing.location.country]
        .filter(Boolean)
        .join(", ") || notSet
    : notSet;

  const detailSections: Section[] = [
    { slug: "details/title", label: t("title", "Title"), value: listing?.title || notSet },
    { slug: "details/property-type", label: t("propertyType", "Property type"), value: propertyType },
    { slug: "details/pricing", label: t("pricing", "Pricing"), value: price },
    { slug: "details/availability", label: t("availability", "Availability"), value: listing?.minStay ? fill(t("valueNightStay", "{min}–{max} night stay"), { min: formatNumber(listing.minStay, lang), max: formatNumber(listing.maxStay ?? listing.minStay, lang) }) : notSet },
    { slug: "details/number-of-guests", label: t("numberOfGuests", "Number of guests"), value: guests },
    { slug: "details/description", label: t("description", "Description"), value: listing?.description ? listing.description.slice(0, 48) : notSet },
    { slug: "details/amenities", label: t("amenities", "Amenities"), value: amenities },
    { slug: "details/accessibility", label: t("accessibility", "Accessibility features"), value: notSet },
    { slug: "details/location", label: t("location", "Location"), value: locationValue },
    { slug: "details/host", label: t("host", "Host"), value: listing?.host?.username || t("aboutYou", "About you") },
    { slug: "details/co-hosts", label: t("coHosts", "Co-hosts"), value: t("manageCohosts", "Manage co-hosts") },
    { slug: "details/instant-book", label: t("instantBook", "Instant Book"), value: listing?.instantBook ? t("on", "On") : t("off", "Off") },
    { slug: "details/house-rules", label: t("houseRules", "House rules"), value: notSet },
    { slug: "details/guest-safety", label: t("guestSafety", "Guest safety"), value: notSet },
    { slug: "details/cancellation-policy", label: t("cancellationPolicy", "Cancellation policy"), value: listing?.cancellationPolicy || notSet },
    { slug: "details/custom-link", label: t("customLink", "Custom link"), value: notSet },
  ];

  const travelSections: Section[] = [
    { slug: "travel/check-in-out", label: t("checkInOut", "Check-in and checkout"), value: listing?.checkInTime ? `${listing.checkInTime} – ${listing.checkOutTime ?? ""}` : notSet },
    { slug: "travel/directions", label: t("directions", "Directions"), value: notSet },
    { slug: "travel/check-in-method", label: t("checkInMethod", "Check-in method"), value: listing?.checkInMethod || notSet },
    { slug: "travel/wifi-details", label: t("wifiDetails", "Wifi details"), value: notSet },
    { slug: "travel/house-manual", label: t("houseManual", "House manual"), value: notSet },
    { slug: "travel/house-rules", label: t("travelHouseRules", "House rules"), value: notSet },
    { slug: "travel/checkout-instructions", label: t("checkoutInstructions", "Checkout instructions"), value: notSet },
    { slug: "travel/guidebooks", label: t("guidebooks", "Guidebooks"), value: notSet },
    { slug: "travel/interaction-preferences", label: t("interactionPreferences", "Interaction preferences"), value: notSet },
  ];

  const sections = tab === "details" ? detailSections : travelSections;
  const isActive = (slug: string) => pathname.includes(`/editor/${id}/${slug}`);
  const photos = listing?.photoUrls ?? [];

  return (
    <nav aria-label={t("listingEditor", "Listing editor")} className="pb-8">
      {/* Back */}
      <button
        type="button"
        onClick={() => router.push(`/${lang}/hosting/listings`)}
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-foreground hover:opacity-70"
      >
        <ChevronLeftIcon size={16} className="rtl:rotate-180" />
        <span>{t("listingEditor", "Listing editor")}</span>
      </button>

      {/* Tabs */}
      <div className="mb-6 flex items-center gap-6 border-b border-border">
        {(["details", "travel"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "-mb-px border-b-2 pb-3 text-[15px] font-medium transition-colors",
              tab === key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {key === "details" ? t("yourSpace", "Your space") : t("arrivalGuide", "Arrival guide")}
          </button>
        ))}
        <button
          type="button"
          aria-label="Settings"
          className="ms-auto pb-3 text-muted-foreground hover:text-foreground"
        >
          <GearIcon size={18} />
        </button>
      </div>

      {/* Complete required steps (only while unpublished) */}
      {listing && !listing.isPublished ? (
        <button
          type="button"
          onClick={() => router.push(`/${lang}/verify-listing/${id}`)}
          className="mb-4 block w-full rounded-2xl border border-border p-4 text-start transition hover:border-foreground hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-destructive" />
              <span className="font-semibold">{t("completeSteps", "Complete required steps")}</span>
            </div>
            <ChevronLeftIcon size={14} className="rotate-180 rtl:rotate-0 text-muted-foreground" />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("completeStepsBody", "Finish these final tasks to publish your listing and start getting booked.")}
          </p>
        </button>
      ) : null}

      {/* Photo tour card (only on the "Your space" tab) */}
      {tab === "details" ? (
        <button
          type="button"
          onClick={() => router.push(`${base}/details/photo-tour`)}
          data-active={isActive("details/photo-tour")}
          className="mb-4 block w-full rounded-2xl border border-border p-3 text-start transition hover:border-foreground hover:shadow-sm data-[active=true]:border-foreground"
        >
          <div className="grid grid-cols-2 gap-1.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted"
              >
                {photos[i] ? (
                  <Image
                    src={photos[i]}
                    alt=""
                    fill
                    sizes="160px"
                    className="object-cover"
                  />
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-3 px-1">
            <p className="font-semibold">{t("photoTour", "Photo tour")}</p>
            <p className="text-sm text-muted-foreground">{bedBath}</p>
          </div>
        </button>
      ) : null}

      {/* Section cards */}
      <div className="space-y-3">
        {sections.map((s) => (
          <button
            key={s.slug}
            type="button"
            onClick={() => router.push(`${base}/${s.slug}`)}
            data-active={isActive(s.slug)}
            className="block w-full rounded-2xl border border-border p-4 text-start transition hover:border-foreground hover:shadow-sm data-[active=true]:border-foreground"
          >
            <p className="font-semibold leading-snug">{s.label}</p>
            {s.value ? (
              <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{s.value}</p>
            ) : null}
          </button>
        ))}
      </div>
    </nav>
  );
};

export default ListingSidebar;
