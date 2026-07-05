"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { confirmAvailability, unpublishListing } from "@/lib/actions/listing-actions";
import { PropertyImageFallback } from "@/components/atom/property-image-fallback";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

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

/**
 * Availability Check — a passive-owner nudge that keeps listed homes honest.
 * Shows ONE stale home at a time (photo + title + "N of M" counter) with a
 * one-tap Busy / Available choice; answering advances to the next home, and the
 * queue ends on a brief "all set" state that auto-closes. Closing early snoozes
 * for a fraction of the reminder period (gentle, not gone).
 *
 * Presentation deliberately mirrors the price-transparency dialog: a white
 * modal card (shadcn Dialog + scrim) — centered 393px on desktop, a full-bleed
 * rounded-top bottom sheet on mobile — so the two read as siblings. Keep the
 * DialogContent shell below in sync with `site/price-transparency-dialog.tsx`.
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

  // Gentle entrance: wait a beat after load (the prompt loader has already
  // gated us on cookie consent, session, and the snooze cookie).
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

  // Closing without finishing snoozes for a quarter of the reminder period
  // (min 1 day) so the nudge returns sooner than the full cycle, never nagging.
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
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Escape / scrim close snoozes — unless the queue already finished.
        if (o) return;
        if (done) setOpen(false);
        else snooze();
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        // Identical shell to price-transparency-dialog: mobile full-bleed bottom
        // sheet (rounded-top 32px, flush to bottom/start/end), desktop centered
        // 393px rounded-32 white card.
        className="grid gap-0 border-0 bg-white p-0 shadow-[0_8px_28px_rgba(0,0,0,0.28)] top-auto bottom-0 start-0 end-0 w-full max-w-none translate-x-0 rtl:translate-x-0 translate-y-0 rounded-t-[32px] rounded-b-none sm:top-[50%] sm:bottom-auto sm:start-[50%] sm:end-auto sm:w-[calc(100%-2rem)] sm:max-w-[393px] sm:translate-x-[-50%] sm:rtl:-translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-[32px] sm:rounded-b-[32px]"
      >
        {/* Persistent accessible name — the visible headings swap with the queue. */}
        <DialogTitle className="sr-only">
          {t.title ?? "Are these homes still available?"}
        </DialogTitle>

        {/* Close / snooze — quiet X, hidden while the "all set" state auto-closes. */}
        {!done && (
          <button
            type="button"
            onClick={snooze}
            aria-label={t.later ?? "Not now"}
            className="absolute end-4 top-4 z-10 grid size-8 place-items-center rounded-full text-[#222222] transition-colors hover:bg-black/5"
          >
            <svg
              viewBox="0 0 32 32"
              className="size-4"
              style={{ fill: "none", stroke: "currentColor", strokeWidth: 4 }}
              aria-hidden="true"
            >
              <path d="m6 6 20 20M26 6 6 26" />
            </svg>
          </button>
        )}

        <div className="flex w-full flex-col items-center px-6 pb-7 pt-12">
          <AnimatePresence mode="wait" initial={false}>
            {done ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="flex flex-col items-center py-2 text-center"
              >
                <span className="flex size-14 items-center justify-center rounded-full bg-[#f7f7f7]">
                  <svg
                    viewBox="0 0 32 32"
                    aria-hidden="true"
                    style={{ display: "block", height: 22, width: 22, stroke: "#008a05", strokeWidth: 3, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }}
                  >
                    <path d="m5 17 7 7L27 9" />
                  </svg>
                </span>
                <p className="mt-4 text-[18px] font-semibold leading-tight text-[#222222]">
                  {t.allSet ?? "You're all set"}
                </p>
                <p className="mt-1.5 text-[14px] leading-snug text-[#6a6a6a]">
                  {t.allSetBody ?? "Thanks — guests will only see homes you can host."}
                </p>
              </motion.div>
            ) : current ? (
              <motion.div
                key={current.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="flex w-full flex-col items-center"
              >
                {/* Question — same scale as the price dialog's title */}
                <p className="px-2 text-center text-[22px] font-semibold leading-[26px] text-[#222222]">
                  {t.questionOne ?? "Is this home still available?"}
                </p>

                {/* The home in question — one at a time */}
                <div className="mt-6 flex w-full items-center justify-center gap-3">
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                    {current.photoUrl ? (
                      <Image
                        src={current.photoUrl}
                        alt=""
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    ) : (
                      <PropertyImageFallback seed={current.title} />
                    )}
                  </div>
                  <div className="min-w-0 text-start">
                    <p className="truncate text-[15px] font-medium text-[#222222]">
                      {current.title}
                    </p>
                    {(current.city || counter) && (
                      <p className="mt-0.5 truncate text-[13px] text-[#6a6a6a]">
                        {[current.city, counter].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </div>

                {/* One-tap answers — Busy (secondary) / Available (primary #222) */}
                <div className="mt-7 grid w-full grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handle("busy")}
                    disabled={pending !== null}
                    className="h-12 rounded-lg border border-[#222222] bg-white text-[15px] font-semibold text-[#222222] transition hover:bg-neutral-50 active:scale-[0.98] disabled:opacity-50"
                  >
                    {pending === "busy" ? "…" : t.busy ?? "Busy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handle("confirm")}
                    disabled={pending !== null}
                    className="h-12 rounded-lg bg-[#222222] text-[15px] font-semibold text-white transition hover:bg-black active:scale-[0.98] disabled:opacity-50"
                  >
                    {pending === "confirm" ? "…" : t.available ?? "Available"}
                  </button>
                </div>

                <p className="mt-5 text-center text-[13px] leading-snug text-[#6a6a6a]">
                  {t.hiddenNote ??
                    "Homes marked busy are hidden from guests until you turn them back on."}
                </p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
