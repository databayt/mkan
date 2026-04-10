"use client";

import React from 'react';
import { Star } from 'lucide-react';

interface Review {
  id: string;
  author: string;
  rating: number;
  date: string;
  comment: string;
  avatar?: string;
}

interface MobileReviewsProps {
  reviews?: Review[];
  className?: string;
}

const MobileReviews: React.FC<MobileReviewsProps> = ({
  reviews = [],
  className = ""
}) => {
  // Sample reviews if none provided
  const sampleReviews: Review[] = [
    {
      id: '1',
      author: 'Sarah M.',
      rating: 5,
      date: 'March 2024',
      comment: 'Absolutely stunning property! The location was perfect and the amenities exceeded our expectations. Highly recommend!'
    },
    {
      id: '2',
      author: 'Michael K.',
      rating: 5,
      date: 'February 2024',
      comment: 'Beautiful place with amazing views. The host was very responsive and helpful throughout our stay.'
    },
    {
      id: '3',
      author: 'Emma L.',
      rating: 4,
      date: 'January 2024',
      comment: 'Great location and very clean. The only minor issue was the wifi speed, but everything else was perfect.'
    },
    {
      id: '4',
      author: 'David R.',
      rating: 5,
      date: 'December 2023',
      comment: 'Fantastic experience! The property is exactly as described and the neighborhood is wonderful.'
    }
  ];

  const displayReviews = reviews.length > 0 ? reviews : sampleReviews;

  return (
    <div className={`md:hidden ${className}`}>
      {/* Section Header */}
      <div className="px-4 py-6 border-b border-gray-200">
        <div className="flex items-center space-x-2 mb-4">
          <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
          <span className="text-lg font-semibold text-gray-900">4.8</span>
          <span className="text-gray-600">·</span>
          <span className="text-gray-600 underline">{displayReviews.length} reviews</span>
        </div>
      </div>

      {/* Horizontal Scrollable Reviews */}
      <div className="overflow-x-auto scrollbar-hide">
        <div className="flex space-x-4 px-4 py-6" style={{ width: `${displayReviews.length * 100}vw` }}>
          {displayReviews.map((review, index) => (
            <div 
              key={review.id}
              className="flex-shrink-0 w-screen pe-4"
              style={{ width: 'calc(100vw - 2rem)' }}
            >
              <div className="bg-white rounded-lg p-6 border border-gray-200 h-full">
                {/* Review Header */}
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-gray-600">
                      {review.author.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{review.author}</div>
                    <div className="text-sm text-gray-600">{review.date}</div>
                  </div>
                </div>

                {/* Rating */}
                <div className="flex items-center space-x-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star 
                      key={i}
                      className={`w-4 h-4 ${i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                    />
                  ))}
                </div>

                {/* Review Text */}
                <p className="text-gray-700 leading-relaxed">
                  {review.comment}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="flex justify-center space-x-2 px-4 pb-6">
        {displayReviews.map((_, index) => (
          <div
            key={index}
            className="w-2 h-2 rounded-full bg-gray-300"
          />
        ))}
      </div>
    </div>
  );
};

export default MobileReviews; 