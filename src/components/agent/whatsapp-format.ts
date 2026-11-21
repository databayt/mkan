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
import { KIGALI_ZONE_BY_SLUG, zoneLabel, zoneNamed } from "@/lib/geo/kigali-zones";
import { forTenant } from "./home-path";
import { EMPTY_REQUIREMENTS, editDistance, parseAdjustments, parseRequirements } from "./requirements";
import { asksForToday } from "./today-pure";
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
    /** Under a ref's home a broker already said yes to: the pick books the viewing. */
    bookPinned: string;
    /** Under the homes, when one of them is confirmed available. */
    book: string;
    /** Nothing fits: may we ask brokers who cover the area? */
    askAround: string;
    /** Under today's homes: the /today link, and with it how many more than the 3 listed ("{n}"). */
    todayAll: string;
    todayMore: string;
    /** The list's own opening line: WhatsApp has no cards, so it never says "each card" or "1 homes". */
    listMany: string;
    listOne: string;
    /** Nothing fit the budget; these are the closest, a little above it ("{budget}"). */
    closest: string;
    /** Nothing fit every detail; these are the closest. */
    widened: string;
    /** The same tail, shorter, for a list that follows another list in the chat. */
    checkShort: string;
    /** The budget ask, once, before any homes: the most they can pay a month. */
    askBudget: string;
  }
