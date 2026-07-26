"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu } from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { cdn } from "@/lib/cdn";
import {
  WishlistGlyph,
  TripsGlyph,
  ProfileGlyph,
  AccountGlyph,
  LogoutGlyph,
  GlobeGlyph,
  ReferGlyph,
  CoHostGlyph,
  GiftCardGlyph,
  HelpGlyph,
} from "./menu-glyphs";

// ───────────────────────────────────────────────────────────────────────────
// Homepage hamburger → full-screen menu sheet (mobile only).
//
// Interaction follows the reference codebase's mobile nav: the trigger opens a
// full-width panel washed with bg-background/90 + backdrop-blur that drops in
// from the top. Content follows Airbnb's mobile account menu: 24px DLS glyphs
// beside 16px rows, a "Become a host" card with the waving-host art, the
// discovery rows (refer / co-host / gift cards), a language row, Help Center,
// and the auth action — personal links (Wishlists, Trips, Profile, Account)
// pinned on top when signed in.
// ───────────────────────────────────────────────────────────────────────────

const translations = {
  en: {
    menu: "Menu",
    close: "Close",
    becomeHost: "Become a host",
    switchToHosting: "Switch to hosting",
    becomeHostDesc: "It's easy to start hosting and earn extra income.",
    referHost: "Refer a Host",
    findCoHost: "Find a co-host",
    giftCards: "Gift cards",
    helpCenter: "Help Center",
    loginOrSignup: "Log in or sign up",
    logout: "Log out",
    wishlists: "Wishlists",
    trips: "Trips",
    profile: "Profile",
    account: "Account",
    language: "Language",
  },
  ar: {
    menu: "القائمة",
    close: "إغلاق",
    becomeHost: "كن مضيفاً",
    switchToHosting: "التبديل إلى الاستضافة",
    becomeHostDesc: "من السهل البدء في الاستضافة وكسب دخل إضافي.",
    referHost: "إحالة مضيف",
    findCoHost: "البحث عن مضيف مشارك",
    giftCards: "بطاقات الهدايا",
    helpCenter: "مركز المساعدة",
    loginOrSignup: "تسجيل الدخول أو إنشاء حساب",
    logout: "تسجيل الخروج",
    wishlists: "قوائم الرغبات",
    trips: "الرحلات",
    profile: "الملف الشخصي",
    account: "الحساب",
    language: "اللغة",
  },
} as const;

// Airbnb mobile menu row: 24px glyph, 16px regular #222 text, ~56px touch row.
const ROW =
  "flex w-full items-center gap-4 py-3.5 text-base font-normal text-[#222222] transition-opacity active:opacity-60";

const Divider = () => (
  <div className="my-3 h-px w-full" style={{ backgroundColor: "#ebebeb" }} />
);

interface MobileNavProps {
  isLandingPage?: boolean;
}

