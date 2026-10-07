/**
 * Bilingual strings for the canonical Report Issue dialog.
 * Repos can override per-language by extending this map.
 */

import type { Locale } from "@/components/internationalization/config";

export type ReportLang = Locale;

export const REPORT_CATEGORY_LABELS = {
  en: {
    visual: "Visual / Layout",
    broken: "Broken / Not Working",
    data: "Wrong Data",
    slow: "Slow / Performance",
    confusing: "Confusing / UX",
    auth: "Sign in / Permissions",
    i18n: "Translation / Language",
    other: "Other",
  },
  ar: {
    visual: "مظهر / تخطيط",
    broken: "معطل / لا يعمل",
    data: "بيانات خاطئة",
    slow: "بطيء / أداء",
    confusing: "مربك / تجربة المستخدم",
    auth: "تسجيل الدخول / الصلاحيات",
    i18n: "ترجمة / لغة",
    other: "أخرى",
  },
  rw: {
    visual: "Isura / Imiterere",
    broken: "Ntikora / Yapfuye",
    data: "Amakuru atari yo",
    slow: "Biratinda / Imikorere",
    confusing: "Biravuna / Uburyo bwo gukoresha",
    auth: "Kwinjira / Uburenganzira",
    i18n: "Ubuhinduzi / Ururimi",
    other: "Ibindi",
  },
} as const;

