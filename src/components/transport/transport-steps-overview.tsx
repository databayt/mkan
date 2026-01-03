"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Building2, Bus, CalendarCheck } from 'lucide-react';

interface Step {
  number: number;
  title: string;
  description: string;
  icon: React.ReactNode;
}

interface TransportStepsOverviewProps {
  onGetStarted?: () => void;
  isLoading?: boolean;
}

const TransportStepsOverview: React.FC<TransportStepsOverviewProps> = ({
  onGetStarted,
  isLoading = false,
}) => {
  const steps: Step[] = [
    {
      number: 1,
      title: "Set up your office",
      description: "Enter your office details, contact information, and select your assembly point location.",
      icon: <Building2 className="h-12 w-12 text-primary" />,
    },
    {
      number: 2,
      title: "Add buses & routes",
      description: "Register your buses with amenities and capacities, then define your routes with pricing.",
      icon: <Bus className="h-12 w-12 text-primary" />,
    },
    {
      number: 3,
      title: "Create schedules & publish",
      description: "Set up trip schedules, add photos, and publish your office to start receiving bookings.",
      icon: <CalendarCheck className="h-12 w-12 text-primary" />,
    }
  ];

  return (
    <div className="h-full flex flex-col px-6 md:px-20">
      <div className="flex-1">
        <div className="h-full max-w-7xl mx-auto flex flex-col">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-12 items-start py-12">
            {/* Left Side - Title */}
            <div>
              <h2>
                It's easy to get
                <br />
                started on Mkan
              </h2>
              <p className="mt-4 text-muted-foreground">
                Set up your transport office in minutes and start accepting online bookings from travelers.
              </p>
            </div>

            {/* Right Side - Steps */}
            <div className="space-y-6">
              {steps.map((step) => (
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
                    {step.icon}
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
                {isLoading ? 'Creating...' : 'Get started'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TransportStepsOverview;
