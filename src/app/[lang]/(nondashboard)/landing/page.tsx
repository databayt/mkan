import { Metadata } from "next";
import React from "react";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";
import HeroSection from "@/components/site/HeroSection";

// Rendered on-demand: the landing page fetches listings from the DB, and the
// CI build has no reachable database, so it must not be prerendered at build.
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  return createMetadata({
    title: dict?.pages?.landing?.metadata?.title ?? "Welcome",
    description:
      dict?.pages?.landing?.metadata?.description ??
      "Welcome to Mkan — your rental and hosting platform",
    locale: lang,
    path: "/landing",
  });
}
import FeaturesSection from "@/components/landing/features";
import DiscoverSection from "@/components/landing/discover";
import CallToActionSection from "@/components/landing/call-to-action";
import FooterSection from "@/components/landing/footer";
import { PropertyContent } from "@/components/site/property/content";
import AirbnbFilter from "@/components/atom/property-filter";
import AirbnbPropertyHeader from "@/components/atom/property-header";
import AirbnbSelect from "@/components/atom/property-select";
import AirbnbIconsRow from "@/components/site/property-filter";
import AirbnbImages from "@/components/atom/property-images";
import AirbnbReserve from "@/components/atom/property-reserve";
import AirbnbInspiration from "@/components/site/inspiration";
import AirbnbReviews from "@/components/atom/reviews";

import PropertyContentComponent from "@/components/property/content";

const Landing = async ({ params }: { params: Promise<{ lang: string }> }) => {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  const demo = (dict as unknown as { landing?: { demo?: { title?: string } } }).landing?.demo;
  return (
    <div>
      <HeroSection />
      <div className="layout-container space-y-10">
      <AirbnbIconsRow />
      
      <PropertyContentComponent searchParams={Promise.resolve({})} />
      
      
      <AirbnbPropertyHeader
        title={demo?.title ?? "Luxury Downtown"}
        location="Manhattan, New York"
        rating={4.8}
        reviewCount={127}
        isSuperhost={true}
      />
      <AirbnbImages 
        images={[
          "https://cdn.databayt.org/mkan/stock/photo-1564013799919-ab600027ffc6.jpg",
          "https://cdn.databayt.org/mkan/stock/photo-1502672260266-1c1ef2d93688.jpg",
          "https://cdn.databayt.org/mkan/stock/photo-1484154218962-a197022b5858.jpg",
          "https://cdn.databayt.org/mkan/stock/photo-1522708323590-d24dbb6b0267.jpg",
          "https://cdn.databayt.org/mkan/stock/photo-1571896349842-33c89424de2d.jpg"
        ]}
      />
      <AirbnbReserve />
      <AirbnbInspiration />
      <AirbnbReviews />
      <AirbnbSelect type="location" />
      <AirbnbFilter />
      <PropertyContent properties={[]} />
      </div>
      <FeaturesSection />
      <DiscoverSection />
      <CallToActionSection />
      <FooterSection />

    </div>
  );
};

export default Landing;
