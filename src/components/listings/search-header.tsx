"use client";

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { MoreHorizontal, Menu } from 'lucide-react';
import SmallSearch from '@/components/template/search/small-search';

const SearchHeader = () => {
  const pathname = usePathname();

  const navigationItems = [
    { name: 'Homes', href: '#' },
    { name: 'Experiences', href: '#' },
    { name: 'Services', href: '#' },
  ];

  const isActiveRoute = (href: string) => {
    return pathname === href;
  };

  return (
    <header className="bg-white sticky top-0 z-50 border-b -mx-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-22">
        <div className="relative flex items-center justify-between h-16">
          {/* Left side - Logo */}
          <div className="flex items-center">
            <Link href="/" className="cursor-pointer hover:text-gray-700" scroll={false}>
              <div className="flex items-center gap-2">
                <Image
                  src="/tent.png"
                  alt="Mkan Logo"
                  width={20}
                  height={20}
                  className="w-5 h-5"
                />
                <div className="text-xl font-bold text-gray-900">
                  Mk
                  <span className="font-light hover:text-gray-700 text-gray-600">
                    an
                  </span>
                </div>
              </div>
            </Link>
          </div>

          {/* Center - Small Search */}
          <div className="flex items-center justify-center flex-1 max-w-md mx-8">
            <SmallSearch />
          </div>

          {/* Right side - User Controls */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center">
              <span className="text-white font-medium text-sm">A</span>
            </div>
            
            <button className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center hover:bg-gray-300 transition-colors">
              <Menu size={16} className="text-gray-600" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default SearchHeader;
