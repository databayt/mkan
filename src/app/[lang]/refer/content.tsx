"use client";
import { cdn } from "@/lib/cdn";

import { useState } from "react";
import Image from "next/image";
import MenuPageHeader from "@/components/menu-pages/page-header";
import SiteFooter from "@/components/template/footer/site-footer";
import { useLocale } from "@/components/internationalization/use-locale";

const t = {
  en: {
    heading: "Refer a host, earn cash",
    yourReferrals: "Your referrals",
    moreWays: "More ways to share",
    share: "Share referral link",
    copied: "Link copied",
    home: "Home",
    homeEarn: "You'll earn SDG 105 – SDG 1,000",
    experience: "Experience",
    experienceEarn: "You'll earn SDG 50",
    service: "Service",
    serviceEarn: "You'll earn SDG 100",
    footPre: "Only for Mkan members. ",
    eligible: "Eligible locations",
    footMid: " and listing types only. Rewards expire July 1, 2026. ",
    terms: "Terms apply",
  },
  ar: {
    heading: "أحِل مضيفاً، واكسب نقوداً",
    yourReferrals: "إحالاتك",
    moreWays: "طرق أخرى للمشاركة",
    share: "مشاركة رابط الإحالة",
    copied: "تم نسخ الرابط",
    home: "منزل",
    homeEarn: "ستكسب ج.س 105 – ج.س 1,000",
    experience: "تجربة",
    experienceEarn: "ستكسب ج.س 50",
    service: "خدمة",
    serviceEarn: "ستكسب ج.س 100",
    footPre: "لأعضاء مكان فقط. ",
    eligible: "المواقع المؤهلة",
    footMid: " وأنواع القوائم المؤهلة فقط. تنتهي المكافآت في 1 يوليو 2026. ",
    terms: "تطبق الشروط",
  },
} as const;

/** Airbnb overflow icon — three 1.5r dots, 16px, fill currentColor. */
function MoreIcon() {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true" focusable="false" style={{ display: "block", fill: "currentColor" }}>
      <path d="m3 9.5c.82842712 0 1.5-.67157288 1.5-1.5s-.67157288-1.5-1.5-1.5-1.5.67157288-1.5 1.5.67157288 1.5 1.5 1.5zm5 0c.82842712 0 1.5-.67157288 1.5-1.5s-.67157288-1.5-1.5-1.5-1.5.67157288-1.5 1.5.67157288 1.5 1.5 1.5zm5 0c.8284271 0 1.5-.67157288 1.5-1.5s-.6715729-1.5-1.5-1.5-1.5.67157288-1.5 1.5.6715729 1.5 1.5 1.5z" />
    </svg>
  );
}

export default function ReferContent() {
  const { locale } = useLocale();
  const labels = t[locale] ?? t.en;
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const cards = [
    { key: "home", title: labels.home, earn: labels.homeEarn, img: cdn.product("refer/home.png") },
    { key: "experience", title: labels.experience, earn: labels.experienceEarn, img: cdn.product("refer/experience.png") },
    { key: "service", title: labels.service, earn: labels.serviceEarn, img: cdn.product("refer/service.png") },
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
            {/* "Your referrals" pill — #f2f2f2, 40px tall, 20px inset, 500 weight. */}
            <button
              className="flex h-10 items-center rounded-full px-5 text-sm font-medium transition-colors"
              style={{ backgroundColor: "#f2f2f2", color: "#222222" }}
            >
              {labels.yourReferrals}
            </button>
            {/* "More ways to share" — 40px circle with the 3-dot overflow icon. */}
            <button
              aria-label={labels.moreWays}
              className="flex h-10 w-10 items-center justify-center rounded-full transition-colors"
              style={{ backgroundColor: "#f2f2f2", color: "#222222" }}
            >
              <MoreIcon />
            </button>
          </>
        }
      />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-screen-xl px-6 pb-20 pt-14 md:px-12 md:pt-20">
          {/* Hero — Airbnb h1: 60px / 600 / -0.04em tracking / 68px line. */}
          <h1
            className="text-center text-4xl font-semibold sm:text-5xl md:text-6xl"
            style={{ color: "#222222", letterSpacing: "-0.04em", lineHeight: 1.06 }}
          >
            {labels.heading}
          </h1>

          {/* Three referral options — equal-thirds row, 24px gap; title + earn
              leading, 48px 3D emoji trailing; select darkens border to #222. */}
          <div className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
            {cards.map((c) => {
              const active = selected === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => setSelected(c.key)}
                  aria-pressed={active}
                  className="flex items-center gap-3 rounded-2xl border bg-white p-6 text-start transition-all"
                  style={{
                    borderColor: active ? "#222222" : "#dddddd",
                    boxShadow: active ? "0 0 0 1px #222222" : undefined,
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-medium" style={{ color: "#222222", lineHeight: "20px" }}>
                      {c.title}
                    </span>
                    <span className="mt-0.5 block text-sm" style={{ color: "#6a6a6a", lineHeight: "18px" }}>
                      {c.earn}
                    </span>
                  </span>
                  <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center">
                    <Image src={c.img} alt="" width={48} height={48} className="h-12 w-12" />
                  </span>
                </button>
              );
            })}
          </div>

          {/* Share button — one card-width, centered (middle of a 3-col grid);
              disabled until a host type is picked. */}
          <div className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
            <div className="hidden md:block" />
            <button
              onClick={handleShare}
              disabled={!selected}
              className={`flex h-12 w-full items-center justify-center px-6 text-base font-medium transition-colors ${
                selected ? "hover:opacity-90" : "cursor-not-allowed"
              }`}
              style={
                selected
                  ? { backgroundColor: "#222222", color: "#ffffff", borderRadius: "12px" }
                  : { backgroundColor: "#f2f2f2", color: "#c1c1c1", borderRadius: "12px" }
              }
            >
              {copied ? labels.copied : labels.share}
            </button>
            <div className="hidden md:block" />
          </div>
        </div>

        {/* Full-bleed hairline divider above the footnote. */}
        <div className="w-full border-t" style={{ borderColor: "#ebebeb" }} />

        {/* Footnote — centered, 14px, #6a6a6a, with inline underlined links. */}
        <p className="px-6 py-8 text-center text-sm" style={{ color: "#6a6a6a", lineHeight: "18px" }}>
          {labels.footPre}
          <span className="font-medium underline">{labels.eligible}</span>
          {labels.footMid}
          <span className="font-medium underline">{labels.terms}</span>
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
