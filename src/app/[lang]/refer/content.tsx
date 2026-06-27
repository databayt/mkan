"use client";

import { useState } from "react";
import MenuPageHeader from "@/components/menu-pages/page-header";
import SiteFooter from "@/components/template/footer/site-footer";
import { useLocale } from "@/components/internationalization/use-locale";

const t = {
  en: {
    heading: "Refer a host, earn cash",
    yourReferrals: "Your referrals",
    share: "Share referral link",
    copied: "Link copied",
    home: "Home",
    homeEarn: "You'll earn SDG 105 – SDG 1,000",
    experience: "Experience",
    experienceEarn: "You'll earn SDG 50",
    service: "Service",
    serviceEarn: "You'll earn SDG 100",
    footnote:
      "Only for Mkan members. Eligible locations and listing types only. Rewards expire July 1, 2026.",
    eligible: "Eligible locations",
    terms: "Terms apply",
  },
  ar: {
    heading: "أحِل مضيفاً، واكسب نقوداً",
    yourReferrals: "إحالاتك",
    share: "مشاركة رابط الإحالة",
    copied: "تم نسخ الرابط",
    home: "منزل",
    homeEarn: "ستكسب ج.س 105 – ج.س 1,000",
    experience: "تجربة",
    experienceEarn: "ستكسب ج.س 50",
    service: "خدمة",
    serviceEarn: "ستكسب ج.س 100",
    footnote:
      "لأعضاء مكان فقط. المواقع وأنواع القوائم المؤهلة فقط. تنتهي المكافآت في 1 يوليو 2026.",
    eligible: "المواقع المؤهلة",
    terms: "تطبق الشروط",
  },
} as const;

export default function ReferContent() {
  const { locale } = useLocale();
  const labels = t[locale] ?? t.en;
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const cards = [
    { key: "home", title: labels.home, earn: labels.homeEarn, emoji: "🏡" },
    {
      key: "experience",
      title: labels.experience,
      earn: labels.experienceEarn,
      emoji: "🎈",
    },
    { key: "service", title: labels.service, earn: labels.serviceEarn, emoji: "🛎️" },
  ];

  const handleShare = async () => {
    if (!selected) return;
    const url = `${window.location.origin}/${locale}/refer?via=${selected}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <MenuPageHeader
        actions={
          <>
            <button className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-200">
              {labels.yourReferrals}
            </button>
            <button
              aria-label="More"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 transition-colors hover:bg-gray-200"
            >
              <span className="-mt-1 text-lg leading-none text-gray-700">…</span>
            </button>
          </>
        }
      />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-6 py-14 md:py-20">
          {/* Hero — big, medium-weight, tight tracking (Airbnb h1 = 60px/600). */}
          <h1 className="text-center text-4xl font-semibold tracking-tight text-[#222222] sm:text-5xl md:text-6xl">
            {labels.heading}
          </h1>

          {/* Three referral options in a row — title + earn leading, 3D icon
              trailing, selectable by darkening the border (no radio, like live). */}
          <div className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-4 md:mt-14 md:grid-cols-3">
            {cards.map((c) => {
              const active = selected === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => setSelected(c.key)}
                  aria-pressed={active}
                  className="flex items-center justify-between gap-3 rounded-2xl border px-6 py-6 text-start transition-all"
                  style={{
                    borderColor: active ? "#222222" : "#dddddd",
                    boxShadow: active ? "0 0 0 1px #222222" : undefined,
                  }}
                >
                  <div>
                    <div className="text-base font-medium text-[#222222]">
                      {c.title}
                    </div>
                    <div className="mt-1 text-sm text-[#6a6a6a]">{c.earn}</div>
                  </div>
                  <span className="text-3xl" aria-hidden="true">
                    {c.emoji}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Share button — one card-width, centered; disabled until a pick. */}
          <button
            onClick={handleShare}
            disabled={!selected}
            className={`mx-auto mt-6 flex w-full max-w-sm items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-medium transition-colors ${
              selected ? "hover:opacity-90" : "cursor-not-allowed"
            }`}
            style={
              selected
                ? { backgroundColor: "#222222", color: "#ffffff" }
                : { backgroundColor: "#f2f2f2", color: "#c1c1c1" }
            }
          >
            {copied ? labels.copied : labels.share}
          </button>

          {/* Footnote */}
          <p className="mx-auto mt-12 max-w-2xl text-center text-sm text-[#6a6a6a]">
            {labels.footnote}{" "}
            <span className="font-medium text-[#222222] underline">
              {labels.eligible}
            </span>{" "}
            <span className="font-medium text-[#222222] underline">
              {labels.terms}
            </span>
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
