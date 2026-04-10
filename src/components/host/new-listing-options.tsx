"use client";

import React from 'react';
import { usePathname } from 'next/navigation';
import { Home, Copy, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface NewListingOptionsProps {
  onCreateNew?: () => void;
  onCreateFromExisting?: () => void;
}

const NewListingOptions: React.FC<NewListingOptionsProps> = ({
  onCreateNew,
  onCreateFromExisting
}) => {
  const pathname = usePathname();
  const isAr = pathname?.startsWith("/ar");
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
        {isAr ? "ابدأ إعلاناً جديداً" : "Start a new listing"}
      </h5>
      
      <div className="space-y-2">
        {/* Create a new listing */}
        <Link href="/host/overview" onClick={handleCreateNew} className="w-full flex items-center justify-between h-auto py-2 sm:py-3 border-b border-border transition-all group min-h-[50px] sm:min-h-[60px]">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
              <Home className="w-4 h-4 sm:w-5 sm:h-5 text-foreground" />
            </div>
            <div className="text-start min-w-0 flex-1">
              <h5 className="text-xs sm:text-sm font-medium">
                {isAr ? "إنشاء إعلان جديد" : "Create a new listing"}
              </h5>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
        </Link>

        {/* Create from existing listing */}
        <Link href="/host/overview" onClick={handleCreateFromExisting} className="w-full flex items-center justify-between h-auto py-2 sm:py-3 border-b border-border transition-all group min-h-[50px] sm:min-h-[60px]">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
              <Copy className="w-4 h-4 sm:w-5 sm:h-5 text-foreground" />
            </div>
            <div className="text-start min-w-0 flex-1">
              <h5 className="text-xs sm:text-sm font-medium">
                {isAr ? "إنشاء من إعلان موجود" : "Create from an existing listing"}
              </h5>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
        </Link>
      </div>
    </div>
  );
};

export default NewListingOptions; 