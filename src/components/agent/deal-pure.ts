/**
 * The deal, in the words a tenant reads once a broker says a home is free —
 * available, what it costs to move in, what is still to confirm, what Mkan
 * covers, and what happens next — and the viewing times they answer with.
 * Pure, so the tests read exactly what goes out.
 *
 * The meeting is one visit at the home with three people: the tenant, the
 * broker, and the person from Mkan (MKAN_VIEWING_REP). If the tenant likes it,
 * the lease is written and signed there. Mkan pays the viewing fee from its
 * share of the broker's commission (Abdout, 2026-11-01), so the tenant never
 * pays to see a home. Every figure comes from the card's cost lines (cost.ts):
 * the ad's own terms when it stated them, Kigali's typical ones otherwise —
 * said as such, and confirmed at the viewing.
 */
import type { CostEstimate, CostLine } from "./cost";

export type DealLang = "en" | "ar" | "rw";

const rwf = (n: number) => `RWF ${Math.round(n).toLocaleString("en-US")}`;
const KIGALI_MS = 2 * 3_600_000;

export interface DealFacts {
  title: string;
  /** The code the tenant can quote ("K5808"). */
  ref: string;
  cost: CostEstimate | null;
  /** Who from Mkan comes to the viewing. */
  rep: string;
  link: string;
}

const line = (cost: CostEstimate | null, key: CostLine["key"]) => cost?.lines.find((l) => l.key === key);
const months = (q: number | undefined, lang: DealLang) => {
  const n = q ?? 0;
  if (lang === "ar") return n === 0.5 ? "نصف شهر" : n === 1 ? "شهر" : `${n} أشهر`;
  if (lang === "rw") return n === 0.5 ? "igice cy'ukwezi" : n === 1 ? "ukwezi kumwe" : `amezi ${n}`;
  return n === 0.5 ? "half a month" : n === 1 ? "1 month" : `${n} months`;
};

