"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { confirmAvailability, unpublishListing } from "@/lib/actions/listing-actions";
import { PropertyImageFallback } from "@/components/atom/property-image-fallback";

export type StaleListing = {
  id: number;
  title: string;
  photoUrl: string | null;
  city: string | null;
};

export const AVAILABILITY_SNOOZE_COOKIE = "availabilityCheckDismissed";

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1] ?? "") : undefined;
}
function writeCookie(name: string, value: string, maxAgeSec: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSec}; samesite=lax`;
}

const fill = (tpl: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), tpl);

// Airbnb "one price, all fees included" mobile dialog anatomy: on mobile a
// full-bleed bottom sheet — flush to bottom/left/right edges, rounded top
// corners only (rounded-t 32px). On desktop it detaches into a floating
// bottom-start card (16px radius, single-layer soft shadow). Radius + shadow
// live in responsive classes so the two breakpoints can differ.

/**
 * Availability Check — a calibrated, Airbnb-banner-styled nudge for passive
 * owners. Shows ONE home at a time (photo + title) with one-tap
 * "Still available" / "Mark busy"; answering advances to the next stale home.
 * Dismissing snoozes for a fraction of the reminder period (gentle, not gone),
 * and finishing the queue shows a brief "all set" state. Keeps seeded/listed
 * homes honest without owner effort — "not too much, not too little".
 */
export function AvailabilityCheck({
  staleListings,
  periodDays,
}: {
  staleListings: StaleListing[];
  periodDays: number;
}) {
  const dict = useDictionary();
  const t = (dict?.property?.availabilityCheck as Record<string, string> | undefined) ?? {};
  const total = staleListings.length;
  const [items, setItems] = useState<StaleListing[]>(staleListings);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<"confirm" | "busy" | null>(null);
  const [done, setDone] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Gentle entrance: wait a beat after load (Airbnb banners never pop instantly).
  useEffect(() => {
    if (staleListings.length === 0 || readCookie(AVAILABILITY_SNOOZE_COOKIE)) return;
    const id = setTimeout(() => setOpen(true), 900);
    return () => clearTimeout(id);
  }, [staleListings.length]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    []
  );

  // "Not now" — snooze for a quarter of the reminder period (min 1 day) so the
  // nudge returns sooner than the full cycle but never nags within a session.
  const snooze = () => {
    const days = Math.max(1, Math.round(periodDays / 4));
    writeCookie(AVAILABILITY_SNOOZE_COOKIE, "1", days * 24 * 60 * 60);
    setOpen(false);
  };

  const current = items[0];

  const handle = async (action: "confirm" | "busy") => {
    if (!current || pending) return;
    setPending(action);
    try {
      const res =
        action === "confirm"
          ? await confirmAvailability(current.id)
          : await unpublishListing(current.id);
      if (res && "success" in res && !res.success) return; // leave in place; owner can retry
      const next = items.slice(1);
      setItems(next);
      if (next.length === 0) {
        setDone(true);
        closeTimer.current = setTimeout(() => setOpen(false), 2200);
      }
    } catch {
      // Leave the item in place on failure; the owner can retry.
    } finally {
      setPending(null);
    }
  };

  const counter =
    total > 1 && current
      ? fill(t.counter ?? "{current} of {total}", {
          current: total - items.length + 1,
          total,
        })
      : null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
          role="dialog"
          aria-live="polite"
          aria-label={t.questionOne ?? "Is this home still available?"}
          className="fixed inset-x-0 bottom-0 z-[9980] bg-white p-5 rounded-t-[32px] rounded-b-none shadow-[0_-4px_24px_rgba(0,0,0,0.12)] md:inset-x-auto md:bottom-6 md:start-6 md:w-[384px] md:p-6 md:rounded-2xl md:shadow-[0_6px_20px_rgba(0,0,0,0.2)] print:hidden"
        >
          {/* Close / snooze — quiet X, Airbnb desktop-banner style */}
          {!done && (
            <button
              type="button"
              onClick={snooze}
              aria-label={t.later ?? "Not now"}
              className="absolute end-3 top-3 flex size-8 items-center justify-center rounded-full text-[#222222] transition-colors hover:bg-neutral-100"
            >
              <svg viewBox="0 0 32 32" aria-hidden="true" style={{ display: "block", height: 12, width: 12, stroke: "currentColor", strokeWidth: 3, fill: "none" }}>
                <path d="m6 6 20 20M26 6 6 26" />
              </svg>
            </button>
          )}

          <AnimatePresence mode="wait" initial={false}>
            {done ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="flex items-center gap-3 py-1"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#f7f7f7]">
                  <svg viewBox="0 0 32 32" aria-hidden="true" style={{ display: "block", height: 18, width: 18, stroke: "#008a05", strokeWidth: 3, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }}>
                    <path d="m5 17 7 7L27 9" />
                  </svg>
                </span>
                <div className="text-start">
                  <p className="text-[15px] font-semibold leading-tight text-[#222222]">
                    {t.allSet ?? "You're all set"}
                  </p>
                  <p className="mt-0.5 text-[13px] leading-snug text-[#6a6a6a]">
                    {t.allSetBody ?? "Thanks — guests will only see homes you can host."}
                  </p>
                </div>
              </motion.div>
            ) : current ? (
              <motion.div
                key={current.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                {/* Bold lead — the banner sentence */}
                <h2 className="pe-8 text-start text-base font-semibold leading-tight tracking-tight text-[#222222]">
                  {t.questionOne ?? "Is this home still available?"}
                </h2>

                {/* The home in question — one at a time */}
                <div className="mt-3 flex items-center gap-3">
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
                    {current.photoUrl ? (
                      <Image
                        src={current.photoUrl}
                        alt=""
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : (
                      <PropertyImageFallback seed={current.title} />
                    )}
                  </div>
                  <div className="min-w-0 text-start">
                    <p className="truncate text-sm font-medium text-[#222222]">{current.title}</p>
                    <p className="mt-0.5 truncate text-xs text-[#6a6a6a]">
                      {[current.city, counter].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>

                {/* One-tap answers */}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handle("busy")}
                    disabled={pending !== null}
                    className="h-11 rounded-lg border bg-white text-sm font-semibold text-[#222222] transition hover:bg-neutral-50 active:scale-[0.98] disabled:opacity-50"
                    style={{ borderColor: "#222222" }}
                  >
                    {pending === "busy" ? "…" : t.markBusy ?? "Mark busy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handle("confirm")}
                    disabled={pending !== null}
                    className="h-11 rounded-lg bg-[#222222] text-sm font-semibold text-white transition hover:bg-black active:scale-[0.98] disabled:opacity-50"
                  >
                    {pending === "confirm" ? "…" : t.stillAvailable ?? "Still available"}
                  </button>
                </div>

                <p className="mt-3 text-start text-xs leading-snug text-[#6a6a6a]">
                  {t.hiddenNote ??
                    "Homes marked busy are hidden from guests until you turn them back on."}
                </p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
