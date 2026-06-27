"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X, Languages, Check } from "lucide-react";
import {
  useLocale,
  useSwitchLocaleHref,
} from "@/components/internationalization/use-locale";
import type { Locale } from "@/components/internationalization/config";

const t = {
  en: {
    languageRegion: "Language and region",
    currency: "Currency",
    translation: "Translation",
    translationDesc: "Automatically translate descriptions and reviews to English.",
    chooseLanguage: "Choose a language and region",
    chooseCurrency: "Choose a currency",
    close: "Close",
    trigger: "Choose a language and currency",
  },
  ar: {
    languageRegion: "اللغة والمنطقة",
    currency: "العملة",
    translation: "الترجمة",
    translationDesc: "ترجمة الأوصاف والتقييمات تلقائياً إلى العربية.",
    chooseLanguage: "اختر اللغة والمنطقة",
    chooseCurrency: "اختر العملة",
    close: "إغلاق",
    trigger: "اختر اللغة والعملة",
  },
} as const;

// Functional locales come first (en/ar actually switch the app). The rest are
// shown for visual parity with Airbnb's dense grid; selecting them previews the
// choice without a real locale route.
type LangOption = {
  locale?: Locale;
  language: string;
  region: string;
};

const LANGUAGES: LangOption[] = [
  { locale: "en", language: "English", region: "United States" },
  { locale: "ar", language: "العربية", region: "السودان" },
  { language: "English", region: "United Kingdom" },
  { language: "Azərbaycan dili", region: "Azərbaycan" },
  { language: "Bahasa Indonesia", region: "Indonesia" },
  { language: "Bosanski", region: "Bosna i Hercegovina" },
  { language: "Català", region: "Espanya" },
  { language: "Čeština", region: "Česká republika" },
  { language: "Dansk", region: "Danmark" },
  { language: "Deutsch", region: "Deutschland" },
  { language: "Español", region: "España" },
  { language: "Français", region: "France" },
  { language: "Italiano", region: "Italia" },
  { language: "Nederlands", region: "Nederland" },
  { language: "Português", region: "Brasil" },
  { language: "Türkçe", region: "Türkiye" },
  { language: "Русский", region: "Россия" },
  { language: "中文", region: "中国" },
  { language: "日本語", region: "日本" },
  { language: "한국어", region: "대한민국" },
];

type CurrencyOption = { name: string; code: string; symbol: string };

const CURRENCIES: CurrencyOption[] = [
  { name: "Sudanese pound", code: "SDG", symbol: "ج.س" },
  { name: "United States dollar", code: "USD", symbol: "$" },
  { name: "Saudi Arabian riyal", code: "SAR", symbol: "SR" },
  { name: "Emirati dirham", code: "AED", symbol: "د.إ" },
  { name: "Egyptian pound", code: "EGP", symbol: "ج.م" },
  { name: "Qatari riyal", code: "QAR", symbol: "ر.ق" },
  { name: "Euro", code: "EUR", symbol: "€" },
  { name: "Pound sterling", code: "GBP", symbol: "£" },
  { name: "Australian dollar", code: "AUD", symbol: "$" },
  { name: "Canadian dollar", code: "CAD", symbol: "$" },
  { name: "Swiss franc", code: "CHF", symbol: "CHF" },
  { name: "Chinese yuan", code: "CNY", symbol: "¥" },
  { name: "Japanese yen", code: "JPY", symbol: "¥" },
  { name: "Indian rupee", code: "INR", symbol: "₹" },
  { name: "Turkish lira", code: "TRY", symbol: "₺" },
  { name: "Moroccan dirham", code: "MAD", symbol: "DH" },
  { name: "Kuwaiti dinar", code: "KWD", symbol: "د.ك" },
  { name: "Jordanian dinar", code: "JOD", symbol: "د.ا" },
  { name: "South African rand", code: "ZAR", symbol: "R" },
  { name: "Nigerian naira", code: "NGN", symbol: "₦" },
  { name: "Kenyan shilling", code: "KES", symbol: "KSh" },
  { name: "Brazilian real", code: "BRL", symbol: "R$" },
  { name: "Mexican peso", code: "MXN", symbol: "$" },
  { name: "Singapore dollar", code: "SGD", symbol: "$" },
  { name: "Malaysian ringgit", code: "MYR", symbol: "RM" },
  { name: "Indonesian rupiah", code: "IDR", symbol: "Rp" },
  { name: "Russian ruble", code: "RUB", symbol: "₽" },
  { name: "Swedish krona", code: "SEK", symbol: "kr" },
];

const CURRENCY_STORAGE_KEY = "mkan_currency";

interface LocaleCurrencyDialogProps {
  /** Optional custom trigger; defaults to the globe pill used in the header. */
  children?: React.ReactNode;
}

