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
 *
 * "We'll ask" is kept by a person: the #mkan card for the viewing lists what
 * the tenant was shown as usual or unstated (termsToAsk), the person from Mkan
 * asks the broker while agreeing the time, and `pnpm deal:book --advance=3 …`
 * records the answers (parseTermFlags), which the tenant's confirmation then
 * restates (confirmedTermsLine).
 */
import type { CostEstimate, CostLine } from "./cost";

export type DealLang = "en" | "ar" | "rw";

export const rwf = (n: number) => `RWF ${Math.round(n).toLocaleString("en-US")}`;
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

/**
 * What the broker confirmed to the person from Mkan, recorded at booking
 * (`pnpm deal:book --advance=3 …`). A term left out was not discussed.
 */
export interface BrokerTerms {
  /** RWF a month, when the broker's figure differs from the ad's. */
  rent?: number;
  monthsInAdvance?: number;
  /** 0 = no deposit. */
  depositMonths?: number;
  /** A fraction of one month's rent (0.1). */
  commissionPct?: number;
  noCommission?: boolean;
  /** RWF; Mkan pays it. */
  viewingFee?: number;
  waterIncluded?: boolean;
  electricityIncluded?: boolean;
  leaseMonths?: number;
  /** YYYY-MM-DD. */
  moveIn?: string;
}

const line = (cost: CostEstimate | null, key: CostLine["key"]) => cost?.lines.find((l) => l.key === key);
const months = (q: number | undefined, lang: DealLang) => {
  const n = q ?? 0;
  if (lang === "ar") return n === 0.5 ? "نصف شهر" : n === 1 ? "شهر" : n === 2 ? "شهران" : n >= 11 ? `${n} شهراً` : `${n} أشهر`;
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
      pct ? `عمولة الوسيط: ${pct} من إيجار شهر${commission?.source === "typical" ? " (المعتاد، تُؤكَّد في المعاينة)" : ""}.` : c ? `لا عمولة وسيط.` : null,
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
      pct ? `Komisiyo ya komisiyoneri: ${pct} by'ukwezi kumwe${commission?.source === "typical" ? " (bisanzwe, bizemezwa mu gusura)" : ""}.` : c ? `Nta komisiyo ya komisiyoneri.` : null,
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
    pct ? `Broker's commission: ${pct} of a month's rent${commission?.source === "typical" ? " (usual, confirmed at the viewing)" : ""}.` : c ? `No broker's commission.` : null,
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

/**
 * What the person from Mkan asks the broker while agreeing the time, for the
 * #mkan card: every term the tenant was shown as usual or not stated (with what
 * they were told), and what no ad states. Empty cost = ask everything.
 */
export function termsToAsk(cost: CostEstimate | null): string[] {
  if (!cost) return ["rent", "months up front", "deposit", "commission", "water", "electricity", "lease length", "move-in date"];
  const usual = (key: CostLine["key"], what: string, told: (l: CostLine) => string) => {
    const l = line(cost, key);
    return l?.source === "typical" ? `${what} (we said ${told(l)}, the usual)` : null;
  };
  const utility = (key: "water" | "electricity") => ((line(cost, key)?.status ?? "unknown") === "unknown" ? `${key} in the rent?` : null);
  const fee = line(cost, "viewingFee");
  return [
    usual("rentInAdvance", "months up front", (l) => months(l.qty, "en")),
    usual("deposit", "deposit", (l) => months(l.qty, "en")),
    usual("commission", "commission", (l) => (l.qtyHigh != null ? `${l.qty}–${l.qtyHigh}%` : `${l.qty}%`)),
    utility("water"),
    utility("electricity"),
    "lease length",
    "move-in date",
    fee?.source === "typical" ? "viewing fee (Mkan pays it)" : null,
  ].filter((s): s is string => !!s);
}

/**
 * `pnpm deal:book` flags → what the broker confirmed. --advance=3 and --deposit=1 are
 * months (--deposit=0.5 or half; 0 = none); --commission=10 is a percent of one month's
 * rent (0 or none = no commission); --rent and --fee are RWF; --water / --power =
 * yes (in the rent) or no (paid separately); --lease=12 months; --move-in=YYYY-MM-DD.
 */
export function parseTermFlags(get: (name: string) => string | undefined): BrokerTerms {
  const t: BrokerTerms = {};
  const num = (name: string, min: number, max: number): number | undefined => {
    const raw = get(name)?.trim();
    if (!raw) return undefined;
    const n = Number(raw.replace(/[,_\s]/g, "").replace(/%$/, ""));
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`--${name}=${raw}: expected a number from ${min} to ${max}`);
    return n;
  };
  const yesNo = (name: string): boolean | undefined => {
    const raw = get(name)?.trim().toLowerCase();
    if (!raw) return undefined;
    if (/^(y|yes|true|included|in)$/.test(raw)) return true;
    if (/^(n|no|false|separate|out)$/.test(raw)) return false;
    throw new Error(`--${name}=${raw}: say yes (in the rent) or no (paid separately)`);
  };
  const rent = num("rent", 1_000, 100_000_000);
  if (rent != null) t.rent = Math.round(rent);
  const advance = num("advance", 1, 12);
  if (advance != null) t.monthsInAdvance = advance;
  const deposit = get("deposit")?.trim().toLowerCase() === "half" ? 0.5 : num("deposit", 0, 12);
  if (deposit != null) t.depositMonths = deposit;
  const commission = get("commission")?.trim().toLowerCase();
  if (commission === "none" || commission === "no") {
    t.noCommission = true;
    t.commissionPct = 0;
  } else {
    const pct = num("commission", 0, 100);
    if (pct != null) {
      t.commissionPct = pct / 100;
      if (pct === 0) t.noCommission = true;
    }
  }
  const fee = num("fee", 0, 1_000_000);
  if (fee != null) t.viewingFee = Math.round(fee);
  const water = yesNo("water");
  if (water != null) t.waterIncluded = water;
  const power = yesNo("power");
  if (power != null) t.electricityIncluded = power;
  const lease = num("lease", 1, 120);
  if (lease != null) t.leaseMonths = lease;
  const moveIn = get("move-in")?.trim();
  if (moveIn) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(moveIn) || Number.isNaN(Date.parse(moveIn))) throw new Error(`--move-in=${moveIn}: expected YYYY-MM-DD`);
    t.moveIn = moveIn;
  }
  return t;
}

