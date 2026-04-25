"use client";
// Disable static generation for this page
export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { CalendarCheckmark, LightningBoltIcon } from '@/components/atom/property-icons';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import { useListing } from '@/components/host/use-listing';

interface InstantBookPageProps {
  params: Promise<{ id: string }>;
}

const InstantBookPage = ({ params }: InstantBookPageProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const dict = useDictionary();
  const [id, setId] = React.useState<string>('');
  const { listing, updateListingData, loadListing } = useListing();
  const [selectedOption, setSelectedOption] = useState<string>('approve-first-5');

  React.useEffect(() => {
    params.then((resolvedParams) => {
      setId(resolvedParams.id);
      const listingId = parseInt(resolvedParams.id);
      if (!isNaN(listingId)) {
        loadListing(listingId).catch(() => {});
      }
    });
  }, [params, loadListing]);

  // Hydrate the local picker from the existing draft so refresh preserves choice.
  React.useEffect(() => {
    if (listing?.instantBook) setSelectedOption('instant-book');
    else if (listing) setSelectedOption('approve-first-5');
  }, [listing]);

  // Persist the instantBook flag whenever it changes.
  const handleSelect = async (optionId: string) => {
    setSelectedOption(optionId);
    try {
      await updateListingData({ instantBook: optionId === 'instant-book' });
    } catch {
      // Silent — the next step's Save button will retry. Toast would
      // spam a field that's a one-click radio.
    }
  };


  const bookingOptions = [
    {
      id: 'approve-first-5',
      title: dict.hosting.pages.instantBook.approveFirst5,
      subtitle: dict.hosting.pages.instantBook.recommended,
      description: dict.hosting.pages.instantBook.approveFirst5Description,
      icon: CalendarCheckmark,
      recommended: true,
    },
    {
      id: 'instant-book',
      title: dict.hosting.pages.instantBook.useInstantBook,
      description: dict.hosting.pages.instantBook.useInstantBookDescription,
      icon: LightningBoltIcon,
      recommended: false,
    },
  ];

  return (
    <div className="">
      <div className="">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-16 items-start">
          {/* Left column - Title and description */}
          <div className="space-y-3 sm:space-y-4">
            <h3>
              {dict.hosting.pages.instantBook.title}
            </h3>
            <p className="text-sm sm:text-base text-muted-foreground">
              {dict.hosting.pages.instantBook.subtitle}{' '}
              <button className="underline hover:no-underline text-foreground">
                {dict.hosting.pages.instantBook.learnMore}
              </button>
            </p>
          </div>

          {/* Right column - Booking options */}
          <div className="lg:col-span-2 space-y-3 sm:space-y-4">
            {bookingOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => handleSelect(option.id)}
                className={`w-full py-4 sm:py-5 px-4 sm:px-8 rounded-xl border transition-all duration-200 text-start ${
                  selectedOption === option.id
                    ? 'border-foreground bg-accent'
                    : 'border-border hover:border-foreground/50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <h5 className="text-sm sm:text-base font-medium">
                        {option.title}
                      </h5>
                    </div>
                    {option.recommended && (
                        <span className="text-green-500 text-xs sm:text-sm">
                          {option.subtitle}
                        </span>
                      )}
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                      {option.description}
                    </p>
                  </div>
                  <div className="flex-shrink-0 ms-3">
                    <option.icon size={20} className="sm:w-6 sm:h-6" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InstantBookPage; 