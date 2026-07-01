"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { useLocale } from "@/components/internationalization/use-locale";

// Airbnb's "Get 15% credit at hotels" promo modal, rebranded to Mkan (the same
// way the logo, currency and gift-card surfaces were localized). Built on the
// raw Radix primitive — like locale-currency-dialog — so the rounded card,
// close affordance and animation match Airbnb exactly rather than the app's
// default DialogContent.

const t = {
  en: {
    title: "Get 15% in Mkan credit at hotels",
    body: "Stay at a featured hotel and get Mkan credit to use on homes, experiences, or services.",
    cta: "Browse hotels",
    excludes: "Excludes fees & taxes",
    valid: "Valid for 1 year",
    terms: "Terms apply",
    close: "Close",
  },
  ar: {
    title: "احصل على رصيد 15% من مكان في الفنادق",
    body: "أقم في فندق مميّز واحصل على رصيد من مكان لاستخدامه في المنازل أو التجارب أو الخدمات.",
    cta: "تصفّح الفنادق",
    excludes: "باستثناء الرسوم والضرائب",
    valid: "صالح لمدة سنة",
    terms: "تنطبق الشروط",
    close: "إغلاق",
  },
} as const;

const STORAGE_KEY = "mkan_hotel_promo_dismissed_v1";

/**
 * Gold bellhop luggage cart — a faithful house rendering of Airbnb's 3D promo
 * art (no real asset exists in the repo; the gift-card surface set the
 * substitute-with-crafted-art precedent). Self-contained inline SVG: renders
 * identically offline and carries no RTL/physical-direction or Tailwind-arbitrary
 * concerns.
 */
function BellhopCartArt({ size = 168 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      role="img"
      aria-hidden="true"
    >
      <defs>
        {/* diagonal gold catches a light from the upper-left for a tubular look */}
        <linearGradient id="hc-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FBE7A6" />
          <stop offset="0.45" stopColor="#E9B945" />
          <stop offset="1" stopColor="#B07C1C" />
        </linearGradient>
        <linearGradient id="hc-gold-soft" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F7D687" />
          <stop offset="1" stopColor="#C8902A" />
        </linearGradient>
        <linearGradient id="hc-silver" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FBFCFE" />
          <stop offset="1" stopColor="#BBC3CD" />
        </linearGradient>
        <linearGradient id="hc-pink" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF7FB0" />
          <stop offset="1" stopColor="#E23A78" />
        </linearGradient>
        <linearGradient id="hc-tan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E2B36E" />
          <stop offset="1" stopColor="#A86C2C" />
        </linearGradient>
        <linearGradient id="hc-teal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2A9D8F" />
          <stop offset="1" stopColor="#11675E" />
        </linearGradient>
        <radialGradient id="hc-wheel" cx="0.38" cy="0.34" r="0.72">
          <stop offset="0" stopColor="#43434B" />
          <stop offset="1" stopColor="#101015" />
        </radialGradient>
        {/* soft contact shadow that fades to nothing at the rim */}
        <radialGradient id="hc-floor" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000000" stopOpacity="0.16" />
          <stop offset="0.7" stopColor="#000000" stopOpacity="0.06" />
          <stop offset="1" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* floating contact shadow */}
      <ellipse cx="100" cy="181" rx="74" ry="15" fill="url(#hc-floor)" />

      {/* gold arch frame (tubular — body + top highlight) */}
      <path
        d="M53 173 L53 85 A47 47 0 0 1 147 85 L147 173"
        stroke="url(#hc-gold)"
        strokeWidth="12"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M57.5 150 L57.5 87 A42.5 42.5 0 0 1 142.5 87"
        stroke="#FCEBB4"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.6"
        fill="none"
      />
      {/* finial */}
      <rect x="96.5" y="36" width="7" height="8" rx="3" fill="#B07C1C" />
      <circle cx="100" cy="33" r="8" fill="url(#hc-gold-soft)" />
      <circle cx="97" cy="30.5" r="2.4" fill="#FFF6DC" opacity="0.9" />

      {/* cart bed + teal felt top */}
      <rect x="43" y="150" width="114" height="17" rx="7" fill="url(#hc-gold)" />
      <rect x="43" y="160" width="114" height="6" rx="3" fill="#7E5715" opacity="0.4" />
      <rect x="49" y="143" width="102" height="10" rx="5" fill="url(#hc-teal)" />
      <rect x="49" y="143" width="102" height="3.5" rx="1.75" fill="#5FC9BC" opacity="0.5" />

      {/* silver upright case (back, tall — rises into the arch) */}
      <g>
        <rect x="62" y="80" width="38" height="68" rx="9" fill="url(#hc-silver)" />
        <rect x="74" y="72" width="14" height="9" rx="4" fill="#9AA3AE" />
        <line x1="72" y1="88" x2="72" y2="142" stroke="#AEB6C0" strokeWidth="2" opacity="0.55" />
        <line x1="81" y1="88" x2="81" y2="142" stroke="#AEB6C0" strokeWidth="2" opacity="0.55" />
        <line x1="90" y1="88" x2="90" y2="142" stroke="#AEB6C0" strokeWidth="2" opacity="0.55" />
        <rect x="65" y="84" width="5" height="60" rx="2.5" fill="#FFFFFF" opacity="0.45" />
      </g>

      {/* tan duffel / holdall (right) */}
      <g>
        <path
          d="M104 100 q16 -13 32 0"
          stroke="#7A4A1E"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <rect x="99" y="99" width="42" height="49" rx="17" fill="url(#hc-tan)" />
        <line x1="101" y1="112" x2="139" y2="112" stroke="#86551E" strokeWidth="2" opacity="0.5" />
        {/* round travel sticker */}
        <circle cx="120" cy="126" r="8" fill="#2EA84F" />
        <circle cx="120" cy="126" r="3.4" fill="#A6E6BB" />
        <rect x="104" y="104" width="5" height="40" rx="2.5" fill="#FFFFFF" opacity="0.16" />
      </g>

      {/* pink hardshell case (front) */}
      <g>
        <rect x="55" y="116" width="48" height="32" rx="9" fill="url(#hc-pink)" />
        <rect x="71" y="111" width="15" height="6" rx="3" fill="#C42B66" />
        <line x1="79" y1="120" x2="79" y2="146" stroke="#C42B66" strokeWidth="1.6" opacity="0.5" />
        <rect x="59" y="120" width="5" height="24" rx="2.5" fill="#FFFFFF" opacity="0.32" />
      </g>

      {/* wheels */}
      <rect x="63" y="160" width="6" height="10" rx="2.5" fill="#A6741B" />
      <rect x="131" y="160" width="6" height="10" rx="2.5" fill="#A6741B" />
      <circle cx="66" cy="174" r="11" fill="url(#hc-wheel)" />
      <circle cx="66" cy="174" r="3.6" fill="#E9B945" />
      <circle cx="134" cy="174" r="11" fill="url(#hc-wheel)" />
      <circle cx="134" cy="174" r="3.6" fill="#E9B945" />
    </svg>
  );
}