// ── Mkan's share: how the business gets paid ──────────────────────────────────
// Mkan brings the tenant; the broker who signs the lease pays Mkan a share of their commission, or
// a flat amount, agreed with that broker (Broker.sharePct / shareFlatRwf). Until 2026-11-07 nothing
// asked for it, computed it or refused a deal without it: 0 of 238 brokers had terms on record.

/** Mkan's share as agreed with a broker: part of their commission, or a flat amount per lease. */
export interface ShareAgreement {
  /** A fraction of the broker's commission (0.5). */
  pct?: number | null;
  /** RWF per signed lease. */
  flatRwf?: number | null;
}

/**
 * `--share-pct=50` (percent of the broker's commission), `--share-rwf=30000` (flat RWF per lease),
 * or `--no-share` (go on without one, on purpose). Null when none was given.
 */
export function parseShareFlags(get: (name: string) => string | undefined, has: (flag: string) => boolean): (ShareAgreement & { none?: boolean }) | null {
  const pctRaw = get("share-pct")?.trim();
  const rwfRaw = get("share-rwf")?.trim();
  const none = has("no-share");
  if ((pctRaw || rwfRaw) && none) throw new Error("--no-share together with a share: pick one");
  if (pctRaw && rwfRaw) throw new Error("--share-pct or --share-rwf, not both");
  if (none) return { none: true };
  if (pctRaw) {
    const n = Number(pctRaw.replace(/%$/, ""));
    if (!Number.isFinite(n) || n <= 0 || n > 100) throw new Error(`--share-pct=${pctRaw}: expected a percent of the broker's commission, above 0 and up to 100`);
    return { pct: n / 100 };
  }
  if (rwfRaw) {
    const n = Number(rwfRaw.replace(/[,_\s]/g, ""));
    if (!Number.isFinite(n) || n < 1 || n > 100_000_000) throw new Error(`--share-rwf=${rwfRaw}: expected RWF from 1 to 100,000,000`);
    return { flatRwf: Math.round(n) };
  }
  return null;
}

/** What Mkan earns on a signed lease: the flat amount, else its part of the commission; null without either. */
export function expectedShare(commission: number | null | undefined, a: ShareAgreement | null | undefined): number | null {
  if (a?.flatRwf != null && a.flatRwf > 0) return Math.round(a.flatRwf);
  if (a?.pct != null && a.pct > 0 && commission != null && commission > 0) return Math.round(commission * a.pct);
  return null;
}

