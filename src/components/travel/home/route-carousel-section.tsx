"use client";

import React from "react";
import Link from "next/link";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import { RouteCard, type RouteCardDictionary } from "./route-card";
import type { PopularRoute } from "./route-utils";
import type { Locale } from "@/components/internationalization/config";

interface RouteCarouselSectionProps {
  title: string;
  href?: string;
  routes: PopularRoute[];
  lang: Locale;
  dateIso: string;
  dictionary: RouteCardDictionary;
  className?: string;
}

/**
 * Horizontal route-card rail — mirrors the homes landing's
 * `ListingCarouselSection` (title-with-chevron header + dragFree embla row)
 * so the transport landing scrolls exactly like the rental marketplace.
 */
export function RouteCarouselSection({
  title,
  href,
  routes,
  lang,
  dateIso,
  dictionary,
  className,
}: RouteCarouselSectionProps) {
  if (!routes || routes.length === 0) return null;

  const titleContent = (
    <>
      {title}
      <svg
        className="w-3 h-3 mt-1 rtl:rotate-180"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={4}
          d="M9 5l7 7-7 7"
        />
      </svg>
    </>
  );

  const titleClassName =
    "text-xl font-bold mb-6 flex items-center gap-1 hover:text-gray-700 transition-colors cursor-pointer";

  return (
    <section className={cn("w-full", className)}>
      {href ? (
        <Link href={href} className={titleClassName}>
          {titleContent}
        </Link>
      ) : (
        <div className={titleClassName}>{titleContent}</div>
      )}

      <Carousel
        opts={{ align: "start", dragFree: true, loop: false }}
        className="w-full"
      >
        <CarouselContent className="-ms-4">
          {routes.map((route) => (
            <CarouselItem
              key={route.id}
              className="ps-4 basis-[85%] sm:basis-1/2 lg:basis-1/4"
            >
              <RouteCard
                route={route}
                lang={lang}
                dateIso={dateIso}
                dictionary={dictionary}
              />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </section>
  );
}
