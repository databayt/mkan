"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useDictionary } from "@/components/internationalization/dictionary-context";

const HeaderContent = () => {
  const dict = useDictionary();

  return (
    <header className="w-full bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <Image
                src="/logo.svg"
                alt={dict.navigation?.brandName ?? "Mkan"}
                width={32}
                height={32}
                className="w-8 h-8"
              />
              <span className="text-xl font-bold text-secondary-600">
                {dict.navigation?.brandName ?? "Mkan"}
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-6 rtl:space-x-reverse">
            <Link
              href="/search"
              className="text-gray-700 hover:text-secondary-600 transition-colors"
            >
              {dict.navigation?.browseRentals ?? "Browse Rentals"}
            </Link>
            <Link
              href="/become-host"
              className="text-gray-700 hover:text-secondary-600 transition-colors"
            >
              {dict.navigation?.becomeHost ?? "Become a Host"}
            </Link>
            <Link
              href="/help"
              className="text-gray-700 hover:text-secondary-600 transition-colors"
            >
              {dict.navigation?.help ?? "Help"}
            </Link>

            {/* Auth Buttons */}
            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <Button variant="ghost" asChild>
                <Link href="/login">
                  {dict.navigation?.signIn ?? "Sign In"}
                </Link>
              </Button>
              <Button asChild>
                <Link href="/join">
                  {dict.navigation?.signUp ?? "Sign Up"}
                </Link>
              </Button>
            </div>
          </nav>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <Button variant="ghost" size="sm">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default HeaderContent;
