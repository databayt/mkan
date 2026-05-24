"use client";

import React from 'react';
import { useDictionary } from "@/components/internationalization/dictionary-context";

interface TabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function Tabs({ activeTab, onTabChange }: TabsProps) {
  const dict = useDictionary();
  const t = dict?.help?.tabs;

  const tabs = [
    { id: 'guest', name: t?.guest ?? 'Guest' },
    { id: 'home-host', name: t?.homeHost ?? 'Home host' },
    { id: 'experience-host', name: t?.experienceHost ?? 'Experience host' },
    { id: 'service-host', name: t?.serviceHost ?? 'Service host' },
    { id: 'travel-admin', name: t?.travelAdmin ?? 'Travel admin' },
  ];

  return (
    <div className="border-b border-gray-200">
      <div className="">
        <nav className="flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-black text-black'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}




