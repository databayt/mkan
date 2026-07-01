"use client";

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Menu, HelpCircle, LogOut } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import { useLocale } from '@/components/internationalization/use-locale';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

// Airbnb account-menu spec, measured from the live site (mirrors the verified
// constants in listings-header.tsx): full-width hover rows, 24px text inset
// (px-6), 14px / weight-400 / #222 text, #f7f7f7 hover. Card width / radius /
// shadow and the #dddddd separators are set INLINE because these brand-new
// arbitrary utilities (w-[265px], rounded-xl override, #dddddd) silently fail
// to generate under Turbopack.
const MENU_ROW =
  'flex items-center gap-3 px-6 py-2 text-sm font-normal text-[#222222] hover:bg-[#f7f7f7] focus:bg-[#f7f7f7] transition-colors cursor-pointer outline-none';
const MENU_SEP_STYLE = { backgroundColor: '#dddddd', margin: 0 } as const;
const MENU_CARD_STYLE = {
  width: '265px',
  borderRadius: '12px',
  boxShadow: '0 2px 16px rgba(0,0,0,0.12)',
} as const;

const HostingHeader = () => {
  const pathname = usePathname();
  const dict = useDictionary();
  const { locale } = useLocale();
  const { data: session, status } = useSession();

  const header = dict.hosting?.header;
  const menu = header?.menu;

  const navigationItems = [
    { name: header?.today ?? 'Today', href: `/${locale}/hosting`, match: (p: string) => p === `/${locale}/hosting` },
    // Calendar links to a resolver that redirects to the host's first listing
    // (/multicalendar/[id]); both the resolver and the grid keep the tab active.
    { name: header?.calendar ?? 'Calendar', href: `/${locale}/hosting/calendar`, match: (p: string) => p.startsWith(`/${locale}/multicalendar`) || p === `/${locale}/hosting/calendar` },
    { name: header?.listings ?? 'Listings', href: `/${locale}/hosting/listings`, match: (p: string) => p.startsWith(`/${locale}/hosting/listings`) },
    { name: header?.messages ?? 'Messages', href: `/${locale}/hosting/messages`, hasNotification: true, match: (p: string) => p.startsWith(`/${locale}/hosting/messages`) },
  ];

  const isActiveRoute = (item: { href: string; match?: (p: string) => boolean }) =>
    item.match ? item.match(pathname) : pathname === item.href;

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/', redirect: true });
  };

  // Avatar shows the signed-in host's initial (falls back to "A").
  const initial = (
    session?.user?.name?.[0] ??
    session?.user?.email?.[0] ??
    'A'
  ).toUpperCase();

  return (
    <header className="bg-muted px-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative flex items-center justify-between h-16">
          {/* Left side - Logo */}
          <div className="flex items-center">
            <Link href={`/${locale}/hosting`} className="cursor-pointer hover:text-gray-700" scroll={false}>
              <div className="flex items-center gap-2">
                <Image
                  src="/tent.png"
                  alt={header?.logo ?? 'Mkan Logo'}
                  width={20}
                  height={20}
                  className="w-4 h-4 sm:w-5 sm:h-5"
                />
                <div className="text-lg sm:text-xl font-bold text-gray-900">
                  {locale === 'ar' ? (
                    header?.brandName ?? 'مكان'
                  ) : (
                    <>Mk<span className="font-light hover:text-gray-700 text-gray-600">an</span></>
                  )}
                </div>
              </div>
            </Link>
          </div>

          {/* Center - Navigation (desktop only) */}
          <nav className="hidden lg:flex absolute left-1/2 transform -translate-x-1/2 space-x-8 rtl:space-x-reverse">
            {navigationItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`relative text-sm font-medium transition-colors ${
                  isActiveRoute(item)
                    ? 'text-gray-900 border-b-2 border-gray-900 pb-0.5'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {item.name}
                {item.hasNotification && (
                  <span className="absolute -top-1 -end-1 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </Link>
            ))}
          </nav>

          {/* Right side - User Controls */}
          <div className="flex items-center gap-2 sm:gap-3 rtl:space-x-reverse">
            {/* Switch to traveling — desktop pill (Airbnb shows this beside the menu) */}
            <Link
              href={`/${locale}/listings`}
              className="hidden lg:inline-block text-sm font-medium text-gray-700 hover:bg-gray-100/70 px-3 py-2 rounded-full transition-colors whitespace-nowrap"
            >
              {header?.switchToTraveling ?? 'Switch to traveling'}
            </Link>

            {/* Identity avatar */}
            <Link
              href={`/${locale}/profile/about`}
              className="rounded-full outline-none transition-opacity hover:opacity-90"
            >
              <Avatar className="w-8 h-8">
                <AvatarImage src={session?.user?.image || ""} alt="Avatar" />
                <AvatarFallback className="bg-gray-900 text-white text-sm font-medium">
                  {initial}
                </AvatarFallback>
              </Avatar>
            </Link>

            {/* Hamburger → Airbnb-style account dropdown. Trigger mirrors the
                guest header (listings-header.tsx): 40px gray-100 circle, 16px
                Menu icon. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={menu?.ariaLabel ?? 'Hosting menu'}
                  className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors cursor-pointer outline-none"
                >
                  <Menu size={16} className="text-[#222222]" />
                </button>
              </DropdownMenuTrigger>

              {/* Card mirrors the live popover: 265px wide, 12px radius, 12px
                  vertical padding, no border, soft single-layer shadow. */}
              <DropdownMenuContent
                align="end"
                sideOffset={8}
                className="bg-white p-0 py-3 border-0 overflow-hidden z-[100]"
                style={MENU_CARD_STYLE}
              >
                {/* Navigation — only shown when the center nav is hidden (mobile/
                    tablet). On desktop these live in the top bar, so the menu
                    stays account-focused like Airbnb's host menu. */}
                <div className="lg:hidden">
                  {navigationItems.map((item) => (
                    <DropdownMenuItem asChild key={item.href}>
                      <Link href={item.href} className={MENU_ROW}>
                        <span>{item.name}</span>
                        {item.hasNotification && (
                          <span className="ms-auto w-2 h-2 bg-red-500 rounded-full" />
                        )}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator className="h-px" style={MENU_SEP_STYLE} />
                </div>

                {/* Create a new listing */}
                <DropdownMenuItem asChild>
                  <Link href={`/${locale}/host`} className={MENU_ROW}>
                    <span>{menu?.createListing ?? 'Create a new listing'}</span>
                  </Link>
                </DropdownMenuItem>

                {/* Refer a Host */}
                <DropdownMenuItem asChild>
                  <Link href={`/${locale}/refer`} className={MENU_ROW}>
                    <span>{menu?.referHost ?? 'Refer a Host'}</span>
                  </Link>
                </DropdownMenuItem>

                {/* Find a co-host */}
                <DropdownMenuItem asChild>
                  <Link href={`/${locale}/co-hosts`} className={MENU_ROW}>
                    <span>{menu?.findCoHost ?? 'Find a co-host'}</span>
                  </Link>
                </DropdownMenuItem>

                {/* Gift cards */}
                <DropdownMenuItem asChild>
                  <Link href={`/${locale}/giftcards`} className={MENU_ROW}>
                    <span>{menu?.giftCards ?? 'Gift cards'}</span>
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="h-px" style={MENU_SEP_STYLE} />

                {/* Help Center — ? icon leading, then label (icon-left), exactly
                    as on the live menu. */}
                <DropdownMenuItem asChild>
                  <Link href={`/${locale}/help`} className={MENU_ROW}>
                    <HelpCircle size={16} className="text-[#222222] flex-shrink-0" />
                    <span>{menu?.helpCenter ?? 'Visit the Help Center'}</span>
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="h-px" style={MENU_SEP_STYLE} />

                {/* Switch to traveling — always available in the menu (the
                    desktop pill is hidden on mobile). */}
                <DropdownMenuItem asChild>
                  <Link href={`/${locale}/listings`} className={MENU_ROW}>
                    <span>{header?.switchToTraveling ?? 'Switch to traveling'}</span>
                  </Link>
                </DropdownMenuItem>

                {/* Log out — only when signed in. */}
                {status !== 'loading' && session?.user && (
                  <DropdownMenuItem onClick={handleSignOut} className={MENU_ROW}>
                    <LogOut size={16} className="text-[#222222] flex-shrink-0" />
                    <span>{menu?.logout ?? 'Log out'}</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
};

export default HostingHeader;
