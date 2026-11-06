/**
 * Masks for text that leaves the team — a phone number to its last 3 digits, social handles, emails,
 * Mac paths and links. One place for the public /monetize view (src/lib/monetize/public.ts), the
 * tenant-facing titles of the rental agent, and the Mac's read-outs (scripts/hermes/read.ts).
 * Pure: safe in the browser, in tests and in scripts.
 */

/** "+250 780 984 777" → "…777". */
export const maskPhone = (p: string | null | undefined): string => {
  const d = String(p ?? "").replace(/\D/g, "");
  return d ? `…${d.slice(-3)}` : "—";
};

/** A run of 9–13 digits (spaces, dashes, dots and brackets allowed) reads as a phone; dates and ids pass. */
const looksLikePhone = (m: string): boolean => {
  const digits = m.replace(/\D/g, "").length;
  return digits >= 9 && digits <= 13 && !/\d{4}-\d{2}-\d{2}/.test(m);
};
const PHONE_RUN = /\+?\d[\d\s().-]{6,}\d/g;

/** Every phone number inside free text, masked to its last 3 digits. */
export const maskPhones = (t: string): string => t.replace(PHONE_RUN, (m) => (looksLikePhone(m) ? maskPhone(m) : m));

/** One line for a read-out: phones masked, whitespace folded, cut to `max`. */
export const maskText = (t: string | null | undefined, max = 90): string =>
  maskPhones(String(t ?? ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
/** "@mossa_real_estate_rwanda" — not the "@" inside an email (masked first) or a URL path. */
const HANDLE = /(^|[^\w@/.])@[A-Za-z0-9_.]{2,30}/g;
const MAC_PATH = /(?:\/Users|\/private|\/var\/folders|~)\/[^\s"'`)\]]+/g;
const URL = /\bhttps?:\/\/([^\s/"'`)\]]+)[^\s"'`)\]]*/g;
const WA_LINK = /\bwa\.me\/\d+/g;

/**
 * Text for a page anyone can read: phones → "…123", emails → "[email]", handles → "@…",
 * paths → "[path]", links → their host only. Idempotent.
 */
export function redactPublic(text: string | null | undefined): string {
  if (text == null) return "";
  return maskPhones(
    String(text)
      .replace(EMAIL, "[email]")
      .replace(WA_LINK, "wa.me/…")
      .replace(URL, (_m, host: string) => host.replace(/^www\./, ""))
      .replace(MAC_PATH, "[path]")
      .replace(HANDLE, (_m, pre: string) => `${pre}@…`),
  );
}

/**
 * A listing title as a tenant reads it: a broker's number, handle or link written into an ad's title
 * never reaches the tenant (Mkan stays in the middle).
 */
export function scrubTitle(title: string | null | undefined): string {
  if (!title) return "";
  return String(title)
    .replace(EMAIL, "")
    .replace(WA_LINK, "")
    .replace(URL, "")
    .replace(HANDLE, (_m, pre: string) => pre)
    .replace(PHONE_RUN, (m) => (looksLikePhone(m) ? "" : m))
    .replace(/\s*[-–—|,:]\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