> = {
  en: {
    month: "/month",
    night: "/night",
    seeAll: "All homes, photos and move-in costs:",
    check: "Reply with a number and I'll check it's still free, then set up a viewing. It's free for you.",
    stop: "Reply STOP to stop.",
    pick: "Reply with a number, or just type.",
    asked: "asked",
    confirmed: "available",
    rented: "taken",
    pinFound: "Here's {ref}:",
    pinGone: "{ref} isn't available any more, sorry. Here are homes like it:",
    pinGoneAlone: "{ref} isn't available any more, sorry.",
    checkPinned: "Want me to check it's still free and set up a viewing? Reply *1*. It's free for you. *2* is the other.",
    bookPinned: "The broker says it's available. Reply *1* and I'll set up the viewing — it's free for you.",
    book: "A home marked available can be viewed: reply with its number and I'll set it up. It's free for you.",
    askAround: "Want me to ask a few brokers who work in that area? Reply *yes* and I'll message you when one has something.",
    todayAll: "All of today's homes, with videos:",
    todayMore: "{n} more posted today. All of today's homes, with videos:",
    listMany: "Here are the homes that fit:",
    listOne: "Here's the home that fits:",
    closest: "Nothing at or under {budget} a month. The closest are a little above it:",
    widened: "Nothing matched every detail, so these are the closest:",
    checkShort: "Which one? Reply with its number.",
    askBudget: "What's the most you can pay a month, in RWF?",
  },
  ar: {
    month: "/شهر",
    night: "/ليلة",
    seeAll: "كل المنازل وصورها وتكلفة الانتقال:",
    check: "أرسل الرقم وسأتأكد أنه ما زال متاحاً ثم أرتب لك معاينة، مجاناً.",
    stop: "أرسل STOP للإيقاف.",
    pick: "أرسل رقماً، أو اكتب ما تريد.",
    asked: "تم السؤال",
    confirmed: "متاح",
    rented: "مؤجَّر",
    pinFound: "هذا {ref}:",
    pinGone: "{ref} لم يعد متاحاً للأسف. هذه منازل قريبة منه:",
    pinGoneAlone: "{ref} لم يعد متاحاً للأسف.",
    checkPinned: "هل أتأكد أنه ما زال متاحاً وأرتب لك معاينة؟ أرسل *1*، والمعاينة مجانية لك. و*2* للمنزل الآخر.",
    bookPinned: "يقول الوسيط إنه متاح. أرسل *1* وسأرتب لك المعاينة، وهي مجانية لك.",
    book: "يمكنك معاينة المنزل المتاح: أرسل رقمه وسأرتب ذلك، والمعاينة مجانية لك.",
    askAround: "هل أسأل بعض الوسطاء الذين يعملون في تلك المنطقة؟ أرسل *نعم* وسأراسلك حين يجد أحدهم شيئاً.",
    todayAll: "كل منازل اليوم مع الفيديوهات:",
    todayMore: "هناك {n} أخرى نُشرت اليوم. كل منازل اليوم مع الفيديوهات:",
    listMany: "هذه المنازل التي تناسبك:",
    listOne: "هذا المنزل الذي يناسبك:",
    closest: "لا يوجد شيء بـ {budget} أو أقل في الشهر. هذه الأقرب، وهي أعلى قليلاً:",
    widened: "لم يطابق شيء كل التفاصيل، فهذه الأقرب:",
    checkShort: "أيّهما؟ أرسل رقمه.",
    askBudget: "ما أقصى مبلغ تدفعه في الشهر بالفرنك الرواندي؟",
  },
  rw: {
    month: "/ukwezi",
    night: "/ijoro",
    seeAll: "Amazu yose, amafoto n'ikiguzi cyo kwimuka:",
    check: "Ohereza nimero ndebe niba igihari, hanyuma dupange gusura. Ni ubuntu kuri wowe.",
    stop: "Ohereza STOP kugira ngo uhagarike.",
    pick: "Ohereza nimero, cyangwa wandike.",
    asked: "nabajije",
    confirmed: "irahari",
    rented: "yafashwe",
    pinFound: "Iyi ni {ref}:",
    pinGone: "{ref} ntikiboneka, mbabarira. Dore amazu ameze nkayo:",
    pinGoneAlone: "{ref} ntikiboneka, mbabarira.",
    checkPinned: "Nkubarize niba igihari kandi dupange gusura? Ohereza *1*. Ni ubuntu kuri wowe. *2* ni yindi.",
    bookPinned: "Komisiyoneri avuga ko iracyahari. Ohereza *1* ngupangire gusura — ni ubuntu kuri wowe.",
    book: "Inzu yanditseho ko iracyahari ushobora kuyisura: ohereza nimero yayo nkagupangira. Ni ubuntu kuri wowe.",
    askAround: "Mbaze abakomisiyoneri bake bakorera muri ako gace? Ohereza *yego* nzakwandikira nibagira icyo babona.",
    todayAll: "Amazu yose y'uyu munsi, hamwe na videwo:",
    todayMore: "Hari andi {n} yashyizweho uyu munsi. Amazu yose y'uyu munsi, hamwe na videwo:",
    listMany: "Dore amazu aguhuye:",
    listOne: "Dore inzu ikuhuye:",
    closest: "Nta nzu iri kuri {budget} cyangwa munsi yayo ku kwezi. Izi ni zo zegereye, zirenga gato:",
    widened: "Nta nzu ihuje ibyo wavuze byose, none izi ni zo zegereye:",
    checkShort: "Iyihe? Ohereza nimero yayo.",
    askBudget: "Ni angahe menshi ushobora kwishyura ku kwezi, mu mafaranga y'u Rwanda?",
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

/**
 * A home's code that asks for the check in the same breath — "Check K1234 for me" (what /find's card
 * and the /k page prefill), "is K1234 still available?", "تحقّق من K1234", "inzu K1234 iracyahari?".
 * The tenant chose that home on their own phone, so it is the pick: the broker is asked at once and
 * the answer comes back on this chat (2026-11-05). A bare code (a TikTok caption's) still asks first.
 */
const CHECK_WORD_RE =
  /\b(?:check|checking|available|availability|still free|is it free|verify|confirm|disponible|v[ée]rifie[rz]?)\b|mbarize|mbaza|iracyahari|iracyari|irahari|igihari|تحق|تأكد|تاكد|متاح|متوفر/i;
export const asksToCheck = (text: string): boolean => readHomeRef(text) != null && CHECK_WORD_RE.test(text);

/** Where a chat's home code came from — the first-share funnel's attribution (2026-11-05). */
export type KnownRefSource = "tiktok" | "tiktok_bio" | "today" | "k_page" | "web" | "organic";
/**
 * A share marker (`fb-kimironko`, `wa-status`, `gbp`…) is a source too (2026-11-16): the `?s=` of the link
 * that brought the person, carried in their first WhatsApp text as ` s:<marker>`.
 */
export type RefSource = KnownRefSource | (string & {});

/** ` s:<marker>` in a WhatsApp text — the first-touch source the site appended to the prefilled message. */
const SHARE_MARK_RE = /(?:^|\s)s:([a-z0-9][a-z0-9_-]{0,31})(?=\s|$)/i;

/** The share marker a message carries, lowercase; null when none. */
export const readShareMarker = (text: string): string | null => text.match(SHARE_MARK_RE)?.[1]?.toLowerCase() ?? null;

/** The message without its share marker, so the agent reads only what the tenant needs. */
export const withoutShareMarker = (text: string): string => text.replace(new RegExp(SHARE_MARK_RE.source, "gi"), " ").replace(/[ \t]{2,}/g, " ").trim();

/** The words the /k/<code> page prefills after the code, so its chats count apart from TikTok's. */
export const K_PAGE_MARK = "mkan.sd";

/** The marker the /tt page (the TikTok profile's link) puts in its WhatsApp messages — with a code or without one. */
export const TIKTOK_BIO_MARK = "tiktok_bio";

/** The marker the /today page puts in its WhatsApp messages: those chats count apart from /tt's and the captions' (2026-11-15). */
export const TODAY_MARK = "mkan_today";

/**
 * A first message that says it came from TikTok without the code: "saw your video", "on TikTok",
 * "kuri TikTok", "تيك توك". Not one chat in 17 posts and 2,248 views had sent a code (2026-11-08),
 * so a viewer who writes in their own words must still count as TikTok's.
 */
const TIKTOK_WORDS_RE =
  /\b(?:on|from|in|via|kuri|sur)\s+tik\s?tok\b|\btik\s?tok\s+(?:video|post|ad|page|live)s?\b|(?:على|من|في|ب)\s?تيك\s?توك|\b(?:saw|seen|watched|see)\b.{0,24}\b(?:video|post|reel)s?\b|\byour (?:video|post)s?\b/i;

/**
 * The marker first (a /tt message is that page whatever else it carries); then a code with the /k page's mark is that page; a code carried with a web chat's `ref:` is /find;
 * then an ` s:<marker>` the site appended (the link that brought the person); a bare code is what a TikTok
 * caption asks viewers to send. No code: TikTok when the words say so, else organic.
 */
export function refSourceOf(text: string, webRef: string | null): RefSource {
  if (/\btiktok_bio\b/i.test(text)) return "tiktok_bio";
  if (/\bmkan_today\b/i.test(text)) return "today";
  const hasCode = readHomeRef(text) != null;
  if (hasCode && /\bmkan\.sd\b/i.test(text)) return "k_page";
  if (webRef) return "web";
  // A share marker beats the guesses below, never the page markers above (2026-11-16).
  const shared = readShareMarker(text);
  if (shared) return shared;
  // A pasted TikTok link is TikTok's too (tiktok-link.ts reads which home it shows).
  if (!hasCode) return TIKTOK_WORDS_RE.test(text) || /\btiktok\.com\//i.test(text) ? "tiktok" : "organic";
  return "tiktok";
}

/**
 * For one of Abdout's own contacts (agent/personal.ts) the bar is higher than for a stranger:
 * friends say "home", "price" and "available" in everyday talk. A home code, a rental word, or a
 * place word together with a want — "I'm at home" is not a request, "looking for a house" is.
 */
const RENT_WORD = /\b(?:rent|renting|rental|for rent|to let|bed ?rooms?|bdr|apartments?|appartment|studio|furnished|unfurnished|tenant|landlord|gukodesha|ubukode|ibyumba|louer|loyer|appartement)\b|ايجار|إيجار|شقة|للإيجار/i;
const PLACE_WORD = /\b(?:house|houses|room|rooms|inzu|icyumba|maison|chambre)\b|منزل|بيت|غرفة|سكن/i;
const WANT_WORD = /\b(?:looking for|look for|searching|need|want|how much|price|budget|ndashaka|nshaka|nkeneye|ndakeneye|angahe|cherche)\b|ابحث|أبحث|عايز|عاوز|محتاج|اريد|أريد|بكم|كم سعر/i;
export const asksForHome = (text: string): boolean =>
  HOME_REF_RE.test(text) || RENT_WORD.test(text) || (PLACE_WORD.test(text) && WANT_WORD.test(text));

/** "yes" to the last question, in the tenant's words — a digit 1 too. */
export const saysYes = (text: string) => /^(?:1|yes|yeah|yep|ok(?:ay)?|sure|please|go ahead|yego|ndiyo|oui|نعم|ايوه|أيوه|ايوا|تمام)[\s.!]*$/i.test(text.trim());

/**
 * Homes a WhatsApp list shows: two, not three (2026-11-21) — a wall of three titles, three links, a /find
 * link and a plug read as a form letter, and tenants answered none of it. The rest wait behind "more".
 */
export const MAX_HOMES = 2;

/** "I'd like to view K1234" — the /find card's "Book the viewing on WhatsApp" prefill, in en / ar / rw / fr. */
export const wantsViewing = (text: string): boolean =>
  /\b(?:view|viewing|visit|see it|book|visiter|voir)\b|معاين|زيار|أشوف|gusura|kureba/i.test(text);

/** Words every language uses on WhatsApp: they say nothing about which one the tenant writes in. */
const NEUTRAL_WORDS = /^(?:ok|okay|okey|k|yes|yeah|yep|no|nope|yego|oya|oui|non|merci|thanks|thank you|thx|please|pls|hi|hello|hey|wow|sure|good|great|fine|cool|bro|sir|madam)$/i;

/**
 * A message with no language in it — a number, a price ("300k"), a home code, an emoji, "ok" — keeps
 * the chat's language: each one used to flip an Arabic or Kinyarwanda chat to English for good.
 */
export function isLanguageNeutral(text: string): boolean {
  const words = text
    .replace(HOME_REF_RE, " ")
    .replace(/\d+(?:[.,]\d+)*\s*(?:k|m|rwf|frw|usd|\$)?/gi, " ")
    .replace(/[^\p{L}\s']/gu, " ")
    .trim()
    .toLowerCase();
  if (!words) return true;
  return NEUTRAL_WORDS.test(words);
}

/** Words that say a message is English: place names and numbers alone are not. */
const ENGLISH_WORDS = /\b(?:the|an?|is|are|am|i|you|my|me|for|in|with|and|to|of|need|want|looking|please|hello|hi|hey|how|what|can|do|does|home|house|room|rooms|rent|budget|bedroom|bedrooms|apartment|price|month|furnished|thanks|thank|yes|no)\b/i;

/** The language of a WhatsApp message: Arabic script, a few Kinyarwanda words, else English — or the chat's own when the message says nothing. */
export function waLang(text: string, prev?: string | null): WaLang {
  if (prev && (prev === "en" || prev === "ar" || prev === "rw") && isLanguageNeutral(text)) return prev;
  if (/[؀-ۿ]/.test(text)) return "ar";
  if (/\b(muraho|mwaramutse|mwiriwe|ndashaka|inzu|icyumba|ibyumba|amafaranga|ukwezi|ibihumbi|murakoze|ese|ibishya|munsi)\b/i.test(text)) return "rw";
  // "bite" / "amakuru" (how are you) alone: the whole message is Kinyarwanda, and an English "Hi, this is Mkan" answered it (wa-06, 2026-11-21).
  if (/^\s*(?:bite|amakuru)\s*[?!.]*\s*$/i.test(text)) return "rw";
  // No Kinyarwanda and no English in it either — "kimironko, remera" after a Kinyarwanda chat (…505, 11-17) —
  // keeps the chat's language: a list in two languages is the mix tenants saw.
  if ((prev === "rw" || prev === "ar") && !ENGLISH_WORDS.test(text)) return prev;
  return "en";
}

const money = (n: number) => `RWF ${Math.round(n).toLocaleString("en-US")}`;

function place(item: ShortlistItem, lang: WaLang): string | null {
  const zone = zoneLabel(item.zone, lang);
  if (zone) return zone;
  return item.district ? districtName(item.district.toUpperCase(), lang) || item.district : null;
}

/** Absolute links only: a listing's path is "/en/listings/…", a broker home's is Mkan's own page "/en/k/K…" (home-path.ts). */
const absolute = (path: string, appUrl: string) => (/^https?:\/\//.test(path) ? path : path ? `${appUrl}${path}` : null);

export function homeLines(items: ShortlistItem[], lang: WaLang, appUrl: string): string[] {
  const c = COPY[lang];
  return items.slice(0, MAX_HOMES).map((item, i) => {
    const price = `${money(item.cost.headline)}${item.cost.period === "night" ? c.night : c.month}`;
    const status = item.availability === "confirmed" ? c.confirmed : item.availability === "rented" ? c.rented : item.availability === "asked" ? c.asked : null;
    const head = [`*${i + 1}. ${item.title.trim()}*`, price, place(item, lang), status ? `(${status})` : null].filter(Boolean).join(" · ");
    // Never the broker's ad: its caption carries their number (forTenant, 2026-11-01).
    const link = absolute(forTenant(item, lang).path, appUrl);
    return link ? `${head}\n${link}` : head;
  });
}

/**
 * The shortlist after a broker said `takenId` is gone: the taken home goes last and marked, confirmed homes
 * first, then the rest in their order. A chat that numbered the homes 1..n then numbers them again from the
 * top, so "1" is the next best, never the home that is gone.
 */
export function reorderAfterTaken(shortlist: ShortlistItem[], takenId: number): ShortlistItem[] {
  const marked = shortlist.map((s) => (s.id === takenId ? { ...s, availability: "rented" as const } : s));
  const live = marked.filter((s) => s.availability !== "rented");
  const gone = marked.filter((s) => s.availability === "rented");
  return [...live.filter((s) => s.availability === "confirmed"), ...live.filter((s) => s.availability !== "confirmed"), ...gone];
}

/** The next best homes to offer at once when one is taken: at most MAX_HOMES, never a taken one. */
export const nextBestAfterTaken = (shortlist: ShortlistItem[], takenId: number): ShortlistItem[] =>
  reorderAfterTaken(shortlist, takenId).filter((s) => s.availability !== "rented").slice(0, MAX_HOMES);

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

/**
 * Where a tenant's WhatsApp message stands in its chat: not taken in, answered by a later message's turn
 * ("superseded"), replied to, answered only with the error, or still waiting for its reply. Only agent
 * messages AFTER it count — the previous turn's reply is not this one's (2026-11-08: a slow turn re-sent it).
 */
export type TakenIn = "not-in" | "superseded" | "replied" | "errored" | "unanswered";
export function takenIn(messages: AgentMessage[], msgId: string): TakenIn {
  const i = messages.findIndex((m) => m.role === "user" && m.wa === msgId);
  if (i < 0) return "not-in";
  const after = messages.slice(i + 1);
  if (after.some((m) => m.role === "user")) return "superseded";
  const agent = after.filter((m): m is Extract<AgentMessage, { role: "agent" }> => m.role === "agent");
  if (agent.length === 0) return "unanswered";
  return agent.at(-1)!.kind === "error" ? "errored" : "replied";
}

/**
 * A message already in the chat, seen again — by a retry (its last run died before the reply went out:
 * `holdReply` precedes every send) or by a fresh claim. "resend" = send the reply the chat holds; "rerun" =
 * run the turn again (a restart killed it, or only the error stands, never sent); "held" = its turn is
 * still running — keep the claim and look again; "duplicate" = answered already.
 */
export function retryPlan(stand: TakenIn, task: { status: string; updatedAt: Date }, retry: boolean, now: number, stuckMs: number): "duplicate" | "resend" | "held" | "rerun" {
  if (stand === "not-in" || stand === "superseded") return "duplicate";
  if (stand === "replied") return retry ? "resend" : "duplicate";
  if (stand === "errored") return retry ? "rerun" : "duplicate";
  return task.status === "RUNNING" && now - task.updatedAt.getTime() < stuckMs ? "held" : "rerun";
}

/** An earlier list went out in this chat (not a repeat, not a ref's home): its tail was already said. */
export function earlierList(view: AgentTaskView): boolean {
  const last = view.messages.findLastIndex((x) => x.role === "agent");
  return view.messages.slice(0, Math.max(0, last)).some((x) => x.role === "agent" && x.kind === "shortlist" && !x.same && !x.pin);
}

/** The budget question already went out in this chat: it is not asked again, and not offered under the homes. */
export const askedBudget = (messages: AgentMessage[] | null | undefined): boolean => (messages ?? []).some((x) => x.role === "agent" && x.kind === "ask" && x.field === "maxPrice");

/** The line that opens a list: the writer's own when it wrote one, else a plain one that says what these are. */
function listOpening(view: AgentTaskView, m: Extract<AgentMessage, { kind: "shortlist" }>, lang: WaLang, fill: (s: string | undefined, vars: Record<string, string | number>) => string): string {
  const c = COPY[lang];
  const budget = m.relaxed?.find((x) => x.key === "budget");
  // Honest about a stretch: over the budget, or off a detail, is said before the homes, never "that match".
  if (budget) return fill(c.closest, { budget: money(view.requirements?.maxPrice ?? Number(budget.to ?? 0)) });
  if (m.relaxed?.length) return c.widened;
  const written = m.text?.trim();
  if (written) return written;
  return Math.min(MAX_HOMES, view.shortlist.length) === 1 ? c.listOne : c.listMany;
}

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
      // Monthly only: the dictionary's budget ask still says "per night or per month".
      else if (m.field === "maxPrice") parts.push(c.askBudget);
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
      // The message moved nothing: the same homes, so a line instead of the list again.
      if (m.same && !m.pin) {
        parts.push(sameHomesText(lang, Math.min(MAX_HOMES, view.shortlist.length)));
        return parts.join("\n\n");
      }
      const ref = m.pin ? `K${m.pin.id}` : null;
      if (m.pin?.found) parts.push(fill(c.pinFound, { ref: ref! }));
      else if (m.pin) parts.push(fill(c.pinGone, { ref: ref! }));
      else parts.push(listOpening(view, m, lang, fill));
      if (m.demand && m.asked) parts.push(fill(d.demand.widenedAsked, { count: m.asked }));
      const homes = homeLines(view.shortlist, lang, appUrl);
      if (homes.length) parts.push(homes.join("\n\n"));
      const pinned = m.pin?.found ? view.shortlist[0] : undefined;
      // The message asked for the check itself ("Check K1234 for me"): it has started, say so.
      if (pinned && m.checked) parts.push(checkText(lang, m.checked, pinned.title.trim()));
      // Asked already (run.ts marks it the moment the broker is asked): never "reply 1" for it again.
      else if (pinned?.lead && pinned.availability === "asked") parts.push(checkText(lang, "already", pinned.title.trim()));
      else if (pinned?.availability === "confirmed") parts.push(c.bookPinned);
      else if (pinned?.lead && pinned.availability === "unconfirmed") parts.push(c.checkPinned);
      // The long tail once; a list that follows another list in the chat gets the short one (2026-11-21).
      else if (view.shortlist.slice(0, MAX_HOMES).some((s) => s.lead && s.availability === "unconfirmed")) parts.push(earlierList(view) ? c.checkShort : c.check);
      if (!pinned && view.shortlist.slice(0, MAX_HOMES).some((s) => s.availability === "confirmed")) parts.push(c.book);
      if (!m.pin && m.refine === "stay") parts.push(d.refine.stay ?? "");
      // Never "keep these within a budget?" to a tenant who gave one, or was already asked (…114, 2026-11-19).
      else if (!m.pin && m.refine === "maxPrice" && !view.requirements?.maxPrice && !askedBudget(view.messages)) parts.push(d.refine.budget ?? "");
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
    case "followUp": {
      // /find's line under the homes. A WhatsApp turn never writes one (whatsapp-chat.ts answers these
      // first), so this only keeps a carried-over chat from going silent.
      const n = Math.min(MAX_HOMES, view.shortlist.length);
      parts.push(m.say === "check" ? whichOneText(lang, n) : m.say === "visit" ? visitText(lang, n) : m.say === "thanks" ? thanksText(lang) : chatText(lang));
      break;
    }
    case "error":
      parts.push(d.reply.error ?? "");
      break;
  }
  // Today's homes end on the /today page, where every video is (2026-11-15); any other list on the chat's cards.
  if (m.kind === "shortlist" && m.today) {
    const more = view.shortlist.length - MAX_HOMES;
    parts.push(`${more > 0 ? fill(c.todayMore, { n: more }) : c.todayAll}\n${appUrl}/${lang}/today`);
  } else if (m.kind === "shortlist" || m.kind === "none") parts.push(`${c.seeAll}\n${chatUrl}`);
  return parts.filter((p) => p.trim()).join("\n\n");
}

/** One reason a home fits, in a few words — the caption's last line. */
const REASON_WORDS: Record<WaLang, Partial<Record<ShortlistItem["reasons"][number], string>>> = {
  en: { inBudget: "Within your budget", neighbourhood: "In the area you asked for", district: "In your district", bedroomsExact: "The size you asked for", bedroomsMore: "More room than you asked for", furnished: "Furnished, as you asked", lowPrice: "One of the lowest prices", confirmed: "Confirmed available", wellRated: "Well rated" },
  ar: { inBudget: "ضمن ميزانيتك", neighbourhood: "في المنطقة التي طلبتها", district: "في منطقتك", bedroomsExact: "بالحجم الذي طلبته", bedroomsMore: "أوسع مما طلبت", furnished: "مفروش كما طلبت", lowPrice: "من أقل الأسعار", confirmed: "متاح ومؤكد", wellRated: "تقييمه جيد" },
  rw: { inBudget: "Iri mu ngengo y'imari yawe", neighbourhood: "Iri mu gace wavuze", district: "Iri mu karere kawe", bedroomsExact: "Ingano wasabye", bedroomsMore: "Ifite umwanya urenze uwo wasabye", furnished: "Ifite ibikoresho nk'uko wabisabye", lowPrice: "Ni imwe mu zihendutse", confirmed: "Irahari byemejwe", wellRated: "Ifite amanota meza" },
};

/** A native WhatsApp photo for one listed home: its cover (or a video's poster) and a three-line caption. */
export interface HomeMedia {
  id: number;
  url: string;
  caption: string;
}

/**
 * The photos that go with a list (2026-11-21: "the photos don't show well", "do you have video?" — nothing was
 * ever sent as media): the cover of each home the list shows, captioned with rent, area and one reason it fits.
 * Only a list's homes, never a repeat of one; homes with no public https photo are left out.
 */
export function homeMedia(view: AgentTaskView, lang: WaLang, appUrl: string): HomeMedia[] {
  const m = lastAgent(view);
  if (!m || m.kind !== "shortlist" || m.same) return [];
  const c = COPY[lang];
  return view.shortlist.slice(0, MAX_HOMES).flatMap((item) => {
    const url = absolute(item.photo ?? "", appUrl);
    if (!url || !/^https:\/\//.test(url)) return [];
    const where = place(item, lang);
    const reason = item.why?.trim() || REASON_WORDS[lang][item.reasons[0]!] || null;
    const head = `*${item.title.trim()}*`;
    const price = `${money(item.cost.headline)}${item.cost.period === "night" ? c.night : c.month}${where ? ` · ${where}` : ""}`;
    return [{ id: item.id, url, caption: [head, price, reason].filter(Boolean).join("\n") }];
  });
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
  if (!digit && view && last?.kind === "shortlist") {
    // A home named in words under the list is the pick too ("the second one", "that 3 bedroom in Norvège").
    const id = pickInWords(text, view.shortlist.slice(0, MAX_HOMES));
    return id != null ? { kind: "check", listingId: id } : null;
  }
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

// ── a home named in words (2026-11-08) ──────────────────────────────────────
// Tenants rarely send a home's number: "That 3 bedroom 3 bathroom in novege" got a one-home list
// and no check (11-07). A message under the list that points at exactly one shown home is its pick.

const NOT_AR = "(?![\\u0621-\\u064A])";
/** "the second one", "iya kabiri", "الثانية", "le deuxième", "the last": the shown home it names. */
const ORDINALS: [RegExp, number | "last"][] = [
  [new RegExp(`\\b(?:first|1st)\\b|\\b(?:i)?ya mbere\\b|\\bpremi(?:er|[eè]re)\\b|ال[أا]ول(?:ى|ي)?${NOT_AR}`, "i"), 0],
  [new RegExp(`\\b(?:second|2nd)\\b|\\b(?:i)?ya kabiri\\b|\\bdeuxi[eè]me\\b|\\bseconde\\b|ال(?:ث|ت)اني(?:ة)?${NOT_AR}`, "i"), 1],
  [new RegExp(`\\b(?:third|3rd)\\b|\\b(?:i)?ya gatatu\\b|\\btroisi[eè]me\\b|ال(?:ث|ت)ال(?:ث|ت)(?:ة)?${NOT_AR}`, "i"), 2],
  [new RegExp(`\\blast\\b|\\b(?:i)?ya nyuma\\b|\\bderni(?:er|[eè]re)\\b|ال[أا]خير(?:ة)?${NOT_AR}`, "i"), "last"],
];
/** An ordinal about something else: "first floor", "last month", "second payment". */
const ORDINAL_NOUN_RE = /\b(?:first|second|third|last|1st|2nd|3rd)\s+(?:floor|month|months|year|years|week|weeks|day|days|time|times|payment|deposit|rent|night|nights|thing)\b/i;
/** "number 2", "option 2", "#2", "nimero 2", "رقم 2". */
const NUMBERED_RE = /(?:\bnumber|\boption|\bhome|\bhouse|\bnimero|\bnum[eé]ro|#|رقم)\s*([1-9])(?!\d)/i;
/** "that one", "I'll take it", "iyo nzu", "هذه" — only when one home was shown. */
const THAT_ONE_RE =
  /\b(?:that|this|the)\s+one\b|\bi(?:'ll|\s+will)?\s+(?:take|want|like|love)\s+(?:it|this|that)\b|^(?:iyo|iyi)\b|\b(?:iyo|iyi)\s+nzu\b|\bndayishaka\b|\bcel(?:le|ui)-?(?:ci|l[aà])\b|^(?:هذا|هذه|هذي|ذاك|تلك)(?![ء-ي])/i;
/** Words that point at a home already shown ("that 3 bedroom…", "I like the one in Remera"). */
const POINTER_RE =
  /^(?:that|this|the)\b|\b(?:that|this)\s+(?:one|house|home|apartment|place|room)\b|\b(?:i(?:'d|\s+would)?\s+(?:want|like|love|take)|i'll\s+take|interested\s+in|check|book|visit|see)\s+(?:that|this|the)\b|^(?:iyo|iyi)\b|\b(?:iyo|iyi)\s+nzu\b|^(?:هذا|هذه|هذي|ذاك|تلك)|\bcel(?:le|ui)\b|^(?:cette|ce)\b/i;
/** A home mentioned to turn it down: "too expensive", "not that one", "oya", "غالي". */
const NOT_A_PICK_RE =
  /\b(?:not|no|don'?t|doesn'?t|isn'?t|too|expensive|far|small|ugly|instead|except|but)\b|\boya\b|\bntabwo\b|\bhapana\b|\bpas\b|\btrop\b|(?:^|\s)(?:لا|مش|ليس|غالي|بعيد)(?:\s|$)/i;
/** Words that start a new search instead ("looking for", "do you have", "another"). */
const SEARCHY_RE = /\b(?:looking for|look for|i need|need an?|want an?|show me|do you have|any|another|other|others|more)\b|\bndashaka\b|\bnshaka\b|أبحث|ابحث|عايز|اريد|أريد/i;
const BEDS_RE = /\b([1-9])\s*-?\s*(?:bed(?:room)?s?|bdrs?|brs?)\b|\bibyumba\s+(?:bi)?([1-9])\b|\b([1-9])\s*chambres?\b|([1-9])\s*غرف/i;
const BATHS_RE = /\b([1-9])\s*-?\s*(?:bath(?:room)?s?|toilets?|douches?)\b|([1-9])\s*حمام/i;
const PRICE_RE = /(\d+(?:[.,]\d+)?)\s*(k|m)\b|\b(\d{1,3}(?:[,\s]\d{3})+)\b|\b(\d{5,7})\b/i;
const foldWords = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function namedFacts(raw: string): { beds: number | null; baths: number | null; price: number | null; type: "house" | "apartment" | "room" | null } {
  const b = raw.match(BEDS_RE);
  const t = raw.match(BATHS_RE);
  const p = raw.match(PRICE_RE);
  let price: number | null = null;
  if (p?.[1]) price = Number(p[1].replace(",", ".")) * (p[2]!.toLowerCase() === "m" ? 1_000_000 : 1_000);
  else if (p?.[3]) price = Number(p[3].replace(/[,\s]/g, ""));
  else if (p?.[4]) price = Number(p[4]);
  const type = /\b(?:apartment|apartments|apart|flat|appartement)\b|شقة/i.test(raw)
    ? "apartment"
    : /\b(?:house|villa|maison)\b|بيت|منزل/i.test(raw)
      ? "house"
      : /\b(?:room|studio|chambre|icyumba)\b|غرفة/i.test(raw)
        ? "room"
        : null;
  const num = (m: RegExpMatchArray | null) => (m ? Number(m.slice(1).find((g) => g != null)) : null);
  return { beds: num(b), baths: num(t), price, type };
}

/** The names a shown home's place goes by: its zone, the zone above it and the district, with their other spellings. */
function placeNames(item: ShortlistItem): { latin: string[]; arabic: string[] } {
  const zones = [];
  for (let z = item.zone ? KIGALI_ZONE_BY_SLUG.get(item.zone) : undefined; z; z = z.parent ? KIGALI_ZONE_BY_SLUG.get(z.parent) : undefined) zones.push(z);
  const latin = [...zones.flatMap((z) => [z.nameEn, z.nameRw, ...z.aliases]), item.district ?? ""]
    .flatMap((n) => foldWords(n).split(/[^a-z]+/))
    .filter((w) => w.length >= 4 && w !== "kigali");
  return { latin: [...new Set(latin)], arabic: zones.map((z) => z.nameAr).filter((n) => n.length > 2) };
}

/** Does the text name this home's place — exactly, or with a typo ("novege" → Norvège: 1 edit, 2 for long names)? */
function namesPlaceOf(raw: string, item: ShortlistItem): boolean {
  const { latin, arabic } = placeNames(item);
  if (arabic.some((n) => raw.includes(n))) return true;
  const tokens = foldWords(raw).split(/[^a-z]+/).filter((t) => t.length >= 4);
  return tokens.some((t) => latin.some((w) => t === w || (w.length >= 5 && t.length >= 5 && editDistance(t, w, w.length >= 9 ? 2 : 1) <= (w.length >= 9 ? 2 : 1))));
}

/**
 * The shown home a message names in words, or null. Read only under the list: an ordinal or
 * "number 2" (in English, Kinyarwanda, Arabic or French); "that one" when one home was shown; or
 * the home's place, bedrooms, bathrooms, price or type matching exactly one shown home — with a
 * pointing word ("that…", "the…", "I like the…"), or with the place and one more fact. Anything that
 * fits two homes, names another place, or reads like a new search is not a pick.
 */
export function pickInWords(text: string, shown: readonly ShortlistItem[]): number | null {
  if (!shown.length) return null;
  const raw = text.trim().toLowerCase().replace(/[٠-٩]/g, (ch) => String(ch.charCodeAt(0) - 0x0660));
  if (!raw || HOME_REF_RE.test(raw)) return null;
  // "The last one is too expensive", "not the first": about a home, but not a pick.
  if (NOT_A_PICK_RE.test(raw)) return null;
  const words = raw.split(/\s+/).filter(Boolean).length;
  const numbered = raw.match(NUMBERED_RE);
  if (numbered) return shown[Number(numbered[1]) - 1]?.id ?? null;
  if (words <= 8 && !ORDINAL_NOUN_RE.test(raw)) {
    for (const [re, at] of ORDINALS) if (re.test(raw)) return shown[at === "last" ? shown.length - 1 : at]?.id ?? null;
  }
  if (shown.length === 1 && words <= 8 && THAT_ONE_RE.test(raw)) return shown[0]!.id;

  const facts = namedFacts(raw);
  const placed = shown.filter((s) => namesPlaceOf(raw, s));
  // A place none of the shown homes is in: a new search, not a pick.
  if (!placed.length && zoneNamed(text)) return null;
  const count = [facts.beds, facts.baths, facts.price, facts.type].filter((v) => v != null).length + (placed.length ? 1 : 0);
  if (count === 0) return null;
  const near = (have: number | null | undefined, said: number) => have != null && Math.abs(have - said) <= said * 0.1;
  const fits = shown.filter(
    (s) =>
      (facts.beds == null || s.bedrooms === facts.beds) &&
      (facts.baths == null || s.bathrooms === facts.baths) &&
      (facts.price == null || near(s.cost?.headline, facts.price)) &&
      (facts.type == null || s.homeType == null || s.homeType === facts.type) &&
      (!placed.length || placed.includes(s)),
  );
  if (fits.length !== 1) return null;
  const pointed = POINTER_RE.test(raw);
  if (!pointed && SEARCHY_RE.test(raw)) return null;
  return pointed || (placed.length > 0 && count >= 2) || count >= 3 ? fits[0]!.id : null;
}

/**
 * What to answer "check home N" with: asked (the line wrote to the broker),
 * handed (a person at Mkan checks it — broker sends paused, or a team number),
 * or none (no broker to reach, or one asked lately who has not answered yet).
 */
/**
 * What a pick gets. Every line says what the line itself did or will do; none promises a person
 * (2026-11-14 — "A person from Mkan will check … and reply to you here" was sent twice to a real tenant
 * on 11-12 and nobody wrote; before 11-08 it was "I'll tell you here if the broker writes back" with no
 * broker asked at all).
 *   asked       — the broker was messaged;
 *   slow        — messaged, but this broker has been silent on the home before: it may take a while;
 *   already     — an ask is already out;
 *   handed      — broker sends are paused, or a team number: a person at Mkan checks (an operator's switch);
 *   taken       — a broker said it is rented;
 *   unreachable — nobody the line may ask ("none" on older stored messages): said so, another home offered;
 *   host        — a host's own home: its page (`link`);
 *   retry       — the check failed twice: send the number again;
 *   confirmed   — a broker already said yes: when can you come?
 * rw is machine-written (native review sheet).
 */
export type CheckOutcome = "asked" | "slow" | "handed" | "none" | "already" | "taken" | "unreachable" | "host" | "retry" | "confirmed";
export function checkText(lang: WaLang, outcome: CheckOutcome, title: string, link?: string | null): string {
  if (outcome === "already") {
    if (lang === "ar") return `سألت الوسيط عن «${title}» من قبل، وسيصلك رده هنا.`;
    if (lang === "rw") return `Nabajije komisiyoneri ibya "${title}" mbere. Igisubizo kizaza hano.`;
    return `I've already asked the broker about "${title}". Their answer will come here.`;
  }
  if (outcome === "taken") {
    if (lang === "ar") return `«${title}» أُجِّر للتو، للأسف. أرسل رقم منزل آخر، أو أخبرني بما تريد تغييره.`;
    if (lang === "rw") return `"${title}" yamaze gufatwa, mbabarira. Ohereza nimero y'indi nzu, cyangwa umbwire icyo nahindura.`;
    return `"${title}" has just been taken, sorry. Send the number of another home, or tell me what to change.`;
  }
  if (outcome === "slow") {
    if (lang === "ar") return `سألت الوسيط عن «${title}». كان بطيئاً في الرد مؤخراً، فقد يأخذ بعض الوقت، وسأرسل لك رده هنا. هل أتحقق من منزل آخر في الأثناء؟ أرسل رقمه.`;
    if (lang === "rw") return `Nabajije komisiyoneri ibya "${title}". Muri iyi minsi atinda gusubiza, bishobora gufata igihe; igisubizo nzakikoherereza hano. Ushaka ko ndeba indi nzu hagati aho? Ohereza nimero yayo.`;
    return `I've asked the broker about "${title}". They have been slow to answer lately, so it may take a while. I'll send their answer here. Want me to check another home meanwhile? Send its number.`;
  }
  if (outcome === "unreachable" || outcome === "none") {
    if (lang === "ar") return `لم أتمكن من الوصول إلى وسيط «${title}»، فهو لا يرد. لن أتركك تنتظر: أرسل رقم منزل آخر، أو أخبرني بما تريد تغييره وأبحث لك عن غيره.`;
    if (lang === "rw") return `Sinashoboye kubona komisiyoneri wa "${title}", ntasubiza. Sinshaka ko utegereza: ohereza nimero y'indi nzu, cyangwa umbwire icyo wahindura nshake izindi.`;
    return `I couldn't reach the broker of "${title}": they haven't been answering. I won't keep you waiting on it. Send the number of another home, or tell me what to change and I'll find more.`;
  }
  if (outcome === "host") {
    const at = link ? `: ${link}` : "";
    if (lang === "ar") return `«${title}» معروض من مالكه على مكان. يمكنك رؤيته وإرسال طلبك من صفحته${at}\nهل أتحقق من منزل آخر مع وسيطه؟ أرسل رقمه.`;
    if (lang === "rw") return `"${title}" yashyizweho na nyirayo kuri Mkan. Wayireba ukohereza ubusabe ku rupapuro rwayo${at}\nUshaka ko ndeba indi nzu kuri komisiyoneri wayo? Ohereza nimero yayo.`;
    return `"${title}" is listed by its owner on Mkan. You can see it and send your request on its page${at}\nWant me to check another home with its broker? Send its number.`;
  }
  if (outcome === "retry") {
    if (lang === "ar") return `عذراً، حدث خطأ عندي أثناء التحقق من «${title}». أرسل رقمه مرة أخرى بعد دقيقة.`;
    if (lang === "rw") return `Mbabarira, habaye ikibazo iwanjye ndimo kugenzura "${title}". Ongera wohereze nimero yayo mu munota umwe.`;
    return `Sorry, something went wrong on my side while checking "${title}". Please send its number again in a minute.`;
  }
  if (outcome === "confirmed") {
    if (lang === "ar") return `خبر جيد: «${title}» ما زال متاحاً. متى تستطيع أن تأتي لرؤيته؟ أرسل اليوم والوقت، مثل «غداً 10 صباحاً».`;
    if (lang === "rw") return `Inkuru nziza: "${title}" iracyahari. Ni ryari wabasha kuza kuyireba? Ohereza umunsi n'isaha, nka "ejo saa yine".`;
    return `Good news: "${title}" is still available. When can you come to see it? Reply with a day and time, like "tomorrow 10am".`;
  }
  if (lang === "ar")
    return outcome === "asked" ? `سألت الوسيط عن «${title}». سأرسل لك الرد هنا.` : `تمام، أتحقق من «${title}» مع الوسيط الآن، وسأراسلك هنا.`;
  if (lang === "rw")
    return outcome === "asked" ? `Nabajije komisiyoneri ibya "${title}". Igisubizo nzakikoherereza hano.` : `Yego, ndimo kubaza komisiyoneri ibya "${title}" ubu. Nzakwandikira hano.`;
  return outcome === "asked" ? `I've asked the broker about "${title}". I'll send their answer here.` : `Got it, I'm checking "${title}" with the broker now. I'll message you here.`;
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
  // The truth, and no "type person": nobody answered those (2026-11-14). The assistant does the chat; a
  // person from Mkan is at the viewing.
  if (lang === "ar") return `أنت تتحدث مع مساعد مكان: أبحث في المنازل وأتواصل مع الوسطاء وأرتب المعاينة من أجلك هنا، و${rep} من فريقنا يحضر المعاينة معك. عمّ تبحث؟`;
  if (lang === "rw") return `Uri kuvugana n'umufasha wa Mkan: nshakisha amazu, mvugana n'abakomisiyoneri kandi ntegura gusura ku bwawe hano. ${rep} wo mu itsinda ryacu azaza mu gusura hamwe nawe. Urashaka inzu imeze ite?`;
  return `You're chatting with Mkan's assistant: I search the homes, talk to the brokers and set up the viewing for you, right here. ${rep} from our team comes to the viewing with you. What are you looking for?`;
}

/**
 * A plain thank-you ("thanks", "murakoze cyane", "شكرا", 🙏). After the homes went out it gets a
 * line back, never the same homes again: 11-01's "Thank you" got six. "ok" is not one — it answers
 * a question (`saysYes`).
 */
export const isThanks = (text: string) =>
  /^(?:(?:ok(?:ay)?|alright|great|perfect|cool|nice|sawa|yego|تمام)[\s,!.]+)?(?:thank(?:s| you| u)(?: (?:so|very) much| a lot)?|thx|tnx|ty|merci(?: beaucoup)?|murakoze(?: cyane)?|urakoze(?: cyane)?|asante(?: sana)?|شكرا|شكراً|مشكور|متشكر)[\s!.,🙏😊❤️👍]*$/iu.test(text.trim());

/** A bare yes / ok / 👍 — under homes with no question pending, it means "that one" without saying which. */
export const isBareYes = (text: string) =>
  saysYes(text) ||
  /^(?:👍|👌|alright|fine|cool|great|nice|perfect|super|good|all(?: good| fine| set| ok)?|sawa|nibyo|ni byiza|d'accord|حسنا|طيب)[\s.!\p{Extended_Pictographic}\uFE0F]*$/iu.test(text.trim()) ||
  /^[\s\p{Extended_Pictographic}\uFE0F]+$/u.test(text.trim()); // emoji only ("👍👍😁"): under homes, "that one"

/** "Which one?" — what a person asks when a bare yes comes under several homes (it used to re-run the search). */
export function whichOneText(lang: WaLang, n: number): string {
  if (n <= 1) {
    if (lang === "ar") return "أرسل 1 وأتأكد أنه ما زال متاحاً.";
    if (lang === "rw") return "Ohereza 1 ndebe ko igihari.";
    return "Send 1 and I'll check it's still free.";
  }
  if (lang === "ar") return `أيّها؟ أرسل رقمه، من 1 إلى ${n}، وأتأكد أنه ما زال متاحاً.`;
  if (lang === "rw") return `Iyihe? Ohereza nimero yayo, kuva kuri 1 kugeza kuri ${n}, ndebe ko igihari.`;
  return `Which one? Send its number, 1 to ${n}, and I'll check it's still free.`;
}

/** Homes already went out in this chat. */
export const shownHomes = (messages: AgentMessage[] | null | undefined) => (messages ?? []).some((m) => m.role === "agent" && m.kind === "shortlist");

/**
 * After a hello, does this message go to a person? Only one that is neither about a home nor a
 * short reply: "ok", "yes", 👍, "thanks" or a digit under the opening question still get the agent (silence
 * there would read as a dead line), while "where are you, so we can bring the things" does not.
 */
export const personAfterHello = (text: string, messages: AgentMessage[] | null | undefined): boolean =>
  onlyGreetedSoFar(messages) && !aboutHomes(text) && !isBareYes(text) && !isThanks(text) && !/^\s*[1-9٠-٩]\.?\s*$/.test(text);

/** "You're welcome", and what they can do next. */
export function thanksText(lang: WaLang): string {
  if (lang === "ar") return "العفو! أرسل رقم المنزل الذي يعجبك وأتأكد أنه ما زال متاحاً، أو أخبرني بما تريد تغييره.";
  if (lang === "rw") return "Ntacyo! Ohereza nimero y'inzu ikunogeye ndebe ko igihari, cyangwa umbwire icyo wahindura.";
  return "You're welcome! Send the number of a home you like and I'll check it's still free, or tell me what to change.";
}

/**
 * The tenant asked for a person. Until 2026-11-14 this said "Okay, I've asked {rep} to reply to you here"
 * — a promise the line could not keep (16 such hand-offs in nine days, none answered). It now says what is
 * true: the assistant does the whole chat, and a person from Mkan is at the viewing.
 */
export function personText(lang: WaLang, rep: string): string {
  if (lang === "ar") return `أنا مساعد مكان، وأستطيع أن أقوم بكل شيء هنا: أجد المنازل، وأتأكد من وسطائها، وأرتب المعاينة، وهناك يلتقيك ${rep} من فريقنا. بماذا أساعدك؟`;
  if (lang === "rw") return `Ndi umufasha wa Mkan, kandi byose nabikora hano: gushaka amazu, kubaza abakomisiyoneri no gutegura gusura, aho ${rep} wo mu itsinda ryacu azahurira nawe. Nagufasha iki?`;
  return `I'm Mkan's assistant, and I can do all of it here: find homes, check them with their brokers and set up the viewing, where ${rep} from our team meets you. What can I help with?`;
}

/** Under the homes, a message the writer could not answer (off, slow, or refused by its guard): how to go on. Never a promise. */
export function unsureText(lang: WaLang): string {
  if (lang === "ar") return "لم أفهم ذلك تماماً. أرسل رقم منزل من القائمة وأتأكد من وسيطه أنه متاح، أو أخبرني بما تبحث عنه: المنطقة والميزانية وعدد الغرف.";
  if (lang === "rw") return "Sinabyumvise neza. Ohereza nimero y'inzu iri ku rutonde ndebe ko igihari, cyangwa umbwire icyo ushaka: agace, amafaranga n'ibyumba.";
  return "I didn't quite get that. Send the number of a home above and I'll check with its broker that it's free, or tell me what you're looking for: the area, the budget and the bedrooms.";
}

/** A TikTok link that leads to no home Mkan knows, sent with nothing else: the code on the video, or the search itself. */
export function videoNotFoundText(lang: WaLang): string {
  if (lang === "ar") return "لم أتمكن من ربط هذا الفيديو بمنزل. أرسل الرمز الظاهر في الفيديو (مثل K5811)، أو أخبرني بالمنطقة وعدد الغرف والميزانية.";
  if (lang === "rw") return "Sinashoboye guhuza iyo videwo n'inzu. Ohereza kode iri kuri videwo (nka K5811), cyangwa umbwire agace, umubare w'ibyumba n'amafaranga ufite.";
  return "I couldn't match that video to a home. Send the code shown on the video (like K5811), or tell me the area, the number of bedrooms and your budget.";
}

/**
 * A first message that is neither about a home nor a hello, from a number that is not on Abdout's own list:
 * one line saying who this is, once a week per number (whatsapp-chat.ts). It was silence and a #mkan card.
 */
export function helloText(lang: WaLang): string {
  if (lang === "ar") return "مرحباً، معك مكان. نساعد الناس في إيجاد منزل للإيجار في كيغالي. إن كنت تبحث عن منزل، أخبرني بالمنطقة وعدد الغرف والميزانية.";
  if (lang === "rw") return "Muraho, ni Mkan. Dufasha abantu kubona inzu yo gukodesha i Kigali. Niba ushaka inzu, mbwira agace, umubare w'ibyumba n'amafaranga ufite.";
  return "Hi, this is Mkan. We help people find a home to rent in Kigali. If you're looking for one, tell me the area, the number of bedrooms and your budget.";
}

/**
 * What a first message to the line is (2026-11-01). The Mkan line was Abdout's own
 * number before it became the business line, and friends still write to it ("Babe",
 * "you sleeping?", "can we meet now") — the agent answered them. A new chat about a
 * home, or a hello, gets the agent; anything else gets a person (a #mkan card).
 */
export function firstMessageKind(text: string): "rental" | "greeting" | "other" {
  const t = text.trim().toLowerCase();
  if (!t) return "other";
  if (HOME_REF_RE.test(t) || /^#?\d{4,6}$/.test(t)) return "rental";
  // "today", "what's new", "uyu munsi": the day's posted homes (today-pure.ts) — a new chat that asks for them is a tenant's.
  if (asksForToday(t)) return "rental";
  if (
    /\b(?:house|home|homes|apartment|appartment|apartement|flat|room|rooms|studio|rent|rental|renting|bed ?rooms?|bdr|furnished|unfurnished|compound|kigali|kicukiro|gasabo|nyarugenge|kimironko|remera|kacyiru|kibagabaga|kimihurura|nyarutarama|gisozi|kanombe|nyamirambo|kagarama|rebero|gikondo|niboye|kabeza|budget|price|monthly|per month|tenant|landlord|broker|viewing|available|inzu|icyumba|ibyumba|gukodesha|ubukode|ndashaka inzu|maison|appartement|chambre|louer|loyer)\b/.test(t) ||
    /\d+\s*k\b|\d{3},\d{3}|ibihumbi/.test(t) ||
    /شقة|منزل|بيت|ايجار|إيجار|غرفة|سكن/.test(t)
  )
    return "rental";
  if (
    /^(?:hi+|hello+|hey+|hallo|good (?:morning|afternoon|evening)|muraho|mwiriwe|mwaramutse|bonjour|salut|salam|habari|jambo|السلام عليكم|سلام|مرحبا|اهلا|أهلا)[\s,.!👋🙏😊]*$/u.test(t) ||
    /^(?:what is this|who is this|who are you|what do you do|mkan\??|ni nde|ni iki)[\s?!.]*$/.test(t)
  )
    return "greeting";
  return "other";
}

/**
 * Wider than `firstMessageKind`'s "rental": a reply to the opening question (what kind of home,
 * furnished, what for) can name no home word — "for my family", "to live with my kids", "I'm a
 * student" — and still be a tenant's. Used only after a hello, where a miss silences a tenant.
 */
const PURPOSE_OR_WANT =
  /\b(?:family|kids|children|child|wife|husband|couple|student|students|alone|myself|single|work|working|office|business|shop|live|living|stay|staying|move|moving|relocat\w*|looking for|look for|searching|need|want|umuryango|abana|umugore|umugabo|umunyeshuri|abanyeshuri|akazi|gutura|kuba|nkeneye|ndakeneye|ndashaka|nshaka|famille|enfants|étudiant|etudiant|travail|habiter|vivre|cherche)\b|عائلة|اسرة|أسرة|اطفال|أطفال|طالب|عمل|اسكن|أسكن|ابحث|أبحث/i;

export const aboutHomes = (text: string): boolean => firstMessageKind(text) === "rental" || PURPOSE_OR_WANT.test(text);

/**
 * The chat so far is only hellos: no word about a home from them, no homes from us. Its next
 * message, if not about a home either, is for a person — "Muherereyehe ngo tubazanire ibintu"
 * ("where are you, so we can bring the things", 11-01) got six homes from the agent.
 */
export function onlyGreetedSoFar(messages: AgentMessage[] | null | undefined): boolean {
  const said = (messages ?? []).filter((m): m is Extract<AgentMessage, { role: "user" }> => m.role === "user");
  if (!said.length) return false;
  if ((messages ?? []).some((m) => m.role === "agent" && m.kind === "shortlist")) return false;
  return said.every((m) => firstMessageKind(m.text ?? "") === "greeting");
}

/** The search, as the rules read this one message: does it state or change anything about a home? */
const movesSearch = (text: string): boolean => {
  const r = parseRequirements(text);
  const stated = Object.values(r).some((v) => v !== null && v !== false && !(Array.isArray(v) && v.length === 0));
  const adjust = parseAdjustments(text, EMPTY_REQUIREMENTS);
  return stated || r.furnished === false || Object.keys(adjust.set).length > 0 || adjust.clear.length > 0;
};

const MORE_RE = /\b(?:more|others?|another|different|else|next|options?|show me|any(?:thing)?)\b|ibindi|indi|زيد|المزيد|غيره|غيرها|autres?/i;
const AVAILABLE_RE = /still available|is it (?:still )?(?:available|free)|are (?:they|these) (?:still )?available|(?:is|are) .{0,20}available\s*\?|iracyari|irahari|ما زال متاح|متاح\?|disponible\s*\?/i;
const VISIT_RE = /\b(?:meet|meeting|visit|viewing|view it|see (?:it|the (?:house|home|place|room|apartment)|them)|come (?:and )?see|tour|show me the (?:house|home))\b|gusura|kureba inzu|turebe|tubonane|نلتقي|زيارة|معاينة|اشوف|أشوف|visiter|voir la maison/i;
const ABOUT_RE = /^(?:\?+|what(?:'s| is) this[?؟]?|who (?:is this|are you)[?؟]?|what (?:do you do|are you)[?؟]?|how does (?:this|it) work[?؟]?|ni iki[?؟]?|ni nde[?؟]?|ما هذا[?؟]?|من انت[?؟]?|من أنت[?؟]?|c'?est quoi[?؟]?|qui (?:êtes|etes)-vous[?؟]?)[\s?!.؟]*$/iu;
const SMALL_TALK_RE = /^(?:(?:so|and|ok|okay|well|hey)[\s,]+)?(?:hi+|hello+|hey+|hallo|yo|good (?:morning|afternoon|evening|night)|how (?:are|r) (?:you|u)|how(?:'s| is) (?:it|it going|your day|everything)(?: today)?|what'?s up|wassup|sup|you (?:there|around|awake|sleeping)|are you there|muraho|mwiriwe|mwaramutse|amakuru|bite|ni meza|bonjour|bonsoir|salut|ça va|ca va|salam|habari|mambo|السلام عليكم|سلام|مرحبا|اهلا|أهلا|كيف حالك|كيفك)[\s,.!?؟👋🙏😊😁😄🙂]*$/iu;

/** "more", "others", "another one": a tenant asking for different homes, not restating the same brief. */
export const asksForMore = (text: string): boolean => MORE_RE.test(text);

export type AfterHomes = "search" | "check" | "visit" | "about" | "chat" | "person";

/**
 * After the homes went out, what is this message (2026-11-02)? Everything that was not a pick, a yes
 * or a thank-you ran a new search, so "How are you", "?", "What is this", "Can we meet now" and "Are
 * you still available?" each got the same six homes again (real tenants, 10-26..11-01).
 *   search  — states or changes something about a home (the rules read it), or asks for more: the agent runs it
 *   check   — "is it still available?": which one (the check starts from a pick)
 *   visit   — wants to see a home or meet: which one, then a time
 *   about   — "what is this", "who are you", "?": what Mkan's assistant is
 *   chat    — small talk: a friendly line and how to go on
 *   person  — anything else ("why can't you ask?"): a person answers (a #mkan card), the tenant hears so
 * "It's a lot of money" is a search: the rules read it as "cheaper" (requirements.ts CHEAPER_RE).
 */
export function afterHomesKind(text: string): AfterHomes {
  const t = text.trim();
  // A phone number on its own: they want a call, not a search for a RWF 786-million home.
  if (/^\+?\d[\d\s-]{7,14}\d$/.test(t) && !/^\d{1,3}(?:[,.\s]\d{3})+$/.test(t)) return "person";
  // The day's posted homes run as a turn (run.ts), under the homes too (2026-11-15).
  if (asksForToday(t)) return "search";
  if (AVAILABLE_RE.test(t)) return "check";
  if (VISIT_RE.test(t)) return "visit";
  if (ABOUT_RE.test(t)) return "about";
  if (aboutHomes(t) || movesSearch(t) || MORE_RE.test(t) || HOME_REF_RE.test(t)) return "search";
  if (SMALL_TALK_RE.test(t) || firstMessageKind(t) === "greeting") return "chat";
  return "person";
}

/** The same homes as last time: say so, and how to go on (instead of the list again). */
export function sameHomesText(lang: WaLang, n: number): string {
  const range = n > 1 ? (lang === "ar" ? `من 1 إلى ${n}` : lang === "rw" ? `kuva kuri 1 kugeza kuri ${n}` : `1 to ${n}`) : "1";
  if (lang === "ar") return `هذه ما زالت أفضل المنازل لبحثك. أرسل رقم واحد منها، ${range}، وأتأكد أنه متاح، أو أخبرني بما تريد تغييره: المنطقة أو الميزانية أو عدد الغرف.`;
  if (lang === "rw") return `Izi nizo nzu zikijyanye n'ibyo ushaka. Ohereza nimero y'imwe muri zo, ${range}, ndebe ko igihari, cyangwa umbwire icyo wahindura: agace, amafaranga cyangwa ibyumba.`;
  return `These are still the best homes for your search. Send the number of one, ${range}, and I'll check it's free, or tell me what to change: the area, the budget or the bedrooms.`;
}

/** Wants to see a home or meet: which one, then a time. */
export function visitText(lang: WaLang, n: number): string {
  const range = n > 1 ? (lang === "ar" ? `من 1 إلى ${n}` : lang === "rw" ? `kuva kuri 1 kugeza kuri ${n}` : `1 to ${n}`) : "1";
  if (lang === "ar") return `بكل سرور. أي منزل تريد أن تراه؟ أرسل رقمه، ${range}: أتأكد أنه متاح، ثم نتفق على موعد ونأتي معك.`;
  if (lang === "rw") return `Yego rwose. Ni iyihe nzu wifuza gusura? Ohereza nimero yayo, ${range}: ndebe ko igihari, hanyuma tuguhe igihe tuzazana nawe.`;
  return `Happy to. Which home would you like to see? Send its number, ${range}: I'll check it's free, then we agree a time and come with you.`;
}

/** Small talk under the homes: a friendly line, and how to go on. */
export function chatText(lang: WaLang): string {
  if (lang === "ar") return "أهلاً! أنا مساعد مكان. أرسل رقم منزل من القائمة وأتأكد أنه متاح، أو أخبرني بما تبحث عنه: المنطقة والميزانية وعدد الغرف.";
  if (lang === "rw") return "Muraho! Ndi umufasha wa Mkan. Ohereza nimero y'inzu iri ku rutonde ndebe ko igihari, cyangwa umbwire icyo ushaka: agace, amafaranga n'ibyumba.";
  return "Hi! I'm Mkan's assistant. Send the number of a home above and I'll check it's free, or tell me what you're looking for: the area, the budget and the bedrooms.";
}

/** "person" / "human" / "agent": the tenant wants someone from Mkan. */
export const wantsPerson = (text: string) => /^(?:a )?(?:person|human|real person|agent|someone|staff|شخص|انسان|إنسان|umuntu)[\s.!]*$/i.test(text.trim());

/**
 * Wants to talk to someone, in any of the ways tenants say it: "need talk with a human", "can we talk",
 * "can we meet and talk about the house", "call me", "link me with a human" (…114, …099, …466). The chat
 * stays autonomous (Abdout, 2026-11-21): it answers the need behind the ask — see `talkText` — and does not
 * hand anyone over.
 */
const TALK_RE = new RegExp(
  [
    String.raw`\b(?:talk|speak|chat)\s+(?:to|with)\s+(?:a\s+|an\s+|the\s+|real\s+)?(?:human|person|someone|somebody|agent|staff|owner|broker|you|me)\b`,
    String.raw`\b(?:need|want|like|wish)\s+(?:to\s+)?(?:talk|speak|chat)\b`,
    String.raw`\b(?:can|could|may)\s+(?:we|i)\s+(?:talk|speak|chat|call)\b`,
    String.raw`\blet'?s\s+(?:talk|speak|chat|call)\b`,
    String.raw`\bmeet\b[^.?!]{0,24}\btalk\b|\btalk\b[^.?!]{0,24}\bmeet\b`,
    String.raw`\b(?:call|phone|ring)\s+me\b|\bgive me (?:a|your) call\b`,
    String.raw`\b(?:link|connect|put)\s+me\s+(?:with|through|to)\s+(?:a\s+|an\s+|the\s+)?(?:human|person|someone|agent)\b`,
    String.raw`\b(?:human|real person|live agent)\b`,
    String.raw`\bparler\s+(?:[àa]|avec)\b|\bappelez[- ]moi\b|\bun humain\b`,
    String.raw`\bndashaka\s+kuvugana\b|\bnashaka\s+kuvugana\b|\btuvugane\b|\bumpamagare\b`,
    "أريد التحدث|اريد التحدث|أبغى أتكلم|ابغى اتكلم|ممكن نتكلم|كلمني|اتصل بي|اتصلوا بي|شخص حقيقي|إنسان|انسان",
  ].join("|"),
  "i",
);
export const asksToTalk = (text: string): boolean => wantsPerson(text) || TALK_RE.test(text.trim());

/** What the tenant who asked to talk to someone is told. */
export function talkText(lang: WaLang, v: { title?: string | null; slots?: string[] } = {}): string {
  const slots = (v.slots ?? []).filter(Boolean).slice(0, 2);
  const title = v.title?.trim() || null;
  if (lang === "ar") {
    const ask = title ? (slots.length === 2 ? `هل يناسبك ${slots[0]} أم ${slots[1]}؟` : slots.length === 1 ? `هل يناسبك ${slots[0]}؟` : "أي يوم يناسبك؟") : "عمّ تبحث؟ المنطقة وعدد الغرف والميزانية.";
    return `أتولى كل شيء هنا، فاسألني عن أي شيء. وحين تكون مستعداً لرؤية ${title ? `«${title}»` : "منزل يعجبك"} يكون معك شخص من مكان عند المنزل. ${ask}`;
  }
  if (lang === "rw") {
    const ask = title ? (slots.length === 2 ? `${slots[0]} cyangwa ${slots[1]}, ni uwuhe ukubereye?` : slots.length === 1 ? `${slots[0]} byakubera byiza?` : "Ni uwuhe munsi ukubereye?") : "Urashaka iki? Agace, ibyumba n'amafaranga.";
    return `Byose mbikorera hano, nabaza icyo ushaka cyose. Nuba witeguye gusura ${title ? `"${title}"` : "inzu ukunze"}, umuntu wo muri Mkan azahurira nawe ku nzu. ${ask}`;
  }
  const ask = title ? (slots.length === 2 ? `Does ${slots[0]} or ${slots[1]} suit you?` : slots.length === 1 ? `Does ${slots[0]} suit you?` : "Which day suits you?") : "What are you looking for? The area, the bedrooms and your budget.";
  return `I handle everything here, so ask me anything. When you're ready to see ${title ? `"${title}"` : "a home you like"}, someone from Mkan meets you at the house. ${ask}`;
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
