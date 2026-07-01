"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useDictionary } from '@/components/internationalization/dictionary-context';

interface NewListingOptionsProps {
  onCreateNew?: () => void;
  onCreateFromExisting?: () => void;
}

const NewListingOptions: React.FC<NewListingOptionsProps> = ({
  onCreateNew,
  onCreateFromExisting
}) => {
  const dict = useDictionary();
  const handleCreateNew = (e: React.MouseEvent) => {
    e.preventDefault();
    onCreateNew?.();
  };

  const handleCreateFromExisting = (e: React.MouseEvent) => {
    e.preventDefault();
    onCreateFromExisting?.();
  };

  return (
    <div className="space-y-2 sm:space-y-3">
      <h5 className="text-base sm:text-lg font-semibold">
        {dict.host?.newListing?.startNewListing ?? "Start a new listing"}
      </h5>
      
      <div className="space-y-2">
        {/* Create a new listing */}
        <Link href="/host/overview" onClick={handleCreateNew} className="w-full flex items-center justify-between h-auto py-2 sm:py-3 border-b border-border transition-all group min-h-[50px] sm:min-h-[60px]">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 32 32"
                aria-hidden="true"
                role="presentation"
                focusable="false"
                className="w-5 h-5 sm:w-6 sm:h-6 text-foreground fill-current"
              >
                <path d="M31.7 15.3 29 12.58 18.12 1.7a3.07 3.07 0 0 0-4.24 0L3 12.59l-2.7 2.7 1.4 1.42L3 15.4V28a2 2 0 0 0 2 2h22a2 2 0 0 0 2-2V15.41l1.3 1.3ZM27 28H5V13.41L15.3 3.12a1 1 0 0 1 1.4 0L27 13.42ZM17 12v5h5v2h-5v5h-2v-5h-5v-2h5v-5Z" />
              </svg>
            </div>
            <div className="text-start min-w-0 flex-1">
              <h5 className="text-xs sm:text-sm font-medium">
                {dict.host?.newListing?.createNewListing ?? "Create a new listing"}
              </h5>
            </div>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 32 32"
            aria-hidden="true"
            role="presentation"
            focusable="false"
            className="w-4 h-4 sm:w-5 sm:h-5 text-foreground stroke-current stroke-[4px] overflow-visible fill-none group-hover:text-foreground transition-colors flex-shrink-0 rtl:rotate-180"
          >
            <path fill="none" d="m12 4 11.3 11.3a1 1 0 0 1 0 1.4L12 28" />
          </svg>
        </Link>

        {/* Create from existing listing */}
        <Link href="/host/overview" onClick={handleCreateFromExisting} className="w-full flex items-center justify-between h-auto py-2 sm:py-3 border-b border-border transition-all group min-h-[50px] sm:min-h-[60px]">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 32 32"
                aria-hidden="true"
                role="presentation"
                focusable="false"
                className="w-5 h-5 sm:w-6 sm:h-6 text-foreground fill-current"
              >
                <path d="M25 5a4 4 0 0 1 4 4v17a5 5 0 0 1-5 5H12a5 5 0 0 1-5-5V10a5 5 0 0 1 5-5h13zm0 2H12a3 3 0 0 0-3 3v16a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V9a2 2 0 0 0-2-2zm-3-6v2H11a6 6 0 0 0-6 5.78V22H3V9a8 8 0 0 1 7.75-8H22z" />
              </svg>
            </div>
            <div className="text-start min-w-0 flex-1">
              <h5 className="text-xs sm:text-sm font-medium">
                {dict.host?.newListing?.createFromExisting ?? "Create from an existing listing"}
              </h5>
            </div>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 32 32"
            aria-hidden="true"
            role="presentation"
            focusable="false"
            className="w-4 h-4 sm:w-5 sm:h-5 text-foreground stroke-current stroke-[4px] overflow-visible fill-none group-hover:text-foreground transition-colors flex-shrink-0 rtl:rotate-180"
          >
            <path fill="none" d="m12 4 11.3 11.3a1 1 0 0 1 0 1.4L12 28" />
          </svg>
        </Link>
      </div>
    </div>
  );
};

export default NewListingOptions; 