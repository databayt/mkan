"use client";

import React from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { signOut } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { MenuIcon } from "./hosting-nav-icons";
import { HelpGlyph, LogoutGlyph } from "@/components/template/header/menu-glyphs";

// ───────────────────────────────────────────────────────────────────────────
// Mobile "Menu" tab for the hosting bottom nav.
//
// On airbnb.com/hosting the mobile view has NO top header — the account actions
// that live in the desktop header's hamburger (create a listing, refer, gift
// cards, help, switch to traveling, log out) move under the bottom-nav "Menu"
// tab, which opens a full-screen sheet. This mirrors that: the tab is styled
// identically to the other bottom-nav tabs; tapping it opens the sheet with the
// same rows as the desktop HostingHeader dropdown.
//
// The sheet is portaled to <body> so it escapes the bottom nav's translate-y
// transform (a transformed ancestor would otherwise become the containing block
// for the fixed-position sheet and clip it to the ~58px bar).
// ───────────────────────────────────────────────────────────────────────────

const ROW =
  "flex w-full items-center gap-4 py-3.5 text-base font-normal text-[#222222] transition-opacity active:opacity-60";

const Divider = () => (
  <div className="my-3 h-px w-full" style={{ backgroundColor: "#ebebeb" }} />
);

export function HostingMenuSheet({
  active,
  label,
  lang,
}: {
  active: boolean;
  label: string;
  lang: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const dict = useDictionary();
  const header = dict.hosting?.header;
  const menu = header?.menu;

  React.useEffect(() => setMounted(true), []);

  const close = React.useCallback(() => setOpen(false), []);

  // Lock body scroll + Escape-to-close while the sheet is open.
  React.useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
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

  const textRow = (href: string, text: string) => (
    <Link href={`/${lang}${href}`} onClick={close} className={ROW}>
      <span>{text}</span>
    </Link>
  );

  const highlighted = active || open;

  const sheet = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="hosting-menu-sheet"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
          role="dialog"
          aria-modal="true"
          aria-label={menu?.ariaLabel ?? "Hosting menu"}
          className="fixed inset-0 z-[100] flex flex-col bg-background/95 backdrop-blur lg:hidden"
        >
          {/* Sheet header — title start, quiet X end */}
          <div className="flex h-[52px] shrink-0 items-center justify-between px-6">
            <span className="text-lg font-semibold text-[#222222]">{label}</span>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
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

          {/* Rows — mirror the desktop HostingHeader dropdown, plus the
              profile/account link the desktop avatar carried (both vanish with
              the mobile header, so they live here instead). */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-2">
            {textRow("/profile/about", menu?.account ?? "Account")}

            <Divider />

            {textRow("/host", menu?.createListing ?? "Create a new listing")}
            {textRow("/refer", menu?.referHost ?? "Refer a Host")}
            {textRow("/co-hosts", menu?.findCoHost ?? "Find a co-host")}
            {textRow("/giftcards", menu?.giftCards ?? "Gift cards")}

            <Divider />

            <Link href={`/${lang}/help`} onClick={close} className={ROW}>
              <HelpGlyph size={22} />
              <span>{menu?.helpCenter ?? "Visit the Help Center"}</span>
            </Link>

            <Divider />

            {textRow("/listings", header?.switchToTraveling ?? "Switch to traveling")}

            <button type="button" onClick={handleSignOut} className={`${ROW} text-start`}>
              <LogoutGlyph size={24} />
              <span>{menu?.logout ?? "Log out"}</span>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <li className="flex-1">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex w-full flex-col items-center gap-1 pt-2 pb-1.5 text-[10px]",
          highlighted ? "text-[#DA1249] font-medium" : "text-[#6A6A6A] font-normal"
        )}
      >
        <MenuIcon className="size-6" />
        <span>{label}</span>
      </button>

      {mounted && createPortal(sheet, document.body)}
    </li>
  );
}
