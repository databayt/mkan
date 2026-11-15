/**
 * One word from Mkan's person closes a step (2026-11-14). A person from Mkan comes to every viewing
 * (Abdout's call), so they know first what happened there — but until now a deal became VIEWED, SIGNED,
 * PAID or LOST only through `pnpm deal:status` on the Mac. They now write it to Mkan's own line from the
 * number in MKAN_REP_WHATSAPP:
 *
 *   signed K5811                the lease is signed (the share request goes to the broker by itself)
 *   signed K5811 share 9000     …with Mkan's share when none is on record
 *   signed K5811 no share       …closed without one, on purpose
 *   paid K5811                  the broker paid Mkan's share
 *   viewed K5811                the viewing took place, no decision yet
 *   lost K5811 too expensive    it will not happen, and why
 *   deals                       the open deals and their codes
 *   take K5811 · back K5811     pause the line in that tenant's chat (12 h) · hand it back
 *   note K5811 <what they said> a note on the deal (and in Twenty)
 *   cost K5811 3000             what the trip cost, RWF — net per deal
 *   off 2026-11-20 · off tomorrow   a day with no viewings offered
 *   numbers                     the last 7 days, with what each means
 *
 * English and Arabic (the people who do this write both). Pure: the writes are rep-word.ts.
 */
import { kigaliDay, phoneKey } from "../../../scripts/wa/outbox-pure";

export type RepStatus = "VIEWED" | "SIGNED" | "PAID" | "LOST";
export type RepWord =
  | { kind: "status"; status: RepStatus; listingId: number; share: number | null; noShare: boolean; note: string | null }
  | { kind: "list" }
  /** `take`: pause the line in the tenant's chat so a person writes · `back`: hand the chat back. */
  | { kind: "take"; listingId: number }
  | { kind: "back"; listingId: number }
  | { kind: "note"; listingId: number; text: string }
  | { kind: "cost"; listingId: number; amount: number }
  /** A Kigali day (YYYY-MM-DD) with no viewings offered. */
  | { kind: "off"; day: string }
  | { kind: "numbers" };

/** The number Mkan's person writes from, digits only; null when none is set (then nothing here runs). */
export function repDigits(env: string | undefined = process.env.MKAN_REP_WHATSAPP): string | null {
  const d = phoneKey(env ?? "");
  return d.length >= 9 ? d : null;
}

