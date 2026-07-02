"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { publishListing, unpublishListing } from "@/components/host/actions";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import type { Listing } from "@/types/listing";

interface PublishToggleButtonProps {
  listing: Listing;
}

/**
 * Owner-facing Available / Busy switch.
 *
 * "Available" = published (shows in search); "Busy" = unpublished (hidden).
 * The wording is deliberately plain for non-technical owners — the mechanics
 * reuse the owner-gated publishListing / unpublishListing actions. Pre-publish
 * validation (required fields, location, ≥1 photo) runs server-side in
 * publishListing and surfaces via toast. The switch is disabled until the
 * listing is complete enough to go live.
 */
export function PublishToggleButton({ listing }: PublishToggleButtonProps) {
  const dict = useDictionary();
  const t = dict.hostingListings ?? ({} as Record<string, string>);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Local optimistic state: this card renders from a client-side fetch in the
  // parent that router.refresh() doesn't re-run, so we hold the toggled value
  // here (useOptimistic would snap back to the stale parent prop after the
  // action settles).
  const [isPublished, setIsPublished] = useState(listing.isPublished ?? false);
  // Photos are NOT required (phase 1) — mirrors publishListing's server-side
  // validation so Busy → Available always works on photo-less homes.
  const ready = !!(
    listing.title &&
    listing.description &&
    listing.pricePerNight &&
    listing.location
  );

  const handleToggle = (next: boolean) => {
    setIsPublished(next); // optimistic
    startTransition(async () => {
      try {
        if (next) {
          await publishListing(listing.id);
          toast.success(t.availableSuccess ?? "Your place is now available");
        } else {
          await unpublishListing(listing.id);
          toast.success(t.busySuccess ?? "Your place is now marked busy");
        }
        router.refresh();
      } catch (err) {
        setIsPublished(!next); // revert on failure
        const message =
          err instanceof Error ? err.message : (t.publishUnknownError ?? "Could not update");
        toast.error(message);
      }
    });
  };

  const label = isPublished
    ? (t.available ?? "Available")
    : ready
      ? (t.busy ?? "Busy")
      : (t.publishCannotYet ?? "Finish setup");

  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <Switch
        checked={isPublished}
        disabled={isPending || (!isPublished && !ready)}
        onCheckedChange={handleToggle}
        aria-label={isPublished ? (t.available ?? "Available") : (t.busy ?? "Busy")}
      />
      <span className="text-xs sm:text-sm font-medium">{label}</span>
    </div>
  );
}
