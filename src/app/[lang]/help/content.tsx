"use client";

import { usePathname } from "next/navigation";
import HelpHeader from "@/components/help/header";
import HelpHeading from "@/components/help/heading";
import Guest from "@/components/help/guest";
import Tabs from "@/components/help/tabs";
import { useState } from "react";
import Guides from "@/components/help/guides";
import Article from "@/components/help/article";
import ExploreMore from "@/components/help/explore-more";

export default function HelpContent() {
  const pathname = usePathname();
  const isAr = pathname?.startsWith("/ar");
  const [activeTab, setActiveTab] = useState('guest');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'guest':
        return <Guest />;
      case 'home-host':
        return <div className="py-8">{isAr ? "محتوى مضيف المنزل قريباً..." : "Home host content coming soon..."}</div>;
      case 'experience-host':
        return <div className="py-8">{isAr ? "محتوى مضيف التجربة قريباً..." : "Experience host content coming soon..."}</div>;
      case 'service-host':
        return <div className="py-8">{isAr ? "محتوى مضيف الخدمة قريباً..." : "Service host content coming soon..."}</div>;
      case 'travel-admin':
        return <div className="py-8">{isAr ? "محتوى مسؤول السفر قريباً..." : "Travel admin content coming soon..."}</div>;
      default:
        return <Guest />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-22">
      <HelpHeader />
      <HelpHeading />
      <Tabs activeTab={activeTab} onTabChange={setActiveTab} />
      {renderTabContent()}
      <Guides />
      <Article />
      <ExploreMore />
    </div>
  );
}
