/**
 * The rental agent's answer as one WhatsApp message — the chat the panel
 * draws, in text. Pure, so the tests read exactly what a tenant receives.
 *
 * Cards become numbered lines (the first link unfurls with its photo), the
 * clarify stepper and the stay/budget asks become numbered options, and the
 * reply ends with the /find link where the full cards live. A tenant answers
 * a numbered option with its digit: `readPick` turns that back into words the
 * agent's readers already understand, or into "check home N".
 */
import { districtName } from "@/lib/geo/rwanda-places";
import { zoneLabel } from "@/lib/geo/kigali-zones";
import type { AgentMessage, AgentTaskView, ShortlistItem } from "./types";

export type WaLang = "en" | "ar" | "rw";

/** The strings the panel already uses — read from the `agent` dictionary by the caller. */
export interface WaDict {
  reply: Record<string, string>;
  ask: Record<string, string>;
  demand: Record<string, string>;
  refine: Record<string, string>;
  clarify: { reply: string; q: Record<string, string>; options: Record<string, Record<string, { label: string }>> };
}

/** Only WhatsApp says these: the panel has buttons where the chat has words. */
const COPY: Record<WaLang, { month: string; night: string; seeAll: string; check: string; stop: string; pick: string; asked: string; confirmed: string; rented: string }> = {
  en: {
    month: "/month",
    night: "/night",
    seeAll: "All homes, photos and move-in costs:",
    check: "Reply with a home's number and I'll ask its broker if it's still free.",
    stop: "Reply STOP to stop.",
    pick: "Reply with a number, or just type.",
    asked: "asked",
    confirmed: "available",
    rented: "taken",
  },
  ar: {
    month: "/شهر",
    night: "/ليلة",
    seeAll: "كل المنازل وصورها وتكلفة الانتقال:",
    check: "أرسل رقم المنزل وسأسأل الوسيط إن كان ما زال متاحاً.",
    stop: "أرسل STOP للإيقاف.",
    pick: "أرسل رقماً، أو اكتب ما تريد.",
    asked: "تم السؤال",
    confirmed: "متاح",
    rented: "مؤجَّر",
  },
  rw: {
    month: "/ukwezi",
    night: "/ijoro",
    seeAll: "Amazu yose, amafoto n'ikiguzi cyo kwimuka:",
    check: "Ohereza nimero y'inzu, mbaze komisiyoneri niba igihari.",
    stop: "Ohereza STOP kugira ngo uhagarike.",
    pick: "Ohereza nimero, cyangwa wandike.",
    asked: "nabajije",
    confirmed: "irahari",
    rented: "yafashwe",
  },
};

export const MAX_HOMES = 3;

/** The language of a WhatsApp message: Arabic script, a few Kinyarwanda words, else English. */
export function waLang(text: string): WaLang {
  if (/[؀-ۿ]/.test(text)) return "ar";
  if (/\b(muraho|mwaramutse|mwiriwe|ndashaka|ndashaka|inzu|icyumba|ibyumba|amafaranga|ukwezi|ibihumbi|murakoze|ese)\b/i.test(text)) return "rw";
  return "en";
}

const money = (n: number) => `RWF ${Math.round(n).toLocaleString("en-US")}`;

function place(item: ShortlistItem, lang: WaLang): string | null {
  const zone = zoneLabel(item.zone, lang);
  if (zone) return zone;
  return item.district ? districtName(item.district.toUpperCase(), lang) || item.district : null;
}

