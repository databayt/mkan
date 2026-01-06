"use client";

import React, { FC, useState } from 'react';
// context
import { DATA_ACTION_TYPES } from '@/context/DataContext';
import { useDataContext } from '@/hooks/useDataContext';
// icons
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from '@/components/row/placeholders/Icons';

// Stub interface for explore nearby
interface IExploreNearby {
  id: string;
  location: string;
  distance: string;
  img: string;
}

interface AppSearchBarMobileProps {
  exploreNearby: IExploreNearby[];
  searchPage?: boolean;
}

const AppSearchBarMobile: FC<AppSearchBarMobileProps> = ({
  exploreNearby,
  searchPage,
  }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [location, setLocation] = useState("");

  return (
    <div className="md:hidden">
      <div className="px-4 py-3">
        <button
          onClick={() => setIsOpen(true)}
          className="w-full flex items-center p-3 bg-white border border-gray-200 rounded-full shadow-sm"
        >
          <div className="flex-1 text-left">
            <div className="text-sm font-medium text-gray-800">Where to?</div>
            <div className="text-xs text-gray-500">Anywhere • Any week • Add guests</div>
          </div>
          <div className="bg-red-500 text-white p-2 rounded-full">
            🔍
          </div>
        </button>
      </div>

      {/* Mobile Search Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-white">
          <div className="flex items-center justify-between p-4 border-b">
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-600"
            >
              ← Back
            </button>
            <h2 className="font-semibold">Search</h2>
            <div></div>
          </div>
          
          <div className="p-4">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Where
                </label>
                <input
                  type="text"
                  placeholder="Search destinations"
                                     value={location}
                   onChange={(e) => setLocation(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  When
                </label>
                <button className="w-full p-3 border border-gray-300 rounded-lg text-left text-gray-500">
                  Add dates
                </button>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Who
                </label>
                <button className="w-full p-3 border border-gray-300 rounded-lg text-left text-gray-500">
                  Add guests
                </button>
              </div>
            </div>
            
            <button
              onClick={() => setIsOpen(false)}
              className="w-full mt-6 bg-red-500 text-white py-3 rounded-lg font-medium"
            >
              Search
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppSearchBarMobile;