export const REPORT_DICTIONARY = {
  en: {
    triggerText: "Report an issue",
    triggerAriaLabel: "Report an issue",
    title: "Report an issue",
    description:
      "Tell us what went wrong on this page. The page address and your browser details are attached automatically.",
    categoryPlaceholder: "Category",
    descriptionPlaceholder: "What went wrong on this page?",
    descriptionHint: "{count}/{min} characters",
    minHint: "A few more words — at least {min} characters.",
    readyHint: "Press ⌘↵ / Ctrl+↵ to send.",
    readyHintMobile: "Ready — tap send.",
    composerPlaceholder: "What went wrong?",
    send: "Send report",
    close: "Close",
    emptyState:
      "Describe what you saw. Short is fine — where it happened is attached.",
    addDetails: "Add steps and expected behavior (optional)",
    reproPlaceholder: "Steps to reproduce: 1. … 2. … 3. …",
    expectedPlaceholder: "What did you expect to happen?",
    actualPlaceholder: "What actually happened?",
    severityLabel: "Severity",
    severityLow: "Low — cosmetic",
    severityMedium: "Medium — noticeable",
    severityHigh: "High — blocks me",
    severityCritical: "Critical — data loss / outage",
    captchaHint: "Reports from signed-in users are processed faster.",
    captchaLink: "Sign in",
    submit: "Submit",
    submitting: "Submitting…",
    success: "Submitted. Thank you!",
    successWithId: "Submitted. Tracked as #{id}.",
    error: "Something went wrong. Try again.",
    cooldown: "Please wait a moment before submitting another report.",
    severityCritical_hint:
      "Reports flagged critical are escalated immediately.",
  },
  ar: {
    triggerText: "الإبلاغ عن مشكلة",
    triggerAriaLabel: "الإبلاغ عن مشكلة",
    title: "الإبلاغ عن مشكلة",
    description:
      "أخبرنا بما حدث في هذه الصفحة. يُرفق عنوان الصفحة وبيانات المتصفح تلقائياً.",
    categoryPlaceholder: "التصنيف",
    descriptionPlaceholder: "ما الذي حدث في هذه الصفحة؟",
    descriptionHint: "{count}/{min} حرف",
    minHint: "بضع كلمات إضافية — {min} حرفاً على الأقل.",
    readyHint: "اضغط ⌘↵ / Ctrl+↵ للإرسال.",
    readyHintMobile: "جاهز — اضغط إرسال.",
    composerPlaceholder: "ما الذي حدث؟",
    send: "إرسال البلاغ",
    close: "إغلاق",
    emptyState: "صف ما رأيته. الاختصار مقبول — مكان حدوثه مُرفق تلقائياً.",
    addDetails: "أضف الخطوات والسلوك المتوقع (اختياري)",
    reproPlaceholder: "خطوات إعادة الإنتاج: 1. … 2. … 3. …",
    expectedPlaceholder: "ما الذي توقعت حدوثه؟",
    actualPlaceholder: "ما الذي حدث فعلياً؟",
    severityLabel: "الخطورة",
    severityLow: "منخفضة — مظهر فقط",
    severityMedium: "متوسطة — ملحوظة",
    severityHigh: "عالية — تعيقني",
    severityCritical: "حرجة — فقدان بيانات / تعطل",
    captchaHint: "البلاغات من المستخدمين المسجلين تُعالج أسرع.",
    captchaLink: "تسجيل الدخول",
    submit: "إرسال",
    submitting: "جاري الإرسال…",
    success: "تم الإرسال. شكراً لك!",
    successWithId: "تم الإرسال. رقم البلاغ #{id}.",
    error: "حدث خطأ. حاول مرة أخرى.",
    cooldown: "يرجى الانتظار لحظة قبل إرسال بلاغ آخر.",
    severityCritical_hint: "البلاغات الحرجة تُصعّد فوراً.",
  },
  rw: {
    triggerText: "Menyesha ikibazo",
    triggerAriaLabel: "Menyesha ikibazo",
    title: "Menyesha ikibazo",
    description:
      "Tubwire ikitagenze neza kuri uru rupapuro. Aderesi y’urupapuro n’amakuru ya mushakisha yongerwaho mu buryo bwikora.",
    categoryPlaceholder: "Icyiciro",
    descriptionPlaceholder: "Ni iki kitagenze neza kuri uru rupapuro?",
    descriptionHint: "{count}/{min} inyuguti",
    minHint: "Andika amagambo make yiyongera — nibura inyuguti {min}.",
    readyHint: "Kanda ⌘↵ / Ctrl+↵ kugira ngo wohereze.",
    readyHintMobile: "Byiteguye — kanda wohereze.",
    composerPlaceholder: "Ni iki kitagenze neza?",
    send: "Ohereza raporo",
    close: "Funga",
    emptyState:
      "Sobanura ibyo wabonye. Gito biremewe — aho byabereye byongerwaho mu buryo bwikora.",
    addDetails: "Ongeraho intambwe n’ibyari byitezwe (si ngombwa)",
    reproPlaceholder: "Intambwe zo kongera kubibona: 1. … 2. … 3. …",
    expectedPlaceholder: "Wari witeze ko haba iki?",
    actualPlaceholder: "Ni iki cyabaye mu by’ukuri?",
    severityLabel: "Uburemere",
    severityLow: "Buke — isura gusa",
    severityMedium: "Buringaniye — bigaragara",
    severityHigh: "Bwinshi — birambuza gukora",
    severityCritical: "Bukabije — gutakaza amakuru / kwangirika",
    captchaHint: "Raporo z’abakoresha binjiye zitunganywa vuba.",
    captchaLink: "Injira",
    submit: "Ohereza",
    submitting: "Biroherezwa…",
    success: "Byoherejwe. Murakoze!",
    successWithId: "Byoherejwe. Nomero ya raporo ni #{id}.",
    error: "Habaye ikosa. Ongera ugerageze.",
    cooldown: "Nyamuneka tegereza akanya mbere yo kohereza indi raporo.",
    severityCritical_hint: "Raporo z’uburemere bukabije zihutishwa ako kanya.",
  },
} as const;

export type ReportDictKey = keyof (typeof REPORT_DICTIONARY)["en"];

/**
 * Widened to plain strings so a repo with a central dictionary (mkan) can pass
 * `strings={dict.reportIssue}` as a partial override without matching the
 * literal types of the defaults.
 */
export type ReportDict = Record<ReportDictKey, string>;
