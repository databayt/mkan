/**
 * Who is writing to the Mkan line — pure rules, no network, no database (2026-11-22).
 *
 * +250 780 984 777 is also Abdout's own phone: friends, dates, a gas seller, a business template sender and
 * "Hello mr / How are you doing" all write to it, and the bot greeted a contact on 11-18 and an unknown greeter on
 * 11-21. The bot now speaks only to someone who is about housing. The first time a person writes, `decideKind`
 * labels them from the new lines and the chat's earlier lines (both addresses); what the rules cannot settle goes to
 * one small Claude call (contact-kind.ts), and the label is kept. Only a label and a reason code are ever stored —
 * never a word of the chat.
 *
 * Order of evidence (the first that speaks wins):
 *   1. a manual override (`pnpm wa:personal set <address> <kind>`)
 *   2. a known broker number (Broker.phones)
 *   3. the personal list (`pnpm wa:personal add`) — left to the handler's own gate (whatsapp-chat.ts)
 *   4. our own surfaces: a K-code, a `ref:` / ` s:` marker, the mkan.sd page, an agent-shown home → tenant
 *   5. a person offering a home / a broker describing themselves
 *   6. a long private history with the line owner → personal (beats housing words in one new line)
 *   7. housing words in the new lines, or earlier from them → tenant
 *   8. the line owner chatting in it by hand, nothing about housing → personal
 *   9. a bare greeting from a brand-new number → tenant (answered); with only greetings in its history → unknown (silent; re-read when they write more)
 *  10. two or more sales words → vendor
 *  Anything else is ambiguous (null): the model decides.
 */
import { HOME_REF_RE, REF_RE, asksForHome, readShareMarker } from "./whatsapp-format";
import { tiktokLink } from "./tiktok-link-pure";

export const CONTACT_KINDS = ["tenant", "broker", "landlord", "personal", "vendor", "unknown"] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];
export const isContactKind = (v: unknown): v is ContactKind => typeof v === "string" && (CONTACT_KINDS as readonly string[]).includes(v);

/** Where a label came from. `cache` is a label read back from WaState; `list` is the personal list. */
export type KindSource = "manual" | "broker" | "list" | "surface" | "agent" | "rule" | "history" | "model" | "default" | "cache";

export interface KindRead {
  kind: ContactKind;
  /** A reason code (never message content). */
  why: string;
  source: KindSource;
}

/** The WaState row of a label: `kind:<digits>` or `kind:<id>@lid`. */
export const kindKey = (address: string) => `kind:${address.replace(/^\+/, "").trim()}`;

/** `…777` for a phone, `lid…abc` for a lid — what a read-out may show of an address. */
export const maskAddress = (address: string): string => {
  const a = address.trim();
  if (a.endsWith("@lid")) return `lid…${a.slice(0, -4).slice(-3)}`;
  const d = a.replace(/\D/g, "");
  return d ? `…${d.slice(-3)}` : "—";
};

/** One earlier message of the chat, text only. `bot`: the line's own reply (Mkan), never the owner typing. */
export interface HistoryLine {
  id?: string;
  fromMe: boolean;
  text: string;
  at: number;
  bot?: boolean;
}

/** How many earlier lines a read looks at, and how long each may be. */
export const HISTORY_LINES = 20;
export const LINE_CHARS = 200;

// ── what a line is about ─────────────────────────────────────────────────────────────────────────

/** Neighbourhoods and districts of Kigali: one is not enough to say a person wants a home. */
const AREA_RE = /\b(?:kigali|kicukiro|gasabo|nyarugenge|kimironko|remera|kacyiru|kibagabaga|kimihurura|nyarutarama|gisozi|kanombe|nyamirambo|kagarama|rebero|gikondo|niboye|kabeza|masaka|kinyinya|gatenga|kimisagara|kanyinya|batsinda|rusororo|bumbogo|gahanga|kabuga|kinamba|nyabugogo|muhima|rugando)\b/i;
/** A rent figure or a budget word. */
const FIGURE_RE = /\b\d{2,3}\s?k\b|\b\d{2,3}[,. ]\d{3}\b|\b\d+\s?(?:rwf|frw|usd)\b|\bbudget\b|\bper month\b|\bmonthly\b|\bibihumbi\b|\bamafaranga\b/i;
/** Housing words beyond asksForHome's: Kinyarwanda "house", a landlord, a viewing. */
const EXTRA_STRONG_RE = /\b(?:inzu|nyir'?inzu|kodesha|viewing|self[- ]contained|bdrm|lease)\b/i;

/** Does one text speak of housing — a code, a rental word, a want + a place, or an area + a figure? */
export function housingWords(text: string): boolean {
  if (!text) return false;
  return asksForHome(text) || EXTRA_STRONG_RE.test(text) || (AREA_RE.test(text) && FIGURE_RE.test(text));
}

const LANDLORD_RE =
  /\b(?:i|we)\s+(?:have|own|am renting out|are renting out|rent out)\b[^.\n]{0,40}\b(?:house|houses|apartment|apartments|room|rooms|studio|flat|flats|home|homes|property|properties)\b|\b(?:my|our)\s+(?:house|apartment|room|studio|flat|home|property)\b[^.\n]{0,40}\b(?:for rent|to let|is available|vacant)\b|\bnyir'?inzu\b|\bndakodesha\b|\bi(?:'m| am) (?:a |the )?(?:landlord|house owner|owner of)\b/i;
