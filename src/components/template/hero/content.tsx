"use client";

import Image from "next/image";
import React, { useState } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRouter, usePathname } from "next/navigation";
import { useGlobalStore } from "@/state/filters";
import SiteHeader from "@/components/template/header/header";


const HeroSection = () => {
  const setFilters = useGlobalStore((s) => s.setFilters);
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();
  const pathname = usePathname();
  const isAr = pathname?.startsWith("/ar");

  const handleLocationSearch = async () => {
    try {
      const trimmedQuery = searchQuery.trim();
      if (!trimmedQuery) return;

      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          trimmedQuery
        )}.json?access_token=${
          process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
        }&fuzzyMatch=true`
      );
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        setFilters({
          location: trimmedQuery,
          coordinates: [lat, lng],
        });
        const params = new URLSearchParams({
          location: trimmedQuery,
          lat: lat.toString(),
          lng: lng,
        });
        router.push(`/search?${params.toString()}`);
      }
    } catch (error) {
      console.error("error search location:", error);
    }
  };

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
          alt={isAr ? "منصة مكان للإيجارات" : "Mkan Rental Platform Hero Section"}
          fill
          className="object-cover object-center"
          priority
          sizes="100vw"
        />


        {/* Hero Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center w-full z-20"
        >
        <div className="max-w-4xl mx-auto px-16 sm:px-12">
          <h1 className="text-5xl font-bold text-white drop-shadow-lg mb-4">
            {isAr
              ? "ابدأ رحلتك لإيجاد المكان المثالي لتسميه وطنك"
              : "Start your journey to finding the perfect place to call home"}
          </h1>
          <p className="text-xl text-white drop-shadow-md mb-8">
            {isAr
              ? "استكشف مجموعتنا الواسعة من العقارات المصممة لتناسب أسلوب حياتك واحتياجاتك!"
              : "Explore our wide range of rental properties tailored to fit your lifestyle and needs!"}
          </p>

          <div className="flex justify-center">
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? "ابحث بالمدينة أو الحي أو العنوان" : "Search by city, neighborhood or address"}
              className="w-full max-w-lg rounded-none rounded-s-xl rtl:rounded-s-none rtl:rounded-e-xl border-none bg-white h-12"
            />
            <Button
              onClick={handleLocationSearch}
              className="bg-secondary-500 text-white rounded-none rounded-e-xl rtl:rounded-e-none rtl:rounded-s-xl border-none hover:bg-secondary-600 h-12"
            >
              {isAr ? "بحث" : "Search"}
            </Button>
          </div>
        </div>
        </motion.div>
      </div>
    </div>
  );
};

export default HeroSection;
