"use client";
import { cdn } from "@/lib/cdn";

import { BlurImage } from "@/components/atom/blur-image";
import React from "react";
import SiteHeader from "@/components/template/header/header";
import BookingForm from "@/components/template/search/vertical-search";
import { useDictionary } from "@/components/internationalization/dictionary-context";

/** 16px WebP LQIP of hero.png (sharp, generated once) — the LCP image gets a real blur, never the neutral one. */
const HERO_BLUR =
  "data:image/webp;base64,UklGRk4AAABXRUJQVlA4IEIAAADwAQCdASoQAAkAAsBMJbACdAD0SRgEIQAA/sBias4ZYHfxl8cjmCMqJokJcA6Rx+Nvj0cGvAD97JQjavnqqBAAAAA=";

interface HeroSectionProps {
  onSearch?: () => void;
}

const HeroSection: React.FC<HeroSectionProps> = ({ onSearch }) => {
  const dict = useDictionary();

  return (
    <div className="relative h-screen w-full overflow-hidden">
      {/* Transparent Navbar Overlay */}
      <div className="absolute top-0 start-0 w-full z-50">
        <SiteHeader />
      </div>

      {/* Hero Background Image */}
      <div className="relative h-full w-full">
        <BlurImage
          src={cdn.product("hero.png")}
          alt={dict.home?.hero?.altText}
          blurDataURL={HERO_BLUR}
          fill
          className="object-cover object-center"
          priority
          fetchPriority="high"
          sizes="100vw"
        />
        <BookingForm onSearch={onSearch} />
      </div>
    </div>
  );
};

export default HeroSection;
