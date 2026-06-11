"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { publishListing, unpublishListing } from "@/components/host/actions";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import type { Listing } from "@/types/listing";

interface PublishToggleButtonProps {
  listing: Listing;
  size?: "default" | "sm";
}

/**
 * Client-side publish/unpublish toggle. Wraps the existing server actions in
 * a transition so the host gets immediate feedback while the action runs.
 *
 * Pre-publish validation (required fields, location, ≥1 photo) happens
 * server-side in `publishListing` — surface its error to the user via toast.
 */
export function PublishToggleButton({ listing, size = "sm" }: PublishToggleButtonProps) {
  const dict = useDictionary();
  const t = dict.hostingListings ?? ({} as Record<string, string>);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    startTransition(async () => {
      try {
        if (listing.isPublished) {
          await unpublishListing(listing.id);
          toast.success(t.unpublishSuccess ?? "Listing unpublished");
        } else {
          await publishListing(listing.id);
          toast.success(t.publishSuccess ?? "Listing published");
        }
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : (t.publishUnknownError ?? "Could not publish");
        toast.error(message);
      }
    });
  };

  const isDraft = listing.draft ?? false;
  const isPublished = listing.isPublished ?? false;
  const ready = !!(listing.title && listing.description && listing.pricePerNight && listing.location && (listing.photoUrls?.length ?? 0) > 0);

  if (isPublished) {
    return (
      <Button
        type="button"
        size={size}
        variant="outline"
        disabled={isPending}
        onClick={handleToggle}
      >
        {isPending ? (t.unpublishing ?? "Unpublishing...") : (t.unpublish ?? "Unpublish")}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size={size}
      variant="default"
      disabled={isPending || !ready}
      onClick={handleToggle}
      title={!ready ? (t.publishCannotYet ?? "Finish setup before publishing") : undefined}
    >
      {isPending
        ? (t.publishing ?? "Publishing...")
        : ready
          ? (t.publish ?? "Publish")
          : (t.publishCannotYet ?? "Finish setup")}
    </Button>
  );
}
