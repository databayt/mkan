"use client";
// Disable static generation for this page
export const dynamic = 'force-dynamic';

import HelpHeader from "@/components/help/header";
import HelpHeading from "@/components/help/heading";
import Guest from "@/components/help/guest";
import Tabs from "@/components/help/tabs";
import { useState } from "react";
import Guides from "@/components/help/guides";
import Article from "@/components/help/article";
import ExploreMore from "@/components/help/explore-more";

export default function HelpPage() {
  const [activeTab, setActiveTab] = useState('guest');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'guest':
        return <Guest />;
      case 'home-host':
        return <div className="py-8">Home host content coming soon...</div>;
      case 'experience-host':
        return <div className="py-8">Experience host content coming soon...</div>;
      case 'service-host':
        return <div className="py-8">Service host content coming soon...</div>;
      case 'travel-admin':
        return <div className="py-8">Travel admin content coming soon...</div>;
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