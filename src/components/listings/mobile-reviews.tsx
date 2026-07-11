"use client";

import React from 'react';
import Laurel from './laurel';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import { useLocale } from '@/components/internationalization/use-locale';
import { formatDate, formatNumber } from '@/lib/i18n/formatters';
import { qualifiesAsGuestFavorite } from '@/lib/guest-favorite';

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
  /** Reviews this host has earned on their *other* places — drives the empty state. */
  hostReviewCount?: number;
  /** Host id, so the empty state can link to the rest of their reviews. */
  hostId?: string;
  /** Operator-curated Listing.isGuestFavorite — one leg of the qualification. */
  curatedGuestFavorite?: boolean;
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
  hostReviewCount = 0,
  hostId,
  curatedGuestFavorite = false,
  className = '',
}) => {
  const { locale } = useLocale();
  useDictionary();
  const ar = locale === 'ar';
  const count = typeof totalReviews === 'number' && totalReviews > 0 ? totalReviews : reviews.length;
  const avg = typeof averageRating === 'number' ? averageRating : 0;

  const wrapperClass = `md:hidden relative before:content-[''] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-[#DDDDDD] ${className}`;

  // Empty state (REVIEWS_EMPTY_DEFAULT): "No reviews (yet)" + a pointer to the
  // host's reviews on their other places, mirroring the live Airbnb block.
  if (count === 0) {
    const otherLabel = formatNumber(hostReviewCount, locale);
    return (
      <div className={wrapperClass}>
        <div className="px-6 pt-8 pb-6">
          <h2 className="mb-6 text-[22px] font-semibold text-[#222222]">
            {ar ? 'لا مراجعات (بعد)' : 'No reviews (yet)'}
          </h2>
          <div className="flex items-start gap-3">
            {/* Outlined star — verbatim from the live REVIEWS_EMPTY_DEFAULT block. */}
            <svg
              viewBox="0 0 32 32"
              aria-hidden
              className="mt-0.5 h-6 w-6 flex-none"
              style={{ display: 'block', fill: 'currentColor', color: '#222222' }}
            >
              <path d="m10.66 9.74-8.23 1-.15.02a2 2 0 0 0-.93 3.47l6.2 5.46-2 8.52-.03.15a2 2 0 0 0 2.96 2.05L16 26.15l7.52 4.26.13.07a2 2 0 0 0 2.8-2.27l-2-8.52 6.2-5.46.11-.11a2 2 0 0 0-1.19-3.38l-8.23-1-3.53-7.55a2 2 0 0 0-3.62 0zM12 11.59l4-8.56 4 8.56 9.33 1.13-7.1 6.26 2.27 9.69-8.5-4.82-8.5 4.82 2.28-9.7-7.11-6.25z" />
            </svg>
            <p className="text-base leading-5 text-[#222222]">
              {hostReviewCount > 0 ? (
                <>
                  {ar
                    ? `لدى هذا المضيف ${otherLabel} مراجعة لأماكن إقامة أخرى. `
                    : `This host has ${otherLabel} reviews for other places to stay. `}
                  {hostId && (
                    <a href={`/${locale}/host/${hostId}`} className="font-medium text-[#222222] underline">
                      {ar ? 'عرض المراجعات الأخرى' : 'Show other reviews'}
                    </a>
                  )}
                </>
              ) : ar ? (
                'كن أول من يقيّم هذا المكان بعد إقامتك.'
              ) : (
                'Be the first to review this place after your stay.'
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Laurel hero only for qualifying homes (Airbnb: ~4.9+ across 5+ reviews,
  // or our curated flag); everything else gets the "★ 4.75 · 4 reviews" head.
  const isGuestFavorite = qualifiesAsGuestFavorite({
    averageRating: avg,
    numberOfReviews: count,
    isGuestFavorite: curatedGuestFavorite,
  });
  const avgLabel = formatNumber(avg, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const countLabel = formatNumber(count, locale);

  return (
    <div className={wrapperClass}>
      {/* Guest-favorite laurel hero (REVIEWS_DEFAULT) */}
      {isGuestFavorite ? (
        <div className="flex flex-col items-center px-6 pt-10 pb-4 text-center">
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
        <div className="px-6 pt-8 pb-2">
          <h2 className="flex items-center gap-2 text-[22px] font-semibold text-[#222222]">
            <Stars n={1} size="h-5 w-5" />
            {avgLabel} · {countLabel} {locale === 'ar' ? 'تقييمات' : 'reviews'}
          </h2>
        </div>
      )}

      {/* Review cards — horizontal snap scroll; only when real records exist */}
      {reviews.length > 0 && (
        <div className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-4">
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
        <div className="px-6 pb-8 pt-2">
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
