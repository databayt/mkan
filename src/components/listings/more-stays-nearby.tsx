"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PropertyImage } from "@/components/atom/property-image";
import RatingStar from "./rating-star";
import { formatCurrency, formatNumber } from "@/lib/i18n/formatters";
import type { Locale } from "@/components/internationalization/config";

export interface NearbyStay {
  id: number;
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
  perNight?: string;
  currency?: string;
}

/**
 * "More stays nearby" — the horizontally-scrolling carousel of nearby listing
 * cards Airbnb closes the room page with. Cards are 20px-radius square images
 * with title, price and rating; arrows nudge the scroll container by ~one card.
 */
export default function MoreStaysNearby({
  stays,
  lang,
  heading = "More stays nearby",
  perNight = "night",
}: MoreStaysNearbyProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  if (!stays || stays.length === 0) return null;

  const nudge = (dir: 1 | -1) => {
    scrollerRef.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  };

  return (
    <section className="border-t border-[#DDDDDD] pb-10 pt-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-[22px] font-medium leading-[26px] tracking-[-0.44px] text-[#222222]">{heading}</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous"
            onClick={() => nudge(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white/90 text-[#222222] shadow-[0_2px_4px_rgba(0,0,0,0.18)] transition-transform hover:scale-105"
          >
            <ChevronLeft className="h-3 w-3 rtl:rotate-180" />
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={() => nudge(1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white/90 text-[#222222] shadow-[0_2px_4px_rgba(0,0,0,0.18)] transition-transform hover:scale-105"
          >
            <ChevronRight className="h-3 w-3 rtl:rotate-180" />
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="flex gap-5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {stays.map((s) => (
          <Link
            key={s.id}
            href={`/${lang}/listings/${s.id}`}
            className="group w-[210px] flex-none"
          >
            <div
              className="relative aspect-square w-full overflow-hidden bg-muted"
              style={{ borderRadius: 20 }}
            >
              <PropertyImage
                src={s.image}
                alt={s.title}
                variant="nearby"
                seed={String(s.id)}
                className="transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <div className="mt-2 flex items-start justify-between gap-2">
              <h3 className="truncate text-sm font-medium text-[#222222]">{s.title}</h3>
              {s.rating > 0 && (
                <span className="flex flex-shrink-0 items-center gap-1 text-sm text-[#222222]">
                  <RatingStar size={12} />
                  {formatNumber(s.rating, lang as Locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-[#6A6A6A]">
              <span className="font-semibold text-[#222222]">
                {formatCurrency(s.price, lang as Locale)}
              </span>{" "}
              {perNight}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
