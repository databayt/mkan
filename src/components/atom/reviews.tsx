"use client";

import React from 'react';
import { 
  StarIcon,
  CleanlinessIcon, 
  AccuracyIcon, 
  CheckInIcon, 
  CommunicationIcon, 
  LocationIcon, 
  ValueIcon 
} from './icons';

interface ReviewCategory {
  name: string;
  rating: number;
  icon: React.ReactNode;
}

interface AirbnbReviewsProps {
  overallRating?: number;
  totalReviews?: number;
  ratingBreakdown?: number[]; // percentages for 5,4,3,2,1 stars
  categories?: ReviewCategory[];
  className?: string;
}

const defaultCategories: ReviewCategory[] = [
  {
    name: 'Cleanliness',
    rating: 4.9,
    icon: <CleanlinessIcon className="w-8 h-8" />
  },
  {
    name: 'Accuracy',
    rating: 4.9,
    icon: <AccuracyIcon className="w-8 h-8" />
  },
  {
    name: 'Check-in',
    rating: 4.8,
    icon: <CheckInIcon className="w-8 h-8" />
  },
  {
    name: 'Communication',
    rating: 4.8,
    icon: <CommunicationIcon className="w-8 h-8" />
  },
  {
    name: 'Location',
    rating: 4.7,
    icon: <LocationIcon className="w-8 h-8" />
  },
  {
    name: 'Value',
    rating: 4.6,
    icon: <ValueIcon className="w-8 h-8" />
  }
];

const AirbnbReviews: React.FC<AirbnbReviewsProps> = ({
  overallRating = 4.85,
  totalReviews = 61,
  ratingBreakdown = [98, 1, 0, 0, 1], // percentages for 5,4,3,2,1 stars
  categories = defaultCategories,
  className = "",
}) => {
  return (
    <div className={`w-full ${className}`}>
      {/* Title on Top */}
      <div className="flex items-center mb-6">
        <StarIcon className="w-5 h-5 me-2" />
        <span className="text-xl font-semibold">
          {overallRating}
        </span>
        <span className="text-xl font-semibold mx-1">·</span>
        <span className="text-xl font-semibold">
          {totalReviews} reviews
        </span>
      </div>

      {/* Content Row Below - Full Width */}
      <div className="flex items-start justify-between w-full">
        {/* Overall Rating Column */}
        <div className="flex flex-col justify-start w-[15%]">
          <h3 className="text-sm font-medium mb-2">Overall rating</h3>
          <div className="space-y-1">
            {[5, 4, 3, 2, 1].map((star, index) => (
              <div key={star} className="flex items-center space-x-3 -mb-1">
                <span className="text-sm w-2">{star}</span>
                <div className="flex-1 bg-gray-200 rounded-full h-1">
                  <div 
                    className="bg-black h-1 rounded-full"
                    style={{ width: `${ratingBreakdown[index]}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Vertical Separator */}
        <div className="w-[0.5px] bg-gray-300 h-24 mx-8"></div>

        {/* Category Columns - Spread Across Full Width */}
        <div className="flex items-start space-x-8 flex-1">
          {categories.map((category, index) => (
            <React.Fragment key={index}>
              <div className="flex flex-col justify-start flex-1">
                <h4 className="text-sm font-medium text-gray-900 mb-1">
                  {category.name}
                </h4>
                <span className="text-lg font-semibold mb-4">
                  {category.rating}
                </span>
                <div className="text-gray-700 mt-auto">
                  {category.icon}
                </div>
              </div>
              {index < categories.length - 1 && (
                <div className="w-[0.5px] bg-gray-300 h-24"></div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AirbnbReviews; 