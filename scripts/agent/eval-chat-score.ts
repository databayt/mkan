/**
 * Deterministic scoring of a whole chat — the bot's side of a conversation against what the tenant wrote
 * (docs/chat-funnel.md, 2026-11-21). Pure functions, no I/O, no model: the same transcript always scores the
 * same, so the old line's real replies (the baseline) and a new build's replies (--replay) are comparable.
 *
 * A check is `pass: true | false`, or `pass: null` when the conversation gives it nothing to judge (no home was
 * listed, no budget was ever given…): n/a checks are left out of the score instead of padding it.
 */

export type Lang = "en" | "fr" | "rw" | "ar";
export type Msg = { role: "tenant" | "bot"; text: string };

export interface Brief {
  areas?: string[];
  maxBudget?: number;
  bedrooms?: number;
  type?: string;
  furnished?: boolean;
}

export interface ChatFixture {
  id: string;
  channel: "wa" | "web";
  lang: string;
  tenantTurns: string[];
  /** What the old line sent. Web chats stored only the card kind, so theirs are short snippets (`oldBotTruncated`). */
  oldBotReplies: string[];
  oldBotTruncated?: boolean;
  brief: Brief;
  tags: string[];
  /** The real thread, both sides in order — present where both were recorded (WhatsApp). */
  timeline?: Msg[];
}

export const CHECKS = [
  "budgetRespected",
  "noCommercial",
  "noRepeatList",
  "noIdenticalRepeat",
  "noBudgetReAsk",
  "noRefusePerson",
  "noPromisePerson",
  "answeredQuestion",
  "langConsistent",
  "slotOffered",
  "pluralOk",
] as const;
export type CheckName = (typeof CHECKS)[number];
export type CheckResult = { pass: boolean | null; detail?: string };
export type ChatScore = { checks: Record<CheckName, CheckResult>; passed: number; applicable: number; score: number };

// ── reading text ─────────────────────────────────────────────────────────────

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
export const westernDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
const URL_RE = /https?:\/\/\S+/g;

/** Interleaves a thread when no real timeline was kept: each tenant turn, then the bot's next reply. */
export function toTranscript(tenantTurns: string[], botReplies: string[]): Msg[] {
  const out: Msg[] = [];
  const n = Math.max(tenantTurns.length, botReplies.length);
  for (let i = 0; i < n; i++) {
    if (i < tenantTurns.length) out.push({ role: "tenant", text: tenantTurns[i] });
    if (i < botReplies.length) out.push({ role: "bot", text: botReplies[i] });
  }
  return out;
}

/** One home line of a list reply: `*1. Title* · RWF 500,000/month · Area`. */
export interface Listed {
  title: string;
  price: number | null;
  period: string | null;
}
const ITEM_RE = /\*\s*\d+\.\s*([^*]+?)\s*\*\s*·\s*RWF\s*([\d][\d,.]*)\s*\/\s*([^\s·]+)/g;
const PRICE_RE = /RWF\s*([\d][\d,.]*)\s*\/\s*([^\s·]+)/g;

