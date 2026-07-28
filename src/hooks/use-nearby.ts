"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { type Coords, isValidCoords } from "@/lib/distance";

/**
 * Why a shared hook: getting a browser position fix reliably on the phones our
 * users actually carry takes more care than one `getCurrentPosition` call, and
 * that care was previously inlined in a single dropdown — so every other search
 * surface either skipped "Nearby" entirely or would have had to re-derive the
 * same defensive dance. All the hard-won handling lives here once.
 */

export type NearbyErrorCode =
  /** No geolocation API, or the page is not a secure context (plain-http webview). */
  | "unsupported"
  /** The user (or the OS) refused. Re-asking will not help. */
  | "denied"
  /** The device has the API but could not produce a fix. */
  | "unavailable"
  /** Neither callback fired in time. */
  | "timeout";

export interface UseNearbyResult {
  /** Last successful fix, retained until `reset()`. */
  coords: Coords | null;
  /** A position request is in flight. */
  isLocating: boolean;
  /** Why the last attempt failed; cleared when a new attempt starts. */
  errorCode: NearbyErrorCode | null;
  /** Request a fix. Resolves to the coords, or null when it failed. */
  locate: () => Promise<Coords | null>;
  /** Drop the stored fix and any error. */
  reset: () => void;
}

/**
 * Some Android WebViews (MIUI's browser among them) drop BOTH the success and
 * error callbacks when the system location service is off, leaving the UI stuck
 * on a spinner forever. This is the backstop that guarantees we always settle.
 */
const SAFETY_TIMEOUT_MS = 12_000;

const POSITION_OPTIONS: PositionOptions = {
  // Android's network-location path can genuinely take this long.
  timeout: 10_000,
  // Reuse a recent OS fix — makes the common case feel instant.
  maximumAge: 600_000,
  // City-level accuracy is all a search needs, and the coarse path avoids
  // spinning up GPS (slower, and a visible battery/permission cost).
  enableHighAccuracy: false,
};

export function useNearby(): UseNearbyResult {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [errorCode, setErrorCode] = useState<NearbyErrorCode | null>(null);

  // Position callbacks can outlive the dropdown that started them (the panel
  // closes, the sheet unmounts) — dropping late updates avoids setState on an
  // unmounted tree.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reset = useCallback(() => {
    setCoords(null);
    setErrorCode(null);
    setIsLocating(false);
  }, []);

  const locate = useCallback(async (): Promise<Coords | null> => {
    if (typeof window === "undefined") return null;

    // `isSecureContext` matters as much as API presence: geolocation is
    // gated to https/localhost, so a plain-http webview exposes the object
    // but can never resolve it.
    if (!("geolocation" in navigator) || !window.isSecureContext) {
      if (mountedRef.current) setErrorCode("unsupported");
      return null;
    }

    // Chrome on Android never re-prompts once denied — the request just fails
    // silently. Detecting that up front lets the UI say something true instead
    // of showing a spinner that goes nowhere.
    try {
      const status = await navigator.permissions?.query?.({ name: "geolocation" });
      if (status?.state === "denied") {
        if (mountedRef.current) setErrorCode("denied");
        return null;
      }
    } catch {
      // Permissions API missing (older WebViews) — fall through and just ask.
    }

    if (mountedRef.current) {
      setIsLocating(true);
      setErrorCode(null);
    }

    return new Promise<Coords | null>((resolve) => {
      let settled = false;

      const finish = (result: Coords | null, code: NearbyErrorCode | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(safetyTimer);

        if (mountedRef.current) {
          setIsLocating(false);
          if (result) setCoords(result);
          setErrorCode(code);
        }
        resolve(result);
      };

      const safetyTimer = setTimeout(() => finish(null, "timeout"), SAFETY_TIMEOUT_MS);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const next = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          // A device can report NaN coords; treat that as no fix rather than
          // letting it poison a search query.
          finish(isValidCoords(next) ? next : null, isValidCoords(next) ? null : "unavailable");
        },
        (err) => {
          finish(null, err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
        },
        POSITION_OPTIONS
      );
    });
  }, []);

  return { coords, isLocating, errorCode, locate, reset };
}

/** Dictionary shape the messages below read from, kept structurally loose. */
interface NearbyDict {
  locating?: string;
  denied?: string;
  unsupported?: string;
  failed?: string;
}

/**
 * Human-readable text for a failure code.
 *
 * Deliberately distinguishes "your browser blocked this" from "we couldn't get
 * a fix": telling someone to check their browser settings when the device
 * simply has no signal sends them somewhere that cannot help.
 */
export function nearbyErrorMessage(
  code: NearbyErrorCode,
  dict: NearbyDict | undefined,
  locale: string
): string {
  const ar = locale === "ar";

  switch (code) {
    case "denied":
      return (
        dict?.denied ??
        (ar
          ? "الوصول إلى الموقع مرفوض — فعّله من إعدادات المتصفح أو اختر مدينة."
          : "Location access is blocked — enable it in your browser settings, or pick a city.")
      );
    case "unsupported":
      return (
        dict?.unsupported ??
        (ar
          ? "المتصفح لا يدعم تحديد الموقع — اختر مدينة من القائمة."
          : "This browser can't share your location — pick a city from the list.")
      );
    case "unavailable":
    case "timeout":
    default:
      return (
        dict?.failed ??
        (ar
          ? "تعذر تحديد موقعك — اختر مدينة من القائمة."
          : "Couldn't get your location — pick a city from the list.")
      );
  }
}
