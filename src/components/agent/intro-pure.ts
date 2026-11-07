/**
 * Direct intros (Abdout, 2026-11-07): until 10 deals are paid, a broker's yes for a WhatsApp tenant
 * becomes an introduction — the broker agrees Mkan's terms (10% of their commission when the tenant
 * signs, and the viewing free for Mkan's tenants), then tenant and broker get each other's number.
 * From the 10th paid deal on, Mkan stays in the middle (deal.ts: deal sheet, a person books).
 *
 * After an intro Mkan follows up so the share is not lost: the tenant at 24 h ("did you see it?") and
 * at 7 days ("did you take it?" + 1–5 for Mkan), the broker at 7 days ("did they sign?" + 1–5 for the
 * tenant). Pure, so the tests read exactly what goes out and how each answer is read.
 */
import type { DealLang } from "./deal-pure";

/** Intros last until this many deals are paid. */
export const INTRO_CAP = 10;

/** What a broker agrees to before getting a tenant's number. */
export const MKAN_TERMS = { pct: 0.1, freeViewing: true } as const;

export type ConnectionMode = "intro" | "relay";

export function connectionMode(paidDeals: number, cap = INTRO_CAP): ConnectionMode {
  return paidDeals < cap ? "intro" : "relay";
}

/** A broker's answer to the terms ask is still read this long after it went out. */
export const TERMS_ASK_TTL_MS = 72 * 3_600_000;
/** With no answer to the terms in this long, the tenant goes the usual way (deal sheet, a person). */
export const TERMS_WAIT_MS = 24 * 3_600_000;
/** A follow-up's answer is read for this long. */
export const FOLLOW_UP_TTL_MS = 72 * 3_600_000;

export type FollowUpMark = "tenant-24h" | "tenant-7d" | "broker-7d";

/** Which follow-ups are due for an intro made at `introducedAt` (each goes once). */
export function dueFollowUps(introducedAt: Date, sent: string[], now: Date): FollowUpMark[] {
  const age = now.getTime() - introducedAt.getTime();
  const due: FollowUpMark[] = [];
  const has = (m: FollowUpMark) => sent.some((s) => s === m || s.startsWith(`${m}:`));
  if (age >= 24 * 3_600_000 && age < 6 * 86_400_000 && !has("tenant-24h")) due.push("tenant-24h");
  if (age >= 7 * 86_400_000 && age < 21 * 86_400_000) {
    if (!has("tenant-7d")) due.push("tenant-7d");
    if (!has("broker-7d")) due.push("broker-7d");
  }
  return due;
}

const pct = (p: number) => `${Math.round(p * 1000) / 10}%`;

/** To the broker, after their yes: Mkan's terms, and their YES to get the tenant's number. */
export function termsAskMessage(v: { ref: string; title: string; tenants: number }): string {
  const who = v.tenants > 1 ? `${v.tenants} tenants want` : "A tenant wants";
  return (
    `Thank you! ${who} to see ${v.title} (${v.ref}). Mkan's terms: ${pct(MKAN_TERMS.pct)} of your commission when they sign the lease, ` +
    `and the viewing is free for Mkan's tenants. Reply YES to agree and we'll send you their WhatsApp number now. Murakoze!`
  );
}

/** To the tenant while the broker agrees the terms. */
export function introPendingMessage(lang: DealLang, title: string): string {
  if (lang === "ar") return `خبر جيد: ${title} متاح! نطلب الآن من الوسيط التواصل معك، وسنرسل لك رقمه هنا قريبًا.`;
  if (lang === "rw") return `Inkuru nziza: ${title} iracyahari! Turimo gusaba umukomisiyoneri kukuvugisha, turaguha nimero ye hano vuba.`;
  return `Good news: ${title} is still free! We're asking the broker to connect with you now — you'll get their number here shortly.`;
}

/** To the tenant: the broker's name and WhatsApp. */
export function introTenantMessage(lang: DealLang, v: { title: string; ref: string; broker: string; phone: string }): string {
  if (lang === "ar")
    return `${v.broker} سيُريك ${v.title} (${v.ref}). راسله على واتساب: ${v.phone} — وقل له إن مكان أرسلك. المعاينة مجانية. أخبرنا هنا كيف سارت الأمور.`;
  if (lang === "rw")
    return `${v.broker} azakwereka ${v.title} (${v.ref}). Mwandikire kuri WhatsApp: ${v.phone} — umubwire ko Mkan ari yo yakohereje. Gusura ni ubuntu. Utubwire hano uko byagenze.`;
  return `${v.broker} will show you ${v.title} (${v.ref}). WhatsApp them: ${v.phone} — say Mkan sent you. The viewing is free. Tell us here how it goes.`;
}

