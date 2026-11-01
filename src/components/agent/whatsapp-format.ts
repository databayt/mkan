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
const COPY: Record<
  WaLang,
  {
    month: string;
    night: string;
    seeAll: string;
    check: string;
    stop: string;
    pick: string;
    asked: string;
    confirmed: string;
    rented: string;
    /** A ref's home leads the list: "{ref}" is its code. */
    pinFound: string;
    /** The ref's home is gone (rented, or its ad was taken down), with homes like it below. */
    pinGone: string;
    /** The ref's home is gone and nothing like it is listed. */
    pinGoneAlone: string;
    /** Under a ref's home: the pick is the consent to ask its broker. */
    checkPinned: string;
    /** Nothing fits: may we ask brokers who cover the area? */
    askAround: string;
  }
> = {
  en: {
    month: "/month",
    night: "/night",
    seeAll: "All homes, photos and move-in costs:",
    check: "Reply with a home's number and I'll check with its broker that it's still free, and set up a viewing. It's free for you.",
    stop: "Reply STOP to stop.",
    pick: "Reply with a number, or just type.",
    asked: "asked",
    confirmed: "available",
    rented: "taken",
    pinFound: "Here's {ref}:",
    pinGone: "{ref} isn't available any more, sorry. Here are homes like it:",
    pinGoneAlone: "{ref} isn't available any more, sorry.",
    checkPinned: "Want me to check it's still free and set up a viewing? Reply *1*. It's free for you. 2 or 3 for the others.",
    askAround: "Want me to ask a few brokers who work in that area? Reply *yes* and I'll message you when one has something.",
  },
  ar: {
    month: "/شهر",
    night: "/ليلة",
    seeAll: "كل المنازل وصورها وتكلفة الانتقال:",
    check: "أرسل رقم المنزل وسأتأكد من الوسيط أنه ما زال متاحاً وأرتب لك معاينة، مجاناً.",
    stop: "أرسل STOP للإيقاف.",
    pick: "أرسل رقماً، أو اكتب ما تريد.",
    asked: "تم السؤال",
    confirmed: "متاح",
    rented: "مؤجَّر",
    pinFound: "هذا {ref}:",
    pinGone: "{ref} لم يعد متاحاً للأسف. هذه منازل قريبة منه:",
    pinGoneAlone: "{ref} لم يعد متاحاً للأسف.",
    checkPinned: "هل أتأكد أنه ما زال متاحاً وأرتب لك معاينة؟ أرسل *1*، والمعاينة مجانية لك. أو 2 و3 للمنزلين الآخرين.",
    askAround: "هل أسأل بعض الوسطاء الذين يعملون في تلك المنطقة؟ أرسل *نعم* وسأراسلك حين يجد أحدهم شيئاً.",
  },
  rw: {
    month: "/ukwezi",
    night: "/ijoro",
    seeAll: "Amazu yose, amafoto n'ikiguzi cyo kwimuka:",
    check: "Ohereza nimero y'inzu, mbaze komisiyoneri niba igihari kandi dupange gusura. Ni ubuntu kuri wowe.",
    stop: "Ohereza STOP kugira ngo uhagarike.",
    pick: "Ohereza nimero, cyangwa wandike.",
    asked: "nabajije",
    confirmed: "irahari",
    rented: "yafashwe",
    pinFound: "Iyi ni {ref}:",
    pinGone: "{ref} ntikiboneka, mbabarira. Dore amazu ameze nkayo:",
    pinGoneAlone: "{ref} ntikiboneka, mbabarira.",
    checkPinned: "Nkubarize niba igihari kandi dupange gusura? Ohereza *1*. Ni ubuntu kuri wowe. 2 cyangwa 3 ku yandi.",
    askAround: "Mbaze abakomisiyoneri bake bakorera muri ako gace? Ohereza *yego* nzakwandikira nibagira icyo babona.",
  },
};

