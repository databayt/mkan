"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PropertyImage } from "@/components/atom/property-image";
import RatingStar from "./rating-star";
import { formatCurrency, formatNumber } from "@/lib/i18n/formatters";
import type { Locale } from "@/components/internationalization/config";
import { useDictionary } from "@/components/internationalization/use-dictionary";

export interface NearbyStay {
  id: number | string;
  title: string;
  image: string | null;
  price: number;
  rating: number;
  city: string;
}

interface MoreStaysNearbyProps {
  stays: NearbyStay[];
  lang: string;
  heading?: string;
  /** Label shown in place of a rating when a listing has no reviews yet. */
  newLabel?: string;
}

/**
 * "More stays nearby" — the horizontally-scrolling carousel of nearby listing
 * cards Airbnb closes the room page with. Mirrors the live PDP carousel:
 *   • fixed-width square cards (167px desktop / 150px mobile) with a 12px radius;
 *   • title on its own truncated line, then a price↔rating meta row;
 *   • "★ New" when a listing has no rating yet (honest — no invented numbers);
 *   • arrow nudgers on desktop only (mobile is swipe-only, like Airbnb).
 * Both the desktop (`hidden md:block`) and mobile (`md:hidden`) trees render this
 * same component, so the responsive classes below do the desktop/mobile split.
 */
export default function MoreStaysNearby({
  stays,
  lang,
  heading = "More stays nearby",
  newLabel = "New",
}: MoreStaysNearbyProps) {
  const dict = useDictionary();
  const scrollerRef = useRef<HTMLDivElement>(null);

  if (!stays || stays.length === 0) return null;

  const nudge = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <section className="border-t border-[#DDDDDD] pb-10 pt-8">
      <div className="mb-4 flex items-center justify-between md:mb-6">
        <h2 className="text-[22px] font-medium leading-[26px] tracking-[-0.44px] text-[#222222] md:text-[26px] md:leading-[30px] md:tracking-[-0.52px]">
          {heading}
        </h2>
        {/* Airbnb shows arrow nudgers on desktop only; mobile carousels are swipe-only. */}
        <div className="hidden items-center gap-2 md:flex">
          <button
            type="button"
            aria-label={dict?.common?.previous ?? "Previous"}
            onClick={() => nudge(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white/90 text-[#222222] shadow-[0_2px_4px_rgba(0,0,0,0.18)] transition-transform hover:scale-105"
          >
            <ChevronLeft className="h-3 w-3 rtl:rotate-180" />
          </button>
          <button
            type="button"
            aria-label={dict?.common?.next ?? "Next"}
            onClick={() => nudge(1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white/90 text-[#222222] shadow-[0_2px_4px_rgba(0,0,0,0.18)] transition-transform hover:scale-105"
          >
            <ChevronRight className="h-3 w-3 rtl:rotate-180" />
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="no-scrollbar flex gap-3 overflow-x-auto"
      >
        {stays.map((s) => (
          <Link
            key={s.id}
            href={`/${lang}/listings/${s.id}`}
            className="group w-[150px] flex-none md:w-[167px]"
          >
            <div className="relative aspect-square w-full overflow-hidden rounded-[12px] bg-muted">
              <PropertyImage
                src={s.image}
                alt={s.title}
                variant="nearby"
                seed={String(s.id)}
                className="transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <h3 className="mt-2 truncate text-sm font-medium text-[#222222]">{s.title}</h3>
            <div className="mt-1 flex items-center justify-between gap-2 text-sm text-[#222222]">
              <span>{formatCurrency(s.price, lang as Locale)}</span>
              <span className="flex flex-shrink-0 items-center gap-1">
                <RatingStar size={11} />
                {s.rating > 0
                  ? formatNumber(s.rating, lang as Locale, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })
                  : newLabel}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
