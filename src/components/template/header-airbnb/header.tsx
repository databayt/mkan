"use client";

import { NAVBAR_HEIGHT } from "@/lib/constants";
import Image from "next/image";
import Link from "next/link";
import React from "react";
import { Button } from "../../ui/button";
import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, MessageCircle, Plus, Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "../../ui/avatar";
import { SidebarTrigger } from "../../ui/sidebar";
import { NAVIGATION_LINKS, DISPLAY_ITEMS, AUTH_LINKS, ALL_NAVIGATION_ITEMS } from "./constant";
import { useCurrentUser } from "../../auth/use-current-user";
import MobileNav from "./mobile-nav";
import { CategorySwitcher } from "./category-switcher";
import { BecomeHostMenu } from "./become-host-menu";

const SiteHeader = () => {
  const { data: session, status } = useSession();
  const currentUser = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();

  const isDashboardPage =
    pathname.includes("/managers") || pathname.includes("/tenants") || pathname.includes("/offices");
  const isLandingPage = pathname === "/" || pathname === "/en" || pathname === "/ar";

  const handleSignOut = async () => {
    await signOut({ 
      callbackUrl: "/",
      redirect: true 
    });
  };

  const isAuthenticated = status === "authenticated" && currentUser;

  // Filter out login/join and host items - they'll be shown separately based on auth state
  const filteredNavItems = ALL_NAVIGATION_ITEMS.filter(item => {
    return item.href !== "/login" && item.href !== "/join" && item.href !== "/host";
  });

  return (
    <div
      className={`top-0 left-0 w-full z-50 ${
        isLandingPage ? "bg-transparent" : "bg-white"
      }`}
      style={{ height: `${NAVBAR_HEIGHT}px` }}
    >
      <div className="layout-container flex justify-between items-center w-full py-3">
        <div className="flex items-center gap-4 md:gap-6">
          {isDashboardPage && (
            <div className="md:hidden">
              <SidebarTrigger />
            </div>
          )}
          <Link
            href="/"
            className="cursor-pointer hover:!text-primary-300"
            scroll={false}
          >
            <div className="flex items-center gap-2">
              <Image
                src="/tent.png"
                alt="Mkan Logo"
                width={20}
                height={20}
                className={`w-4.5 h-4.5 ${isLandingPage ? "invert" : ""}`}
              />
              <div className={`text-xl font-bold ${
                isLandingPage ? "text-white" : "text-primary-700"
              }`}>
                Mk
                <span className={`font-light hover:!text-primary-300 ${
                  isLandingPage ? "text-white" : "text-secondary-500"
                }`}>
                  an
                </span>
              </div>
            </div>
          </Link>
          {isDashboardPage && session?.user && (
            <Button
              variant="secondary"
              className="md:ml-4 bg-primary-50 text-primary-700 hover:bg-secondary-500 hover:text-primary-50"
              onClick={() =>
                router.push(
                  session.user.role?.toLowerCase() === "manager"
                    ? "/managers/newproperty"
                    : "/search"
                )
              }
            >
              {session.user.role?.toLowerCase() === "manager" ? (
                <>
                  <Plus className="h-4 w-4" />
                  <span className="hidden md:block ml-2">Add New Property</span>
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  <span className="hidden md:block ml-2">
                    Search Properties
                  </span>
                </>
              )}
            </Button>
          )}
        </div>

        {/* Category Switcher - Only visible on non-dashboard pages */}
        {!isDashboardPage && (
          <div className="hidden md:flex">
            <CategorySwitcher lang={pathname.startsWith('/ar') ? 'ar' : 'en'} />
          </div>
        )}

        {/* Desktop Navigation Links - Hidden on mobile */}
        <nav className="hidden md:flex items-center gap-6">
          {/* Become a Host dropdown menu */}
          <BecomeHostMenu isLandingPage={isLandingPage} />

          {filteredNavItems.map((item, index) => {
            const commonClasses = `text-sm font-light ${isLandingPage ? "text-white" : "text-gray-700"} hover:opacity-80`;

            // If item has href, render as Link
            if (item.href) {
              return (
                <Link key={item.href || index} href={item.href} className={commonClasses}>
                  {item.label}
                </Link>
              );
            }

            // If no href, render as display text
            return (
              <span key={index} className={commonClasses}>
                {item.label}
              </span>
            );
          })}

          {/* Auth section - show Login OR Logout based on session */}
          {status === "loading" ? null : isAuthenticated ? (
            <button
              onClick={handleSignOut}
              className={`text-sm font-light ${isLandingPage ? "text-white" : "text-gray-700"} hover:opacity-80`}
            >
              Logout
            </button>
          ) : (
            <Link
              href="/login"
              className={`text-sm font-light ${isLandingPage ? "text-white" : "text-gray-700"} hover:opacity-80`}
            >
              Login
            </Link>
          )}
        </nav>

        {/* Mobile Navigation - Shows only on mobile */}
        <MobileNav isLandingPage={isLandingPage} />
      </div>
    </div>
  );
};

export default SiteHeader;
