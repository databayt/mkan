"use client";

import React from "react";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { useLocale } from "@/components/internationalization/use-locale";
import {
  CancellationPolicyIcon,
  HouseRulesIcon,
  SafetyPropertyIcon,
  ChevronForwardIcon,
} from "./things-to-know-icons";

/**
 * Mobile "Things to know" (POLICIES_DEFAULT) — the closing section of the
 * Airbnb room PDP. On mobile Airbnb renders the three groups as full-width
 * clickable rows: a 24px leading glyph, the title over a short stack of 14px
 * body rows, and a trailing 16px chevron (ground truth
 * `.clone/airbnb-room-mobile/sections/14-POLICIES_DEFAULT.html`). Order matches
 * Airbnb: Cancellation policy → House rules → Safety & property.
 *
 * Content: the Listing model supplies guest count and pet policy; the rest are
 * the platform-standard defaults Airbnb shows when a host hasn't overridden
 * them. Bilingual en/ar inline — none of this copy has dictionary keys yet, so
 * it follows the house `locale === "ar" ? … : …` idiom. The chevron mirrors
 * under RTL.
 */

interface MobileThingsToKnowProps {
  maxGuests?: number | null;
  petsAllowed?: boolean;
  heading?: string;
}

interface Row {
  text: string;
}

function GroupRow({
  icon,
  title,
  rows,
  chevronFlip,
}: {
  icon: React.ReactNode;
  title: string;
  rows: Row[];
  chevronFlip: boolean;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-4 text-start hover:opacity-80"
    >
      <span className="shrink-0 text-[#222222]">{icon}</span>
      <span className="flex flex-1 flex-col">
        <span className="mb-1 text-base font-medium text-[#222222]">
          {title}
        </span>
        {rows.map((r, i) => (
          <span key={i} className="text-sm leading-[18px] text-[#6C6C6C]">
            {r.text}
          </span>
        ))}
      </span>
      <span
        className={`shrink-0 text-[#6a6a6a] ${chevronFlip ? "-scale-x-100" : ""}`}
      >
        <ChevronForwardIcon />
      </span>
    </button>
  );
}

export default function MobileThingsToKnow({
  maxGuests,
  petsAllowed = false,
  heading,
}: MobileThingsToKnowProps) {
  const dict = useDictionary();
  const { locale } = useLocale();
  const isAr = locale === "ar";

  // Forward-compatible: pick up a dict key if a parallel session adds one,
  // otherwise fall back to inline bilingual copy (mirrors mobile-amenities).
  const sections = dict?.property?.sections as
    | Record<string, string>
    | undefined;
  const headingText =
    heading ??
    sections?.thingsToKnow ??
    (isAr ? "معلومات يجب معرفتها" : "Things to know");
  const guests = maxGuests ?? 2;

  const cancellation: Row[] = [
    {
      text: isAr
        ? "إلغاء مجاني قبل تسجيل الوصول."
        : "Free cancellation before check-in.",
    },
    {
      text: isAr
        ? "راجع سياسة الإلغاء الكاملة الخاصة بالمضيف للتفاصيل."
        : "Review this host's full policy for details.",
    },
  ];

  const houseRules: Row[] = [
    { text: isAr ? "تسجيل الوصول بعد الساعة 3:00 مساءً" : "Check-in after 3:00 PM" },
    { text: isAr ? "تسجيل المغادرة قبل الساعة 11:00 صباحاً" : "Checkout before 11:00 AM" },
    { text: isAr ? `الحد الأقصى ${guests} ضيوف` : `${guests} guests maximum` },
    {
      text: petsAllowed
        ? isAr
          ? "يُسمح بالحيوانات الأليفة"
          : "Pets allowed"
        : isAr
          ? "غير مسموح بالحيوانات الأليفة"
          : "No pets",
    },
  ];

  const safety: Row[] = [
    {
      text: isAr
        ? "لم يتم الإبلاغ عن جهاز إنذار أول أكسيد الكربون"
        : "Carbon monoxide alarm not reported",
    },
    {
      text: isAr
        ? "كاميرات مراقبة خارجية في العقار"
        : "Exterior security cameras on property",
    },
    { text: isAr ? "جهاز إنذار الدخان" : "Smoke alarm" },
  ];

  return (
    <section className="px-6 py-8 space-y-6 relative before:content-[''] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-[#DDDDDD]">
      <h2 className="text-[22px] font-semibold leading-[26px] tracking-[-0.44px] text-[#222222]">
        {headingText}
      </h2>
      <div className="flex flex-col gap-6">
        <GroupRow
          icon={<CancellationPolicyIcon />}
          title={isAr ? "سياسة الإلغاء" : "Cancellation policy"}
          rows={cancellation}
          chevronFlip={isAr}
        />
        <GroupRow
          icon={<HouseRulesIcon />}
          title={isAr ? "قواعد المنزل" : "House rules"}
          rows={houseRules}
          chevronFlip={isAr}
        />
        <GroupRow
          icon={<SafetyPropertyIcon />}
          title={isAr ? "السلامة والممتلكات" : "Safety & property"}
          rows={safety}
          chevronFlip={isAr}
        />
      </div>
    </section>
  );
}
