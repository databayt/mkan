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
import { awakeMs } from "./broker-rank";
import type { DealLang } from "./deal-pure";

/** Intros last until this many deals are paid. */
export const INTRO_CAP = 10;

/** What a broker agrees to before getting a tenant's number. */
export const MKAN_TERMS = { pct: 0.1, freeViewing: true } as const;

export type ConnectionMode = "intro" | "relay";

export function connectionMode(paidDeals: number, cap = INTRO_CAP): ConnectionMode {
  return paidDeals < cap ? "intro" : "relay";
}

/** A broker's answer to the terms ask is still read this long after it went out — after the hand-off too. */
export const TERMS_ASK_TTL_MS = 72 * 3_600_000;
/**
 * Daytime hours (08:00–20:00 Kigali, broker-rank.ts awakeMs) a broker gets to agree the terms
 * before the tenant goes the usual way: the deal sheet, a person books the viewing. Abdout,
 * 2026-11-08: 24 h → 2 daytime hours — no broker had agreed yet (0 of 15), and a tenant told
 * "the broker will connect with you shortly" should not wait a day. A yes at 19:30 hands off at 09:30.
 */
export const TERMS_WAIT_AWAKE_HOURS = 2;
/** Has the broker had their daytime hours to agree the terms asked at `askAt`? */
export const termsHandOffDue = (askAt: Date, now: Date): boolean => awakeMs(askAt, now) >= TERMS_WAIT_AWAKE_HOURS * 3_600_000;
/** A follow-up's answer is read for this long. */
export const FOLLOW_UP_TTL_MS = 72 * 3_600_000;

/** "tenant-48h" is the second try: the 24 h question, asked again once, when nobody answered it. */
export type TenantMark = "tenant-24h" | "tenant-48h" | "tenant-7d";
export type FollowUpMark = TenantMark | "broker-7d";

