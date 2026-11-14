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
 *
 * English and Arabic (the people who do this write both). Pure: the writes are rep-word.ts.
 */
import { phoneKey } from "../../../scripts/wa/outbox-pure";

export type RepStatus = "VIEWED" | "SIGNED" | "PAID" | "LOST";
export type RepWord =
  | { kind: "status"; status: RepStatus; listingId: number; share: number | null; noShare: boolean; note: string | null }
  | { kind: "list" };

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

/**
 * What Mkan's person wrote, or null when it is not one of the words (their message then goes the usual
 * way, so they can still test the chat). A word needs a home's code; the status word may come before or
 * after it ("K5811 signed").
 */
export function readRepWord(text: string): RepWord | null {
  const t = text.trim().replace(/[٠-٩]/g, (ch) => String(ch.charCodeAt(0) - 0x0660));
  if (!t || t.length > 300) return null;
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
  ].join("\n");
}
