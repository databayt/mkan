"use client";
import { cdn } from "@/lib/cdn";

import React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Listing } from '@/types/listing';
import { PropertyImageFallback } from '@/components/atom/property-image-fallback';
import { getNextStep } from '@/components/hosting/listing/listing-progress';
import { useLocale } from '@/components/internationalization/use-locale';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import { formatCurrency } from '@/lib/i18n/formatters';
import { PublishToggleButton } from './publish-toggle-button';

interface ListingCardProps {
  listing: Listing;
  viewType: 'grid' | 'list';
}

type StatusKey = 'published' | 'unlisted' | 'inProgress' | 'actionRequired';

const ListingCard: React.FC<ListingCardProps> = ({ listing, viewType }) => {
  const router = useRouter();
  const { locale } = useLocale();
  const dict = useDictionary();
  const defaultStatusLabels: Record<StatusKey, string> = {
    published: 'Published',
    unlisted: 'Unlisted',
    inProgress: 'In progress',
    actionRequired: 'Action required',
  };
  const statusLabels = {
    ...defaultStatusLabels,
    ...(dict.hostingListings as { status?: Partial<Record<StatusKey, string>> } | undefined)
      ?.status,
  };

  const getListingStatus = (listing: Listing): { key: StatusKey; circleColor: string } => {
    // Non-draft = onboarding is DONE: the home is either live (published) or
    // deliberately hidden (busy/unlisted). Neither should ever route back to
    // the onboarding wizard.
    if (!listing.draft) {
      return listing.isPublished
        ? { key: 'published', circleColor: 'bg-green-500' }
        : { key: 'unlisted', circleColor: 'bg-gray-400' };
    }
    if (listing.isPublished) {
      return { key: 'actionRequired', circleColor: 'bg-red-500' };
    }
    // Draft: complete enough to publish (photos optional in phase 1) →
    // action required; otherwise still in progress.
    const hasBasicInfo = listing.title && listing.description && listing.pricePerNight;
    if (hasBasicInfo && listing.location) {
      return { key: 'actionRequired', circleColor: 'bg-red-500' };
    }
    return { key: 'inProgress', circleColor: 'bg-orange-500' };
  };

  const getListingImage = (listing: Listing): string | null =>
    listing.photoUrls && listing.photoUrls.length > 0 ? (listing.photoUrls[0] ?? null) : null;

  const getListingTitle = (listing: Listing) => {
    if (listing.title) {
      return listing.title;
    }
    if (listing.location) {
      return `${listing.location.city}, ${listing.location.state}`;
    }
    return 'Untitled Listing';
  };

  const getListingDescription = (listing: Listing) => {
    if (listing.description) {
      return listing.description;
    }
    if (listing.location) {
      return `${listing.location.address}, ${listing.location.city}`;
    }
    return 'No description available';
  };

  const handleCardClick = () => {
    const status = getListingStatus(listing);

    // Only genuinely-in-progress drafts resume the onboarding wizard; every
    // finished home (published, busy/unlisted, or complete-but-unpublished)
    // opens the editor.
    if (status.key === 'inProgress') {
      const nextStep = getNextStep(listing);
      if (nextStep === 'photo-tour') {
        router.push(`/hosting/listings/editor/${listing.id}/details/photo-tour`);
      } else {
        router.push(`/host/${listing.id}/${nextStep}`);
      }
    } else {
      router.push(`/hosting/listings/editor/${listing.id}/details/photo-tour`);
    }
  };

  const status = getListingStatus(listing);
  const image = getListingImage(listing);
  const title = getListingTitle(listing);
  const description = getListingDescription(listing);

  return (
    <div 
      className={`cursor-pointer ${viewType === 'list' ? 'flex' : ''}`}
      onClick={handleCardClick}
    >
      {/* Airbnb host card: full-bleed near-square photo with 12px radius on
          mobile (no gutter padding), white status pill floating top-start.
          Desktop keeps the tighter 4:3 grid look. */}
      <div className={`relative ${viewType === 'list' ? 'p-2' : 'p-0 sm:p-2'}`}>
        <div className={`relative ${viewType === 'list' ? 'w-48 h-28' : 'aspect-square sm:aspect-[4/3]'} bg-gray-200 overflow-hidden rounded-xl`}>
          {image ? (
            <Image
              src={image}
              alt={title}
              width={viewType === 'list' ? 192 : 600}
              height={viewType === 'list' ? 112 : 600}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = cdn.product("property-placeholder.svg");
              }}
            />
          ) : (
            /* Same branded "No Image Available" placeholder as the homepage
               and /listings cards. */
            <PropertyImageFallback seed={title} alt={title} />
          )}
        </div>
        <div className={`absolute ${viewType === 'list' ? 'top-4 start-4' : 'top-3 start-3 sm:top-5 sm:start-5'}`}>
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#222222]"
            style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.18)" }}
          >
            <span className={`size-2 rounded-full ${status.circleColor}`}></span>
            {statusLabels[status.key]}
          </span>
        </div>
      </div>

      <div className={`flex-1 ${viewType === 'list' ? 'p-3' : 'p-0 pt-3 sm:p-3 sm:pt-3'}`}>
        <h3 className="text-[15px] sm:text-base font-medium text-gray-900 mb-0.5 truncate">
          {title}
        </h3>

        <p className="text-sm text-gray-500 mb-2 truncate">
          {description}
        </p>

        {/* The live mobile card stops at title + subtitle; price and the
            publish toggle are desktop-only (mobile manages them in the
            editor / availability prompt). */}
        {listing.pricePerNight && (
          <p className="hidden text-xs font-medium text-gray-900 sm:text-sm lg:block">
            {formatCurrency(listing.pricePerNight, locale)}/{dict.rental?.listing?.perNight ?? "night"}
          </p>
        )}

        <div className="mt-3 hidden lg:block" onClick={(e) => e.stopPropagation()}>
          <PublishToggleButton listing={listing} />
        </div>
      </div>
    </div>
  );
};

export default ListingCard;