const BROKER_SELF_RE = /\bi(?:'m| am) (?:a |an )?(?:broker|real estate agent|property agent|agent)\b|\bwe are (?:a |an )?(?:real estate|property|agency)\b|\bour (?:listings?|properties|houses)\b/i;

/** Sales marks: one is ambiguous (a friend can say "gas"), two with nothing about housing is a seller. */
const VENDOR_MARKS: RegExp[] = [
  /\b(?:promo|promotion|discount|\d+\s?% off|limited time|special offer|free delivery|order now|buy now|shop now)\b/i,
  /\b(?:delivery|deliver|delivered)\b/i,
  /\b(?:catalog|catalogue|price list|our products|our services|wholesale|retail)\b/i,
  /\b(?:gas|cylinder|refill|refills)\b/i,
  /\b(?:unsubscribe|reply stop|opt out|whatsapp business)\b/i,
  /\b(?:we (?:sell|offer|provide)|on sale|in stock|new arrivals?)\b/i,
];
export const vendorMarks = (text: string): number => VENDOR_MARKS.filter((re) => re.test(text)).length;

/** Words of a greeting or small talk — a line made only of these says nothing about what the person wants. */
const GREETING_WORDS = new Set(
  `hi hii hy hie hiya hola ola heya hello helo hellow hey heyy hallo yo sup good morning afternoon evening night day how are r you u doing going today there it your is things everything fine well and ok okay mr mrs ms sir madam dear bro brother sister friend my the a
   thanks thank please pls welcome
   muraho mwiriwe mwaramutse amakuru bite meza yego nimeza
   bonjour bonsoir salut ca va comment allez vous
   salam salaam habari jambo mambo
   السلام عليكم ورحمة الله وبركاته سلام مرحبا اهلا أهلا كيف حالك صباح مساء الخير النور`
    .split(/\s+/)
    .filter(Boolean),
);

/** A line of only greetings / small talk (emoji and punctuation ignored). */
export function isBareGreeting(text: string): boolean {
  const words = text
    .toLowerCase()
    .replace(/(\p{L})\1{2,}/gu, "$1")
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  return words.length <= 9 && words.every((w) => GREETING_WORDS.has(w));
}

/** The text of the line the bot itself sent (or a notice the line sends for Mkan): never the owner typing. */
const BOT_LINE_RE = /\bmkan\b|\bK[-\s#]?\d{3,6}\b|happy to help|sorry for the slow reply|i can only read typed messages|welcome back! tell me the area|tell me the area, the number of bedrooms/i;
export const looksLikeBotLine = (text: string): boolean => BOT_LINE_RE.test(text);

// ── the decision ─────────────────────────────────────────────────────────────────────────────────

export interface KindInput {
  /** The new line(s) of this burst, one per message. */
  lines: string[];
  /** The chat's earlier lines on both addresses, oldest first, text only (HISTORY_LINES at most). */
  history: HistoryLine[];
  /** A `kind` set by hand with `pnpm wa:personal set`. */
  manual?: ContactKind | null;
  /** The number is in Broker.phones (or posted a home we ask about). */
  broker?: boolean;
  /** The number is on the personal list (`pnpm wa:personal add`). */
  listedPersonal?: boolean;
  /** The agent already showed this person homes. */
  agentShowedHomes?: boolean;
}

const owner = (history: readonly HistoryLine[]) => history.filter((h) => h.fromMe && !h.bot && h.text.trim());
const theirs = (history: readonly HistoryLine[]) => history.filter((h) => !h.fromMe && h.text.trim());

/** Human lines that count against "a private chat": the owner's own typing with no housing in it. */
const privateOwnerLines = (history: readonly HistoryLine[]) => owner(history).filter((h) => !housingWords(h.text));

/** At or above this many private lines by the owner, one housing word in a new line does not undo "personal". */
export const HEAVY_PERSONAL = 5;

/** A surface of ours the message came through; `tiktok` only counts when the chat has no private history. */
function surfaceOf(lines: readonly string[]): { tag: string; weak?: boolean } | null {
  const all = lines.join("\n");
  if (HOME_REF_RE.test(all)) return { tag: "k-code" };
  if (REF_RE.test(all)) return { tag: "ref-marker" };
  if (readShareMarker(all) || lines.some((l) => readShareMarker(l))) return { tag: "share-marker" };
  if (/\bmkan\.sd\b|\btiktok_bio\b|\bmkan_today\b/i.test(all)) return { tag: "mkan-page" };
  if (tiktokLink(all)) return { tag: "tiktok-link", weak: true };
  return null;
}

/** The steps that need no history: a label set by hand, a broker, the list, our own surfaces, a home the agent showed. */
export function cheapKind(i: KindInput): KindRead | null {
  if (i.manual) return { kind: i.manual, why: "set-by-hand", source: "manual" };
  if (i.broker) return { kind: "broker", why: "broker-number", source: "broker" };
  if (i.listedPersonal) return { kind: "personal", why: "personal-list", source: "list" };
  const surface = surfaceOf(i.lines);
  if (surface && !surface.weak) return { kind: "tenant", why: surface.tag, source: "surface" };
  if (i.agentShowedHomes) return { kind: "tenant", why: "agent-showed-homes", source: "agent" };
  return null;
}

/** The label the rules give, or null when only the model can tell. */
export function decideKind(i: KindInput): KindRead | null {
  const cheap = cheapKind(i);
  if (cheap) return cheap;
  const text = i.lines.join("\n");
  const history = i.history.slice(-HISTORY_LINES);
  const ownerLines = privateOwnerLines(history);

  // A TikTok link from someone the owner has never chatted with by hand: they saw a post.
  const surface = surfaceOf(i.lines);
  if (surface && owner(history).length === 0) return { kind: "tenant", why: surface.tag, source: "surface" };

  if (BROKER_SELF_RE.test(text)) return { kind: "broker", why: "says-broker", source: "rule" };
  if (LANDLORD_RE.test(text)) return { kind: "landlord", why: "offers-a-home", source: "rule" };

  // A long private chat: a friend saying "rent" in passing does not make them a tenant.
  if (ownerLines.length >= HEAVY_PERSONAL) return { kind: "personal", why: "long-private-chat", source: "history" };

  const sales = vendorMarks(text);
  if (i.lines.some(housingWords) && sales < 2) return { kind: "tenant", why: "housing-words", source: "rule" };
  if (theirs(history).some((h) => housingWords(h.text)) && sales < 2) return { kind: "tenant", why: "housing-earlier", source: "history" };

  // The line owner typing in the chat by hand, and nothing from them about housing (the owner's own broadcast of his
  // search — "looking for a 2 bedroom" — sits in friends' chats and says nothing about the friend).
  if (ownerLines.length >= 1 && !theirs(history).some((h) => housingWords(h.text))) return { kind: "personal", why: "owner-chatted", source: "history" };

  const earlierSaid = theirs(history).some((h) => !isBareGreeting(h.text));
  // A brand-new number whose first words are "Hello": the line's number is on TikTok and the site, so it is almost
  // always someone looking (backtest 11-22: 15 of 34 chats opened with a bare greeting, most became tenants). The
  // owner's friends have history on the line and are caught above. Answer it.
  if (history.length === 0 && i.lines.length > 0 && i.lines.every((l) => isBareGreeting(l))) return { kind: "tenant", why: "new-number-greeting", source: "rule" };
  if (!earlierSaid && i.lines.every((l) => isBareGreeting(l))) return { kind: "unknown", why: "greeting-only", source: "rule" };

  if (sales >= 2 && !i.lines.some(housingWords)) return { kind: "vendor", why: "sales-words", source: "rule" };
  return null;
}

// ── what a label means for the turn ──────────────────────────────────────────────────────────────

export type KindAct = "answer" | "silent" | "broker";

/**
 * tenant / landlord → the normal turn; broker → the broker path (the outbox reads them); personal / vendor /
 * unknown → silent. A person on the personal list (source `list`) keeps the handler's own gate, which still
 * answers a message that plainly asks for a home — that rule is older and unchanged.
 */
export function kindAct(read: Pick<KindRead, "kind" | "source">): KindAct {
  switch (read.kind) {
    case "tenant":
    case "landlord":
      return "answer";
    case "broker":
      return "broker";
    case "personal":
      return read.source === "list" ? "answer" : "silent";
    default:
      return "silent";
  }
}

/** A cached `unknown` is read again when the person writes more than a greeting. */
export const worthRereading = (lines: readonly string[]): boolean => lines.some((l) => l.trim() && !isBareGreeting(l));

/** A model's reason code, kept short and free of digits that could be a number. */
export const safeWhy = (why: string): string => why.replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "model";
