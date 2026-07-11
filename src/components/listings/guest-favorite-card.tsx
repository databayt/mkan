import React from "react";
import Laurel from "./laurel";
import RatingStar from "./rating-star";

/**
 * Compact "Guest favorite" banner in the overview — pixel-matched to the live
 * card: 1px #DDDDDD / 12px radius / 22×26 padding, laurels (36px) flanking a
 * two-line "Guest favorite", the blurb, then rating + review count split by a
 * 1×40 hairline.
 */
export default function GuestFavoriteCard({
  rating,
  reviewCount,
  blurb = "One of the most loved homes on Mkan, according to guests",
  label = "Guest favorite",
  reviewsLabel = "Reviews",
  badgeOnly = false,
}: {
  rating?: number;
  reviewCount?: number;
  blurb?: string;
  label?: string;
  reviewsLabel?: string;
  /** No review data yet — render the laurel badge + blurb only, never fake numbers. */
  badgeOnly?: boolean;
}) {
  const [word1, ...rest] = label.split(" ");

  // Curated favorite without reviews: badge + blurb, no rating/review columns.
  if (badgeOnly) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[12px] border border-[#DDDDDD] px-[26px] py-[22px] text-center sm:flex-row sm:justify-center sm:gap-6">
        <div className="flex items-center gap-1">
          <Laurel side="left" size={36} />
          <div className="text-[18px] font-medium leading-[18px] text-[#222222]">
            {word1}
            {rest.length > 0 && (
              <>
                <br />
                {rest.join(" ")}
              </>
            )}
          </div>
          <Laurel side="right" size={36} />
        </div>
        <p className="max-w-[273px] text-[16px] font-medium leading-5 text-[#222222]">
          {blurb}
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-around gap-6 rounded-[12px] border border-[#DDDDDD] px-[26px] py-[22px]">
      <div className="flex items-center gap-1">
        <Laurel side="left" size={36} />
        <div className="text-[18px] font-medium leading-[18px] text-[#222222]">
          {word1}
          {rest.length > 0 && (
            <>
              <br />
              {rest.join(" ")}
            </>
          )}
        </div>
        <Laurel side="right" size={36} />
      </div>

      <p className="hidden max-w-[273px] flex-1 text-[16px] font-medium leading-5 text-[#222222] sm:block">
        {blurb}
      </p>

      <div className="flex items-center gap-4">
        <div className="text-center">
          <div className="text-[22px] font-medium leading-[26px] text-[#222222]">
            {(rating ?? 0).toFixed(1)}
          </div>
          <div className="mt-1 flex justify-center gap-0.5">
            {[...Array(5)].map((_, i) => (
              <RatingStar key={i} size={10} />
            ))}
          </div>
        </div>
        <div className="h-10 w-px bg-[#DDDDDD]" />
        <div className="text-center">
          <div className="text-[22px] font-medium leading-[26px] text-[#222222]">
            {reviewCount ?? 0}
          </div>
          <div className="text-[12px] font-medium leading-4 text-[#222222]">
            {reviewsLabel}
          </div>
        </div>
      </div>
    </div>
  );
}
