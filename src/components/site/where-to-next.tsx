"use client";

import Link from "next/link";
import Image from "next/image";
import { useLocale } from "@/components/internationalization/use-locale";
import { useDictionary } from "@/components/internationalization/dictionary-context";

export default function WhereToNext() {
  const { locale } = useLocale();
  const dict = useDictionary();

  // Fetch localized dictionary values for the banner
  const t = dict?.home?.whereToNext;

  return (
    <Link
      href={`/${locale}/travel/listings`}
      className="group block w-full bg-[#f7f7f7] hover:bg-[#efefef] rounded-2xl border border-gray-200 overflow-hidden transition-all duration-300 hover:shadow-md cursor-pointer"
    >
      <div className="flex flex-col md:flex-row items-stretch min-h-[300px]">
        {/* Content Section */}
        <div className="flex-1 flex flex-col justify-center p-8 lg:p-12 text-start">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#353535] leading-tight mb-4">
            {t?.title ?? "Where to next?"}
          </h2>
          <p className="text-base text-[#646464] mb-8 max-w-md">
            {t?.text ?? "Discover our travel map with over 8000 destinations worldwide."}
          </p>
          <div>
            <div className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6 py-3.5 rounded-lg shadow-sm transition-all duration-200 group-hover:scale-[1.02]">
              <svg
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5 fill-current shrink-0"
                aria-hidden="true"
              >
                <path d="m2.5 5.56 5-3.4v16.29l-5 3.39a.5.5 0 0 1-.25.09q-.24-.01-.25-.35V6.49c0-.33.22-.75.5-.93M8.54 2.1l-.04-.01v16.28h.04l6.93 3.53.03.01V5.63h-.04zm13.2-.03a.4.4 0 0 0-.24.09l-5 3.4v16.28l5-3.4c.28-.18.5-.6.5-.93V2.42q-.01-.34-.25-.35" />
              </svg>
              <span>{t?.button ?? "Explore the map"}</span>
            </div>
          </div>
        </div>

        {/* Image Section */}
        <div className="relative flex-1 min-h-[250px] md:min-h-auto overflow-hidden">
          <Image
            src="/assets/sudan-travel-banner.jpg"
            alt={t?.altText ?? "Scenic view of Sudan travel featuring pyramids and road"}
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
            priority
          />
        </div>
      </div>
    </Link>
  );
}