interface HotelCreditDialogProps {
  /** Bypass the once-per-browser persistence — handy for previews/tests. */
  forceOpen?: boolean;
}

export default function HotelCreditDialog({ forceOpen }: HotelCreditDialogProps) {
  const { locale, isRTL } = useLocale();
  const router = useRouter();
  const labels = t[locale] ?? t.en;
  const [open, setOpen] = useState(false);

  // Surface like a promo shortly after the page paints, once per browser.
  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      return;
    }
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY)) return;
    const id = window.setTimeout(() => setOpen(true), 600);
    return () => window.clearTimeout(id);
  }, [forceOpen]);

  const dismiss = () => {
    setOpen(false);
    if (!forceOpen && typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "1");
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (next) setOpen(true);
    else dismiss();
  };

  // The CTA marks the promo as seen and lands on the search surface where the
  // credited hotel rooms live.
  const browseHotels = () => {
    dismiss();
    router.push(`/${locale}/search`);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          dir={isRTL ? "rtl" : "ltr"}
          className="fixed start-[50%] top-[50%] z-[100] flex w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] rtl:translate-x-[50%] flex-col items-center overflow-hidden bg-white text-center shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          style={{ maxWidth: 568, borderRadius: 32, padding: "48px 40px 32px" }}
        >
          {/* close */}
          <DialogPrimitive.Close
            className="absolute z-10 flex items-center justify-center rounded-full transition-colors hover:bg-gray-100 outline-none"
            style={{ top: 16, insetInlineEnd: 16, width: 32, height: 32 }}
            aria-label={labels.close}
          >
            <X size={18} style={{ color: "#222222" }} />
          </DialogPrimitive.Close>

          <BellhopCartArt />

          <DialogPrimitive.Title
            className="font-bold"
            style={{
              fontSize: 28,
              lineHeight: 1.18,
              letterSpacing: "-0.4px",
              color: "#222222",
              maxWidth: 340,
              marginTop: 8,
            }}
          >
            {labels.title}
          </DialogPrimitive.Title>

          <DialogPrimitive.Description
            style={{
              fontSize: 16,
              lineHeight: 1.45,
              color: "#6a6a6a",
              maxWidth: 420,
              marginTop: 12,
            }}
          >
            {labels.body}
          </DialogPrimitive.Description>

          <button
            type="button"
            onClick={browseHotels}
            className="mt-7 w-full rounded-lg bg-neutral-800 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-neutral-900"
          >
            {labels.cta}
          </button>

          <div
            className="mt-5 flex flex-wrap items-center justify-center gap-x-1.5"
            style={{ fontSize: 13, color: "#6a6a6a" }}
          >
            <span>{labels.excludes}</span>
            <span aria-hidden="true">·</span>
            <span>{labels.valid}</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              className="underline underline-offset-2 transition-colors hover:text-gray-800"
            >
              {labels.terms}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
