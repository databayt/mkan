"use client";

import { useState } from "react";
import { useLocale } from "@/components/internationalization/use-locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Mobile "Report this listing" — the closing REPORT_TO_AIRBNB row of the Airbnb
 * room PDP plus the flow the link opens, cloned from the live room 40938334
 * (`.clone/airbnb-report-flow/`). The link renders left-aligned with a flag
 * glyph + underlined label (`sections/17-REPORT_TO_AIRBNB.html`); tapping it
 * opens a full-bleed bottom sheet (mkan's mobile-dialog pattern — see
 * price-transparency-dialog) that steps through the reason menu → a free-text
 * detail step → a confirmation, mirroring Airbnb's modal:
 *
 *   1. "Why are you reporting this listing?"  (5 radio reasons)
 *   2. "Describe how it's <reason>"           (textarea)
 *   3. "We got your report"                   (confirmation)
 *
 * Bilingual inline (this area's idiom — none of this copy has dictionary keys;
 * see mobile-things-to-know). Client-only for now: the report isn't persisted,
 * matching Airbnb's visible behaviour — a real moderation queue is a follow-up.
 */

type Step = "reason" | "detail" | "done";

interface Reason {
  id: string;
  label: { en: string; ar: string };
  detailHeading: { en: string; ar: string };
  placeholder: { en: string; ar: string };
}

// Reason 1's heading + placeholder are the exact live strings; the other four
// follow the same "describe how / tell us more" pattern Airbnb uses.
const REASONS: Reason[] = [
  {
    id: "inaccurate",
    label: { en: "It’s inaccurate or incorrect", ar: "غير دقيق أو غير صحيح" },
    detailHeading: {
      en: "Describe how it’s inaccurate or incorrect",
      ar: "صِف كيف أنه غير دقيق أو غير صحيح",
    },
    placeholder: {
      en: "Ex: This listing says it’s an entire home but it’s actually a private room.",
      ar: "مثال: يقول الإعلان إنه منزل كامل لكنه في الواقع غرفة خاصة.",
    },
  },
  {
    id: "not_real",
    label: { en: "It’s not a real place to stay", ar: "ليس مكان إقامة حقيقي" },
    detailHeading: {
      en: "Tell us why it’s not a real place to stay",
      ar: "أخبِرنا لماذا ليس مكان إقامة حقيقي",
    },
    placeholder: {
      en: "Ex: The photos look fake or copied from another listing.",
      ar: "مثال: تبدو الصور مزيفة أو منسوخة من إعلان آخر.",
    },
  },
  {
    id: "scam",
    label: { en: "It’s a scam", ar: "إنه عملية احتيال" },
    detailHeading: {
      en: "Tell us why you think it’s a scam",
      ar: "أخبِرنا لماذا تعتقد أنها عملية احتيال",
    },
    placeholder: {
      en: "Ex: The host asked me to pay or communicate outside of the platform.",
      ar: "مثال: طلب مني المضيف الدفع أو التواصل خارج المنصة.",
    },
  },
  {
    id: "offensive",
    label: { en: "It’s offensive", ar: "محتوى مسيء" },
    detailHeading: { en: "Tell us what’s offensive", ar: "أخبِرنا ما هو المسيء" },
    placeholder: {
      en: "Ex: The listing title or description contains offensive language.",
      ar: "مثال: عنوان الإعلان أو وصفه يحتوي على لغة مسيئة.",
    },
  },
  {
    id: "something_else",
    label: { en: "It’s something else", ar: "شيء آخر" },
    detailHeading: { en: "Tell us more", ar: "أخبِرنا المزيد" },
    placeholder: {
      en: "Provide as many details as you can.",
      ar: "قدّم أكبر قدر ممكن من التفاصيل.",
    },
  },
];

// Airbnb's REPORT_TO_AIRBNB flag glyph (exact path from the captured section).
function FlagIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      style={{ display: "block", height: 16, width: 16, fill: "currentColor" }}
    >
      <path d="m7.5011 1c.5272 0 .9591.40794.99725.92537l.00275.07463v1h5.5c.31265 0 .5435.281645.4935.581075l-.01275.056285-.96125 3.36264.96125 3.36265c.08055.2818-.0967.5625-.36775.62465l-.0554.00945-.0576.00325h-5.5c-.5272 0-.9591-.40795-.99725-.92535l-.00275-.07465v-1h-5v6h-1v-14zm1 3h-1v4h1z" />
    </svg>
  );
}