/** To the broker, once they agreed: the tenant's number, and how to tell Mkan they signed. */
export function introBrokerMessage(v: { ref: string; title: string; tenants: string[] }): string {
  const list = v.tenants.join(", ");
  return (
    `Thank you, agreed. ${v.tenants.length > 1 ? "The tenants" : "The tenant"} for ${v.title} (${v.ref}): ${list} on WhatsApp — they'll message you, or write to them first. ` +
    `When they sign the lease, reply SIGNED and we'll send Mkan's share request. Murakoze!`
  );
}

export function followUpTenantMessage(lang: DealLang, mark: "tenant-24h" | "tenant-7d", title: string): string {
  if (mark === "tenant-24h") {
    if (lang === "ar") return `هل رأيت ${title}؟ ردّ بـ 1 نعم · 2 ليس بعد · 3 لا يناسبني.`;
    if (lang === "rw") return `Wabonye ${title}? Subiza 1 yego · 2 si ubu · 3 ntibimbereye.`;
    return `Did you get to see ${title}? Reply 1 yes · 2 not yet · 3 not for me.`;
  }
  if (lang === "ar") return `هل استأجرت ${title}؟ ردّ بنعم أو لا. وكيف كانت مساعدة مكان، من 1 إلى 5؟`;
  if (lang === "rw") return `Wafashe ${title}? Subiza yego cyangwa oya. Kandi Mkan yagufashije ite, kuva kuri 1 kugeza kuri 5?`;
  return `Did you take ${title}? Reply YES or NO. And how did Mkan do, from 1 to 5?`;
}

export function followUpBrokerMessage(v: { ref: string; title: string; tenant: string }): string {
  return `Hello! Did the tenant Mkan sent you (${v.tenant}) sign for ${v.title} (${v.ref})? Reply SIGNED, NOT YET or NO — and how good a fit were they, from 1 to 5? Murakoze!`;
}

// ── reading the answers ───────────────────────────────────────────────────

const words = (text: string) => ` ${text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim()} `;

/** The broker's answer to the terms: yes (agree), no, or null (a person reads it). */
export function readTermsReply(text: string): "yes" | "no" | null {
  const w = words(text);
  if (/ (no|oya|not|refuse|never|nope|non|hapana) /.test(w) && !/ not yet /.test(w)) return "no";
  if (/ (yes|yeah|yep|ok|okay|agree|agreed|deal|sure|fine|yego|ego|sawa|nibyo|ndabyemera|oui|d accord|1) /.test(w) || /👍|✅/.test(text)) return "yes";
  return null;
}

export type IntroOutcome = "viewed" | "wait" | "signed" | "lost";

/** The tenant's answer to a follow-up. 24 h: 1 seen · 2 not yet · 3 not for me; 7 days: yes (took it) / no. */
export function readTenantFollowUp(text: string, mark: "tenant-24h" | "tenant-7d"): IntroOutcome | null {
  const w = words(text);
  if (mark === "tenant-24h") {
    if (/^ 1 /.test(w) || / (yes|yego|saw it|seen|i saw|نعم|رأيته) /.test(w)) return "viewed";
    if (/^ 2 /.test(w) || / (not yet|si ubu|ليس بعد|later) /.test(w)) return "wait";
    if (/^ 3 /.test(w) || / (not for me|no|oya|ntibimbereye|لا) /.test(w)) return "lost";
    return null;
  }
  if (/ (no|oya|not|لا) /.test(w) && !/ not yet /.test(w)) return "lost";
  if (/ (yes|yego|took|taken|signed|نعم|استأجرت) /.test(w)) return "signed";
  return null;
}

/** The broker's answer to "did they sign?". */
export function readBrokerFollowUp(text: string): IntroOutcome | null {
  const w = words(text);
  if (/ (signed|yes|yego|done|paid) /.test(w) && !/ not /.test(w)) return "signed";
  if (/ (not yet|si ubu|soon|later|still) /.test(w)) return "wait";
  if (/ (no|oya|lost|cancel|cancelled) /.test(w)) return "lost";
  return null;
}

/**
 * A 1–5 rating in a short answer ("5", "4/5", "yes, 5", "⭐⭐⭐⭐"). A lone 1 or 2 also answers the
 * 24 h question, so ratings are read only from the 7-day answers.
 */
export function readRating(text: string): number | null {
  const stars = (text.match(/⭐/g) ?? []).length;
  if (stars >= 1 && stars <= 5) return stars;
  const m = /(?:^|[^\d])([1-5])(?:\s*\/\s*5)?(?!\d)/.exec(text);
  return m ? Number(m[1]) : null;
}
