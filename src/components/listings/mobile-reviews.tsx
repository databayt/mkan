"use client";

import React from 'react';
import { Star } from 'lucide-react';

import { useDictionary } from '@/components/internationalization/dictionary-context';
import { useLocale } from '@/components/internationalization/use-locale';
import { formatDate } from '@/lib/i18n/formatters';

interface MobileReviewItem {
  id: number;
  author: string;
  rating: number;
  createdAt: string | Date;
  comment: string | null;
}

interface MobileReviewsProps {
  reviews?: MobileReviewItem[];
  averageRating?: number;
  totalReviews?: number;
  className?: string;
}

const MobileReviews: React.FC<MobileReviewsProps> = ({
  reviews = [],
  averageRating,
  totalReviews,
  className = ""
}) => {
  const dict = useDictionary();
  const { locale } = useLocale();
  const t = (dict.rental?.reviewsList as Record<string, string> | undefined) ?? {};
  const reviewsCountLabel =
    typeof totalReviews === 'number' ? totalReviews : reviews.length;

  if (reviewsCountLabel === 0) {
    return (
      <div className={`md:hidden ${className}`}>
        <div className="px-4 py-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            {t.heading ?? 'What guests are saying'}
          </h3>
          <p className="text-sm text-gray-600">
            {t.empty ?? 'No reviews yet — be the first to share your experience.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`md:hidden ${className}`}>
      {/* Section Header */}
      <div className="px-4 py-6 border-b border-gray-200">
        <div className="flex items-center space-x-2 mb-4">
          <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
          {typeof averageRating === 'number' && averageRating > 0 && (
            <span className="text-lg font-semibold text-gray-900">{averageRating.toFixed(1)}</span>
          )}
          <span className="text-gray-600">·</span>
          <span className="text-gray-600 underline">{reviewsCountLabel}</span>
        </div>
      </div>

      {/* Horizontal Scrollable Reviews */}
      <div className="overflow-x-auto scrollbar-hide">
        <div className="flex space-x-4 px-4 py-6" style={{ width: `${reviews.length * 100}vw` }}>
          {reviews.map((review) => (
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
                    <div className="text-sm text-gray-600">{formatDate(review.createdAt, locale)}</div>
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
                {review.comment && (
                  <p className="text-gray-700 leading-relaxed">{review.comment}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="flex justify-center space-x-2 px-4 pb-6">
        {reviews.map((review) => (
          <div key={review.id} className="w-2 h-2 rounded-full bg-gray-300" />
        ))}
      </div>
    </div>
  );
};

export default MobileReviews;