/** Which follow-ups are due for an intro made at `introducedAt` (each goes once). */
export function dueFollowUps(introducedAt: Date, sent: string[], now: Date): FollowUpMark[] {
  const age = now.getTime() - introducedAt.getTime();
  const due: FollowUpMark[] = [];
  const has = (m: FollowUpMark) => sent.some((s) => s === m || s.startsWith(`${m}:`));
  if (age >= 24 * 3_600_000 && age < 6 * 86_400_000 && !has("tenant-24h")) due.push("tenant-24h");
  // Second try (2026-11-09): the 24 h question went, 24 h later nothing came back — ask once more.
  // An answer (even "not yet") marks `tenant-24h:answered`, so only silence is asked again.
  if (age >= 48 * 3_600_000 && age < 6 * 86_400_000 && sent.includes("tenant-24h") && !sent.includes("tenant-24h:answered") && !has("tenant-48h")) due.push("tenant-48h");
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

/**
 * To the tenant while the broker agrees the terms. `askedOn` (deal-pure.ts askedOnLabel): the yes
 * came a day or more after they last wrote — name the day, and ask whether they're still looking.
 */
export function introPendingMessage(lang: DealLang, title: string, askedOn: string | null = null): string {
  if (askedOn) {
    if (lang === "ar") return `سألت عن ${title} يوم ${askedOn}: خبر جيد، ما زال متاحاً! إن كنت ما زلت تبحث، نطلب الآن من الوسيط التواصل معك، وسنرسل لك رقمه هنا قريبًا.`;
    if (lang === "rw") return `Wabajije ibya ${title} ku itariki ya ${askedOn}: inkuru nziza, iracyahari! Niba ugishaka inzu, turimo gusaba umukomisiyoneri kukuvugisha, turaguha nimero ye hano vuba.`;
    return `You asked about ${title} on ${askedOn}: good news, it's still free! If you're still looking, we're asking the broker to connect with you now — you'll get their number here shortly.`;
  }
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

export function followUpTenantMessage(lang: DealLang, mark: TenantMark, title: string): string {
  if (mark === "tenant-48h") {
    if (lang === "ar") return `ما زلنا نسأل عن ${title}: هل رأيته؟ ردّ بـ 1 نعم · 2 ليس بعد · 3 لا يناسبني. إن لم يعد يهمّك، ردّ 3 ولن نسألك مجدداً.`;
    if (lang === "rw") return `Turacyabaza kuri ${title}: wayibonye? Subiza 1 yego · 2 si ubu · 3 ntibimbereye. Niba utacyayishaka, subiza 3 ntituzongera kukubaza.`;
    return `Checking in once more on ${title}: did you get to see it? Reply 1 yes · 2 not yet · 3 not for me. If you've moved on, reply 3 and we won't ask again.`;
  }
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

/**
 * Lower-cased words only: Arabic marks (tashkeel) dropped so "وقّع" stays one word, Arabic-Indic digits
 * made ASCII ("١" answers like "1"), and "didn't" / "haven't" read as "did not" / "have not".
 */
const words = (text: string) =>
  ` ${text
    .toLowerCase()
    .replace(/\p{M}/gu, "")
    .replace(/[٠-٩]/g, (ch) => String(ch.charCodeAt(0) - 0x0660))
    .replace(/n['’]t\b/g, " not")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()} `;

/** Words that agree, in English, Kinyarwanda, French, Arabic and Swahili (Kigali brokers write all of them). */
const YES_WORDS =
  /\b(?:yes|yeah|yep|yup|yea|ok|okay|okey|agree|agreed|accept|accepted|deal|sure|fine|alright|absolutely|certainly|yego|ego|sawa|nibyo|ndabyemera|ndabyemeye|turabyemera|twemeranyije|byemewe|byiza|ni byiza|oui|d accord|daccord|ndiyo|1)\b/u;
/** "No problem" is a yes; so is "nta kibazo" and "not a problem". Checked before any "no" is read. */
const NO_PROBLEM = / (?:no (?:problem|worries|worry|issue)|not a problem|nta kibazo|ntakibazo|pas de probl[eè]me|hakuna shida) /u;
const NO_WORDS = / (?:no|oya|not|refuse|refused|never|nope|non|hapana|reject|decline|declined|disagree) /u;

/** The broker's answer to the terms: yes (agree), no, or null (a person reads it). */
export function readTermsReply(text: string): "yes" | "no" | null {
  const w = words(text);
  const raw = text.toLowerCase();
  // A different number ("yes but 5%", "ok 7 percent") is a counter-offer, not an agreement: a person reads it.
  const pcts = [...raw.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:%|percent|pct|ku ijana)/g)].map((m) => Number(m[1]!.replace(",", ".")));
  if (pcts.some((p) => p !== MKAN_TERMS.pct * 100)) return null;
  if (/ (?:but|however|except|unless|instead|discount|negotiate|reduce|lower|less|half) /.test(w) && !NO_PROBLEM.test(w)) return null;
  if (NO_PROBLEM.test(w)) return "yes";
  if (NO_WORDS.test(w) && !/ not yet /.test(w)) return "no";
  if (YES_WORDS.test(w) || /👍|✅|🙏|نعم|موافق|تمام|حسنا|حسناً/u.test(text)) return "yes";
  return null;
}

export type IntroOutcome = "viewed" | "wait" | "signed" | "lost";

// Words, per language. Each is a whole word or phrase between spaces (see `words`); a negation is read
// before the thing it negates, so "did not sign" is never "sign" and "I signed, no problem" is never "no".
const ANY_NO = / (?:no|oya|non|لا|ntabwo|hapana) /;
const NOT_FOR_ME = / (?:not for me|not interested|did not like|do not want|did not take|do not like|found another|ntibimbereye|ntabwo binkwiye|ntabwo nyishaka|ntayifashe|sinkeneye|pas pour moi|لا يناسبني|لا تناسبني|ما ناسبني|ما عجبني) /;
const NOT_YET = / (?:not yet|not seen|have not seen|did not see|have not been|did not go|have not visited|later|tomorrow|si ubu|ntiragera|ntarayibona|sindayibona|ntabwo ndayibona|ntabwo ndayisura|ntirarabaho|ليس بعد|لم أره|لم اره|لم أذهب|لم اذهب|لاحقا|بكرة|غدا|pas encore|demain) /;
const SAW_IT = / (?:yes|yeah|yep|yego|ego|saw it|seen it|seen|i saw|saw|visited|went|narayibonye|nayibonye|narayisuye|nayisuye|oui|vu|visité|visite|نعم|رأيته|رأيتها|شفته|شفتها|زرته|زرتها|ايوه|أيوه) /;
const NOT_SIGNED = / (?:did not|have not|has not|had not|do not|does not|not paid|not done|not rented|not signed|not sign|did not sign|have not signed|not taken|ntarasinya|ntiyasinya|ntibarasinya|ntabwo nasinye|ntabwo twasinye|لم أوقع|لم اوقع|لم يوقع|لم يوقعوا|لم نوقع|pas signé|pas signe) /;
const SIGNED = / (?:signed|sign|took|taken|take it|rented|done|paid|yes|yego|ego|nasinye|narasinye|twasinye|twarasinye|nayifashe|narayifashe|basinye|yasinye|basinyiye|yasinyiye|asinye|basinyishije|bashyize umukono|oui|signé|signe|loué|نعم|وقعت|وقعنا|وقع|وقعوا|تم التوقيع|استأجرت|استأجرنا|استأجر|ايوه|أيوه) /;
const WAITING = / (?:not yet|still|soon|later|thinking|tomorrow|si ubu|ntibaragera|bataragera|ntiraraba|ليس بعد|لاحقا|قريبا|pas encore|bientôt|bientot) /;

/** A tenant's "I signed" said on its own, any time: for the tenant's 24 h answer and for deals with no follow-up open. */
export const saysSigned = (text: string): boolean => {
  const w = words(text);
  return SIGNED.test(w) && !NOT_SIGNED.test(w) && !NOT_FOR_ME.test(w) && !NOT_YET.test(w) && / (?:signed|sign|nasinye|narasinye|twasinye|basinye|yasinye|basinyiye|yasinyiye|asinye|وقعت|وقعنا|وقع|وقعوا|signé|signe) /.test(w);
};

/**
 * The tenant's answer to a follow-up. 24 h (and its second try): 1 seen · 2 not yet · 3 not for me;
 * 7 days: yes (took it) / not yet / no. A "signed" counts at either, said unprompted.
 */
export function readTenantFollowUp(text: string, mark: TenantMark): IntroOutcome | null {
  const w = words(text);
  if (mark !== "tenant-7d") {
    if (/^ 3 /.test(w) || NOT_FOR_ME.test(w)) return "lost";
    if (saysSigned(text)) return "signed";
    if (/^ 2 /.test(w) || NOT_YET.test(w)) return "wait";
    if (/^ 1 /.test(w) || SAW_IT.test(w)) return "viewed";
    if (ANY_NO.test(w)) return "lost";
    return null;
  }
  if (NOT_FOR_ME.test(w)) return "lost";
  if (NOT_SIGNED.test(w) || NOT_YET.test(w) || WAITING.test(w)) return ANY_NO.test(w) && !NOT_YET.test(w) && !WAITING.test(w) ? "lost" : "wait";
  if (SIGNED.test(w)) return "signed";
  if (ANY_NO.test(w)) return "lost";
  return null;
}

/** The broker's answer to "did they sign?". */
export function readBrokerFollowUp(text: string): IntroOutcome | null {
  const w = words(text);
  // "Not yet" is a wait even with a "no" beside it ("no, not yet"); "did not sign" with a "no" is a no.
  if (NOT_YET.test(w) || WAITING.test(w)) return "wait";
  if (NOT_SIGNED.test(w)) return ANY_NO.test(w) ? "lost" : "wait";
  if (/ (?:lost|cancel|cancelled|canceled|declined|refused|ntibakiriye|ntibabishatse|ألغي|ملغي) /.test(w)) return "lost";
  if (SIGNED.test(w)) return "signed";
  if (ANY_NO.test(w)) return "lost";
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

// ── a held intro: what the sweep does with a terms ask or a tenant number that did not go out ──────

/** A phone as the public may see it: its last three digits. */
export const lastDigits = (phone: string) => `…${phone.replace(/\D/g, "").slice(-3)}`;

/** A reply that rides on the broker's own message is given this long to be sent before the sweep steps in. */
export const RIDE_GRACE_MS = 10 * 60_000;
/** The same message is queued again this many times at most (an outbox that SKIPPED or FAILED it). */
export const MAX_QUEUE_TRIES = 3;

export type SendRow = { status: "QUEUED" | "SENT" | "FAILED" | "SKIPPED" };
export type SendDecision =
  /** Nothing to do now: still inside the grace, in flight, or already delivered. */
  | { do: "wait"; why: "grace" | "in-flight" | "delivered" | "window" }
  /** Queue it through the outbox now. */
  | { do: "queue"; retry: boolean }
  /** Sends are off: a #mkan card names who is waiting; nothing is queued (the outbox would SKIP it unseen). */
  | { do: "hold"; why: "sends-off" | "tries-used" };

/**
 * A message the line owes a broker (the terms ask; the tenant's number after their YES). `rows` are
 * the outbox rows written for it since the ask began. Decided from what actually happened — a row
 * the outbox SKIPPED (sends off, a quiet night, a stale one) is not "replied": the old `replied`
 * flag stayed true after a held reply and the ask was never sent (2026-11-07).
 */
export function decideSend(i: { ageMs: number; rows: SendRow[]; sendsOn: boolean; inWindow: boolean; ride: boolean }): SendDecision {
  if (i.rows.some((r) => r.status === "SENT")) return { do: "wait", why: "delivered" };
  if (i.rows.some((r) => r.status === "QUEUED")) return { do: "wait", why: "in-flight" };
  // A reply riding on the broker's own message gets its minutes first; a form answer has none to ride on.
  if (i.ride && i.rows.length === 0 && i.ageMs < RIDE_GRACE_MS) return { do: "wait", why: "grace" };
  if (!i.sendsOn) return { do: "hold", why: "sends-off" };
  if (i.rows.length >= MAX_QUEUE_TRIES) return { do: "hold", why: "tries-used" };
  if (!i.inWindow) return { do: "wait", why: "window" };
  return { do: "queue", retry: i.rows.length > 0 };
}

/** The #mkan card for an intro that is waiting on Abdout. The tenants are named by their last three digits. */
export function heldIntroCard(v: { ref: string; title: string; broker: string; tenants: string[]; why: "sends-off" | "tries-used"; text: string; chatLink?: string }): string {
  const who = v.tenants.map(lastDigits).join(", ");
  const n = v.tenants.length;
  const why =
    v.why === "sends-off"
      ? "Broker sends are off, so the terms ask is held. Tap Yes on /monetize (\"Turn broker asks on\") or run `pnpm wa:brokers gated` — the hourly sweep then sends it by itself."
      : `The outbox dropped it ${MAX_QUEUE_TRIES} times. Send it by hand${v.chatLink ? `: ${v.chatLink}` : ""}.`;
  return (
    `⏸ *Intro held* ${v.ref} (${v.title}) — ${v.broker} said it's free; ${n} tenant${n === 1 ? "" : "s"} (${who}) wait${n === 1 ? "s" : ""} for their number.\n` +
    `${why}\n> ${v.text.slice(0, 300)}`
  );
}

/** A broker's YES to the *availability* ask is not an answer to an older terms ask: the newer question wins. */
export function termsReplyApplies(i: { askAt: Date; newestAvailabilityAskAt: Date | null; quotedTerms: boolean }): boolean {
  if (i.quotedTerms) return true;
  return !(i.newestAvailabilityAskAt && i.newestAvailabilityAskAt.getTime() > i.askAt.getTime());
}

/** The next quarter-hour tick of the intro sweep (cf/crons.json): :00 :15 :30 :45, 05:00–19:59 UTC (07:00–21:59 Kigali). */
export function nextSweepTick(from: Date): Date {
  const t = new Date(from.getTime());
  t.setUTCSeconds(0, 0);
  for (let i = 0; i < 24 * 4 + 1; i++) {
    t.setUTCMinutes(t.getUTCMinutes() + 1);
    const h = t.getUTCHours();
    if (t.getUTCMinutes() % 15 === 0 && (t.getUTCMinutes() === 0 || (h >= 5 && h <= 19))) return new Date(t.getTime());
  }
  return t;
}
