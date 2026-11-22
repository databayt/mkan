/**
 * Reading a broker's WhatsApp reply with Claude (2026-11-22) — the pure half: when the rules are enough, the
 * classifier's prompt, and its reply turned into a typed read. No network, no database; broker-read.ts makes
 * the call. The rules (broker-reply.ts parseBrokerReply) stay the fast path for a digit, a plain yes, a plain
 * "taken" and a resend; anything wordier — "yes, tomorrow 10am works", "taken but I have another one in
 * Gikondo 2 bed 200k", "how much is your budget?", a voice note — goes to Haiku.
 */
import { isLang, type Lang } from "./language";
import { readViewingTime } from "./deal-pure";
import type { BrokerReply } from "./broker-reply";

export const BROKER_ANSWERS = ["available", "taken", "resend", "other_home", "time", "question", "price", "unclear"] as const;
export type BrokerAnswer = (typeof BROKER_ANSWERS)[number];

export interface BrokerOtherHome {
  area: string | null;
  bedrooms: number | null;
  /** RWF a month. */
  rent: number | null;
  furnished: boolean | null;
}

export interface BrokerRead {
  answer: BrokerAnswer;
  /** The viewing time they named or accepted, a real instant (parsed from ISO in Kigali time). */
  time: Date | null;
  otherHome: BrokerOtherHome | null;
  /** What they asked, in their words, one line. */
  question: string | null;
  lang: Lang | null;
}

/** What the classifier is told about the ask the reply answers. */
export interface BrokerReadContext {
  /** The broker's words (a voice note or photo already turned into text). */
  text: string;
  now: Date;
  /** The home Mkan asked about: area, size, rent — for "is the price right?" and for "same one?". */
  home?: { area?: string | null; bedrooms?: number | null; rent?: number | null } | null;
  /** The two viewing times the ask offered, as labels ("Mon 23 Nov, 09:00"). */
  offeredSlots?: string[];
}

const KIGALI_MS = 2 * 3_600_000;

/** "Mon 23 Nov 2026, 14:05" in Kigali, so the model can resolve "tomorrow". */
export function kigaliStamp(now: Date): string {
  const k = new Date(now.getTime() + KIGALI_MS);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][k.getUTCDay()]!;
  const mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][k.getUTCMonth()]!;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${wd} ${k.getUTCDate()} ${mo} ${k.getUTCFullYear()}, ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
}

export const BROKER_READ_SYSTEM = `You read one WhatsApp message from a Kigali property broker, sent to Mkan (a service that brings tenants to viewings). Mkan asked them whether a home is still free and offered two viewing times. Brokers write short, informal English, Kinyarwanda, French or Swahili, often mixed, with typos.

Reply with ONLY one JSON object, no prose, no code fence:
{"answer": "...", "time": null, "otherHome": null, "question": null, "lang": "en"}

answer is exactly one of:
- "available": the home is free / still there / they agree to a viewing ("yes", "it is available", "ihari", "yes come tomorrow 10am").
- "taken": the home is gone (rented, sold, "taken", "byaragiye"). If they also offer another home ("taken but I have another in Gikondo, 2 bed 200k"), keep "taken" and fill otherHome.
- "resend": they could not open the link or video we sent and want it again ("the video is not available", "send the link again", "screenshot please"). It is about OUR link, never about the home.
- "other_home": they offer a different home and say nothing about whether this one is free ("I have another one in Gikondo, 2 bed 200k"). Fill otherHome.
- "time": they only name a day or time for a viewing, without saying free or taken ("tomorrow 10am we can see it", "come Thursday at 3"). That implies available.
- "question": they ask Mkan something about the tenant or the visit (budget, family or single, who is coming, how many people, when).
- "price": they state or ask about the rent, deposit, commission or viewing fee of THIS home ("it is 250k", "price negotiable", "visit fee 5k").
- "unclear": a greeting only, thanks, or anything you cannot place.

Other fields:
- time: the viewing time they named or accepted, as ISO 8601 with the Kigali offset, for example "2026-11-24T10:00:00+02:00". Resolve "tomorrow", weekdays and "saa yine" (Kinyarwanda: saa N means N+6 o'clock, so saa yine = 10:00) from the current Kigali time given. If they accept one of the offered times, use that one. A day with no hour: null. Never guess a time they did not say.
- otherHome: {"area": string or null, "bedrooms": integer or null (0 = studio), "rent": RWF per month as an integer or null ("200k" = 200000), "furnished": true/false/null}. Only when they offer another home; else null.
- question: the question in their words, one line, or null.
- lang: the language they wrote in: "en", "rw", "fr", "sw" or "ar".
A message can fit two answers: pick the one that matters most for the next step, and put the time or the other home in its field ("available" with a time; "taken" with an otherHome).`;

