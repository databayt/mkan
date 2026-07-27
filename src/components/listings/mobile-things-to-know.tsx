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
 * Content comes from the listing itself: check-in/checkout times, the
 * house-rules JSON, check-in method, guest count and pet policy. Every row
 * falls back to Airbnb's platform-standard default only when the host has
 * genuinely set nothing — previously the whole block was hardcoded, so every
 * listing claimed "Check-in after 3:00 PM / Checkout before 11:00 AM / No
 * pets" no matter what its host had actually chosen.
 *
 * The rules are rendered from structure rather than from stored text, which is
 * what keeps them bilingual: the scraper parses Airbnb's rule strings back into
 * these fields (scripts/crm/house-rules.ts) precisely so this component can say
 * them in the viewer's language rather than the language they were scraped in.
 *
 * Bilingual en/ar inline — none of this copy has dictionary keys yet, so it
 * follows the house `locale === "ar" ? … : …` idiom. The chevron mirrors under
 * RTL.
 */

/** The subset of `Listing.houseRules` this section renders. */
export interface ListingHouseRules {
  petsAllowed?: boolean;
  eventsAllowed?: boolean;
  smokingAllowed?: boolean;
  commercialPhotographyAllowed?: boolean;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  additionalRules?: string;
}

interface MobileThingsToKnowProps {
  maxGuests?: number | null;
  /** Listing.isPetsAllowed — the column, distinct from the houseRules JSON. */
  petsAllowed?: boolean;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  checkInMethod?: string | null;
  houseRules?: ListingHouseRules | null;
  cancellationPolicy?: string | null;
  heading?: string;
}

interface Row {
  text: string;
}

/** mkan's CheckInMethod enum, in both languages. */
const CHECK_IN_METHOD = {
  SelfCheckIn: { en: "Self check-in", ar: "تسجيل وصول ذاتي" },
  Lockbox: { en: "Self check-in with lockbox", ar: "تسجيل وصول ذاتي بصندوق مفاتيح" },
  SmartLock: { en: "Self check-in with smart lock", ar: "تسجيل وصول ذاتي بقفل ذكي" },
  InPerson: { en: "Check-in with the host", ar: "تسجيل الوصول مع المضيف" },
} as const;

/** mkan's CancellationPolicy enum, in both languages. */
const CANCELLATION = {
  Flexible: {
    en: "Free cancellation up to 24 hours before check-in.",
    ar: "إلغاء مجاني حتى 24 ساعة قبل تسجيل الوصول.",
  },
  Moderate: {
    en: "Free cancellation up to 5 days before check-in.",
    ar: "إلغاء مجاني حتى 5 أيام قبل تسجيل الوصول.",
  },
  Strict: {
    en: "Free cancellation within 48 hours of booking only.",
    ar: "إلغاء مجاني خلال 48 ساعة من الحجز فقط.",
  },
} as const;

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
  checkInTime,
  checkOutTime,
  checkInMethod,
  houseRules,
  cancellationPolicy,
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

  const policy = cancellationPolicy
    ? CANCELLATION[cancellationPolicy as keyof typeof CANCELLATION]
    : undefined;
  const cancellation: Row[] = [
    {
      text: policy
        ? isAr ? policy.ar : policy.en
        : isAr ? "إلغاء مجاني قبل تسجيل الوصول." : "Free cancellation before check-in.",
    },
    {
      text: isAr
        ? "راجع سياسة الإلغاء الكاملة الخاصة بالمضيف للتفاصيل."
        : "Review this host's full policy for details.",
    },
  ];

  // House rules, from the listing. A row appears only when the host (or the
  // import that stands in for them) actually stated it — an unset boolean is
  // silence, not a "no", so it is not rendered as one.
  const rules: Row[] = [];
  if (checkInTime) {
    rules.push({ text: isAr ? `تسجيل الوصول بعد ${checkInTime}` : `Check-in after ${checkInTime}` });
  } else {
    rules.push({ text: isAr ? "تسجيل وصول مرن" : "Flexible check-in" });
  }
  if (checkOutTime) {
    rules.push({ text: isAr ? `تسجيل المغادرة قبل ${checkOutTime}` : `Checkout before ${checkOutTime}` });
  }
  if (checkInMethod) {
    const method = CHECK_IN_METHOD[checkInMethod as keyof typeof CHECK_IN_METHOD];
    if (method) rules.push({ text: isAr ? method.ar : method.en });
  }
  if (typeof maxGuests === "number") {
    rules.push({ text: isAr ? `الحد الأقصى ${maxGuests} ضيوف` : `${maxGuests} guests maximum` });
  }

  // `Listing.isPetsAllowed` is the column the search filters use; the
  // houseRules JSON is what the host set in the editor. Prefer the explicit
  // rule and fall back to the column, so the two can never contradict on screen.
  const petsRule = houseRules?.petsAllowed ?? petsAllowed;
  rules.push({
    text: petsRule
      ? isAr ? "يُسمح بالحيوانات الأليفة" : "Pets allowed"
      : isAr ? "غير مسموح بالحيوانات الأليفة" : "No pets",
  });

  if (houseRules?.eventsAllowed !== undefined) {
    rules.push({
      text: houseRules.eventsAllowed
        ? isAr ? "يُسمح بالحفلات والمناسبات" : "Parties and events allowed"
        : isAr ? "غير مسموح بالحفلات أو المناسبات" : "No parties or events",
    });
  }
  if (houseRules?.smokingAllowed !== undefined) {
    rules.push({
      text: houseRules.smokingAllowed
        ? isAr ? "يُسمح بالتدخين" : "Smoking allowed"
        : isAr ? "ممنوع التدخين" : "No smoking",
    });
  }
  if (houseRules?.commercialPhotographyAllowed !== undefined) {
    rules.push({
      text: houseRules.commercialPhotographyAllowed
        ? isAr ? "يُسمح بالتصوير التجاري" : "Commercial photography allowed"
        : isAr ? "ممنوع التصوير التجاري" : "No commercial photography",
    });
  }
  if (houseRules?.quietHoursEnabled && houseRules.quietHoursStart && houseRules.quietHoursEnd) {
    rules.push({
      text: isAr
        ? `ساعات الهدوء من ${houseRules.quietHoursStart} حتى ${houseRules.quietHoursEnd}`
        : `Quiet hours ${houseRules.quietHoursStart} - ${houseRules.quietHoursEnd}`,
    });
  }
  // The host's own wording, in whatever language they wrote it — this one row
  // is not translated, because it is theirs. Only the first line, since this
  // section collapses to a few rows on mobile.
  const firstExtraRule = houseRules?.additionalRules?.trim().split("\n")[0]?.trim();
  if (firstExtraRule) rules.push({ text: firstExtraRule });

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
          rows={rules}
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