export default function MobileReportListing({
  listingId,
}: {
  listingId?: number;
}) {
  void listingId; // reserved for a future moderation-queue action
  const { locale } = useLocale();
  const ar = locale === "ar";
  const t = (en: string, arText: string) => (ar ? arText : en);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("reason");
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [details, setDetails] = useState("");

  const reason = REASONS.find((r) => r.id === reasonId) ?? null;

  const close = () => {
    setOpen(false);
    // Reset after the sheet has animated out so the user doesn't see it flip
    // back to step 1 mid-close.
    window.setTimeout(() => {
      setStep("reason");
      setReasonId(null);
      setDetails("");
    }, 250);
  };

  return (
    <>
      {/* REPORT_TO_AIRBNB row — a hairline rule off the carousel above it (ref:
          border-top #DDDDDD over the report section), then the flag + underlined
          label. Aligned to the px-4 mobile inset like the other PDP sections; the
          tail below is trimmed since the fixed reserve bar already adds clearance. */}
      <div className="md:hidden relative px-6 pb-4 pt-6 before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-[#DDDDDD] before:content-['']">
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="report-listing-button"
          className="flex items-center gap-3 text-base font-semibold text-[#222222] underline underline-offset-[3px]"
        >
          <FlagIcon />
          {t("Report this listing", "الإبلاغ عن هذا الإعلان")}
        </button>
      </div>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent
          showCloseButton={false}
          // Mobile: full-bleed bottom sheet (rounded top only, flush to edges,
          // Airbnb's 0 8px 28px/.28 shadow). sm+: centered 568px card — the live
          // report modal's width. Mirrors price-transparency-dialog's override.
          className="flex max-h-[90vh] flex-col gap-0 border-0 bg-white p-0 shadow-[0_8px_28px_rgba(0,0,0,0.28)] top-auto bottom-0 start-0 end-0 w-full max-w-none translate-x-0 rtl:translate-x-0 translate-y-0 rounded-t-[32px] rounded-b-none sm:top-[50%] sm:bottom-auto sm:start-[50%] sm:end-auto sm:h-auto sm:max-h-[85vh] sm:w-[calc(100%-2rem)] sm:max-w-[568px] sm:translate-x-[-50%] sm:rtl:-translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-[32px] sm:rounded-b-[32px]"
        >
          {/* Close — top-start, matching the live report modal (X sits left) */}
          <button
            type="button"
            aria-label={t("Close", "إغلاق")}
            onClick={close}
            className="absolute start-4 top-4 z-10 grid size-8 place-items-center rounded-full text-[#222222] transition-colors hover:bg-black/5"
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

          {step === "reason" && (
            <>
              <div className="flex-1 overflow-y-auto px-6 pb-4 pt-16">
                <DialogTitle className="text-[22px] font-semibold leading-[28px] tracking-[-0.44px] text-[#222222]">
                  {t(
                    "Why are you reporting this listing?",
                    "لماذا تُبلّغ عن هذا الإعلان؟"
                  )}
                </DialogTitle>
                <DialogDescription className="mt-1.5 text-sm text-[#6a6a6a]">
                  {t(
                    "This won’t be shared with the Host.",
                    "لن تتم مشاركة هذا مع المضيف."
                  )}
                </DialogDescription>

                <div className="mt-4 divide-y divide-[#EBEBEB]">
                  {REASONS.map((r) => (
                    <label
                      key={r.id}
                      className="flex cursor-pointer items-center justify-between gap-4 py-[18px]"
                    >
                      <span className="text-base text-[#222222]">
                        {t(r.label.en, r.label.ar)}
                      </span>
                      <span className="relative grid size-5 shrink-0 place-items-center">
                        <input
                          type="radio"
                          name="report-reason"
                          value={r.id}
                          checked={reasonId === r.id}
                          onChange={() => setReasonId(r.id)}
                          className="peer sr-only"
                        />
                        <span className="size-5 rounded-full border border-[#b0b0b0] transition-colors peer-checked:border-[#222222] peer-checked:bg-[#222222]" />
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end border-t border-[#EBEBEB] px-6 py-4">
                <button
                  type="button"
                  disabled={!reasonId}
                  onClick={() => setStep("detail")}
                  className="h-12 rounded-xl px-6 text-base font-medium transition-colors disabled:bg-[#F2F2F2] disabled:text-[#C1C1C1] enabled:bg-[#222222] enabled:text-white enabled:active:scale-[0.98]"
                >
                  {t("Next", "التالي")}
                </button>
              </div>
            </>
          )}

          {step === "detail" && reason && (
            <>
              <div className="flex-1 overflow-y-auto px-6 pb-4 pt-16">
                <DialogTitle className="text-[22px] font-semibold leading-[28px] tracking-[-0.44px] text-[#222222]">
                  {t(reason.detailHeading.en, reason.detailHeading.ar)}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {t(
                    "Add details about your report.",
                    "أضِف تفاصيل حول بلاغك."
                  )}
                </DialogDescription>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder={t(reason.placeholder.en, reason.placeholder.ar)}
                  rows={4}
                  className="mt-5 w-full resize-none rounded-xl border border-[#222222] p-4 text-base text-[#222222] placeholder:text-[#6a6a6a] focus:outline-none focus:ring-1 focus:ring-[#222222]"
                />
              </div>

              <div className="flex items-center justify-between border-t border-[#EBEBEB] px-6 py-4">
                <button
                  type="button"
                  onClick={() => setStep("reason")}
                  className="text-base font-semibold text-[#222222] underline underline-offset-[3px]"
                >
                  {t("Back", "رجوع")}
                </button>
                <button
                  type="button"
                  disabled={!details.trim()}
                  onClick={() => setStep("done")}
                  className="h-12 rounded-xl px-6 text-base font-medium transition-colors disabled:bg-[#F2F2F2] disabled:text-[#C1C1C1] enabled:bg-[#222222] enabled:text-white enabled:active:scale-[0.98]"
                >
                  {t("Next", "التالي")}
                </button>
              </div>
            </>
          )}

          {step === "done" && (
            <div className="flex flex-1 flex-col px-6 pb-6 pt-16">
              <DialogTitle className="text-[22px] font-semibold leading-[28px] tracking-[-0.44px] text-[#222222]">
                {t("We got your report", "لقد تلقّينا بلاغك")}
              </DialogTitle>
              <DialogDescription className="mt-2 text-base leading-[22px] text-[#6a6a6a]">
                {t(
                  "Thanks for letting us know. Our team will review this listing.",
                  "شكرًا لإخبارنا. سيراجع فريقنا هذا الإعلان."
                )}
              </DialogDescription>
              <button
                type="button"
                onClick={close}
                className="mt-8 h-12 w-full rounded-xl bg-[#222222] text-base font-medium text-white transition-transform active:scale-[0.98]"
              >
                {t("Done", "تم")}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
