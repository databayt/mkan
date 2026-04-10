"use client";

import Image from "next/image";
import React from "react";
import SiteHeader from "@/components/template/header/header";
import BookingForm from "@/components/template/search/vertical-search";
import { useDictionary } from "@/components/internationalization/dictionary-context";

interface HeroSectionProps {
  onSearch?: () => void;
}

const HeroSection: React.FC<HeroSectionProps> = ({ onSearch }) => {
  const dict = useDictionary();

  return (
    <div className="relative h-screen w-full overflow-hidden">
      {/* Transparent Navbar Overlay */}
      <div className="absolute top-0 left-0 w-full z-50">
        <SiteHeader />
      </div>

      {/* Hero Background Image */}
      <div className="relative h-full w-full">
        <Image
          src="/hero.png"
          alt={dict.home?.hero?.altText}
          fill
          className="object-cover object-center"
          priority
          sizes="100vw"
        />
        <BookingForm onSearch={onSearch} />
      </div>
    </div>
  );
};

export default HeroSection;