export function brokerReadPrompt(c: BrokerReadContext): string {
  const home = c.home;
  const facts = [home?.bedrooms != null ? (home.bedrooms === 0 ? "studio" : `${home.bedrooms}-bedroom`) : null, home?.area ? `in ${home.area}` : null, home?.rent ? `rent RWF ${home.rent}` : null].filter(Boolean).join(", ");
  return [
    `Now in Kigali: ${kigaliStamp(c.now)}.`,
    facts ? `The home we asked about: ${facts}.` : null,
    c.offeredSlots?.length ? `The ask offered these viewing times: ${c.offeredSlots.join(" or ")}.` : null,
    `The broker's message:\n"""\n${c.text.slice(0, 1200)}\n"""`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ── the reply ───────────────────────────────────────────────────────────────

/** "200k", "200,000", "RWF 200000", 200000 → 200000; anything that is not a monthly rent → null. */
export function rentOf(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 20_000 && v <= 20_000_000 ? Math.round(v) : null;
  if (typeof v !== "string") return null;
  const m = v.toLowerCase().replace(/[, ]/g, "").match(/(\d+(?:\.\d+)?)(k|m)?/);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] === "k" ? 1_000 : m[2] === "m" ? 1_000_000 : 1);
  return n >= 20_000 && n <= 20_000_000 ? Math.round(n) : null;
}

const str = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** The first JSON object in a model reply, fenced or not; null when there is none. */
function jsonObject(raw: string): Record<string, unknown> | null {
  const s = raw.replace(/```(?:json)?/gi, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const v: unknown = JSON.parse(s.slice(start, end + 1));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * The classifier's reply as a BrokerRead, or null when it is not one (not JSON, an answer outside the list).
 * A time is kept only when it is real and within a month ahead (an hour of slack behind); an other-home with
 * no area, size or rent is dropped; "other_home" with nothing in it reads as "unclear".
 */
export function parseBrokerRead(raw: string | null | undefined, now: Date = new Date()): BrokerRead | null {
  if (!raw) return null;
  const o = jsonObject(raw);
  if (!o) return null;
  let answer = typeof o.answer === "string" ? (o.answer.trim().toLowerCase() as BrokerAnswer) : null;
  if (!answer || !(BROKER_ANSWERS as readonly string[]).includes(answer)) return null;

  let time: Date | null = null;
  const t = str(o.time, 40);
  if (t && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t)) {
    // No offset given: it was meant in Kigali time.
    const d = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(t) ? t : `${t}+02:00`);
    if (!Number.isNaN(d.getTime()) && d.getTime() > now.getTime() - 3_600_000 && d.getTime() < now.getTime() + 30 * 86_400_000) time = d;
  }

  let otherHome: BrokerOtherHome | null = null;
  const oh = o.otherHome;
  if (oh && typeof oh === "object" && !Array.isArray(oh)) {
    const h = oh as Record<string, unknown>;
    const beds = typeof h.bedrooms === "number" && Number.isInteger(h.bedrooms) && h.bedrooms >= 0 && h.bedrooms <= 8 ? h.bedrooms : null;
    const cand: BrokerOtherHome = { area: str(h.area, 60), bedrooms: beds, rent: rentOf(h.rent), furnished: typeof h.furnished === "boolean" ? h.furnished : null };
    if (cand.area || cand.bedrooms != null || cand.rent != null) otherHome = cand;
  }
  if (answer === "other_home" && !otherHome) answer = "unclear";

  const lang = typeof o.lang === "string" && isLang(o.lang.trim().toLowerCase()) ? (o.lang.trim().toLowerCase() as Lang) : null;
  return { answer, time, otherHome, question: str(o.question, 240), lang };
}

// ── fast path ───────────────────────────────────────────────────────────────

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * Whether the rules cannot settle this reply alone. The rules answer a digit, a plain "yes" / "taken" (no time
 * in it, a few words), a resend, a greeting and "are you a bot?" (a person's). Everything else — a time, an
 * offered home, a question, a price, a long message, a voice note's words — is read by the classifier.
 */
export function needsClassifier(text: string, r: BrokerReply, now: Date = new Date()): boolean {
  const t = text.trim();
  if (!t) return false;
  if (r.asksIfBot) return false;
  if (r.resend) return false;
  if (r.greeting) return false;
  const hasTime = readViewingTime(t, now) != null;
  if ((r.yes || r.gone) && !hasTime && wordCount(t) <= 5 && r.price == null && !r.question) return false;
  return true;
}

/** The broker's language as the directory stores it (Broker.preferredLanguage): EN, FR or RW; null for others. */
export function storedLang(l: Lang | null | undefined): "EN" | "FR" | "RW" | null {
  return l === "en" ? "EN" : l === "fr" ? "FR" : l === "rw" ? "RW" : null;
}

/** Fold a classifier read back into the shape the inbox already acts on (BrokerReply flags), for a mixed read. */
export function readAsAnswer(read: BrokerRead): "AVAILABLE" | "RENTED" | null {
  if (read.answer === "available" || read.answer === "time") return "AVAILABLE";
  if (read.answer === "taken") return "RENTED";
  return null;
}
