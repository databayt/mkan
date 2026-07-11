"use client";

import React from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { HelpCircle, Bookmark } from 'lucide-react';
import { useDictionary } from '@/components/internationalization/use-dictionary';

interface HostHeaderProps {
  onHelp?: () => void;
  onSave?: () => void;
}

const HostHeader: React.FC<HostHeaderProps> = ({ onHelp, onSave }) => {
  const dict = useDictionary();
  return (
    <header className="w-full py-4">
      <div className="flex items-center justify-between">
        {/* Left side - Mkan logo */}
        <div className="flex items-center">
          <svg
            viewBox="0 0 197 179"
            className="w-5 h-5 text-[#FF385C] fill-current"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M68.3674 17.1638C81.5791 -5.72128 114.603 -5.72128 127.815 17.1638L191.532 127.507C204.746 150.392 188.227 179 161.801 179H144.681H34.3818C7.9559 179 -8.56365 150.392 4.65052 127.507L68.3674 17.1638ZM98.0913 93.1778L51.5021 179H144.681L98.0913 93.1778Z"
              fill="currentColor"
            />
          </svg>
        </div>

        {/* Right side - Help and Save buttons */}
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={onHelp}
            className="rounded-full"
            aria-label={dict?.host?.header?.help ?? "Help"}
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onSave}
            className="rounded-full"
            aria-label={dict?.host?.header?.saveProgress ?? "Save progress"}
          >
            <Bookmark className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
};

export default HostHeader;
