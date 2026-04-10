"use client";

import React from 'react';
import { usePathname } from 'next/navigation';
import { Home } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useDictionary } from '@/components/internationalization/dictionary-context';

interface ListingCardProps {
  id: string;
  title: string;
  startDate: string;
  type?: 'house' | 'listing';
  onClick?: (id: string) => void;
}

const ListingCard: React.FC<ListingCardProps> = ({
  id,
  title,
  startDate,
  type = 'listing',
  onClick
}) => {
  const pathname = usePathname();
  const dict = useDictionary();

  const handleClick = () => {
    onClick?.(id);
  };

  return (
    <Card 
      className="border hover:border-foreground/50 py-2 sm:py-3 bg-card hover:bg-accent transition-all cursor-pointer shadow-none hover:shadow-none rounded-lg min-h-[50px] sm:min-h-[60px]"
      onClick={handleClick}
    >
      <CardContent className="flex items-center px-2 sm:px-3">
        <div className="flex items-center space-x-2 flex-1">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-muted rounded-md flex items-center justify-center flex-shrink-0">
            <Home className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h5 className="text-xs sm:text-sm font-medium truncate">
              {title}
            </h5>
            <p className="text-xs text-muted-foreground mt-0.5">
              {dict.hosting.components.listingCard.started.replace('{date}', startDate)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ListingCard; 