/** The code a TikTok post tells viewers to send ("K5808"), or a bare number of the same shape. */
export const HOME_REF_RE = /\bK[-\s#]?(\d{3,6})\b/i;

/** A ref in a message: "K5808" anywhere, or a message that is only 4–6 digits. Null for anything else (a phone number is 9+). */
export function readHomeRef(text: string): number | null {
  const t = text.trim();
  const k = t.match(HOME_REF_RE);
  if (k) return Number(k[1]);
  const bare = t.match(/^#?(\d{4,6})$/);
  return bare ? Number(bare[1]) : null;
}

/** "yes" to the last question, in the tenant's words — a digit 1 too. */
export const saysYes = (text: string) => /^(?:1|yes|yeah|yep|ok(?:ay)?|sure|please|go ahead|yego|ndiyo|oui|نعم|ايوه|أيوه|ايوا|تمام)[\s.!]*$/i.test(text.trim());

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
      const ref = m.pin ? `K${m.pin.id}` : null;
      if (m.pin?.found) parts.push(fill(c.pinFound, { ref: ref! }));
      else if (m.pin) parts.push(fill(c.pinGone, { ref: ref! }));
      else parts.push(m.text?.trim() || fill(d.reply.shortlist, { count: m.count }));
      if (m.demand && m.asked) parts.push(fill(d.demand.widenedAsked, { count: m.asked }));
      const homes = homeLines(view.shortlist, lang, appUrl);
      if (homes.length) parts.push(homes.join("\n\n"));
      const pinned = m.pin?.found ? view.shortlist[0] : undefined;
      if (pinned?.lead && pinned.availability === "unconfirmed") parts.push(c.checkPinned);
      else if (view.shortlist.some((s) => s.lead && s.availability === "unconfirmed")) parts.push(c.check);
      if (!m.pin && m.refine === "stay") parts.push(d.refine.stay ?? "");
      else if (!m.pin && m.refine === "maxPrice") parts.push(d.refine.budget ?? "");
      break;
    }
    case "answer":
      parts.push(m.text?.trim() || (m.topic === "other" ? d.reply.other : d.reply.answerFallback) || "");
      break;
    case "none":
      if (m.pin) parts.push(fill(c.pinGoneAlone, { ref: `K${m.pin.id}` }));
      if (m.demand) parts.push(m.asked ? fill(d.demand.noneAsked, { count: m.asked }) : d.demand.noneKept ?? "");
      else parts.push((m.stay === "long" ? d.reply.noneLong : d.reply.none) ?? "");
      // Brokers hear about it only if the tenant says yes (demand.ts askAround).
      if (m.demand && !m.asked) parts.push(c.askAround);
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

export type Pick = { kind: "text"; text: string } | { kind: "check"; listingId: number } | { kind: "askAround" } | null;

/**
 * A bare digit answers the agent's last numbered question: an option of the
 * clarify / stay ask becomes its label (which the readers understand), a home
 * number becomes "check this home". "Yes" answers the two yes/no questions:
 * "want me to check it?" under a ref's home, and "want me to ask brokers
 * around?" when nothing fit. Anything else is not a pick.
 */
export function readPick(text: string, view: AgentTaskView | null, d: WaDict): Pick {
  const last = view ? lastAgent(view) : null;
  if (last?.kind === "none" && last.demand && !last.asked && saysYes(text)) return { kind: "askAround" };
  if (last?.kind === "shortlist" && last.pin?.found && view!.shortlist[0] && saysYes(text) && !/^\d/.test(text.trim())) return { kind: "check", listingId: view!.shortlist[0].id };
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

/**
 * What to answer "check home N" with: asked (the line wrote to the broker),
 * handed (a person at Mkan checks it — broker sends paused, or a team number),
 * or none (no broker to reach, or one asked lately who has not answered yet).
 */
export function checkText(lang: WaLang, outcome: "asked" | "handed" | "none", title: string): string {
  if (lang === "ar")
    return outcome === "asked"
      ? `سألت الوسيط عن «${title}». سأرسل لك الرد هنا.`
      : outcome === "handed"
        ? `تمام، أتحقق من «${title}» مع الوسيط الآن، وسأراسلك هنا.`
        : `لا أستطيع الحصول على رد بخصوص «${title}» الآن. سأخبرك هنا إن ردّ الوسيط. الرابط أعلاه فيه الإعلان.`;
  if (lang === "rw")
    return outcome === "asked"
      ? `Nabajije komisiyoneri ibya "${title}". Igisubizo nzakikoherereza hano.`
      : outcome === "handed"
        ? `Yego, ndimo kubaza komisiyoneri ibya "${title}" ubu. Nzakwandikira hano.`
        : `Ntabwo mbona igisubizo ku bya "${title}" ubu. Nzakubwira hano nasubiza. Link iri hejuru ifite itangazo.`;
  return outcome === "asked"
    ? `I've asked the broker about "${title}". I'll send their answer here.`
    : outcome === "handed"
      ? `Got it, I'm checking "${title}" with the broker now. I'll message you here.`
      : `I can't get an answer about "${title}" right now. I'll tell you here if the broker writes back. The link above has the ad.`;
}

/** What to answer "yes, ask around" with. */
export function askAroundText(lang: WaLang, result: { asked: number; handed: boolean }): string {
  const { asked, handed } = result;
  if (lang === "ar")
    return handed || asked > 0 ? `تمام، أسأل الوسطاء في المنطقة الآن، وسأراسلك هنا حين يجد أحدهم شيئاً.` : `لم أجد بعد وسيطاً يغطي تلك المنطقة. سأراسلك حين يصل منزل يناسبك.`;
  if (lang === "rw")
    return handed || asked > 0 ? `Yego, ndimo kubaza abakomisiyoneri bo muri ako gace. Nzakwandikira hano nibagira icyo babona.` : `Sindabona komisiyoneri ukorera muri ako gace. Nzakwandikira inzu ihuye n'ibyo ushaka nibonetse.`;
  return handed || asked > 0
    ? `Done, I'm asking brokers who work in that area. I'll message you here when one has something.`
    : `I couldn't find a broker who covers that area yet. I'll message you when a home that fits comes in.`;
}

/**
 * "Are you a bot?" from a tenant: the truth, and a person one word away. The
 * line never claims to be a person (2026-10-27, kept 11-01); a #mkan card
 * tells the team someone asked.
 */
export function botText(lang: WaLang, rep: string): string {
  if (lang === "ar") return `أنت تتحدث مع مساعد مكان: أبحث في المنازل وأتواصل مع الوسطاء من أجلك. ${rep} من فريقنا يتابع المحادثات ويحضر المعاينة معك. اكتب «شخص» إن أردت أن يرد عليك أحد من الفريق.`;
  if (lang === "rw") return `Uri kuvugana n'umufasha wa Mkan: nshakisha amazu kandi mvugana n'abakomisiyoneri ku bwawe. ${rep} wo mu itsinda ryacu akurikirana ibiganiro kandi azaza mu gusura. Andika "umuntu" niba ushaka ko akwisubiriza.`;
  return `You're chatting with Mkan's assistant: I search the homes and talk to the brokers for you. ${rep} from our team follows these chats and comes to the viewing with you. Type "person" if you'd like a person to reply.`;
}

/** The tenant asked for a person: one is told (a #mkan card), and the tenant hears so. */
export function personText(lang: WaLang, rep: string): string {
  if (lang === "ar") return `تمام، طلبت من ${rep} أن يرد عليك هنا.`;
  if (lang === "rw") return `Yego, nasabye ${rep} kugusubiza hano.`;
  return `Okay, I've asked ${rep} to reply to you here.`;
}

/** "person" / "human" / "agent": the tenant wants someone from Mkan. */
export const wantsPerson = (text: string) => /^(?:a )?(?:person|human|real person|agent|someone|staff|شخص|انسان|إنسان|umuntu)[\s.!]*$/i.test(text.trim());

/** The web → WhatsApp hand-off: `/find`'s "Continue on WhatsApp" sends this ref, the chat carries over. */
export const REF_RE = /\bref[:#]\s*([a-z0-9]{20,32})\b/i;
export const readRef = (text: string): { ref: string | null; rest: string } => {
  const m = text.match(REF_RE);
  return m ? { ref: m[1]!, rest: text.replace(REF_RE, "").trim() } : { ref: null, rest: text.trim() };
};

/** Words that start a new search instead of refining the current one. */
export const isFresh = (text: string) => /^(new|new search|start over|restart|جديد|بحث جديد|gishya|shakisha bundi bushya)$/i.test(text.trim());

export { COPY as WA_COPY };