/** The agreement as a #mkan card says it: "50% of the commission", "RWF 30,000 a lease". */
export function shareLabel(a: ShareAgreement | null | undefined): string | null {
  if (a?.flatRwf != null && a.flatRwf > 0) return `${rwf(a.flatRwf)} a lease`;
  if (a?.pct != null && a.pct > 0) return `${Math.round(a.pct * 1000) / 10}% of the commission`;
  return null;
}

/** One line for #mkan: what the deal earns Mkan once signed, net of the viewing fee Mkan pays. */
export function unitEconomicsLine(v: { share: number | null; commission: number | null; agreement: ShareAgreement | null; viewingFee: number | null }): string {
  const fee = v.viewingFee ?? 0;
  // Agreed as a part of the commission, but the commission is not known yet: price it, don't cry "none".
  if ((v.share == null || v.share <= 0) && v.agreement?.pct && !(v.commission != null && v.commission > 0)) {
    return `💵 Mkan's share: ${shareLabel(v.agreement)} — the commission is not on record yet: add \`--commission=<% of one month's rent>\` when booking, or \`--share=<RWF>\` when it signs.`;
  }
  if (v.share == null || v.share <= 0) {
    return `⚠ No share for Mkan on record: this deal ${fee > 0 ? `costs Mkan ${rwf(fee)} (the viewing fee) and ` : ""}earns nothing. Agree Mkan's share with the broker before the viewing (\`pnpm deal:terms\`).`;
  }
  const basis = v.agreement?.flatRwf ? " (flat, as agreed)" : v.agreement?.pct && v.commission ? ` (${shareLabel(v.agreement)} of ${rwf(v.commission)})` : "";
  if (fee <= 0) return `💵 If it signs: Mkan ≈ ${rwf(v.share)}${basis}`;
  const net = v.share - fee;
  return `💵 If it signs: Mkan ≈ ${rwf(v.share)}${basis} − ${rwf(fee)} viewing fee = ≈ ${rwf(net)}${net <= 0 ? " ⚠ the viewing fee is more than Mkan's share" : ""}`;
}

/** The WhatsApp a person from Mkan sends the broker once the lease is signed (it never goes by itself). */
export function invoiceDraft(v: { broker: string | null; amount: number; ref: string; title: string; payout: string | null }): string {
  return `Hello${v.broker ? ` ${v.broker}` : ""}, thank you for the lease on ${v.title} (${v.ref}). As agreed, Mkan's share is ${rwf(v.amount)}.${v.payout ? ` Please send it to ${v.payout}.` : ""} Murakoze!`;
}

export type DealStatusWord = "viewed" | "signed" | "paid" | "lost";

/** The exact `pnpm deal:status` line a #mkan card prints; parseStatusArgs reads it back. */
export function dealCommand(id: string, status: DealStatusWord, extra = ""): string {
  return `pnpm deal:status --deal=${id} --status=${status}${extra ? ` ${extra}` : ""}`;
}

/**
 * `pnpm deal:status` arguments after the command: the flags (--deal= --status= [--share=] [--no-share]
 * [--note=]), or the short `<deal id> SIGNED` an older card printed.
 */
export function parseStatusArgs(args: string[]): { id: string | null; status: string | null; share: number | null; noShare: boolean; note: string | null } {
  const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const positional = args.filter((a) => !a.startsWith("--"));
  const id = flag("deal") ?? positional[0] ?? null;
  const status = (flag("status") ?? positional[1] ?? "").toUpperCase() || null;
  const raw = flag("share")?.trim();
  let share: number | null = null;
  if (raw) {
    const n = Number(raw.replace(/[,_\s]/g, ""));
    if (!Number.isFinite(n) || n <= 0 || n > 100_000_000) throw new Error(`--share=${raw}: expected the RWF the broker owes Mkan`);
    share = Math.round(n);
  }
  return { id, status, share, noShare: args.includes("--no-share"), note: flag("note") ?? null };
}

/**
 * The share a deal closes with: the amount given now, else the one booked, else the broker's agreement
 * on the commission. A signed or paid deal with no share is refused unless `--no-share` says so — the
 * business is that share; a deal that closes without one is a choice, not an accident.
 */