/** Absolute links only: a lead's path is its TikTok post, a listing's is "/en/listings/…". */
const absolute = (path: string, appUrl: string) => (/^https?:\/\//.test(path) ? path : path ? `${appUrl}${path}` : null);

function homeLines(items: ShortlistItem[], lang: WaLang, appUrl: string): string[] {
  const c = COPY[lang];
  return items.slice(0, MAX_HOMES).map((item, i) => {
    const price = `${money(item.cost.headline)}${item.cost.period === "night" ? c.night : c.month}`;
    const status = item.availability === "confirmed" ? c.confirmed : item.availability === "rented" ? c.rented : item.availability === "asked" ? c.asked : null;
    const head = [`*${i + 1}. ${item.title.trim()}*`, price, place(item, lang), status ? `(${status})` : null].filter(Boolean).join(" · ");
    const link = absolute(item.path, appUrl);
    return link ? `${head}\n${link}` : head;
  });
}

/** One question with numbered options — the clarify stepper and the stay ask, in text. */
function numbered(question: string, labels: string[], lang: WaLang): string {
  return [question, ...labels.map((l, i) => `${i + 1}. ${l}`), COPY[lang].pick].join("\n");
}

const CLARIFY_ORDER: Record<string, string[]> = {
  stay: ["long", "short"],
  homeType: ["apartment", "house", "room", "studio"],
  furnished: ["no", "yes"],
  purpose: ["family", "study", "business"],
};

/** The newest agent message: what this turn answered. */
export const lastAgent = (view: AgentTaskView) => [...view.messages].reverse().find((m): m is Extract<AgentMessage, { role: "agent" }> => m.role === "agent") ?? null;

/** Everything the tenant gets for the turn that just ran. */
export function formatWhatsApp(view: AgentTaskView, d: WaDict, lang: WaLang, chatUrl: string, appUrl: string): string {
  const c = COPY[lang];
  const m = lastAgent(view);
  if (!m) return d.reply.working ?? "…";
  const fill = (s: string | undefined, vars: Record<string, string | number>) => (s ?? "").replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
  const parts: string[] = [];

  switch (m.kind) {
    case "ask":
      if (m.field === "stay") parts.push(numbered(d.ask.stay ?? "", [d.clarify.options.stay?.long?.label ?? "Months", d.clarify.options.stay?.short?.label ?? "A few nights"], lang));
      else parts.push(d.ask[m.field] ?? d.ask.maxPrice ?? "");
      break;
    case "clarify": {
      // WhatsApp asks one thing at a time: the first, most result-changing field.
      const field = m.fields[0];
      const opts = field ? CLARIFY_ORDER[field] ?? [] : [];
      parts.push(d.clarify.reply);
      if (field) parts.push(numbered(d.clarify.q[field] ?? "", opts.map((o) => d.clarify.options[field]?.[o]?.label ?? o), lang));
      break;
    }
    case "shortlist": {
      parts.push(m.text?.trim() || fill(d.reply.shortlist, { count: m.count }));
      if (m.demand && m.asked) parts.push(fill(d.demand.widenedAsked, { count: m.asked }));
      const homes = homeLines(view.shortlist, lang, appUrl);
      if (homes.length) parts.push(homes.join("\n\n"));
      if (view.shortlist.some((s) => s.lead && s.availability === "unconfirmed")) parts.push(c.check);
      if (m.refine === "stay") parts.push(d.refine.stay ?? "");
      else if (m.refine === "maxPrice") parts.push(d.refine.budget ?? "");
      break;
    }
    case "answer":
      parts.push(m.text?.trim() || (m.topic === "other" ? d.reply.other : d.reply.answerFallback) || "");
      break;
    case "none":
      if (m.demand) parts.push(m.asked ? fill(d.demand.noneAsked, { count: m.asked }) : d.demand.noneKept ?? "");
      else parts.push((m.stay === "long" ? d.reply.noneLong : d.reply.none) ?? "");
      break;
    case "monthlyOnly":
      parts.push(d.reply.monthlyOnly ?? "");
      break;
    case "error":
      parts.push(d.reply.error ?? "");
      break;
  }
  if (m.kind === "shortlist" || m.kind === "none") parts.push(`${c.seeAll}\n${chatUrl}`);
  return parts.filter((p) => p.trim()).join("\n\n");
}

/** A short reply when the agent cannot run this message: the last turn is still going, or too many messages. */
export function busyText(d: WaDict, why: "busy" | "rate"): string {
  return (why === "busy" ? d.reply.busy : d.reply.rate) ?? "";
}

export type Pick = { kind: "text"; text: string } | { kind: "check"; listingId: number } | null;

/**
 * A bare digit answers the agent's last numbered question: an option of the
 * clarify / stay ask becomes its label (which the readers understand), a home
 * number becomes "check this home". Anything else is not a pick.
 */
export function readPick(text: string, view: AgentTaskView | null, d: WaDict): Pick {
  const digit = text.trim().replace(/[٠-٩]/g, (ch) => String(ch.charCodeAt(0) - 0x0660)).match(/^([1-9])\.?$/);
  if (!digit || !view) return null;
  const n = Number(digit[1]);
  const m = lastAgent(view);
  if (!m) return null;
  if (m.kind === "ask" && m.field === "stay") {
    const key = ["long", "short"][n - 1];
    return key ? { kind: "text", text: d.clarify.options.stay?.[key]?.label ?? key } : null;
  }
  if (m.kind === "clarify" && m.fields[0]) {
    const key = CLARIFY_ORDER[m.fields[0]]?.[n - 1];
    return key ? { kind: "text", text: d.clarify.options[m.fields[0]]?.[key]?.label ?? key } : null;
  }
  if (m.kind === "shortlist") {
    const item = view.shortlist.slice(0, MAX_HOMES)[n - 1];
    return item ? { kind: "check", listingId: item.id } : null;
  }
  return null;
}

/** What to answer "check home N" with, once the broker loop ran (or could not). */
export function checkText(lang: WaLang, asked: boolean, title: string): string {
  if (lang === "ar") return asked ? `سألت الوسيط عن «${title}». سأرسل لك الرد هنا.` : `لا أستطيع السؤال عن «${title}» الآن — افتح الرابط أعلاه للتفاصيل.`;
  if (lang === "rw") return asked ? `Nabajije komisiyoneri ibya "${title}". Igisubizo nzakikoherereza hano.` : `Sinshobora kubaza ibya "${title}" ubu — fungura link iri hejuru.`;
  return asked ? `I've asked the broker about "${title}". I'll send their answer here.` : `I can't ask about "${title}" right now — the link above has its details.`;
}

/** The web → WhatsApp hand-off: `/find`'s "Continue on WhatsApp" sends this ref, the chat carries over. */
export const REF_RE = /\bref[:#]\s*([a-z0-9]{20,32})\b/i;
export const readRef = (text: string): { ref: string | null; rest: string } => {
  const m = text.match(REF_RE);
  return m ? { ref: m[1]!, rest: text.replace(REF_RE, "").trim() } : { ref: null, rest: text.trim() };
};

/** Words that start a new search instead of refining the current one. */
export const isFresh = (text: string) => /^(new|new search|start over|restart|جديد|بحث جديد|gishya|shakisha bundi bushya)$/i.test(text.trim());

export { COPY as WA_COPY };
