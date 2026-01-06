"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { OnboardingStepsOverviewProps } from './types';

/**
 * Generic steps overview component for onboarding flows
 * Displays the main steps in a two-column layout with illustrations
 * Can be configured for different onboarding flows (host, transport, etc.)
 */
const OnboardingStepsOverview: React.FC<OnboardingStepsOverviewProps> = ({
  config,
  onGetStarted,
  isLoading = false,
  loadingLabel = "Creating...",
  className,
}) => {
  const defaultHeadline = (
    <>
      It's easy to get
      <br />
      started on Mkan
    </>
  );

  return (
    <div className={cn("h-full flex flex-col px-6 md:px-20", className)}>
      <div className="flex-1">
        <div className="h-full max-w-7xl mx-auto flex flex-col">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-12 items-start py-12">
            {/* Left Side - Title */}
            <div>
              <h2>
                {config.headline || defaultHeadline}
              </h2>
              {config.subheadline && (
                <p className="mt-4 text-muted-foreground">
                  {config.subheadline}
                </p>
              )}
            </div>

            {/* Right Side - Steps */}
            <div className="space-y-6">
              {config.steps.map((step) => (
                <div key={step.number} className="flex gap-6 items-start">
                  <div className="flex gap-3 flex-1">
                    <div className="flex-shrink-0">
                      <h4 className="text-foreground">
                        {step.number}
                      </h4>
                    </div>
                    <div>
                      <h4 className="mb-1">
                        {step.title}
                      </h4>
                      <p>
                        {step.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex-shrink-0 hidden md:flex items-center justify-center w-24 h-24">
                    {step.illustration}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Section with HR and Button */}
          <div>
            <Separator className="w-full" />
            <div className="flex justify-end py-4">
              <Button onClick={onGetStarted} disabled={isLoading}>
                {isLoading ? loadingLabel : (config.buttonLabel || 'Get started')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingStepsOverview;
