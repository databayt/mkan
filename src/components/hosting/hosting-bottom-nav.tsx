"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import {
  TodayIcon,
  CalendarIcon,
  ListingsIcon,
  MessagesIcon,
  MenuIcon,
} from "./hosting-nav-icons";

// Mobile-only host tab bar (Today · Calendar · Listings · Messages · Menu),
// mirroring airbnb.com/hosting. It slides out of view when the page scrolls
// down and slides back when it scrolls up — the same footer behaviour as the
// Airbnb host app.
type Item = {
  key: "today" | "calendar" | "listings" | "messages" | "menu";
  href: string;
  Icon: (p: { className?: string }) => React.ReactElement;
  match: (path: string) => boolean;
};

const ITEMS: Item[] = [
  { key: "today", href: "/hosting", Icon: TodayIcon, match: (p) => /\/hosting(\/|$)/.test(p) && !/\/hosting\/(calendar|listings|messages|menu)/.test(p) },
  { key: "calendar", href: "/hosting/calendar", Icon: CalendarIcon, match: (p) => /\/hosting\/calendar|\/multicalendar/.test(p) },
  { key: "listings", href: "/hosting/listings", Icon: ListingsIcon, match: (p) => /\/hosting\/listings/.test(p) },
  { key: "messages", href: "/hosting/messages", Icon: MessagesIcon, match: (p) => /\/hosting\/messages/.test(p) },
  { key: "menu", href: "/hosting/menu", Icon: MenuIcon, match: (p) => /\/hosting\/menu/.test(p) },
];

const FALLBACK: Record<Item["key"], string> = {
  today: "Today",
  calendar: "Calendar",
  listings: "Listings",
  messages: "Messages",
  menu: "Menu",
};

export function HostingBottomNav() {
  const pathname = usePathname() ?? "";
  const params = useParams();
  const lang = (params?.lang as string) ?? "en";
  const dict = useDictionary();
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    let ticking = false;
    const update = () => {
      const y = window.scrollY;
      const delta = y - lastY.current;
      if (Math.abs(delta) > 6) {
        // scrolling down past a small offset hides the bar; scrolling up shows it
        if (delta > 0 && y > 48) setHidden(true);
        else if (delta < 0) setHidden(false);
        lastY.current = y;
      }
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navDict = (dict?.hosting as { nav?: Record<string, string> } | undefined)?.nav;
  const label = (k: Item["key"]) => navDict?.[k] ?? FALLBACK[k];

  return (
    <nav
      aria-label="Hosting"
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 border-t border-border bg-white transition-transform duration-300 ease-out lg:hidden",
        hidden ? "translate-y-full" : "translate-y-0"
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex items-stretch">
        {ITEMS.map(({ key, href, Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={key} className="flex-1">
              <Link
                href={`/${lang}${href}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 pt-2 pb-1.5 text-[10px] font-medium",
                  active ? "text-[#E31C5F]" : "text-[#222222]"
                )}
              >
                <Icon className="size-6" />
                <span>{label(key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
