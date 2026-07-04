"use client";
import { cdn } from "@/lib/cdn";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  Bell,
  Settings,
  Globe,
  BookOpen,
  HelpCircle,
  UserPlus,
  HousePlus,
  Users,
  LogOut,
  ChevronRight,
  ChevronLeft,
  ArrowLeftRight,
} from "lucide-react";
import type { Locale } from "@/components/internationalization/config";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface MenuDict {
  title?: string;
  newToHosting?: string;
  newToHostingSubtitle?: string;
  getStarted?: string;
  accountSettings?: string;
  languages?: string;
  hostingResources?: string;
  getHelp?: string;
  findCoHost?: string;
  createListing?: string;
  referHost?: string;
  logout?: string;
  switchToTraveling?: string;
  notifications?: string;
  profile?: string;
  terms?: string;
  privacy?: string;
  copyright?: string;
}

// Mobile hosting menu, mirroring airbnb.com/hosting/menu: bell + avatar
// circles top-end, 32px title, promo card, 56px icon rows in hairline-divided
// groups, footer links, and a floating "Switch to traveling" pill above the
// tab bar. Desktop (lg+) keeps the top header, so the page just centers.
export default function HostingMenuContent({
  lang,
  dict,
}: {
  lang: Locale;
  dict: MenuDict | null;
}) {
  const t = dict ?? {};
  const router = useRouter();
  const pathname = usePathname() ?? `/${lang}/hosting/menu`;
  const { data: session } = useSession();
  const isRTL = lang === "ar";
  const RowChevron = isRTL ? ChevronLeft : ChevronRight;

  const initial = (
    session?.user?.name?.[0] ??
    session?.user?.email?.[0] ??
    "M"
  ).toUpperCase();

  function switchLanguage() {
    const other = lang === "ar" ? "en" : "ar";
    const parts = pathname.split("/");
    parts[1] = other;
    router.push(parts.join("/") || `/${other}`);
  }

  const groups: {
    key: string;
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
    label: string;
    href?: string;
    onClick?: () => void;
  }[][] = [
    [
      { key: "settings", icon: Settings, label: t.accountSettings ?? "Account settings", href: `/${lang}/profile/about` },
      { key: "languages", icon: Globe, label: t.languages ?? "Languages & currency", onClick: switchLanguage },
      { key: "resources", icon: BookOpen, label: t.hostingResources ?? "Hosting resources", href: `/${lang}/help` },
      { key: "help", icon: HelpCircle, label: t.getHelp ?? "Get help", href: `/${lang}/help` },
    ],
    [
      { key: "cohost", icon: UserPlus, label: t.findCoHost ?? "Find a co-host", href: `/${lang}/co-hosts` },
      { key: "create", icon: HousePlus, label: t.createListing ?? "Create a new listing", href: `/${lang}/host` },
      { key: "refer", icon: Users, label: t.referHost ?? "Refer a host", href: `/${lang}/refer` },
    ],
    [
      {
        key: "logout",
        icon: LogOut,
        label: t.logout ?? "Log out",
        onClick: () => signOut({ callbackUrl: `/${lang}`, redirect: true }),
      },
    ],
  ];

  const year = new Date().getFullYear();

  return (
    <div className="mx-auto w-full max-w-2xl px-2 pb-10 lg:py-10">
      {/* top actions — mobile only (desktop has the global header) */}
      <div className="flex items-center justify-end gap-3 pt-4 lg:hidden">
        <Link
          href={`/${lang}/hosting/messages`}
          aria-label={t.notifications ?? "Notifications"}
          className="flex size-10 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/70"
        >
          <Bell className="size-4" strokeWidth={2} />
        </Link>
        <Link
          href={`/${lang}/profile/about`}
          aria-label={t.profile ?? "Profile"}
          className="rounded-full outline-none transition-opacity hover:opacity-90"
        >
          <Avatar className="size-10">
            <AvatarImage src={session?.user?.image || ""} alt="" />
            <AvatarFallback className="bg-gray-900 text-sm font-medium text-white">
              {initial}
            </AvatarFallback>
          </Avatar>
        </Link>
      </div>

      {/* title — 32/600/36, tight tracking (inline: new arbitrary tracking
          utilities don't generate under Turbopack dev) */}
      <h1
        className="mt-4 text-[32px] font-semibold leading-9 text-foreground lg:mt-0"
        style={{ letterSpacing: "-0.96px" }}
      >
        {t.title ?? "Menu"}
      </h1>

      {/* promo card */}
      <div
        className="mt-12 flex flex-col items-center bg-muted px-6 py-8 text-center"
        style={{ borderRadius: 20 }}
      >
        <Image
          src={cdn.product("hosting/today.png")}
          alt=""
          width={132}
          height={132}
          className="object-contain"
        />
        <h2 className="mt-4 text-lg font-medium leading-6 text-foreground">
          {t.newToHosting ?? "New to hosting?"}
        </h2>
        <p className="mt-1 max-w-[260px] text-sm leading-5 text-muted-foreground">
          {t.newToHostingSubtitle ?? "Tips and resources to help you get set up and booked."}
        </p>
        <Link
          href={`/${lang}/help`}
          className="mt-6 rounded-lg bg-background px-5 py-[11px] text-sm font-medium leading-[18px] text-foreground transition-colors hover:bg-background/80"
        >
          {t.getStarted ?? "Get started"}
        </Link>
      </div>

      {/* row groups */}
      <nav className="mt-6">
        {groups.map((group, gi) => (
          <ul
            key={gi}
            className={gi > 0 ? "border-t border-border" : undefined}
          >
            {group.map(({ key, icon: Icon, label, href, onClick }) => {
              const inner = (
                <>
                  <Icon className="size-6 flex-shrink-0 text-foreground" strokeWidth={1.5} />
                  <span className="flex-1 text-start text-base font-normal text-foreground">
                    {label}
                  </span>
                  <RowChevron className="size-4 flex-shrink-0 text-muted-foreground" />
                </>
              );
              return (
                <li key={key}>
                  {href ? (
                    <Link href={href} className="flex h-14 w-full items-center gap-4">
                      {inner}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={onClick}
                      className="flex h-14 w-full items-center gap-4"
                    >
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ))}
      </nav>

      {/* footer */}
      <div className="mt-8 pb-16 text-center lg:pb-0">
        <p className="text-xs text-foreground">
          <Link href={`/${lang}/terms`} className="underline">
            {t.terms ?? "Terms of Service"}
          </Link>
          <span className="mx-1.5">·</span>
          <Link href={`/${lang}/privacy`} className="underline">
            {t.privacy ?? "Privacy Policy"}
          </Link>
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {(t.copyright ?? "© {year} Mkan. All rights reserved.").replace("{year}", String(year))}
        </p>
      </div>

      {/* floating "Switch to traveling" pill — sits above the tab bar */}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center lg:hidden">
        <Link
          href={`/${lang}/listings`}
          className="pointer-events-auto flex h-12 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background shadow-lg transition-transform active:scale-95"
        >
          <ArrowLeftRight className="size-4" />
          {t.switchToTraveling ?? "Switch to traveling"}
        </Link>
      </div>
    </div>
  );
}