export function shareForStatus(
  status: "VIEWED" | "SIGNED" | "PAID" | "LOST",
  v: { given: number | null; booked: number | null; commission: number | null; agreement: ShareAgreement | null; noShare: boolean },
): number | null {
  const share = v.given ?? v.booked ?? expectedShare(v.commission, v.agreement);
  if ((status === "SIGNED" || status === "PAID") && !(share != null && share > 0) && !v.noShare) {
    throw new Error("no share for Mkan on this deal — pass --share=<RWF the broker owes Mkan>, or --no-share to close it without one");
  }
  return share != null && share > 0 ? share : null;
}

/** "15 Nov" from "2026-11-15". */
const dayMonth = (iso: string) => {
  const m = iso.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[2])} ${MO[Number(m[1]) - 1]}` : iso;
};
const pctOf = (p: number) => `${Math.round(p * 1000) / 10}%`;
const rwfRange = (r: [number, number]) => (r[1] !== r[0] ? `${rwf(r[0])}–${rwf(r[1])}` : rwf(r[0]));

/**
 * The deal as the broker confirmed it, for the tenant's booking confirmation:
 * only what was said, in the tenant's language; null when nothing was.
 * `moveIn` is what moving in costs on those terms (the viewing fee is Mkan's).
 */
export function confirmedTermsLine(lang: DealLang, t: BrokerTerms, moveIn: [number, number] | null): string | null {
  const free = t.noCommission === true || t.commissionPct === 0;
  const total = moveIn ? rwfRange(moveIn) : null;
  if (lang === "ar") {
    const util = (v: boolean) => (v ? "ضمن الإيجار" : "على المستأجر");
    const parts = [
      t.rent != null ? `الإيجار ${rwf(t.rent)} في الشهر` : null,
      t.monthsInAdvance != null ? `${months(t.monthsInAdvance, lang)} مقدماً` : null,
      t.depositMonths != null ? (t.depositMonths === 0 ? "بلا تأمين" : `${months(t.depositMonths, lang)} تأميناً`) : null,
      free ? "بلا عمولة وسيط" : t.commissionPct != null ? `عمولة الوسيط ${pctOf(t.commissionPct)} من إيجار شهر` : null,
      t.waterIncluded != null ? `الماء ${util(t.waterIncluded)}` : null,
      t.electricityIncluded != null ? `الكهرباء ${util(t.electricityIncluded)}` : null,
      t.leaseMonths != null ? `عقد لمدة ${months(t.leaseMonths, lang)}` : null,
      t.moveIn ? `الانتقال من ${dayMonth(t.moveIn)}` : null,
    ].filter(Boolean);
    if (!parts.length) return null;
    return `أكّد الوسيط: ${parts.join("، ")}.${total ? ` للانتقال: ${total}.` : ""}`;
  }
  if (lang === "rw") {
    const util = (v: boolean) => (v ? "biri mu bukode" : "ubyishyura ukwawe");
    const parts = [
      t.rent != null ? `ubukode ${rwf(t.rent)} ku kwezi` : null,
      t.monthsInAdvance != null ? `${months(t.monthsInAdvance, lang)} mbere` : null,
      t.depositMonths != null ? (t.depositMonths === 0 ? "nta ngwate" : `${months(t.depositMonths, lang)} y'ingwate`) : null,
      free ? "nta komisiyo" : t.commissionPct != null ? `komisiyo ${pctOf(t.commissionPct)} by'ukwezi kumwe` : null,
      t.waterIncluded != null ? `amazi ${util(t.waterIncluded)}` : null,
      t.electricityIncluded != null ? `amashanyarazi ${util(t.electricityIncluded)}` : null,
      t.leaseMonths != null ? `amasezerano y'${months(t.leaseMonths, lang)}` : null,
      t.moveIn ? `kwimuka guhera ${dayMonth(t.moveIn)}` : null,
    ].filter(Boolean);
    if (!parts.length) return null;
    return `Byemejwe na komisiyoneri: ${parts.join(", ")}.${total ? ` Kwimukira: ${total}.` : ""}`;
  }
  const util = (v: boolean) => (v ? "included" : "paid by you");
  const parts = [
    t.rent != null ? `rent ${rwf(t.rent)} a month` : null,
    t.monthsInAdvance != null ? `${months(t.monthsInAdvance, lang)} up front` : null,
    t.depositMonths != null ? (t.depositMonths === 0 ? "no deposit" : `${months(t.depositMonths, lang)} deposit`) : null,
    free ? "no broker's commission" : t.commissionPct != null ? `broker's commission ${pctOf(t.commissionPct)} of a month's rent` : null,
    t.waterIncluded != null ? `water ${util(t.waterIncluded)}` : null,
    t.electricityIncluded != null ? `electricity ${util(t.electricityIncluded)}` : null,
    t.leaseMonths != null ? `${t.leaseMonths}-month lease` : null,
    t.moveIn ? `move in from ${dayMonth(t.moveIn)}` : null,
  ].filter(Boolean);
  if (!parts.length) return null;
  return `Confirmed with the broker: ${parts.join(", ")}.${total ? ` To move in: ${total}.` : ""}`;
}