/** The sheet itself, in the tenant's language; ends by asking when they can come. */
export function dealSheetMessage(f: DealFacts, lang: DealLang): string {
  const c = f.cost;
  const rent = c?.headline ?? null;
  const advance = line(c, "rentInAdvance");
  const deposit = line(c, "deposit");
  const commission = line(c, "commission");
  const viewing = line(c, "viewingFee");
  const water = line(c, "water")?.status ?? "unknown";
  const power = line(c, "electricity")?.status ?? "unknown";
  const typical = [advance, deposit, commission].some((l) => l?.source === "typical");
  const total = c ? (c.totalHigh !== c.total ? `${rwf(c.total)}–${rwf(c.totalHigh)}` : rwf(c.total)) : null;
  // The viewing fee is Mkan's, never the tenant's: the move-in total leaves it out.
  const moveIn = c && viewing ? (c.totalHigh !== c.total ? `${rwf(c.total - viewing.amount)}–${rwf(c.totalHigh - viewing.amount)}` : rwf(c.total - viewing.amount)) : total;
  const pct = commission ? (commission.qtyHigh != null ? `${commission.qty}–${commission.qtyHigh}%` : `${commission.qty}%`) : null;

  if (lang === "ar") {
    const util = (s: string) => (s === "included" ? "ضمن الإيجار" : s === "separate" ? "على المستأجر" : "لم يذكرها الإعلان، سنسأل");
    return [
      `خبر جيد: يقول الوسيط إن «${f.title}» (${f.ref}) ما زال متاحاً.`,
      rent != null ? `الإيجار: ${rwf(rent)} في الشهر.` : null,
      moveIn ? `للانتقال: نحو ${moveIn}${advance ? ` — ${months(advance.qty, lang)} مقدماً` : ""}${deposit && deposit.qty ? ` و${months(deposit.qty, lang)} تأميناً` : ""}${typical ? " (المعتاد في كيغالي، يُؤكَّد في المعاينة)" : ""}.` : null,
      pct ? `عمولة الوسيط: ${pct} من إيجار شهر${commission?.source === "typical" ? " (المعتاد، تُؤكَّد في المعاينة)" : ""}.` : `لا عمولة وسيط.`,
      `المعاينة: مجانية لك، تدفعها مكان.`,
      `الماء: ${util(water)}. الكهرباء: ${util(power)}.`,
      `الخطوة التالية: نلتقي في المنزل، أنت والوسيط و${f.rep} من مكان. إن أعجبك نكتب العقد ونوقّعه في اليوم نفسه. أحضر هويتك.`,
      `متى يناسبك أن تراه؟ أرسل اليوم والوقت، مثل «غداً 10 صباحاً».`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (lang === "rw") {
    const util = (s: string) => (s === "included" ? "biri mu bukode" : s === "separate" ? "ubyishyura ukwawe" : "itangazo ntiribivuga, tuzabaza");
    return [
      `Inkuru nziza: komisiyoneri avuga ko "${f.title}" (${f.ref}) igihari.`,
      rent != null ? `Ubukode: ${rwf(rent)} ku kwezi.` : null,
      moveIn ? `Kwimukira: hafi ${moveIn}${advance ? ` — ${months(advance.qty, lang)} mbere` : ""}${deposit && deposit.qty ? ` na ${months(deposit.qty, lang)} y'ingwate` : ""}${typical ? " (nk'uko bisanzwe i Kigali, bizemezwa mu gusura)" : ""}.` : null,
      pct ? `Komisiyo ya komisiyoneri: ${pct} by'ukwezi kumwe${commission?.source === "typical" ? " (bisanzwe, bizemezwa mu gusura)" : ""}.` : `Nta komisiyo ya komisiyoneri.`,
      `Gusura: ni ubuntu kuri wowe, Mkan irabyishyura.`,
      `Amazi: ${util(water)}. Amashanyarazi: ${util(power)}.`,
      `Ibikurikira: duhurira ku nzu, wowe, komisiyoneri na ${f.rep} wo muri Mkan. Niba uyikunze, twandika amasezerano tukayasinya uwo munsi. Uzane indangamuntu.`,
      `Ni ryari wayisura? Ohereza umunsi n'isaha, nka "ejo saa yine".`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  const util = (s: string) => (s === "included" ? "included in the rent" : s === "separate" ? "paid by you" : "not in the ad, we'll ask");
  return [
    `Good news: the broker says "${f.title}" (${f.ref}) is still available.`,
    rent != null ? `Rent: ${rwf(rent)} a month.` : null,
    moveIn
      ? `To move in: about ${moveIn}${advance ? ` — ${months(advance.qty, lang)} up front` : ""}${deposit && deposit.qty ? ` + ${months(deposit.qty, lang)} deposit` : ""}${typical ? " (what's usual in Kigali, confirmed at the viewing)" : ""}.`
      : null,
    pct ? `Broker's commission: ${pct} of a month's rent${commission?.source === "typical" ? " (usual, confirmed at the viewing)" : ""}.` : `No broker's commission.`,
    `Viewing: free for you. Mkan covers it.`,
    `Water: ${util(water)}. Electricity: ${util(power)}.`,
    `Next: we meet at the house, you, the broker and ${f.rep} from Mkan. If you like it, we write and sign the lease the same day. Bring your ID.`,
    `When can you come to see it? Reply with a day and time, like "tomorrow 10am".`,
  ]
    .filter(Boolean)
    .join("\n");
}

const DAY_MS = 86_400_000;
/** Kigali wall-clock parts of a UTC instant. */
const kigali = (d: Date) => {
  const k = new Date(d.getTime() + KIGALI_MS);
  return { y: k.getUTCFullYear(), m: k.getUTCMonth(), d: k.getUTCDate(), wd: k.getUTCDay(), h: k.getUTCHours() };
};
/** The UTC instant of a Kigali wall-clock time. */
const atKigali = (y: number, m: number, d: number, h: number, min: number) => new Date(Date.UTC(y, m, d, h, min) - KIGALI_MS);

const WEEKDAYS: [RegExp, number][] = [
  [/\b(?:sun(?:day)?|ku cyumweru|الأحد|الاحد)\b/i, 0],
  [/\b(?:mon(?:day)?|kuwa mbere|الاثنين|الإثنين)\b/i, 1],
  [/\b(?:tue(?:s|sday)?|kuwa kabiri|الثلاثاء)\b/i, 2],
  [/\b(?:wed(?:nesday)?|kuwa gatatu|الأربعاء|الاربعاء)\b/i, 3],
  [/\b(?:thu(?:rs|rsday)?|kuwa kane|الخميس)\b/i, 4],
  [/\b(?:fri(?:day)?|kuwa gatanu|الجمعة)\b/i, 5],
  [/\b(?:sat(?:urday)?|kuwa gatandatu|السبت)\b/i, 6],
];

/** Kinyarwanda / Swahili count the hours from 06:00: "saa yine" (4) is 10:00. */
const SAA: Record<string, number> = { imwe: 1, moja: 1, kabiri: 2, mbili: 2, gatatu: 3, tatu: 3, yine: 4, nne: 4, tanu: 5, gatanu: 5, tano: 5, sita: 6, gatandatu: 6, saba: 7, karindwi: 7, munani: 8, nane: 8, cyenda: 9, tisa: 9, icumi: 10, kumi: 10 };

export type ViewingTime = { at: Date } | { day: Date; needTime: true };

/**
 * A viewing time in a tenant's words — "tomorrow 10am", "Tuesday at 3",
 * "today after 4pm", "ejo saa yine", "غداً 10 صباحاً" — as a Kigali time
 * between 07:00 and 19:00 that has not passed. A day with no time asks for one;
 * anything else is not a time (null).
 */
export function readViewingTime(text: string, now: Date): ViewingTime | null {
  const t = text.toLowerCase().replace(/[٠-٩]/g, (ch) => String(ch.charCodeAt(0) - 0x0660));
  const today = kigali(now);
  let offset: number | null = null;
  if (/\b(?:day after tomorrow|after tomorrow|ejobundi)\b|بعد بكرة|بعد غد/.test(t)) offset = 2;
  else if (/\b(?:tomorrow|tmrw|tomorow|tommorow|ejo|bukeye)\b|غدا|غداً|بكرة|بكره/.test(t)) offset = 1;
  else if (/\b(?:today|tonight|this (?:morning|afternoon|evening)|uyu munsi)\b|اليوم/.test(t)) offset = 0;
  else {
    for (const [re, wd] of WEEKDAYS) {
      if (re.test(t)) {
        offset = (wd - today.wd + 7) % 7;
        break;
      }
    }
  }

  let hour: number | null = null;
  let minute = 0;
  const saa = t.match(/\bsaa\s+(\d{1,2}|[a-z]+)\b/);
  const clock = t.match(/\b(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm|a\.m\.?|p\.m\.?)?(?![\d,])/);
  if (saa) {
    const n = Number(saa[1]) || SAA[saa[1]!] || 0;
    if (n >= 1 && n <= 12) hour = n + 6;
  } else if (clock && (clock[3] || clock[2] || /\b(?:at|after|around|by|from|ku|saa)\s+\d/.test(t) || /صباح|مساء|الساعة|ظهر/.test(t) || offset != null)) {
    const n = Number(clock[1]);
    const mer = clock[3]?.[0];
    if (n >= 1 && n <= 12) {
      hour = mer === "p" || /مساء|العصر/.test(t) ? (n % 12) + 12 : mer === "a" || /صباح/.test(t) ? n % 12 : n <= 6 ? n + 12 : n;
      minute = clock[2] ? Math.min(59, Number(clock[2])) : 0;
    } else if (n >= 13 && n <= 23) {
      hour = n;
      minute = clock[2] ? Math.min(59, Number(clock[2])) : 0;
    }
  } else if (/\bmorning\b|صباح|mu gitondo/.test(t)) hour = 10;
  else if (/\bnoon\b|ظهر/.test(t)) hour = 12;
  else if (/\bafternoon\b|عصر|nyuma ya saa sita/.test(t)) hour = 14;
  else if (/\bevening\b|مساء|nimugoroba/.test(t)) hour = 17;

  if (offset == null && hour == null) return null;
  if (hour != null && (hour < 7 || hour > 19)) return null;
  const base = new Date(atKigali(today.y, today.m, today.d, 0, 0).getTime() + (offset ?? 0) * DAY_MS);
  const b = kigali(base);
  if (hour == null) return { day: base, needTime: true };
  let at = atKigali(b.y, b.m, b.d, hour, minute);
  // "at 3" with no day, already past today, means tomorrow; a stated day in the past means next week.
  if (at.getTime() <= now.getTime()) at = new Date(at.getTime() + (offset == null ? 1 : 7) * DAY_MS);
  return { at };
}

const WD = { en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], ar: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"], rw: ["Cyumweru", "Mbere", "Kabiri", "Gatatu", "Kane", "Gatanu", "Gatandatu"] };
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Tue 4 Nov, 10:00" in Kigali time. */
export function viewingLabel(at: Date, lang: DealLang): string {
  const k = new Date(at.getTime() + KIGALI_MS);
  const hm = `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
  return `${WD[lang][k.getUTCDay()]} ${k.getUTCDate()} ${MO[k.getUTCMonth()]}, ${hm}`;
}

/** The tenant named a time: a person confirms it with the broker. */
export function viewingProposedMessage(lang: DealLang, label: string, rep: string): string {
  if (lang === "ar") return `تمام: ${label}. أتأكد من الموعد مع الوسيط الآن، وسيراسلك ${rep} هنا.`;
  if (lang === "rw") return `Yego: ${label}. Ndimo kubyemeza na komisiyoneri, ${rep} arakwandikira hano.`;
  return `Got it: ${label}. I'm confirming it with the broker now, and ${rep} will message you here.`;
}

/** A day with no time. */
export function askTimeMessage(lang: DealLang): string {
  if (lang === "ar") return `وفي أي ساعة؟ مثلاً «10 صباحاً» أو «3 عصراً».`;
  if (lang === "rw") return `Ni saa ngahe? Nka "saa yine" cyangwa "saa cyenda".`;
  return `What time works? For example "10am" or "3pm".`;
}

export function viewingConfirmedMessage(lang: DealLang, v: { title: string; label: string; place: string | null; rep: string }): string {
  const where = v.place ? ` · ${v.place}` : "";
  if (lang === "ar") return `تم تأكيد المعاينة: «${v.title}»، ${v.label}${where}. ستلتقي الوسيط و${v.rep} من مكان هناك. أحضر هويتك؛ إن أعجبك المنزل نكتب العقد ونوقّعه في اليوم نفسه. أخبرنا هنا إن تغيّر شيء.`;
  if (lang === "rw") return `Gusura byemejwe: "${v.title}", ${v.label}${where}. Uzahura na komisiyoneri na ${v.rep} wo muri Mkan. Uzane indangamuntu; niba uyikunze, amasezerano yandikwa agasinywa uwo munsi. Tubwire hano niba hari icyahindutse.`;
  return `Viewing confirmed: "${v.title}", ${v.label}${where}. You'll meet the broker and ${v.rep} from Mkan there. Bring your ID; if you like it, the lease is written and signed the same day. Tell us here if anything changes.`;
}

export function viewingReminderMessage(lang: DealLang, v: { title: string; label: string; rep: string }, which: "24h" | "2h"): string {
  if (lang === "ar")
    return which === "24h" ? `تذكير: معاينة «${v.title}» غداً، ${v.label}. سيلتقيك ${v.rep} من مكان هناك.` : `معاينة «${v.title}» اليوم، ${v.label}. ${v.rep} في الطريق. أخبرنا هنا إن تأخرت.`;
  if (lang === "rw")
    return which === "24h" ? `Kwibutsa: gusura "${v.title}" ni ejo, ${v.label}. ${v.rep} wo muri Mkan azakwakira.` : `Gusura "${v.title}" ni uyu munsi, ${v.label}. ${v.rep} ari mu nzira. Tubwire hano niba utinze.`;
  return which === "24h" ? `Reminder: your viewing of "${v.title}" is tomorrow, ${v.label}. ${v.rep} from Mkan will meet you there.` : `Your viewing of "${v.title}" is today, ${v.label}. ${v.rep} is on the way. Tell us here if you're running late.`;
}

export function afterViewingMessage(lang: DealLang, title: string): string {
  if (lang === "ar") return `كيف كانت معاينة «${title}»؟ أرسل 1 إن أردت أخذه، أو 2 إن لم يناسبك، أو أخبرنا برأيك.`;
  if (lang === "rw") return `Gusura "${title}" byagenze bite? Ohereza 1 niba uyishaka, 2 niba itakunogeye, cyangwa utubwire uko wabibonye.`;
  return `How did the viewing of "${title}" go? Reply 1 if you want to take it, 2 if not, or tell us what you thought.`;
}
