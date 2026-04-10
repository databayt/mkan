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
} from '@/components/atom/icons';

interface ReviewCategory {
  name: string;
  rating: number;
  icon: React.ReactNode;
}

interface MobileReviewsDetailProps {
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
    icon: <CleanlinessIcon className="w-6 h-6" />
  },
  {
    name: 'Accuracy',
    rating: 4.9,
    icon: <AccuracyIcon className="w-6 h-6" />
  },
  {
    name: 'Check-in',
    rating: 4.8,
    icon: <CheckInIcon className="w-6 h-6" />
  },
  {
    name: 'Communication',
    rating: 4.8,
    icon: <CommunicationIcon className="w-6 h-6" />
  },
  {
    name: 'Location',
    rating: 4.7,
    icon: <LocationIcon className="w-6 h-6" />
  },
  {
    name: 'Value',
    rating: 4.6,
    icon: <ValueIcon className="w-6 h-6" />
  }
];

const MobileReviewsDetail: React.FC<MobileReviewsDetailProps> = ({
  overallRating = 4.85,
  totalReviews = 61,
  ratingBreakdown = [98, 1, 0, 0, 1], // percentages for 5,4,3,2,1 stars
  categories = defaultCategories,
  className = "",
}) => {
  return (
    <div className={`md:hidden px-4 py-6 space-y-6 ${className}`}>
      {/* Title */}
      <div className="flex items-center">
        <StarIcon className="w-5 h-5 me-2" />
        <span className="text-lg font-semibold">
          {overallRating}
        </span>
        <span className="text-lg font-semibold mx-1">·</span>
        <span className="text-lg font-semibold">
          {totalReviews} reviews
        </span>
      </div>

      {/* Overall Rating */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Overall rating</h3>
        <div className="space-y-2">
          {[5, 4, 3, 2, 1].map((star, index) => (
            <div key={star} className="flex items-center space-x-3">
              <span className="text-sm w-4">{star}</span>
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

      {/* Category Ratings */}
      <div className="space-y-4">
        {categories.map((category, index) => (
          <div key={index} className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="text-gray-700">
                {category.icon}
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-900">
                  {category.name}
                </h4>
                <span className="text-lg font-semibold">
                  {category.rating}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MobileReviewsDetail; 