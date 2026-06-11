"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
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
 * Bottom-anchored consent banner. Renders only when no choice has been
 * recorded yet. Notifies the rest of the page via a `cookieconsent`
 * window event so analytics islands can subscribe and only fire when
 * the user has accepted.
 */
export function CookieBanner() {
  const dict = useDictionary();
  const { locale } = useLocale();
  const t = (dict.cookieConsent as Record<string, string> | undefined) ?? {};
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const existing = readCookie(COOKIE_KEY);
    if (!existing) setOpen(true);
  }, []);

  const decide = (choice: Choice) => {
    writeCookie(COOKIE_KEY, choice, COOKIE_MAX_AGE);
    setOpen(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("cookieconsent", { detail: { choice } }));
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t.title ?? "Cookie consent"}
      className="fixed inset-x-2 bottom-2 sm:inset-x-auto sm:bottom-4 sm:end-4 sm:max-w-md z-50 rounded-xl border bg-background/95 backdrop-blur shadow-lg p-4 print:hidden"
    >
      <h2 className="text-sm font-semibold mb-1">{t.title ?? "We use cookies"}</h2>
      <p className="text-xs text-muted-foreground mb-3">
        {t.description ??
          "We use cookies for sign-in, security, and to understand how the site is used."}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => decide("all")}>
          {t.acceptAll ?? "Accept all"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => decide("essential")}>
          {t.rejectNonEssential ?? "Reject non-essential"}
        </Button>
        <Link
          href={`/${locale}/cookies`}
          className="text-xs underline text-muted-foreground ms-auto"
        >
          {t.learnMore ?? "Learn more"}
        </Link>
      </div>
    </div>
  );
}