export function listedHomes(text: string): Listed[] {
  const out: Listed[] = [];
  for (const m of text.matchAll(ITEM_RE)) out.push({ title: m[1], price: toInt(m[2]), period: m[3] });
  if (out.length) return out;
  // A list the title regex missed (no bold): still read its prices.
  for (const m of text.matchAll(PRICE_RE)) out.push({ title: "", price: toInt(m[1]), period: m[2] });
  return out;
}
const toInt = (s: string): number | null => {
  const n = Number(s.replace(/[,.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const isMonthly = (period: string | null) => !period || /^(month|mo|شهر|شهري|ukwezi|mois)/i.test(period);

/** A bot message that shows homes (WhatsApp format: bold numbered titles with a price). */
export const isListReply = (text: string) => listedHomes(text).length > 0;

/** The most a tenant says they can pay, from one message ("150k", "400k-500k", "200,000-250,000", "٤٠٠ ألف", "budget 1m"). */
export function tenantBudget(raw: string): number | null {
  const text = westernDigits(raw).replace(URL_RE, " ");
  const found: number[] = [];
  // 150k · 150 k · 1.5m
  for (const m of text.matchAll(/(?<![\w.])(\d+(?:[.,]\d+)?)\s*(k|m)\b(?!\w)/gi)) {
    const base = Number(m[1].replace(",", "."));
    found.push(base * (m[2].toLowerCase() === "m" ? 1_000_000 : 1_000));
  }
  // 400 ألف
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s*ألف/g)) found.push(Number(m[1].replace(",", ".")) * 1_000);
  // 200,000 · 250000 · RWF 300,000 — a real price, not a count
  for (const m of text.matchAll(/(?<![\w.])(\d{1,3}(?:,\d{3})+|\d{5,7})(?![\w])/g)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (n >= 10_000 && n <= 5_000_000) found.push(n);
  }
  // "3 bedroom 400" (a bare figure next to a house word, in the thousands): "a house for 400 three bedroom"
  if (!found.length) {
    const m = text.match(/\b(?:for|budget|max|under|up to|upto|below)\s*:?\s*(\d{3})\b(?!\s*(?:m2|sqm|bed|bath))/i);
    if (m) found.push(Number(m[1]) * 1_000);
  }
  const ok = found.filter((n) => n >= 10_000);
  return ok.length ? Math.max(...ok) : null;
}

const normalise = (t: string) => t.replace(URL_RE, "<url>").replace(/\s+/g, " ").trim().toLowerCase();

// ── language ─────────────────────────────────────────────────────────────────

const STOP: Record<Exclude<Lang, "ar">, string[]> = {
  en: ["the", "and", "you", "your", "is", "are", "to", "for", "with", "i", "me", "my", "it", "this", "that", "hello", "hi", "hey", "thanks", "thank", "please", "send", "homes", "home", "what", "how", "can", "do", "not", "of", "in", "a", "if", "i'll", "i'm", "want", "need", "looking", "budget", "found", "number", "free", "stay", "no", "yes", "ok", "okay", "sorry", "tell", "area", "bedroom", "bedrooms", "check", "broker", "viewing"],
  fr: ["le", "la", "les", "des", "est", "je", "vous", "pas", "que", "pour", "avec", "bonjour", "merci", "meublé", "logement", "d'accord", "ça", "un", "une", "du", "de", "et", "il", "n'y", "rien", "à", "au", "j'aimerais", "savoir", "si", "c'est", "numéro", "photos", "peux", "dites", "moi", "bien", "sûr", "plaisir", "libre", "courtier", "voir", "faites", "ok", "mon", "ma", "nuit", "cela", "convient", "s'il", "plaît"],
  rw: ["mwaramutse", "mwiriwe", "muraho", "nkeneye", "inzu", "amazu", "ndashaka", "nishimiye", "mbwira", "ngushakire", "ingano", "agace", "ukwezi", "yego", "oya", "ndayishaka", "iyo", "ya", "ngo", "murakoze", "ubuntu", "komisiyoneri", "bite", "kugufasha", "ushaka", "ni", "n'ibyo", "gukodesha", "nabonye", "ahuye", "ohereza", "nimero", "mbaze", "niba", "igihari", "dupange", "gusura", "kuri", "wowe", "buri", "karita", "yerekana", "impamvu", "ikubereye", "n'ayo", "wakwishyura", "winjire", "amafoto", "ikiguzi", "kwimuka", "yose", "ingengo", "y'imari", "ndagukunda", "mu", "na", "cyangwa"],
};

/** Text with the parts that carry no language of their own taken out: links, prices, bold home titles. */
function languageBody(text: string): string {
  return text
    .replace(URL_RE, " ")
    .replace(/\*[^*]*\*/g, " ")
    .replace(/RWF\s*[\d,.]+\s*\/\s*\S+/g, " ")
    .replace(/\bK\d{3,5}\b/g, " ");
}

/** en / fr / rw / ar from the words used, or null when there is too little to tell (a digit, a code, "ok"). */
export function detectLang(text: string): Lang | null {
  const body = languageBody(text);
  const letters = body.match(/\p{L}/gu) ?? [];
  if (!letters.length) return null;
  const arabic = letters.filter((c) => /[؀-ۿ]/.test(c)).length;
  if (arabic / letters.length > 0.3) return "ar";
  const words = body.toLowerCase().match(/[\p{L}']+/gu) ?? [];
  const score = (list: string[]) => words.filter((w) => list.includes(w)).length;
  const s: [Lang, number][] = [["en", score(STOP.en)], ["fr", score(STOP.fr)], ["rw", score(STOP.rw)]];
  // Accents are French's own tell; English has none.
  if (/[éèêàùçôîâ]/i.test(body)) s[1][1] += 2;
  s.sort((a, b) => b[1] - a[1]);
  if (s[0][1] < 1 || s[0][1] === s[1][1]) return null;
  return s[0][0];
}

// ── what the tenant asked ────────────────────────────────────────────────────

export type QuestionKind = "furnished" | "location" | "bathrooms" | "media" | "available";
const Q_MARK = /[?؟]/;

/** The kinds of question one tenant message asks (the ones answeredQuestion can judge). */
export function questionsIn(text: string): QuestionKind[] {
  const t = text.replace(URL_RE, " ");
  const out: QuestionKind[] = [];
  const asking = Q_MARK.test(t) || /^(is|are|do|does|did|can|could|how|where|what|est-ce|où|combien|ni|hari|هل|أين|كم)\b/i.test(t.trim());
  if (asking && /furnish|meubl|مفروش|bifite\s+ibikoresho/i.test(t) && !/^\s*furnished\s*$/i.test(t)) out.push("furnished");
  if (/\blocation\b|where is|where are|\bwhere\b.*\?|\boù\b|\bwapi\b|\bhehe\b|أين|وين|موقع/i.test(t) && (asking || /^\s*location\s*$/i.test(t))) out.push("location");
  if (asking && /bathroom|toilet|douche|salle de bain|حمام|ubwiherero/i.test(t)) out.push("bathrooms");
  if (asking && /\bvideo\b|\bphotos?\b|pictures?|\bimages?\b|amafoto|فيديو|صور/i.test(t)) out.push("media");
  if (asking && /availab|still free|is it free|disponible|libre|متاح|igihari/i.test(t)) out.push("available");
  return out;
}

const ANSWERS: Record<QuestionKind, RegExp> = {
  furnished: /furnish|meubl|مفروش|bifite ibikoresho|nta bikoresho/i,
  location: /\b(is in|are in|located|neighbou?rhood|google maps|map|pin|\bkm\b|près de|situé|se trouve|dans le quartier|يقع|في حي|iherereye|riherereye)\b|📍/i,
  bathrooms: /bathroom|toilet|self-contained|salle de bain|douche|حمام|ubwiherero|\bbath\b/i,
  media: /\b(photos?|videos?|clip|pictures?|images?|amafoto|vidéo|صور|فيديو)\b/i,
  available: /\b(free|available|taken|broker|courtier|confirm|libre|disponible|متاح|igihari|komisiyoneri)\b/i,
};

export const asksForPerson = (text: string) =>
  /\b(human|person|someone|real (?:person|agent)|talk to|speak (?:to|with)|link me|connect me|can we (?:talk|meet)|call me|humain|une personne|quelqu'un|umuntu|moteur)\b|بشري|شخص|إنسان|أكلم/i.test(text) || /\bcan we meet\b/i.test(text);

/** A tenant turn that picks a home: a number, a K-code, "check K…", "this one", "the 1 first one". */
export const picksHome = (text: string) => {
  const t = text.trim().replace(/[.!]+$/, "");
  return /^\d$/.test(t) || /^K\d{3,5}$/i.test(t) || /\bK\d{3,5}\b/i.test(t) || /^(this one|the (?:1|2|3|first|second|third)|(?:number )?[123](?: first one)?|that no ?\d)\b/i.test(t) || /\bthe 1 first one\b/i.test(t);
};

// ── bot-side patterns ────────────────────────────────────────────────────────

const COMMERCIAL_RE = /\b(shop|business room|office|commercial|store|warehouse|boutique|salon|restaurant|bar)\b/i;
export const REFUSES_PERSON_RE =
  /\b(?:can(?:'|’)?t|cannot|can not|unable to|not able to|won't be able to)\s+(?:connect|link|put|transfer)\s+you\b|\bno (?:person|human) (?:here|available)\b|ne peux pas vous (?:mettre|connecter|passer)|لا أستطيع (?:توصيل|ربط)|sinshobora (?:kukuguhuza|kukuguhuza)/i;
export const PROMISES_PERSON_RE =
  /\b(?:a person|someone|osman|the team|our team|a rep|an agent)(?:\s+from\s+(?:mkan|our team|the team))?\s+(?:will|is going to|shall|'ll)\s+(?:check|reply|respond|call|contact|get back|write|message|answer|be in touch)\b|\basked\s+(?:osman|a person|the team|someone)\s+to\s+(?:reply|respond|call|write|contact)\b|\bwill\s+reply\s+to\s+you\s+here\b|يرد عليك|سيتحقق أحد|طلبت من .{1,20} أن يرد|azagusubiza|kugusubiza hano/i;
const BUDGET_ASK_RE =
  /(?:what(?:'|’)?s|what is|what are|and|tell me)\s+(?:the\s+area,\s+(?:the\s+)?size\s+and\s+)?your\s+budget\b|keep these within a budget|within a budget\?|quel est votre budget|ما هي ميزانيتك|كم ميزانيتك|ingengo y'imari yawe\?|ingengo y'imari$|and your budget,?\s+and i'?ll find|ميزانية\s+تريد|ميزانيتك\?/i;
const PLURAL_BAD_RE = /\b1 (homes|places|rooms|houses|apartments|studios|listings)\b/i;

const DAYS = "mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|tomorrow|today|tonight|demain|ejo|uyu munsi|غدا|غداً|اليوم|السبت|الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة";
const TIME = String.raw`\d{1,2}(?:[:h.]\d{2})?\s?(?:am|pm|h)\b|\d{1,2}:\d{2}|\d{1,2}\s?(?:صباح|مساء)`;
const SLOT_RE = new RegExp(String.raw`\b(?:${DAYS})\b[^.?!\n]{0,24}?(?:${TIME})`, "i");

/** A bot message offering a concrete viewing time. "Reply with a day and time, like 'tomorrow 10am'" is homework, not an offer. */
export function offersSlot(text: string): boolean {
  const t = text.replace(/\blike\s+["“'«][^"”'»]*["”'»]/gi, " ").replace(/\b(?:e\.g\.|for example)\s+["“'«][^"”'»]*["”'»]/gi, " ");
  return SLOT_RE.test(t);
}

// ── the checks ───────────────────────────────────────────────────────────────

const botIdx = (msgs: Msg[]) => msgs.map((m, i) => (m.role === "bot" ? i : -1)).filter((i) => i >= 0);
const NA: CheckResult = { pass: null };
const verdict = (bad: string[], applicable = true): CheckResult => (!applicable ? NA : bad.length ? { pass: false, detail: bad.slice(0, 3).join(" | ") } : { pass: true });

/** The index of the first tenant message that states a budget (the budget is "known" from here on). */
function budgetKnownAt(msgs: Msg[], brief: Brief): number {
  const i = msgs.findIndex((m) => m.role === "tenant" && tenantBudget(m.text) != null);
  return i >= 0 ? i : brief.maxBudget ? 0 : -1;
}

function budgetRespected(msgs: Msg[], brief: Brief): CheckResult {
  const max = brief.maxBudget;
  const lists = botIdx(msgs).filter((i) => isListReply(msgs[i].text));
  if (!max || !lists.length) return NA;
  const from = budgetKnownAt(msgs, brief);
  const bad: string[] = [];
  for (const i of lists) {
    if (i < from) continue;
    for (const h of listedHomes(msgs[i].text)) {
      if (h.price != null && isMonthly(h.period) && h.price > max * 1.1) bad.push(`${h.price.toLocaleString("en")} > ${max.toLocaleString("en")}${h.title ? ` (${h.title.slice(0, 30)})` : ""}`);
    }
  }
  const after = lists.filter((i) => i >= from);
  return after.length ? verdict(bad) : NA;
}

function noCommercial(msgs: Msg[]): CheckResult {
  const lists = botIdx(msgs).filter((i) => isListReply(msgs[i].text));
  if (!lists.length) return NA;
  const bad: string[] = [];
  for (const i of lists) for (const h of listedHomes(msgs[i].text)) if (COMMERCIAL_RE.test(h.title)) bad.push(h.title.slice(0, 40));
  return verdict(bad);
}

const listKey = (text: string) => listedHomes(text).map((h) => `${h.title}|${h.price}`).join(";");

function noRepeatList(msgs: Msg[]): CheckResult {
  const bots = botIdx(msgs).map((i) => msgs[i].text);
  const lists = bots.filter(isListReply);
  if (lists.length < 2) return NA;
  const bad: string[] = [];
  for (let k = 1; k < bots.length; k++) if (isListReply(bots[k]) && isListReply(bots[k - 1]) && listKey(bots[k]) === listKey(bots[k - 1])) bad.push(`bot message ${k + 1} repeats the list above it`);
  return verdict(bad);
}

function noIdenticalRepeat(msgs: Msg[]): CheckResult {
  const bots = botIdx(msgs).map((i) => msgs[i].text);
  if (bots.length < 2) return NA;
  const bad: string[] = [];
  for (let k = 1; k < bots.length; k++) if (normalise(bots[k]) === normalise(bots[k - 1])) bad.push(`"${bots[k].slice(0, 50)}" sent twice in a row`);
  return verdict(bad);
}

function noBudgetReAsk(msgs: Msg[], brief: Brief): CheckResult {
  const from = budgetKnownAt(msgs, brief);
  if (from < 0) return NA;
  const bad: string[] = [];
  msgs.forEach((m, i) => {
    if (m.role === "bot" && i > from && BUDGET_ASK_RE.test(m.text)) bad.push(`asks the budget again: "${m.text.slice(0, 50)}"`);
  });
  return verdict(bad);
}

function noRefusePerson(msgs: Msg[]): CheckResult {
  const asked = msgs.some((m) => m.role === "tenant" && asksForPerson(m.text));
  const bad = msgs.filter((m) => m.role === "bot" && REFUSES_PERSON_RE.test(m.text)).map((m) => m.text.slice(0, 60));
  return verdict(bad, asked || bad.length > 0);
}

function noPromisePerson(msgs: Msg[]): CheckResult {
  const asked = msgs.some((m) => m.role === "tenant" && asksForPerson(m.text));
  const bad = msgs.filter((m) => m.role === "bot" && PROMISES_PERSON_RE.test(m.text)).map((m) => m.text.slice(0, 60));
  return verdict(bad, asked || bad.length > 0);
}

function answeredQuestion(msgs: Msg[]): CheckResult {
  const bad: string[] = [];
  let asked = 0;
  msgs.forEach((m, i) => {
    if (m.role !== "tenant") return;
    const kinds = questionsIn(m.text);
    if (!kinds.length) return;
    // The reply is the bot's next message, up to the tenant's next turn.
    let next: Msg | undefined;
    for (let j = i + 1; j < msgs.length && msgs[j].role === "bot"; j++) {
      next = msgs[j];
      break;
    }
    for (const k of kinds) {
      asked++;
      // A list is never an answer to a question: it is what the old line sent instead of one.
      const answered = !!next && !isListReply(next.text) && ANSWERS[k].test(next.text);
      if (!answered) bad.push(`${k}: "${m.text.slice(0, 40)}"`);
    }
  });
  return asked ? verdict(bad) : NA;
}

function langConsistent(msgs: Msg[], fixtureLang: string): CheckResult {
  let tenantLang: Lang | null = (["en", "fr", "rw", "ar"] as const).find((l) => l === fixtureLang) ?? null;
  const bad: string[] = [];
  let judged = 0;
  for (const m of msgs) {
    if (m.role === "tenant") {
      const l = detectLang(m.text);
      if (l) tenantLang = l;
      continue;
    }
    const l = detectLang(m.text);
    if (!l || !tenantLang) continue;
    judged++;
    if (l !== tenantLang) bad.push(`${l} reply to a ${tenantLang} tenant: "${m.text.slice(0, 40)}"`);
  }
  return judged ? verdict(bad) : NA;
}

function slotOffered(msgs: Msg[]): CheckResult {
  // The moment a home is picked (a number after a list, or a K-code) or a person is asked for.
  const at = msgs.findIndex((m, i) => {
    if (m.role !== "tenant") return false;
    if (asksForPerson(m.text) || /\bK\d{3,5}\b/i.test(m.text)) return true;
    return picksHome(m.text) && msgs.slice(0, i).some((x) => x.role === "bot" && isListReply(x.text));
  });
  if (at < 0) return NA;
  const offered = msgs.slice(at + 1).some((m) => m.role === "bot" && offersSlot(m.text));
  return offered ? { pass: true } : { pass: false, detail: "no viewing time offered after the pick / the ask for a person" };
}

function pluralOk(msgs: Msg[]): CheckResult {
  const bots = msgs.filter((m) => m.role === "bot");
  if (!bots.some((m) => isListReply(m.text) || /\bfound\b/i.test(m.text))) return NA;
  const bad = bots.filter((m) => PLURAL_BAD_RE.test(m.text)).map((m) => m.text.match(PLURAL_BAD_RE)![0]);
  return verdict(bad);
}

/** Scores one bot transcript against the tenant's side of it and what the tenant asked for. */
export function scoreChat(msgs: Msg[], fixture: Pick<ChatFixture, "brief" | "lang">): ChatScore {
  const { brief, lang } = fixture;
  const checks: Record<CheckName, CheckResult> = {
    budgetRespected: budgetRespected(msgs, brief),
    noCommercial: noCommercial(msgs),
    noRepeatList: noRepeatList(msgs),
    noIdenticalRepeat: noIdenticalRepeat(msgs),
    noBudgetReAsk: noBudgetReAsk(msgs, brief),
    noRefusePerson: noRefusePerson(msgs),
    noPromisePerson: noPromisePerson(msgs),
    answeredQuestion: answeredQuestion(msgs),
    langConsistent: langConsistent(msgs, lang),
    slotOffered: slotOffered(msgs),
    pluralOk: pluralOk(msgs),
  };
  const rows = Object.values(checks).filter((c) => c.pass !== null);
  const passed = rows.filter((c) => c.pass === true).length;
  return { checks, passed, applicable: rows.length, score: rows.length ? passed / rows.length : 1 };
}

/** The transcript to score for the old line: the real timeline where recorded, else tenant turns interleaved with the bot's. */
export const baselineTranscript = (f: ChatFixture): Msg[] => f.timeline ?? toTranscript(f.tenantTurns, f.oldBotReplies);

export interface Aggregate {
  threads: number;
  /** Per check: threads passed / threads it applied to. */
  perCheck: Record<CheckName, { passed: number; applicable: number }>;
  /** Mean of the threads' scores. */
  overall: number;
}

export function aggregate(scores: ChatScore[]): Aggregate {
  const perCheck = Object.fromEntries(CHECKS.map((c) => [c, { passed: 0, applicable: 0 }])) as Aggregate["perCheck"];
  for (const s of scores) {
    for (const c of CHECKS) {
      const r = s.checks[c];
      if (r.pass === null) continue;
      perCheck[c].applicable++;
      if (r.pass) perCheck[c].passed++;
    }
  }
  const overall = scores.length ? scores.reduce((a, s) => a + s.score, 0) / scores.length : 0;
  return { threads: scores.length, perCheck, overall };
}
