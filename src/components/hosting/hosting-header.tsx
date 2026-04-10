"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { useDictionary } from '@/components/internationalization/dictionary-context';

const HostingHeader = () => {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const dict = useDictionary();

  const isAr = pathname?.startsWith('/ar');

  const navigationItems = [
    { name: dict.hosting?.header?.today ?? "Today", href: '/hosting' },
    { name: dict.hosting?.header?.calendar ?? "Calendar", href: '/hosting/calendar' },
    { name: dict.hosting?.header?.listings ?? "Listings", href: '/hosting/listings' },
    { name: dict.hosting?.header?.messages ?? "Messages", href: '/hosting/messages', hasNotification: true },
  ];

  const isActiveRoute = (href: string) => {
    return pathname === href;
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <header className="bg-muted px-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative flex items-center justify-between h-16">
          {/* Left side - Logo */}
          <div className="flex items-center">
            <Link href="/hosting" className="cursor-pointer hover:text-gray-700" scroll={false}>
              <div className="flex items-center gap-2">
                <Image
                  src="/tent.png"
                  alt={dict.hosting?.header?.logo ?? "Mkan Logo"}
                  width={20}
                  height={20}
                  className="w-4 h-4 sm:w-5 sm:h-5"
                />
                <div className="text-lg sm:text-xl font-bold text-gray-900">
                  {isAr ? (dict.hosting?.header?.brandName ?? "مكان") : (<>Mk<span className="font-light hover:text-gray-700 text-gray-600">an</span></>)}
                </div>
              </div>
            </Link>
          </div>

          {/* Center - Navigation (Hidden on mobile, shown on desktop) */}
          <nav className="hidden lg:flex absolute left-1/2 transform -translate-x-1/2 space-x-8 rtl:space-x-reverse">
            {navigationItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`relative text-sm font-medium transition-colors ${
                  isActiveRoute(item.href)
                    ? 'text-gray-900 border-b-2 border-gray-900 pb-0.5'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {item.name}
                {item.hasNotification && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                )}
              </Link>
            ))}
          </nav>

          {/* Right side - User Controls */}
          <div className="flex items-center space-x-2 sm:space-x-4 rtl:space-x-reverse">
            <div className="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center">
              <span className="text-white font-medium text-sm">A</span>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={toggleMobileMenu}
              className=" p-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-gray-200 bg-white">
            <nav className="flex flex-col space-y-1 py-2">
              {navigationItems.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                    isActiveRoute(item.href)
                      ? 'text-gray-900 bg-gray-50'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{item.name}</span>
                    {item.hasNotification && (
                      <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                    )}
                  </div>
                </Link>
              ))}
              <Link
                href="/search"
                onClick={() => setIsMobileMenuOpen(false)}
                className="px-4 py-3 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
              >
                {dict.hosting?.header?.switchToTraveling ?? "Switch to traveling"}
              </Link>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};

export default HostingHeader;
