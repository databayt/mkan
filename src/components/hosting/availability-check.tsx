"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { confirmAvailability, unpublishListing } from "@/lib/actions/listing-actions";

type StaleListing = { id: number; title: string };

const DISMISS_KEY = "availabilityCheckDismissed";

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1] ?? "") : undefined;
}
function writeCookie(name: string, value: string, maxAgeSec: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSec}; samesite=lax`;
}

/**
 * Availability Check — a calibrated, cookie-consent-styled nudge for passive
 * owners. Lists the host's homes whose availability hasn't been reconfirmed in
 * a while, each with one-tap "Still available" / "Mark busy". Shown at most once
 * per reminder period (cookie-snoozed) and always dismissible — "not too much,
 * not too little". Keeps seeded/listed homes honest without owner effort.
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
  const [items, setItems] = useState<StaleListing[]>(staleListings);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => {
    if (staleListings.length > 0 && !readCookie(DISMISS_KEY)) setOpen(true);
  }, [staleListings.length]);

  const dismissForPeriod = () => {
    writeCookie(DISMISS_KEY, "1", periodDays * 24 * 60 * 60);
    setOpen(false);
  };

  const handle = async (id: number, action: "confirm" | "busy") => {
    setPending(id);
    try {
      if (action === "confirm") await confirmAvailability(id);
      else await unpublishListing(id);
      const next = items.filter((i) => i.id !== id);
      setItems(next);
      if (next.length === 0) dismissForPeriod();
    } catch {
      // Leave the item in place on failure; the owner can retry.
    } finally {
      setPending(null);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          role="dialog"
          aria-live="polite"
          aria-label={t.title ?? "Availability check"}
          className="fixed bottom-0 left-0 right-0 md:bottom-6 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-[520px] z-[9999] rounded-t-[28px] rounded-b-none md:rounded-2xl border border-neutral-200/80 bg-white p-6 md:p-7 shadow-[0_8px_28px_rgba(0,0,0,0.14)] print:hidden"
        >
          <h2 className="text-neutral-900 font-semibold text-lg md:text-[20px] leading-tight tracking-tight text-start">
            {t.title ?? "Are these homes still available?"}
          </h2>
          <p className="text-neutral-600 text-xs md:text-sm leading-relaxed mt-2 text-start">
            {t.description ??
              "Keep your availability current so guests only reach you about homes you can actually host."}
          </p>

          <ul className="mt-4 max-h-[40vh] space-y-2 overflow-y-auto">
            {items.map((it) => (
              <li
                key={it.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 p-3"
              >
                <span className="truncate text-sm text-neutral-900 text-start">{it.title}</span>
                <div className="flex flex-shrink-0 gap-2">
                  <button
                    onClick={() => handle(it.id, "confirm")}
                    disabled={pending === it.id}
                    className="rounded-lg bg-[#222222] px-3 py-2 text-xs font-semibold text-white transition hover:bg-black active:scale-[0.98] disabled:opacity-50"
                  >
                    {t.stillAvailable ?? "Still available"}
                  </button>
                  <button
                    onClick={() => handle(it.id, "busy")}
                    disabled={pending === it.id}
                    className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-semibold text-neutral-800 transition hover:bg-neutral-50 active:scale-[0.98] disabled:opacity-50"
                  >
                    {t.markBusy ?? "Mark busy"}
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex justify-end">
            <button
              onClick={dismissForPeriod}
              className="text-sm font-semibold text-neutral-700 underline hover:text-black"
            >
              {t.done ?? "Done"}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