export default function LocaleCurrencyDialog({
  children,
}: LocaleCurrencyDialogProps) {
  const { locale, isRTL } = useLocale();
  const router = useRouter();
  const getSwitchLocaleHref = useSwitchLocaleHref();
  const labels = t[locale] ?? t.en;

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"language" | "currency">("language");
  const [translate, setTranslate] = useState(true);
  const [currency, setCurrency] = useState<string>("SDG");

  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? window.localStorage.getItem(CURRENCY_STORAGE_KEY)
        : null;
    if (stored) setCurrency(stored);
  }, []);

  const selectLanguage = (opt: LangOption) => {
    if (opt.locale && opt.locale !== locale) {
      router.push(getSwitchLocaleHref(opt.locale));
    }
    setOpen(false);
  };

  const selectCurrency = (code: string) => {
    setCurrency(code);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CURRENCY_STORAGE_KEY, code);
    }
    setOpen(false);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        {children ?? (
          <button
            className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors cursor-pointer outline-none"
            aria-label={labels.trigger}
            title={labels.trigger}
          >
            {/* Globe — inline so the error boundary chunking issue with
                lucide doesn't apply, matching the header's globe size. */}
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-gray-700"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </button>
        )}
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          dir={isRTL ? "rtl" : "ltr"}
          className="fixed start-[50%] top-[50%] z-[100] flex max-h-[88vh] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] rtl:translate-x-[50%] flex-col overflow-hidden rounded-[32px] bg-white shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 lg:max-w-5xl"
        >
          <DialogPrimitive.Title className="sr-only">
            {labels.trigger}
          </DialogPrimitive.Title>

          {/* Sticky header: close button + tabs */}
          <div className="sticky top-0 z-10 bg-white px-6 pt-5">
            <DialogPrimitive.Close
              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-gray-100 outline-none"
              aria-label={labels.close}
            >
              <X size={16} className="text-gray-700" />
            </DialogPrimitive.Close>

            <div className="mt-3 flex gap-6 border-b border-gray-200">
              <button
                onClick={() => setTab("language")}
                className={`relative pb-3 text-sm font-medium transition-colors ${
                  tab === "language"
                    ? "text-gray-900"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {labels.languageRegion}
                {tab === "language" && (
                  <span className="absolute -bottom-px start-0 h-0.5 w-full rounded-full bg-gray-900" />
                )}
              </button>
              <button
                onClick={() => setTab("currency")}
                className={`relative pb-3 text-sm font-medium transition-colors ${
                  tab === "currency"
                    ? "text-gray-900"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {labels.currency}
                {tab === "currency" && (
                  <span className="absolute -bottom-px start-0 h-0.5 w-full rounded-full bg-gray-900" />
                )}
              </button>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="overflow-y-auto px-6 py-6">
            {tab === "language" ? (
              <>
                {/* Translation toggle card */}
                <div className="mb-8 flex items-center justify-between gap-4 rounded-2xl bg-gray-50 px-5 py-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-gray-900">
                        {labels.translation}
                      </h3>
                      <Languages size={18} className="text-gray-700" />
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      {labels.translationDesc}
                    </p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={translate}
                    onClick={() => setTranslate((v) => !v)}
                    className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors ${
                      translate ? "bg-gray-900" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform ${
                        translate
                          ? "translate-x-6 rtl:-translate-x-6"
                          : "translate-x-1 rtl:-translate-x-1"
                      }`}
                    >
                      {translate && (
                        <Check size={12} className="text-gray-900" />
                      )}
                    </span>
                  </button>
                </div>

                <h2 className="mb-5 text-2xl font-semibold text-gray-900">
                  {labels.chooseLanguage}
                </h2>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-3 lg:grid-cols-4">
                  {LANGUAGES.map((opt, i) => {
                    const active = opt.locale === locale;
                    return (
                      <button
                        key={`${opt.language}-${opt.region}-${i}`}
                        onClick={() => selectLanguage(opt)}
                        className={`rounded-lg border px-4 py-3 text-start transition-colors ${
                          active
                            ? "border-gray-900"
                            : "border-transparent hover:bg-gray-100"
                        }`}
                      >
                        <div className="text-sm font-medium text-gray-900">
                          {opt.language}
                        </div>
                        <div className="text-sm text-gray-500">
                          {opt.region}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <h2 className="mb-5 text-2xl font-semibold text-gray-900">
                  {labels.chooseCurrency}
                </h2>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-3 lg:grid-cols-4">
                  {CURRENCIES.map((c) => {
                    const active = c.code === currency;
                    return (
                      <button
                        key={c.code}
                        onClick={() => selectCurrency(c.code)}
                        className={`rounded-lg border px-4 py-3 text-start transition-colors ${
                          active
                            ? "border-gray-900"
                            : "border-transparent hover:bg-gray-100"
                        }`}
                      >
                        <div className="text-sm font-medium text-gray-900">
                          {c.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {c.code} – {c.symbol}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
