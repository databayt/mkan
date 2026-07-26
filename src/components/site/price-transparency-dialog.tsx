"use client";

import { useEffect, useState } from "react";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

// Once-per-user education modal mirroring Airbnb's homepage pricing-transparency
// announcement ("Now you'll see one price for your trip, all fees included.").
// Gated by a localStorage flag so it shows a single time, like the original.
const SEEN_KEY = "mkan_price_transparency_seen";

// Airbnb's pricing-transparency mark — a glossy 3D price tag (pink gradient
// front tag, cream back tag, brass eyelet, braided cord). The live original is
// a Lottie whose SVG can't be cleanly inlined (shared gradient/filter ids), so
// we serve the captured vector as a static asset and render it 1:1 at its
// native 120px. Decorative — the dialog's aria-label already carries the copy.
function PriceTagIcon() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icons/price-transparency-tag.svg"
      alt=""
      aria-hidden="true"
      width={120}
      height={120}
      draggable={false}
      className="block h-[120px] w-[120px] select-none"
    />
  );
}

export function PriceTransparencyDialog() {
  const dict = useDictionary();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
    } catch {
      return;
    }
    // Wait our turn: the cookie-consent banner owns the screen on first load.
    // Show only once it's been answered, so the two never collide.
    let timer: ReturnType<typeof setTimeout>;
    const show = () => {
      timer = setTimeout(() => setOpen(true), 400);
    };
    const hasConsent = document.cookie
      .split("; ")
      .some((c) => c.startsWith("cookieConsent="));
    if (hasConsent) {
      show();
      return () => clearTimeout(timer);
    }
    const onChoice = () => show();
    window.addEventListener("cookieconsent", onChoice);
    return () => {
      window.removeEventListener("cookieconsent", onChoice);
      clearTimeout(timer);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* private mode — still dismiss for the session */
    }
    setOpen(false);
  };

  const t = dict?.home?.priceTransparency;
  const body = t?.body ?? "Now you'll see one price for your trip, all fees included.";
  const gotIt = t?.gotIt ?? "Got it";
  const closeLabel = t?.close ?? "Close";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && dismiss()}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        // Mobile: full-bleed bottom sheet — flush to bottom/start/end edges,
        // rounded top corners only (Airbnb's live mobile dialog: rounded-t 32px,
        // square bottom, 0 8px 28px .28 shadow). Desktop (sm+): the centered
        // 393px rounded card. Overrides shadcn DialogContent's default centering.
        className="grid gap-0 border-0 bg-white p-0 shadow-[0_8px_28px_rgba(0,0,0,0.28)] top-auto bottom-0 start-0 end-0 w-full max-w-none translate-x-0 rtl:translate-x-0 translate-y-0 rounded-t-[32px] rounded-b-none sm:top-[50%] sm:bottom-auto sm:start-[50%] sm:end-auto sm:w-[calc(100%-2rem)] sm:max-w-[393px] sm:translate-x-[-50%] sm:rtl:-translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-[32px] sm:rounded-b-[32px]"
      >
        <button
          type="button"
          aria-label={closeLabel}
          onClick={dismiss}
          className="absolute end-4 top-4 grid size-8 place-items-center rounded-full text-[#222222] transition-colors hover:bg-black/5"
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

        <div className="flex flex-col items-center px-6 pb-6 pt-10">
          {/* One-shot pop-in. Was a framer-motion spring — a back-out bezier
              keyframe reads the same and keeps the animation engine out of
              the home page's chunks. */}
          <div
            className="animate-in fade-in zoom-in-50 duration-300 fill-mode-both"
            style={{
              animationTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
              animationDelay: "100ms",
            }}
          >
            <PriceTagIcon />
          </div>

          <DialogTitle asChild>
            <p className="mt-4 px-2 text-center text-[22px] font-semibold leading-[26px] text-[#222222]">
              {body}
            </p>
          </DialogTitle>

          <button
            type="button"
            onClick={dismiss}
            className="mt-6 h-12 w-full rounded-lg bg-[#222222] text-base font-medium text-white transition-transform active:scale-[0.98]"
          >
            {gotIt}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