export function viewingConfirmedMessage(lang: DealLang, v: { title: string; label: string; place: string | null; rep: string; terms?: string | null }): string {
  const where = v.place ? ` · ${v.place}` : "";
  const body =
    lang === "ar"
      ? `تم تأكيد المعاينة: «${v.title}»، ${v.label}${where}. ستلتقي الوسيط و${v.rep} من مكان هناك. أحضر هويتك؛ إن أعجبك المنزل نكتب العقد ونوقّعه في اليوم نفسه. أخبرنا هنا إن تغيّر شيء.`
      : lang === "rw"
        ? `Gusura byemejwe: "${v.title}", ${v.label}${where}. Uzahura na komisiyoneri na ${v.rep} wo muri Mkan. Uzane indangamuntu; niba uyikunze, amasezerano yandikwa agasinywa uwo munsi. Tubwire hano niba hari icyahindutse.`
        : `Viewing confirmed: "${v.title}", ${v.label}${where}. You'll meet the broker and ${v.rep} from Mkan there. Bring your ID; if you like it, the lease is written and signed the same day. Tell us here if anything changes.`;
  return v.terms ? `${body}\n${v.terms}` : body;
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

// ── after the viewing ───────────────────────────────────────────────────
// "How did the viewing go? Reply 1 if you want to take it, 2 if not" (afterViewingMessage) had no
// reader: a "1" picked home #1 of the chat and could ask a broker about another home (2026-11-06).
// Word ends are a lookahead, not \b: \b is ASCII-only even under /u, so it never matches after نعم.

const WANT_IT = /^\s*(?:1|yes|yeah|yep|sure|i\s+(?:want|will\s+take|'?ll\s+take|like)\s+it|i\s+take\s+it|take\s+it|we(?:'?ll|\s+will)\s+take\s+it|we\s+want\s+it|yego|ndayishaka|ndayifata|oui|je\s+la\s+prends|نعم|أريده|اريده|أبغاه|ابغاه|تمام)(?=$|[\s.,!?؟،])/iu;
const NOT_IT = /^\s*(?:2|no|nope|not\s+for\s+me|i\s+don'?t\s+(?:want|like)\s+it|(?:i\s+)?did(?:n'?t|\s+not)\s+like(?:\s+it)?|oya|ntabwo|ntayo|non|لا|ما\s+عجبني|ما\s+يناسبني)(?=$|[\s.,!?؟،])/iu;

/** The tenant's answer to "how did the viewing go?": want / not / anything else (a person reads it). */
export function readAfterViewing(text: string): "want" | "not" | null {
  const t = text.trim().replace(/[٠-٩]/g, (ch) => String(ch.charCodeAt(0) - 0x0660));
  if (NOT_IT.test(t)) return "not";
  if (WANT_IT.test(t)) return "want";
  return null;
}

export function afterViewingWantText(lang: DealLang, title: string): string {
  if (lang === "ar") return `رائع! سأخبر الوسيط أنك تريد «${title}»، وأعود إليك هنا بالعقد وما تدفعه.`;
  if (lang === "rw") return `Ni byiza! Ndabwira komisiyoneri ko ushaka "${title}", ngaruke hano nkubwire ibijyanye n'amasezerano n'ibyo uzishyura.`;
  return `Great! I'll tell the broker you want "${title}" and come back to you here with the lease and what to pay.`;
}

export function afterViewingNotText(lang: DealLang): string {
  if (lang === "ar") return "شكراً لإخبارك. ما الذي يجب أن يتغير: المنطقة، الميزانية أم الحجم؟ اكتبه وسأبحث لك عن منازل أخرى.";
  if (lang === "rw") return "Murakoze kumbwira. Ni iki gikwiye guhinduka: agace, amafaranga cyangwa ubunini? Bwandike ngushakire izindi nzu.";
  return "Thanks for telling me. What should change — the area, the budget or the size? Write it and I'll look for other homes.";
}
