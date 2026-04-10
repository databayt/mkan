import React from 'react';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShareIcon, HeartIcon } from '@/components/atom/icons';

interface AirbnbPropertyHeaderProps {
  title: string;
  location: string;
  rating?: number;
  reviewCount?: number;
  isSuperhost?: boolean;
  onShare?: () => void;
  onSave?: () => void;
  isSaved?: boolean;
  className?: string;
}

const AirbnbPropertyHeader: React.FC<AirbnbPropertyHeaderProps> = ({
  title,
  location,
  rating,
  reviewCount,
  isSuperhost = false,
  onShare,
  onSave,
  isSaved = false,
  className = "",
}) => {
  const formatReviewCount = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k`;
    }
    return count.toString();
  };

  return (
    <div className={`w-full ${className}`}>
      {/* Main Header */}
      <div className="flex flex-col space-y-1">
        {/* Title Row */}
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 leading-tight">
            {title}
          </h1>
        </div>

        {/* Everything Else Row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center space-x-3">
            {/* Rating */}
            {rating && (
              <div className="flex items-center space-x-1">
                <svg className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} viewBox="0 0 16 16" fill="none">
                <path d="M7.99996 3.16675L9.16663 6.83341H12.8333L9.83329 9.16675L10.8333 12.8334L7.99996 10.5001L5.16663 12.8334L6.16663 9.16675L3.16663 6.83341H6.83329L7.99996 3.16675Z" stroke="#DE3151" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill={isSaved ? '#DE3151' : 'none'}/>
              </svg>
                <span className="text-sm font-normal text-gray-900">
                  {rating.toFixed(1)}
                </span>
                {reviewCount && (
                  <span className="text-sm text-gray-600">
                    · {formatReviewCount(reviewCount)} reviews
                  </span>
                )}
              </div>
            )}

            {/* Superhost Badge */}
            {isSuperhost && (
              <>
                <span className="text-gray-400 text-sm">·</span>
                <div className="flex items-center space-x-1 text-gray-900">
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                    <path d="M9.50004 5.83341L12.1667 3.16675H3.83337L6.50004 5.83341" stroke="#DE3151" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M11.5 9.33325C11.5 11.2662 9.933 12.8333 8 12.8333C6.067 12.8333 4.5 11.2662 4.5 9.33325C4.5 7.40026 6.067 5.83325 8 5.83325C9.933 5.83325 11.5 7.40026 11.5 9.33325Z" stroke="#DE3151" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-sm font-normal">Superhost</span>
                </div>
              </>
            )}

            {/* Location */}
            <div className="flex items-center space-x-1 text-gray-600">
              <span className="text-gray-400 hidden sm:inline text-sm">·</span>
              <MapPin className="w-3 h-3 sm:hidden" />
              <span className="hover:underline hover:text-gray-900 cursor-pointer text-sm">
                {location}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onShare}
              className="flex items-center space-x-1 text-gray-700 hover:bg-transparent hover:underline text-sm font-medium underline"
            >
              <ShareIcon className="w-4 h-4" />
              <span>Share</span>
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={onSave}
              className={`flex items-center space-x-1 hover:bg-transparent hover:underline text-sm font-medium underline ${
                isSaved ? 'text-red-500' : 'text-gray-700'
              }`}
            >
              <HeartIcon className={`w-4 h-4 ${isSaved ? 'fill-red-500 text-red-500' : ''}`} />
              <span>Save</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Divider
      <div className="mt-6 border-b border-gray-200" /> */}
    </div>
  );
};

export default AirbnbPropertyHeader;
