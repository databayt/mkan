"use client";

import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const COOKIE_KEY = "cookieConsent";

function readConsent(): "all" | "essential" | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${COOKIE_KEY}=`));
  if (!match) return null;
  const value = decodeURIComponent(match.split("=")[1] ?? "");
  if (value === "all" || value === "essential") return value;
  return null;
}

/**
 * Vercel Analytics + Speed Insights, rendered only when the user has
 * accepted "all" cookies. Listens to the `cookieconsent` event the
 * <CookieBanner/> dispatches so the analytics light up the moment the
 * user clicks Accept (no page reload required).
 */
export function ConsentAwareAnalytics() {
  const [allow, setAllow] = useState(false);

  useEffect(() => {
    setAllow(readConsent() === "all");
    const onConsent = (e: Event) => {
      const detail = (e as CustomEvent<{ choice?: string }>).detail;
      setAllow(detail?.choice === "all");
    };
    window.addEventListener("cookieconsent", onConsent);
    return () => window.removeEventListener("cookieconsent", onConsent);
  }, []);

  if (!allow) return null;
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
