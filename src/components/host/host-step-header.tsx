"use client";

import React from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useDictionary } from '@/components/internationalization/dictionary-context';

interface HostStepHeaderProps {
  stepNumber?: number;
  title: string;
  description?: string;
  illustration?: React.ReactNode;
  className?: string;
}

const HostStepHeader: React.FC<HostStepHeaderProps> = ({
  stepNumber,
  title,
  description,
  illustration,
  className,
}) => {
  const pathname = usePathname();
  const dict = useDictionary();

  return (
    <div className={cn('w-full -mt-6 sm:-mt-10', className)}>
      <div className="grid grid-cols-1 lg:grid-cols-2 items-center gap-6 lg:gap-12">
        {/* Left Side - Content */}
        <div className="space-y-4 sm:space-y-6">
          {stepNumber && (
            <h6 className="text-base sm:text-lg font-semibold text-muted-foreground">
              {dict.hosting.components.stepHeader.step.replace('{number}', String(stepNumber))}
            </h6>
          )}
          
          <h2 className="leading-tight text-2xl sm:text-3xl lg:text-4xl font-semibold text-foreground">
            {title}
          </h2>
          
          {description && (
            <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
              {description}
            </p>
          )}
        </div>

        {/* Right Side - Illustration */}
        {illustration && (
          <div className="block lg:block order-first lg:order-last">
            <div className="relative">
              {illustration}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HostStepHeader; 