"use client";
// Disable static generation for this page
export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepNavigation } from '@/components/host';
import { useHostValidation } from '@/context/host-validation-context';
import { ListingProvider, useListing } from '@/components/host/use-listing';

interface TitlePageProps {
  params: Promise<{ id: string }>;
}

const TitlePageContent = ({ params }: TitlePageProps) => {
  const router = useRouter();
  const [id, setId] = React.useState<string>('');
  const { enableNext, disableNext } = useHostValidation();
  const { listing, updateListingData, loadListing } = useListing();
  const [title, setTitle] = useState<string>('');

  const maxLength = 32;

  React.useEffect(() => {
    params.then((resolvedParams) => {
      setId(resolvedParams.id);
      // Load the listing data in the background
      const listingId = parseInt(resolvedParams.id);
      if (!isNaN(listingId)) {
        loadListing(listingId).catch(console.error);
      }
    });
  }, [params, loadListing]);

  // Load existing title from listing
  React.useEffect(() => {
    if (listing?.title) {
      setTitle(listing.title);
    }
  }, [listing]);

  // Enable/disable next button based on title length
  React.useEffect(() => {
    if (title.trim().length > 0) {
      enableNext();
    } else {
      disableNext();
    }
  }, [title, enableNext, disableNext]);

  const handleBack = () => {
    router.push(`/host/${id}/photos`);
  };

  const handleNext = () => {
    router.push(`/host/${id}/description`);
  };

  const handleTitleChange = async (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newTitle = event.target.value;
    if (newTitle.length <= maxLength) {
      setTitle(newTitle);
      
      // Update backend data with debouncing
      try {
        await updateListingData({
          title: newTitle
        });
      } catch (error) {
        console.error('Error updating title:', error);
      }
    }
  };

  return (
    <div className="">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-20 items-start">
          {/* Left side - Text content */}
          <div className="space-y-3 sm:space-y-4">
            <h3>
              Now, let's give your
              <br />
              house a title
            </h3>
            <p className="text-sm sm:text-base text-muted-foreground">
              Short titles work best. Have fun with it—you can always change it later.
            </p>
          </div>

          {/* Right side - Input box */}
          <div>
            <textarea
              value={title}
              onChange={handleTitleChange}
              className="w-full h-[80px] sm:h-[100px] p-4 sm:p-6 border border-input rounded-lg resize-none focus:outline-none focus:border-ring transition-colors text-sm sm:text-base"
              maxLength={maxLength}
            />
            <div className="mt-2 text-muted-foreground text-xs sm:text-sm">
              <span>{title.length}/{maxLength}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const TitlePage = ({ params }: TitlePageProps) => {
  return (
    <ListingProvider>
      <TitlePageContent params={params} />
    </ListingProvider>
  );
};

export default TitlePage; 