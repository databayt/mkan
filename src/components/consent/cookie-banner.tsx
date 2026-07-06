"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

import { useDictionary } from "@/components/internationalization/dictionary-context";
import { useLocale } from "@/components/internationalization/use-locale";

const COOKIE_KEY = "cookieConsent";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type Choice = "all" | "essential";

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1] ?? "") : undefined;
}

function writeCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`;
}

/**
 * Airbnb-styled centered floating consent banner.
 */
export function CookieBanner() {
  const dict = useDictionary();
  const { locale } = useLocale();
  const t = (dict.cookieConsent as Record<string, string> | undefined) ?? {};
  // Open by default so the banner is part of the server HTML and paints with
  // the page's first paint — as a client-gated mount it only appeared after
  // full hydration (~10s on a slow phone) and, being the largest text block,
  // set the page's measured LCP to that moment. Visitors who already
  // consented never see it: the layout's inline pre-paint script stamps
  // `data-consent` on <html> and a CSS rule display:nones the banner before
  // anything renders; the effect below then unmounts it for real.
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const existing = readCookie(COOKIE_KEY);
    if (existing) setOpen(false);
  }, []);

  const decide = (choice: Choice) => {
    writeCookie(COOKIE_KEY, choice, COOKIE_MAX_AGE);
    setOpen(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("cookieconsent", { detail: { choice } }));
    }
  };

  const desc = t.description ?? "";
  const policyText = t.policyText ?? "cookie policy";
  const parts = desc.split("{policyLink}");

  return (
    // initial={false}: the banner is already in the server HTML — animating it
    // in at hydration would blink content that has been visible for seconds.
    // Exit (after a choice) still animates.
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          data-cookie-banner
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          role="dialog"
          aria-live="polite"
          aria-label={t.title ?? "Cookie consent"}
          className="fixed bottom-0 left-0 right-0 md:bottom-6 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-[680px] z-[9999] rounded-t-[32px] rounded-b-none md:rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white dark:bg-neutral-900 p-6 md:p-8 shadow-[0_8px_28px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_28px_rgba(0,0,0,0.4)] print:hidden"
        >
          <h2 className="text-neutral-900 dark:text-neutral-50 font-semibold text-lg md:text-[22px] leading-tight md:leading-[26px] tracking-tight text-start">
            {t.title ?? "Help us improve your experience"}
          </h2>
          
          <p className="text-neutral-600 dark:text-neutral-300 text-xs md:text-[14px] leading-relaxed md:leading-[20px] mt-3 font-normal text-start">
            {parts.length > 1 ? (
              <>
                {parts[0]}
                <Link
                  href={`/${locale}/cookies`}
                  className="underline font-semibold text-neutral-950 dark:text-white hover:text-black dark:hover:text-neutral-200 transition"
                >
                  {policyText}
                </Link>
                {parts[1]}
              </>
            ) : (
              desc || "We use cookies and other technologies to personalize content."
            )}
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6 md:mt-8 w-full">
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <button
                onClick={() => decide("all")}
                className="w-full sm:w-auto bg-[#222222] dark:bg-neutral-100 hover:bg-black dark:hover:bg-white text-white dark:text-neutral-900 font-semibold py-3 px-6 rounded-lg text-sm transition-all duration-200 cursor-pointer shadow-sm text-center active:scale-[0.98]"
              >
                {t.acceptAll ?? "Accept all"}
              </button>
              <button
                onClick={() => decide("essential")}
                className="w-full sm:w-auto bg-[#222222] dark:bg-neutral-100 hover:bg-black dark:hover:bg-white text-white dark:text-neutral-900 font-semibold py-3 px-6 rounded-lg text-sm transition-all duration-200 cursor-pointer shadow-sm text-center active:scale-[0.98]"
              >
                {t.rejectNonEssential ?? "Only necessary"}
              </button>
            </div>
            
            <Link
              href={`/${locale}/cookies`}
              className="underline font-semibold text-neutral-950 dark:text-white hover:text-black dark:hover:text-neutral-200 text-sm whitespace-nowrap text-center sm:text-start transition"
            >
              {t.learnMore ?? "Manage preferences"}
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
