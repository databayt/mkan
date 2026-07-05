"use client";

import React from "react";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { useLocale } from "@/components/internationalization/use-locale";

/**
 * Mobile "Things to know" (POLICIES_DEFAULT) — the closing section of the
 * Airbnb room PDP. Adapted from the desktop `things-to-know.tsx`: the desktop
 * lays the three groups out in a 3-column grid; the mobile clone STACKS them
 * vertically (House rules → Safety & property → Cancellation policy), each a
 * bold 16px sub-label over a short stack of 14px body rows and a "Show more"
 * text link (non-functional, mirroring the desktop affordance).
 *
 * Content comes from the desktop component: the Listing model supplies guest
 * count and pet policy; the rest are the platform-standard defaults Airbnb
 * shows when a host hasn't overridden them (check-in/checkout windows, alarms,
 * partial-refund cancellation). Bilingual en/ar inline — none of this copy has
 * dictionary keys yet, so it follows the house `locale === "ar" ? … : …` idiom.
 */

interface MobileThingsToKnowProps {
  maxGuests?: number | null;
  petsAllowed?: boolean;
  heading?: string;
}

interface Row {
  text: string;
  /** Muted secondary line (#6C6C6C) vs. primary body (#222222). */
  muted?: boolean;
}

function Group({
  title,
  rows,
  showMore,
}: {
  title: string;
  rows: Row[];
  showMore: string;
}) {
  return (
    <div className="flex flex-col">
      <h3 className="mb-3 text-base font-medium text-[#222222]">{title}</h3>
      <ul className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <li
            key={i}
            className={`text-sm leading-6 ${r.muted ? "text-[#6C6C6C]" : "text-[#222222]"}`}
          >
            {r.text}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="mt-3 w-fit text-start text-sm font-medium text-[#222222] underline underline-offset-2 hover:opacity-80"
      >
        {showMore}
      </button>
    </div>
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
  const showMore = isAr ? "عرض المزيد" : "Show more";
  const guests = maxGuests ?? 2;

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
    { text: isAr ? "جهاز إنذار الدخان" : "Smoke alarm" },
    {
      text: isAr
        ? "كاميرات مراقبة خارجية في العقار"
        : "Exterior security cameras on property",
    },
  ];

  const cancellation: Row[] = [
    {
      text: isAr
        ? "إلغاء مجاني قبل تسجيل الوصول."
        : "Free cancellation before check-in.",
    },
    {
      text: isAr
        ? "راجع سياسة الإلغاء الكاملة الخاصة بالمضيف والتي تنطبق حتى لو ألغيت الحجز بسبب المرض أو الاضطرابات."
        : "Review the Host's full cancellation policy which applies even if you cancel for illness or disruptions.",
      muted: true,
    },
  ];

  return (
    <section className="px-4 py-8 border-t border-[#DDDDDD] space-y-6">
      <h2 className="text-[22px] font-semibold leading-[26px] tracking-[-0.44px] text-[#222222]">
        {headingText}
      </h2>
      <Group
        title={isAr ? "قواعد المنزل" : "House rules"}
        rows={houseRules}
        showMore={showMore}
      />
      <Group
        title={isAr ? "السلامة والممتلكات" : "Safety & property"}
        rows={safety}
        showMore={showMore}
      />
      <Group
        title={isAr ? "سياسة الإلغاء" : "Cancellation policy"}
        rows={cancellation}
        showMore={showMore}
      />
    </section>
  );
}
