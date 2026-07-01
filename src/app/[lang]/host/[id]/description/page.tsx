"use client";
// Disable static generation for this page
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import { useListing } from '@/components/host/use-listing';
import { useHostValidation } from '@/context/onboarding-validation-context';
import { Highlight } from '@prisma/client';
import { useDictionary } from '@/components/internationalization/dictionary-context';

interface DescriptionPageProps {
  params: Promise<{ id: string }>;
}

// Mapping function to convert UI highlight IDs to Prisma enum values
const mapHighlightToPrisma = (highlightId: string): Highlight => {
  const mapping: Record<string, Highlight> = {
    '1': Highlight.QuietNeighborhood, // Peaceful
    '2': Highlight.RecentlyRenovated, // Unique
    '3': Highlight.SmokeFree, // Family-friendly (mapped to SmokeFree as a safe environment)
    '4': Highlight.RecentlyRenovated, // Stylish
    '5': Highlight.CloseToTransit, // Central
    '6': Highlight.GreatView, // Spacious
  };

  return mapping[highlightId] || Highlight.QuietNeighborhood; // Default to QuietNeighborhood if not found
};

const DescriptionPageContent = ({ params }: DescriptionPageProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const dict = useDictionary();
  const { setCustomNavigation } = useHostValidation();
  const { listing, updateListingData, loadListing } = useListing();
  const [id, setId] = React.useState<string>('');
  const [selectedHighlights, setSelectedHighlights] = useState<string[]>([]);
  const [description, setDescription] = useState('You\'ll have a great time at this comfortable place to stay.');
  const [currentStep, setCurrentStep] = useState<'highlights' | 'description'>('highlights');

  const maxLength = 500;

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

  // Load existing data from listing
  React.useEffect(() => {
    if (listing) {
      if (listing.description) {
        setDescription(listing.description);
      }
      if (listing.highlights) {
        setSelectedHighlights(listing.highlights.map(h => h.toLowerCase()));
      }
    }
  }, [listing]);

  const handleBack = () => {
    if (currentStep === 'description') {
      setCurrentStep('highlights');
      return;
    }
    router.push(`/host/${id}/title`);
  };

  const handleNext = async () => {
    if (currentStep === 'highlights') {
      if (selectedHighlights.length > 0) {
        // Update backend with highlights using the mapping function
        try {
          const backendHighlights = selectedHighlights.map(highlightId => 
            mapHighlightToPrisma(highlightId)
          );
          
          await updateListingData({
            highlights: backendHighlights
          });
        } catch (error) {
          console.error('Error updating highlights:', error);
        }
        setCurrentStep('description');
      }
      return;
    }
    
    if (currentStep === 'description' && description.trim().length > 0) {
      // Update backend with description
      try {
        await updateListingData({
          description: description.trim()
        });
      } catch (error) {
        console.error('Error updating description:', error);
      }
      router.push(`/host/${id}/finish-setup`);
    }
  };

  const nextDisabled = (currentStep === 'highlights' && selectedHighlights.length === 0) ||
                      (currentStep === 'description' && description.trim().length === 0);

  // Set custom navigation in context
  useEffect(() => {
    setCustomNavigation({
      onBack: handleBack,
      onNext: handleNext,
      nextDisabled: nextDisabled
    });

    // Cleanup on unmount
    return () => {
      setCustomNavigation(undefined);
    };
  }, [currentStep, selectedHighlights, description, id]);

  const highlights = [
    { id: '1', title: dict.hosting.pages.description.peaceful, iconSrc: '/highlights/Peaceful.svg' },
    { id: '2', title: dict.hosting.pages.description.unique, iconSrc: '/highlights/Unique.svg' },
    { id: '3', title: dict.hosting.pages.description.familyFriendly, iconSrc: '/highlights/Family-friendly.svg' },
    { id: '4', title: dict.hosting.pages.description.stylish, iconSrc: '/highlights/Stylish.svg' },
    { id: '5', title: dict.hosting.pages.description.central, iconSrc: '/highlights/Central.svg' },
    { id: '6', title: dict.hosting.pages.description.spacious, iconSrc: '/highlights/Spacious.svg' }
  ];

  const toggleHighlight = (highlightId: string) => {
    setSelectedHighlights(prev => {
      if (prev.includes(highlightId)) {
        return prev.filter(id => id !== highlightId);
      }
      if (prev.length < 2) {
        return [...prev, highlightId];
      }
      return prev;
    });
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    if (newValue.length <= maxLength) {
      setDescription(newValue);
    }
  };

  return (
    <div className="w-full">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-20 items-start">
          {/* Left side - Text content */}
          <div className="space-y-3 sm:space-y-4">
            <h3>
              {currentStep === 'highlights'
                ? dict.hosting.pages.description.highlightsTitle
                : dict.hosting.pages.description.descriptionTitle}
            </h3>
            <p className="text-sm sm:text-base text-muted-foreground">
              {currentStep === 'highlights'
                ? dict.hosting.pages.description.highlightsSubtitle
                : dict.hosting.pages.description.descriptionSubtitle}
            </p>
          </div>

          {/* Right side - Content */}
          <div>
            {currentStep === 'highlights' ? (
              <div className="flex flex-wrap gap-2 sm:gap-3">
                {highlights.map((highlight) => (
                  <button
                    key={highlight.id}
                    onClick={() => toggleHighlight(highlight.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-full border transition-all whitespace-nowrap text-sm sm:text-base ${
                      selectedHighlights.includes(highlight.id)
                        ? 'border-foreground bg-accent'
                        : 'border-border hover:border-foreground/50'
                    }`}
                  >
                    <Image
                      src={highlight.iconSrc}
                      alt=""
                      width={22}
                      height={22}
                      className="object-contain"
                    />
                    <span>{highlight.title}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div>
                <textarea
                  value={description}
                  onChange={handleDescriptionChange}
                  className="w-full h-[150px] sm:h-[200px] p-4 sm:p-6 border border-input rounded-lg resize-none focus:outline-none focus:border-ring transition-colors text-sm sm:text-base"
                />
                <div className="flex justify-start mt-2 text-muted-foreground text-xs sm:text-sm">
                  <span>{description.length}/{maxLength}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DescriptionPageContent; 