const MobileNav = ({ isLandingPage = false }: MobileNavProps) => {
  const [open, setOpen] = React.useState(false);
  // Two-phase close so the sheet can fade/slide out via CSS before unmount —
  // replaces the framer-motion AnimatePresence exit (the animation engine was
  // the heaviest chunk shipping with the home header for a one-shot fade).
  const [closing, setClosing] = React.useState(false);
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const locale = pathname?.startsWith("/ar") ? "ar" : "en";
  const t = translations[locale];
  const isAuthed = status === "authenticated" && !!session?.user;

  const close = React.useCallback(() => {
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 200);
  }, []);

  // Lock body scroll + Escape-to-close while the sheet is open.
  React.useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleSignOut = async () => {
    close();
    await signOut({ callbackUrl: "/", redirect: true });
  };

  const row = (href: string, glyph: React.ReactNode, label: string) => (
    <Link href={`/${locale}${href}`} onClick={close} className={ROW}>
      {glyph}
      <span>{label}</span>
    </Link>
  );

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className={`md:hidden w-9 h-9 flex items-center justify-center transition-colors hover:bg-transparent ${
          isLandingPage ? "text-white hover:text-white/80" : "text-black hover:text-black/80"
        }`}
      >
        <Menu className="size-5" />
        <span className="sr-only">{t.menu}</span>
      </Button>

      {open && (
          <div
            key="menu-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t.menu}
            className={`fixed inset-0 z-[100] flex flex-col bg-background/90 backdrop-blur md:hidden transition-all duration-200 ease-out animate-in fade-in slide-in-from-top-4 ${closing ? "opacity-0 -translate-y-3" : ""}`}
          >
            {/* Sheet header — title start, quiet X end */}
            <div className="flex h-[52px] shrink-0 items-center justify-between px-6">
              <span className="text-lg font-semibold text-[#222222]">{t.menu}</span>
              <button
                type="button"
                onClick={close}
                aria-label={t.close}
                className="-me-2 flex size-10 items-center justify-center rounded-full text-[#222222] transition-colors hover:bg-neutral-100"
              >
                <svg
                  viewBox="0 0 32 32"
                  aria-hidden="true"
                  style={{ display: "block", height: 14, width: 14, stroke: "currentColor", strokeWidth: 3, fill: "none" }}
                >
                  <path d="m6 6 20 20M26 6 6 26" />
                </svg>
              </button>
            </div>

            {/* Rows */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-2">
              {isAuthed ? (
                <>
                  {row("/tenants/favorites", <WishlistGlyph size={24} />, t.wishlists)}
                  {row("/tenants/trips", <TripsGlyph size={24} />, t.trips)}
                  {row("/profile/about", <ProfileGlyph size={24} />, t.profile)}
                  {row("/tenants/settings", <AccountGlyph size={24} />, t.account)}
                </>
              ) : (
                row("/help", <HelpGlyph size={22} />, t.helpCenter)
              )}

              <Divider />

              {/* Become a host / Switch to hosting — Airbnb's promo card with
                  the waving-host art. */}
              <Link
                href={`/${locale}${isAuthed ? "/hosting" : "/host"}`}
                onClick={close}
                className="flex items-center gap-3 rounded-2xl border bg-white p-4 transition-opacity active:opacity-70"
                style={{ borderColor: "#ebebeb", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
              >
                <div className="flex-1">
                  <div className="text-base text-[#222222]" style={{ fontWeight: 500, lineHeight: "20px" }}>
                    {isAuthed ? t.switchToHosting : t.becomeHost}
                  </div>
                  <div className="mt-0.5 text-[13px] text-[#6a6a6a]" style={{ lineHeight: "17px" }}>
                    {t.becomeHostDesc}
                  </div>
                </div>
                <div className="relative h-14 w-14 flex-shrink-0">
                  <Image
                    src={cdn.product("images/host_waving.png")}
                    alt=""
                    fill
                    sizes="56px"
                    className="object-contain"
                  />
                </div>
              </Link>

              <div className="mt-1">
                {row("/refer", <ReferGlyph size={24} />, t.referHost)}
                {row("/co-hosts", <CoHostGlyph size={24} />, t.findCoHost)}
                {row("/giftcards", <GiftCardGlyph size={24} />, t.giftCards)}
              </div>

              <Divider />

              {/* Language — globe row with the one-tap locale toggle */}
              <div className={ROW}>
                <GlobeGlyph size={24} />
                <span className="flex-1">{t.language}</span>
                <LanguageSwitcher
                  variant="text"
                  className="text-sm font-medium text-[#222222] underline"
                />
              </div>

              {isAuthed && row("/help", <HelpGlyph size={22} />, t.helpCenter)}

              <Divider />

              {isAuthed ? (
                <button type="button" onClick={handleSignOut} className={`${ROW} text-start`}>
                  <LogoutGlyph size={24} />
                  <span>{t.logout}</span>
                </button>
              ) : (
                <Link
                  href={`/${locale}/login`}
                  onClick={close}
                  className="mt-2 flex h-12 w-full items-center justify-center rounded-lg bg-[#222222] text-base font-semibold text-white transition hover:bg-black active:scale-[0.99]"
                >
                  {t.loginOrSignup}
                </Link>
              )}
            </div>
          </div>
      )}
    </>
  );
};

export default MobileNav;