const STATUS_WORDS: [RegExp, RepStatus][] = [
  [/^(?:signed|sign|lease signed|وق[ّ]?ع(?:نا|وا)?|تم التوقيع|توقيع)$/i, "SIGNED"],
  [/^(?:paid|payed|received|تم الدفع|دفع(?:وا)?|استلمنا|مدفوع)$/i, "PAID"],
  [/^(?:viewed|seen|visited|تمت المعاينة|عاين(?:وا|نا)?|شاف(?:وا|ه|ها)?)$/i, "VIEWED"],
  [/^(?:lost|cancel(?:led|ed)?|dropped|no deal|خسرنا|ضاع(?:ت)?|ألغي|الغي|ما تم)$/i, "LOST"],
];
const LIST_RE = /^(?:deals?|open deals|status|list|\?|الصفقات|صفقات)[\s?.!]*$/i;
/** A home's code as the posts write it; a bare 4–6 digit number counts only when no K-code is there. */
const K_CODE_RE = /\bK[-\s#]?(\d{3,6})\b/i;
const BARE_CODE_RE = /(?:^|\s)#?(\d{4,6})(?=\s|$)/;
const SHARE_RE = /(?:\bshare|حصة|حصتنا)\s*[:=]?\s*(\d[\d,]*\d|\d)\s*(k)?(?=\s|$)/i;
const NO_SHARE_RE = /\b(?:no share|without share|no-share)\b|بدون حصة|بلا حصة/i;

const NUMBERS_RE = /^(?:numbers?|stats|الأرقام|ارقام|أرقام)[\s?.!]*$/i;
const TAKE_RE = /^(?:take(?: over)?|استلم|خذ)\s+(.+)$/i;
const BACK_RE = /^(?:back|give back|release|رجع|رجّع|ارجع|سلّم|سلم)\s+(.+)$/i;
const NOTE_RE = /^(?:note|ملاحظة|لاحظ)\s*[:：]?\s+([\s\S]+)$/i;
const COST_RE = /^(?:cost|trip(?: cost)?|تكلفة|كلفة)\s+(.+)$/i;
const OFF_RE = /^(?:off|day off|إجازة|اجازة)\s+(.+)$/i;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The home's code at the start of `rest`: "K5811" or a bare 4–6 digits; what follows it is `tail`. */
function codeAndTail(rest: string): { listingId: number; tail: string } | null {
  const m = rest.trim().match(/^(?:K[-\s#]?|#)?(\d{3,6})\b\s*([\s\S]*)$/i);
  return m ? { listingId: Number(m[1]), tail: m[2]!.trim() } : null;
}

/** "2026-11-20", "tomorrow", "today" (and their Arabic) as a Kigali day; null when it is none of them. */
export function readOffDay(text: string, now: Date = new Date()): string | null {
  const t = text.trim().toLowerCase();
  if (/^(?:today|اليوم)$/.test(t)) return kigaliDay(now);
  if (/^(?:tomorrow|غدا|غداً|بكرة|بكره)$/.test(t)) return kigaliDay(new Date(now.getTime() + 86_400_000));
  const m = t.match(DAY_RE);
  if (!m) return null;
  const d = new Date(`${t}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === t ? t : null;
}

/** The words that are not a status: pause, hand back, note, cost, day off, numbers. Null when it is none of them. */
function readControlWord(t: string, now: Date): RepWord | null {
  if (NUMBERS_RE.test(t)) return { kind: "numbers" };
  const off = t.match(OFF_RE);
  if (off) {
    const day = readOffDay(off[1]!, now);
    return day ? { kind: "off", day } : null;
  }
  const take = t.match(TAKE_RE);
  const takeCode = take && codeAndTail(take[1]!);
  if (takeCode && !takeCode.tail) return { kind: "take", listingId: takeCode.listingId };
  const back = t.match(BACK_RE);
  const backCode = back && codeAndTail(back[1]!);
  if (backCode && !backCode.tail) return { kind: "back", listingId: backCode.listingId };
  const note = t.match(NOTE_RE);
  const noteCode = note && codeAndTail(note[1]!);
  if (noteCode?.tail) return { kind: "note", listingId: noteCode.listingId, text: noteCode.tail.slice(0, 1000) };
  const cost = t.match(COST_RE);
  const costCode = cost && codeAndTail(cost[1]!);
  const amount = costCode?.tail.match(/^(?:rwf\s*)?(\d[\d,]*)\s*(k)?$/i);
  if (costCode && amount) {
    const n = Math.round(Number(amount[1]!.replace(/,/g, "")) * (amount[2] ? 1000 : 1));
    if (n >= 0) return { kind: "cost", listingId: costCode.listingId, amount: n };
  }
  return null;
}

/**
 * What Mkan's person wrote, or null when it is not one of the words (their message then goes the usual
 * way, so they can still test the chat). A word needs a home's code; the status word may come before or
 * after it ("K5811 signed").
 */
export function readRepWord(text: string, now: Date = new Date()): RepWord | null {
  const t = text.trim().replace(/[٠-٩]/g, (ch) => String(ch.charCodeAt(0) - 0x0660));
  if (!t || t.length > 1200) return null;
  // A note is the only word that may run long (what a tenant said at a viewing); the rest stay short.
  const control = readControlWord(t, now);
  if (control) return control;
  if (t.length > 300) return null;
  if (LIST_RE.test(t)) return { kind: "list" };
  // The share's amount is read and taken out first, so "share 9000" is never mistaken for a home's code.
  const noShare = NO_SHARE_RE.test(t);
  const shareMatch = noShare ? null : t.match(SHARE_RE);
  const share = shareMatch ? Math.round(Number(shareMatch[1]!.replace(/,/g, "")) * (shareMatch[2] ? 1000 : 1)) : null;
  const plain = t.replace(NO_SHARE_RE, " ").replace(SHARE_RE, " ");
  const code = plain.match(K_CODE_RE) ?? plain.match(BARE_CODE_RE);
  if (!code) return null;
  const listingId = Number(code[1]);
  // What is left around the code: the status word, then anything else is the note.
  const words = plain.replace(code[0], " ").replace(/\s+/g, " ").trim();
  // The status is the longest phrase from the start, else from the end, that is one of the words.
  const parts = words.split(" ").filter(Boolean);
  for (let n = Math.min(3, parts.length); n >= 1; n--) {
    for (const [phrase, tail] of [
      [parts.slice(0, n).join(" "), parts.slice(n).join(" ")],
      [parts.slice(-n).join(" "), parts.slice(0, -n).join(" ")],
    ] as const) {
      const hit = STATUS_WORDS.find(([re]) => re.test(phrase));
      if (hit) return { kind: "status", status: hit[1], listingId, share: share != null && share > 0 ? share : null, noShare, note: tail.trim() || null };
    }
  }
  return null;
}

/** What the line reads from Mkan's person, for when their message is not one of the words. */
export function repHelpText(): string {
  return [
    "Words I read from you:",
    "signed K5811 · signed K5811 share 9000 · signed K5811 no share",
    "paid K5811 · viewed K5811 · lost K5811 <why>",
    "deals — the open ones and their codes",
    "take K5811 — pause the line in that chat (12 h) · back K5811 — hand it back",
    "note K5811 <what they said> · cost K5811 3000",
    "off 2026-11-20 or off tomorrow — no viewings that day",
    "numbers — the last 7 days and what to do",
  ].join("\n");
}
