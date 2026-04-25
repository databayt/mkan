"use client";

import HelpHeader from "@/components/help/header";
import HelpHeading from "@/components/help/heading";
import Guest from "@/components/help/guest";
import HomeHost from "@/components/help/home-host";
import ExperienceHost from "@/components/help/experience-host";
import ServiceHost from "@/components/help/service-host";
import TravelAdmin from "@/components/help/travel-admin";
import Tabs from "@/components/help/tabs";
import { useState } from "react";
import Guides from "@/components/help/guides";
import Article from "@/components/help/article";
import ExploreMore from "@/components/help/explore-more";

export default function HelpContent() {
  const [activeTab, setActiveTab] = useState('guest');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'guest':
        return <Guest />;
      case 'home-host':
        return <HomeHost />;
      case 'experience-host':
        return <ExperienceHost />;
      case 'service-host':
        return <ServiceHost />;
      case 'travel-admin':
        return <TravelAdmin />;
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
