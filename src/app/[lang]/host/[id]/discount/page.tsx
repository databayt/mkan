"use client";
// Disable static generation for this page
export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import HostStepLayout from '@/components/host/host-step-layout';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useHostValidation } from '@/context/onboarding-validation-context';
import { useDictionary } from '@/components/internationalization/dictionary-context';

interface DiscountPageProps {
  params: Promise<{ id: string }>;
}

const DiscountPage = ({ params }: DiscountPageProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const dict = useDictionary();
  const [id, setId] = React.useState<string>('');
  const [selectedDiscounts, setSelectedDiscounts] = useState<string[]>([
    'new-listing',
    'last-minute',
    'weekly'
  ]);
  const { enableNext } = useHostValidation();

  React.useEffect(() => {
    params.then((resolvedParams) => {
      setId(resolvedParams.id);
    });
  }, [params]);

  // Enable next button since discounts are optional
  React.useEffect(() => {
    enableNext();
  }, [enableNext]);

  const toggleDiscount = (discountId: string) => {
    setSelectedDiscounts(prev => 
      prev.includes(discountId)
        ? prev.filter(id => id !== discountId)
        : [...prev, discountId]
    );
  };

  const discounts = [
    {
      id: 'new-listing',
      percentage: '20%',
      title: dict.hosting.pages.discount.newListingPromotion,
      description: dict.hosting.pages.discount.newListingDescription,
    },
    {
      id: 'last-minute',
      percentage: '25%',
      title: dict.hosting.pages.discount.lastMinuteDiscount,
      description: dict.hosting.pages.discount.lastMinuteDescription,
    },
    {
      id: 'weekly',
      percentage: '10%',
      title: dict.hosting.pages.discount.weeklyDiscount,
      description: dict.hosting.pages.discount.weeklyDescription,
    },
  ];

  return (
    <HostStepLayout
      title={dict.hosting.pages.discount.title}
      subtitle={dict.hosting.pages.discount.subtitle}
    >
      <div className="space-y-4">
        {discounts.map((discount) => (
          <Card
            key={discount.id}
            className={`p-4 cursor-pointer transition-all duration-200 ${
              selectedDiscounts.includes(discount.id)
                ? 'border-foreground/50 bg-accent'
                : 'hover:border-foreground/50'
            }`}
            onClick={() => toggleDiscount(discount.id)}
          >
            <div className="flex items-center justify-between">
              {/* Percentage Badge */}
              <div className="flex-shrink-0">
                <Badge 
                  variant={discount.id === 'new-listing' ? 'default' : 'outline'} 
                  className={`w-12 h-8 bg-transparent text-foreground flex items-center justify-center ${
                    discount.id !== 'new-listing' ? 'bg-background border border-muted-foreground' : ''
                  }`}
                >
                  {discount.percentage}
                </Badge>
              </div>
              
              {/* Title and Description */}
              <div className="flex-1 mx-4">
                <h5 className="mb-1">
                  {discount.title}
                </h5>
                <p>
                  {discount.description}
                </p>
              </div>
              
              {/* Checkbox */}
              <div className="flex-shrink-0">
                <Checkbox
                  checked={selectedDiscounts.includes(discount.id)}
                  onCheckedChange={() => toggleDiscount(discount.id)}
                />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </HostStepLayout>
  );
};

export default DiscountPage; 