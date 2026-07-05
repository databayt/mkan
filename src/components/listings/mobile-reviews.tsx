"use client";

import React from 'react';
import Laurel from './laurel';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import { useLocale } from '@/components/internationalization/use-locale';
import { formatDate, formatNumber } from '@/lib/i18n/formatters';

interface MobileReviewItem {
  id: number;
  author: string;
  rating: number;
  createdAt: string | Date;
  comment: string | null;
}

interface MobileReviewsProps {
  reviews?: MobileReviewItem[];
  /** Listing-level review count (drives the hero + "Show all"), like the banner. */
  totalReviews?: number;
  averageRating?: number;
  className?: string;
}

// Airbnb's 32-grid star, filled #222 (not the yellow lucide star).
const Stars = ({ n = 5, size = 'h-2.5 w-2.5' }: { n?: number; size?: string }) => (
  <div className="flex items-center gap-0.5">
    {[...Array(n)].map((_, i) => (
      <svg key={i} viewBox="0 0 32 32" aria-hidden className={size} style={{ display: 'block', fill: '#222222' }}>
        <path d="m15.1 1.58-4.13 8.88-9.86 1.27a1 1 0 0 0-.54 1.74l7.3 6.57-1.97 9.85a1 1 0 0 0 1.48 1.06l8.62-5 8.63 5a1 1 0 0 0 1.48-1.06l-1.97-9.85 7.3-6.57a1 1 0 0 0-.55-1.73l-9.86-1.28-4.12-8.88a1 1 0 0 0-1.82 0z" />
      </svg>
    ))}
  </div>
);

const MobileReviews: React.FC<MobileReviewsProps> = ({
  reviews = [],
  totalReviews,
  averageRating,
  className = '',
}) => {
  const { locale } = useLocale();
  useDictionary();
  const count = typeof totalReviews === 'number' && totalReviews > 0 ? totalReviews : reviews.length;
  const avg = typeof averageRating === 'number' ? averageRating : 0;

  // Honest-info rule: no rating and no reviews → render nothing.
  if (count === 0 && avg === 0) return null;

  const isGuestFavorite = avg >= 4.5 && count >= 1;
  const avgLabel = formatNumber(avg, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const countLabel = formatNumber(count, locale);

  return (
    <div className={`md:hidden relative before:content-[''] before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-[#DDDDDD] ${className}`}>
      {/* Guest-favorite laurel hero (REVIEWS_DEFAULT) */}
      {isGuestFavorite ? (
        <div className="flex flex-col items-center px-4 pt-10 pb-4 text-center">
          <div className="flex items-center justify-center gap-1">
            <Laurel side="left" size={58} />
            <span className="text-[58px] font-medium leading-none tracking-[-0.04em] text-[#222222]">{avgLabel}</span>
            <Laurel side="right" size={58} />
          </div>
          <h2 className="mt-4 text-[22px] font-semibold text-[#222222]">
            {locale === 'ar' ? 'مفضل الضيوف' : 'Guest favorite'}
          </h2>
          <p className="mt-1.5 max-w-[320px] text-base leading-5 text-[#6C6C6C]">
            {locale === 'ar'
              ? 'هذا المنزل من مفضلات الضيوف بناءً على التقييمات والمراجعات والموثوقية'
              : 'This home is a guest favorite based on ratings, reviews, and reliability'}
          </p>
        </div>
      ) : (
        <div className="px-4 pt-8 pb-2">
          <h2 className="flex items-center gap-2 text-[22px] font-semibold text-[#222222]">
            <Stars n={1} size="h-5 w-5" />
            {avgLabel} · {countLabel} {locale === 'ar' ? 'تقييمات' : 'reviews'}
          </h2>
        </div>
      )}

      {/* Review cards — horizontal snap scroll; only when real records exist */}
      {reviews.length > 0 && (
        <div className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4">
          {reviews.map((r) => (
            <div key={r.id} className="w-[300px] flex-none snap-start">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#DDDDDD] text-sm font-medium text-[#222222]">
                  {r.author.charAt(0).toUpperCase()}
                </div>
                <div className="text-start">
                  <div className="text-base font-medium text-[#222222]">{r.author}</div>
                  <div className="text-sm text-[#6C6C6C]">{formatDate(r.createdAt, locale)}</div>
                </div>
              </div>
              <div className="mt-3">
                <Stars />
              </div>
              {r.comment && (
                <p className="mt-2 line-clamp-4 text-base leading-5 text-[#222222]">{r.comment}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Show all N reviews */}
      {count > 0 && (
        <div className="px-4 pb-8 pt-2">
          <button
            type="button"
            className="flex h-12 w-full items-center justify-center rounded-[12px] bg-[#F2F2F2] text-base font-medium text-[#222222]"
          >
            {locale === 'ar' ? `عرض جميع التقييمات (${countLabel})` : `Show all ${countLabel} reviews`}
          </button>
        </div>
      )}
    </div>
  );
};

export default MobileReviews;
