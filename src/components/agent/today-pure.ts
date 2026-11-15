/**
 * "Today on Mkan" in a tenant's words (2026-11-15). The day's posted homes are an intent of their own:
 * "today", "what's new", "اليوم", "uyu munsi", "aujourd'hui" show them as the usual cards, with no model
 * call and no search.
 *
 * Only a message that is nothing but the ask counts ("today I need 2 bedrooms in Remera" is a search).
 * The bare word "new" is NOT here: on WhatsApp it starts a new chat (whatsapp-format.ts `isFresh`).
 * "جديد" alone does start a new chat there, and the turn that chat opens with runs with these very
 * words, so it lands here too.
 */

/** The words that may come in front of the ask: "show me", "send me the", "ما هي", "ndashaka". */
const LEAD =
  "(?:(?:show|send|give|tell|get)\\s+me\\s+(?:the\\s+)?|see\\s+(?:the\\s+)?|what(?:\\s+s|\\s+is|\\s+are)\\s+(?:the\\s+)?|any\\s+|the\\s+|ndashaka\\s+|mwanyereka\\s+|montre[zr]?[- ]moi\\s+(?:les\\s+)?|ما\\s+هي\\s+|ما\\s+|اريد\\s+|أريد\\s+|ورني\\s+|اعرض\\s+)?";

const PHRASES = [
  // en
  "today",
  "today s homes",
  "todays homes",
  "today s houses",
  "todays houses",
  "today s listings",
  "homes today",
  "houses today",
  "today s new homes",
  "today s posts",
  "what s new",
  "whats new",
  "what is new",
  "what s new today",
  "anything new",
  "anything new today",
  "any new homes",
  "new homes",
  "new houses",
  "new listings",
  "new today",
  "new homes today",
  "latest",
  "latest homes",
  "latest listings",
  "latest posts",
  // ar
  "اليوم",
  "بيوت اليوم",
  "منازل اليوم",
  "شقق اليوم",
  "الجديد",
  "جديد اليوم",
  "الجديد اليوم",
  "ما الجديد",
  "ايش الجديد",
  "بيوت جديدة",
  "منازل جديدة",
  "جديد",
  // rw
  "uyu munsi",
  "amazu y uyu munsi",
  "amazu yo uyu munsi",
  "ibishya",
  "ibishya uyu munsi",
  "amazu mashya",
  "amazu mashya uyu munsi",
  // fr
  "aujourd hui",
  "aujourdhui",
  "les maisons d aujourd hui",
  "maisons d aujourd hui",
  "nouveautes",
  "les nouveautes",
  "nouveautes du jour",
  "quoi de neuf",
  "quoi de neuf aujourd hui",
];

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[’'`´]/g, " ")
    .replace(/[?!.؟,،:;…\-–—()"“”]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const PHRASE_RE = new RegExp(`^${LEAD}(?:${PHRASES.map((p) => p.replace(/\s/g, "\\s")).join("|")})(?:\\s+(?:please|pls|plz))?$`, "u");

/** True when the whole message asks for the day's posted homes. */
export function asksForToday(text: string): boolean {
  const t = norm(text);
  return t.length > 0 && t.length <= 48 && PHRASE_RE.test(t);
}
