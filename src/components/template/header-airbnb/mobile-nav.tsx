"use client";

import React from 'react';
import Link from 'next/link';
import { Menu, X, LogOut } from 'lucide-react';
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { ALL_NAVIGATION_ITEMS } from './constant';
import { useCurrentUser } from '../../auth/use-current-user';
import { LanguageSwitcher } from '@/components/language-switcher';

interface MobileNavProps {
  isLandingPage?: boolean;
}

const MobileNav = ({ isLandingPage = false }: MobileNavProps) => {
  const [open, setOpen] = React.useState(false);
  const { data: session } = useSession();
  const currentUser = useCurrentUser();
  const pathname = usePathname();

  const handleSignOut = async () => {
    await signOut({ 
      callbackUrl: "/",
      redirect: true 
    });
    setOpen(false);
  };

  // Filter out login/join and host items - host options shown separately
  const filteredNavItems = ALL_NAVIGATION_ITEMS.filter(item => {
    if (item.href === "/host") return false; // Will show expanded host options
    if (!currentUser) return true;
    return item.href !== "/login" && item.href !== "/join";
  });

  const handleLinkClick = () => {
    setOpen(false);
  };

  const isDashboardPage =
    pathname.includes("/managers") || pathname.includes("/tenants") || pathname.includes("/offices");
  const currentLocale = pathname.startsWith('/ar') ? 'ar' : 'en';

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`md:hidden w-9 h-9 flex items-center justify-center relative z-[60] transition-colors ${
            open
              ? 'text-black hover:text-black/80'
              : isLandingPage
                ? 'text-white hover:text-white/80'
                : 'text-black hover:text-black/80'
          } hover:bg-transparent`}
        >
          <div className="w-5 h-5 flex items-center justify-center">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </div>
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-80 p-6">
        <div className="flex flex-col space-y-4 pt-8">
          {/* Become a host - direct link */}
          <Link
            href={`/${currentLocale}/host`}
            onClick={handleLinkClick}
            className="text-black text-sm hover:text-black/70 transition-colors"
          >
            Become a host
          </Link>

          <Separator className="my-2" />

          {filteredNavItems.map((item, index) => {
            // Handle display items without href (skip "English" - handled by LanguageSwitcher)
            if (item.type === "display" && !item.href) {
              if (item.label === "English") return null;
              return (
                <div key={index} className="text-black text-sm">
                  {item.label}
                </div>
              );
            }

            // Handle navigation items with href
            if (item.href) {
              const localizedHref = `/${currentLocale}${item.href}`;
              return (
                <Link
                  key={item.href || index}
                  href={localizedHref}
                  onClick={handleLinkClick}
                  className="text-black text-sm hover:text-black/70 transition-colors"
                >
                  {item.label}
                </Link>
              );
            }

            return null;
          })}

          {/* Language Switcher */}
          <Separator className="my-2" />
          <LanguageSwitcher variant="inline" />

          {currentUser && (
            <>
              <Separator className="my-2" />
              <button
                onClick={handleSignOut}
                className="text-black text-sm text-start hover:text-black/70 transition-colors flex items-center gap-2"
              >
                <LogOut className="size-4" />
                Logout
              </button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileNav;
