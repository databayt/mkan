/**
 * The viewing, agreed by the line itself (2026-11-14). Until now a tenant's "tomorrow 10am" became a
 * #mkan card: a person phoned the broker, then typed `pnpm deal:book`. Nobody did, and not one viewing
 * was ever booked. The line now asks the broker itself, reads their answer, and books:
 *
 *   tenant names a time ─► slotVerdict: can the person from Mkan be there? (their hours, their other
 *                           viewings, enough notice for the broker) — else the nearest time that works
 *                       ─► the broker is asked: "1 = yes, or send another day and time"
 *   broker says yes     ─► booked (deal.ts bookViewing): tenant, broker and Mkan's person all hear
 *   broker names a time ─► the tenant is asked; their yes books it
 *   broker says no      ─► the broker is asked when; the tenant hears we are finding a time
 *   silence             ─► one chase after CHASE_AWAKE_HOURS of daytime, then the tenant is told
 *
 * A person from Mkan still comes to every viewing (Abdout, 2026-11-14) — they are told when it is
 * booked — but no step waits for one to type. Pure: the writes are viewing-loop.ts.
 */
import { KIGALI_OFFSET_MS } from "../../../scripts/wa/outbox-pure";
import { greetName } from "./broker-message";
import { parseBrokerReply } from "./broker-reply";
import { readViewingTime, type DealLang } from "./deal-pure";
import { readTermsReply } from "./intro-pure";

const HOUR_MS = 3_600_000;

/** The broker and Mkan's person both need this much notice, counted from when the broker can first be asked. */
export const MIN_LEAD_MS = 2 * HOUR_MS;
/** One person from Mkan cannot be at two homes: viewings are kept this far apart. */
export const REP_GAP_MS = 90 * 60_000;
/** A time ask is still being answered this long after it went out. */
export const VIEWING_ASK_TTL_MS = 48 * HOUR_MS;
/** Daytime hours (08:00–20:00 Kigali) of silence before the one chase, and before the tenant is told. */
export const CHASE_AWAKE_HOURS = 3;
export const TELL_TENANT_AWAKE_HOURS = 10;

/** The time ask waiting on one broker (WaState `viewing-time:<number>` holds a list of these). */
export type ViewingTimeAsk = {
  taskId: string;
  listingId: number;
  /** The tenant's number, where their side of it goes. */
  tenant: string;
  lang: DealLang;
  /** The time on the table (ISO). */
  at: string;
  askedAt: string;
  /** `time`: is this time OK? · `when`: they said no and were asked for one · `tenant`: their other time is with the tenant. */
  stage: "time" | "when" | "tenant";
  chasedAt?: string;
  tenantToldAt?: string;
};
export const viewingTimeKey = (phone: string) => `viewing-time:${phone.replace(/\D/g, "")}`;

// ── can Mkan's person be there? ──────────────────────────────────────────────────────────────────

export type RepHours = { start: number; end: number; days: number[] };
/** Mon–Sat 09:00–18:00 Kigali unless MKAN_VIEWING_HOURS ("9-18") / MKAN_VIEWING_DAYS ("1-6", 0 = Sunday) say otherwise. */
export function repHours(hours: string | undefined = process.env.MKAN_VIEWING_HOURS, days: string | undefined = process.env.MKAN_VIEWING_DAYS): RepHours {
  const h = hours?.match(/^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$/);
  const d = days?.match(/^\s*([0-6])\s*-\s*([0-6])\s*$/);
  const start = h ? Number(h[1]) : 9;
  const end = h ? Number(h[2]) : 18;
  const from = d ? Number(d[1]) : 1;
  const to = d ? Number(d[2]) : 6;
  const list: number[] = [];
  for (let i = from; ; i = (i + 1) % 7) {
    list.push(i);
    if (i === to || list.length === 7) break;
  }
  return start >= 0 && end <= 24 && start < end ? { start, end, days: list } : { start: 9, end: 18, days: [1, 2, 3, 4, 5, 6] };
}

export type SlotVerdict = "ok" | "past" | "soon" | "hours" | "busy";

/**
 * Can the viewing be at `at`? `askableAt` is when the broker can first be asked (now, or 08:00 after quiet
 * hours); `busy` are the person's other viewings. The last start is an hour before their day ends.
 */
export function slotVerdict(at: Date, askableAt: Date, busy: readonly Date[], hours: RepHours = repHours()): SlotVerdict {
  if (at.getTime() <= askableAt.getTime()) return "past";
  if (at.getTime() - askableAt.getTime() < MIN_LEAD_MS) return "soon";
  const k = new Date(at.getTime() + KIGALI_OFFSET_MS);
  const h = k.getUTCHours() + k.getUTCMinutes() / 60;
  if (!hours.days.includes(k.getUTCDay()) || h < hours.start || h > hours.end - 1) return "hours";
  if (busy.some((b) => Math.abs(b.getTime() - at.getTime()) < REP_GAP_MS)) return "busy";
  return "ok";
}

/** The nearest time at or after `from` that works (half-hour steps, a fortnight at most); null when none does. */
export function nextSlot(from: Date, askableAt: Date, busy: readonly Date[], hours: RepHours = repHours()): Date | null {
  const first = Math.max(from.getTime(), askableAt.getTime() + MIN_LEAD_MS);
  let t = Math.ceil(first / (30 * 60_000)) * 30 * 60_000;
  for (let i = 0; i < 14 * 48; i++, t += 30 * 60_000) {
    const at = new Date(t);
    if (slotVerdict(at, askableAt, busy, hours) === "ok") return at;
  }
  return null;
}

// ── the broker's answer ──────────────────────────────────────────────────────────────────────────

export type BrokerViewingReply =
  /** `place`: what they said beside the yes, when it reads as where to meet. */
  | { kind: "yes"; place: string | null }
  | { kind: "time"; at: Date }
  /** A day with no hour ("tomorrow is fine"): ask the hour. */
  | { kind: "day" }
  | { kind: "no" }
  | { kind: "taken" };

const PLACE_HINT = /\b(?:at|near|in front of|behind|next to|opposite|meet (?:me |us )?(?:at|near)|kuri|hafi ya|imbere ya|devant|pr[èe]s de)\b/i;
const TAKEN_RE = /\b(?:taken|rented(?: out)?|gone|no longer available|not available(?: any ?more)?|already (?:taken|rented|occupied)|occupied|yafashwe|yarafashwe|yaragiye|byaragiye|yarakodeshejwe|ntikiboneka|d[ée]j[àa] (?:pris|prise|lou[ée]e?))\b|أُجِّر|مؤجر|تم تأجير/i;
const NOT_THAT_DAY_RE = /\b(?:not|no|except|sauf|pas)\s+(?:today|tomorrow|tonight|this (?:morning|afternoon|evening)|aujourd'?hui|demain|uyu munsi|ejo)\b[,.;:]?/gi;

/**
 * What a broker's reply to "can you do {time}? 1 = yes, or send another" says. Another day and time is
 * read first ("yes but 3pm" is a new time, not a yes); then taken; then yes or no in the five languages
 * Kigali brokers write (intro-pure.ts readTermsReply). Null — a question, a hedge, "are you a bot?" — is
 * left to #mkan, as before.
 */
export function readBrokerViewingReply(text: string, now: Date): BrokerViewingReply | null {
  const t = text.trim();
  if (!t) return null;
  const r = parseBrokerReply(t);
  if (r.asksIfBot) return null;
  // "1" and "2" are the menu's, never an hour.
  const bare = t.replace(/[\s.!]/g, "");
  if (bare === "1") return { kind: "yes", place: null };
  if (bare === "2") return { kind: "no" };
  // The home itself is gone — said in words. A bare "no" here is about the time, not the home
  // (broker-reply.ts reads it as "not available", which is right for "is this available?").
  if (TAKEN_RE.test(t)) return { kind: "taken" };
  // "Not today, maybe Friday at 4": the day they ruled out is not the day they offer.
  const when = readViewingTime(t.replace(NOT_THAT_DAY_RE, " "), now);
  if (when && "at" in when) return { kind: "time", at: when.at };
  if (when) return { kind: "day" };
  const said = readTermsReply(t);
  if (said === "no") return { kind: "no" };
  // "It's available" (parseBrokerReply's yes) is not a yes to a time: only words that agree are.
  if (said === "yes") {
    const rest = t.replace(/^[\s,.!]*(?:yes|yeah|yep|ok(?:ay)?|sure|fine|yego|sawa|oui|ndiyo|ni byiza|byiza)\b[\s,.!]*/i, "").trim();
    return { kind: "yes", place: rest.length >= 6 && rest.length <= 120 && PLACE_HINT.test(rest) ? rest : null };
  }
  return null;
}

// ── words to the broker (as Mkan, Kinyarwanda first with English under it — broker-message.ts) ───

const hi = (name: string | null | undefined, word: string) => {
  const n = greetName(name);
  return n ? `${word} ${n}` : word;
};
const isFrench = (lang: string | null | undefined) => (lang ?? "").toUpperCase() === "FR";

/** "Can you do {time}?" — the home named by the broker's own ad, as every ask to them is. */
export function viewingTimeAskMessage(v: { name?: string | null; lang?: string | null; title: string; link?: string | null; en: string; rw: string; rep: string }): string {
  const home = v.link ? `${v.title}\n${v.link}` : v.title;
  if (isFrench(v.lang))
    return `${hi(v.name, "Bonjour")}, ici Mkan. Notre locataire souhaite visiter cette maison le ${v.en}:\n${home}\nCela vous convient-il ? Répondez 1 = oui, ou envoyez un autre jour et une autre heure. ${v.rep} de Mkan l'accompagnera.`;
  const rw = `${hi(v.name, "Muraho")}, ni Mkan. Umukiriya wacu arifuza gusura iyi nzu ${v.rw}:\n${home}\nBirashoboka? Subiza 1 = yego, cyangwa wohereze undi munsi n'isaha. ${v.rep} wo muri Mkan azazana na we.`;
  const en = `${hi(v.name, "Hi")}, Mkan here. Our tenant would like to see this home on ${v.en}. Does that work for you? Reply 1 = yes, or send another day and time. ${v.rep} from Mkan will come with them.`;
  return `${rw}\n\n${en}`;
}

/** The one chase: the same question, short. */
export function viewingChaseMessage(v: { name?: string | null; lang?: string | null; en: string; rw: string }): string {
  if (isFrench(v.lang)) return `${hi(v.name, "Bonjour")}, petit rappel de Mkan : la visite le ${v.en}, c'est possible ? Répondez 1 = oui, ou envoyez un autre moment.`;
  return `${hi(v.name, "Muraho")}, ni Mkan nanone: gusura ${v.rw} birashoboka? Subiza 1 = yego, cyangwa wohereze ikindi gihe.\n\n${hi(v.name, "Hi")}, a quick reminder from Mkan: can you do the viewing on ${v.en}? Reply 1 = yes, or send another time.`;
}

/** Their yes: it is booked. `askPlace` when they did not say where to meet. */
export function viewingBookedBrokerMessage(v: { en: string; rep: string; askPlace: boolean }): string {
  return `Confirmed, thank you: ${v.en}. ${v.rep} from Mkan will be there with the tenant.${v.askPlace ? " Where should they meet you?" : ""} Murakoze!`;
}

/** They named another time: it goes to the tenant first. */
export const viewingCounterAckMessage = (en: string) => `Thank you. I'll check ${en} with the tenant and confirm here.`;
/** Their other time does not work for Mkan's person: the nearest one that does. */
export const viewingRepCannotMessage = (v: { en: string; alt: string }) => `Thank you. We can't make ${v.en} on our side. Could you do ${v.alt}? Reply 1 = yes, or send another time.`;
/** A day with no hour. */
export const viewingWhatTimeBrokerMessage = () => "Thank you. What time on that day?";
/** They said no to the time: when, then? */
export const viewingWhenBrokerMessage = () => "No problem. Which day and time would work for you this week?";

/** To Mkan's person, when a viewing is booked: everything they need to be there. */
export function viewingRepMessage(v: { rep: string; title: string; ref: string; en: string; place: string | null; tenant: string; broker: string | null; share: string | null }): string {
  return [
    `${v.rep}, a viewing is booked: ${v.title} (${v.ref}), ${v.en}${v.place ? `, ${v.place}` : ""}.`,
    `Tenant ${v.tenant}${v.broker ? ` · broker ${v.broker}` : ""}.`,
    v.share ? `Mkan's share: ${v.share} (agreed).` : "No share agreed with this broker yet: settle it at the home (10% of their commission, free viewing).",
    "Confirm the terms there: months up front, deposit, commission, water and electricity.",
  ].join("\n");
}

// ── words to the tenant ──────────────────────────────────────────────────────────────────────────

/** The time cannot be done on Mkan's side: the nearest one that can. */
export function repBusyMessage(lang: DealLang, v: { label: string; alt: string; rep: string }): string {
  if (lang === "ar") return `لا نستطيع في ${v.label}: يأتي معك ${v.rep} من مكان، وهذا الوقت غير متاح له. هل يناسبك ${v.alt}؟ أرسل «نعم»، أو يوماً ووقتاً آخرين.`;
  if (lang === "rw") return `${v.label} ntibishoboka: ${v.rep} wo muri Mkan azazana nawe, kandi icyo gihe ntaboneka. ${v.alt} byagushobokera? Subiza yego, cyangwa wohereze undi munsi n'isaha.`;
  return `We can't do ${v.label}: ${v.rep} from Mkan comes with you, and that time is not free for them. Can you do ${v.alt}? Reply yes, or send another day and time.`;
}

/** No time works in the next fortnight (the hours are set wrong, or the diary is full): say so plainly. */
export function noSlotMessage(lang: DealLang): string {
  if (lang === "ar") return "لا أجد موعداً متاحاً قريباً. أرسل يوماً ووقتاً آخرين من فضلك.";
  if (lang === "rw") return "Sindabona igihe kiboneka vuba. Ohereza undi munsi n'isaha.";
  return "I can't find a free time soon. Please send another day and time.";
}

/** The broker offers another time. */
export function counterOfferMessage(lang: DealLang, v: { title: string; label: string }): string {
  if (lang === "ar") return `الوسيط لا يستطيع في الموعد الذي طلبته لمعاينة «${v.title}»، ويقترح ${v.label}. هل يناسبك؟ أرسل «نعم»، أو يوماً ووقتاً آخرين.`;
  if (lang === "rw") return `Komisiyoneri ntabasha ku gihe wasabye cyo gusura "${v.title}", ariko atanze ${v.label}. Birakunogeye? Subiza yego, cyangwa wohereze undi munsi n'isaha.`;
  return `The broker can't do the time you asked for "${v.title}", but offers ${v.label}. Does that work? Reply yes, or send another day and time.`;
}

/** The broker said no to the time and was asked for one. */
export function brokerCannotMessage(lang: DealLang, v: { title: string; label: string }): string {
  if (lang === "ar") return `الوسيط لا يستطيع في ${v.label} لمعاينة «${v.title}». سألته عن موعد يناسبه، وسأراسلك هنا فور رده.`;
  if (lang === "rw") return `Komisiyoneri ntabasha ${v.label} ku gusura "${v.title}". Namubajije igihe cyamubera cyiza, nzakwandikira hano akimara gusubiza.`;
  return `The broker can't do ${v.label} for "${v.title}". I've asked them which time works, and I'll message you here as soon as they answer.`;
}

/** The broker has not confirmed the time after a chase: the tenant is told, and offered another home. */
export function viewingWaitMessage(lang: DealLang, title: string): string {
  if (lang === "ar") return `لم يؤكد الوسيط بعد موعد معاينة «${title}». ما زلت أتابع معه. هل أتحقق من منزل آخر في الأثناء؟ أرسل رقمه.`;
  if (lang === "rw") return `Komisiyoneri ntaremeza igihe cyo gusura "${title}". Ndacyabikurikirana. Ushaka ko ndeba indi nzu hagati aho? Ohereza nimero yayo.`;
  return `The broker hasn't confirmed the time for "${title}" yet. I'm still on it. Want me to check another home meanwhile? Send its number.`;
}

/** The tenant said yes to the broker's time: it is being booked (the confirmation follows). */
export function bookingNowMessage(lang: DealLang, label: string): string {
  if (lang === "ar") return `ممتاز، ${label}. أحجز الموعد الآن وأرسل لك التأكيد.`;
  if (lang === "rw") return `Ni byiza, ${label}. Ndimo kubyandika, ndakoherereza icyemezo.`;
  return `Great, ${label}. I'm booking it now and will send you the confirmation.`;
}

/** After a daytime of silence the ask is the tenant's news; a day older it is dropped. */
export const sweepPlan = (i: { askedAt: Date; chased: boolean; tenantTold: boolean; awakeMs: number; ageMs: number; inWindow: boolean; stage: ViewingTimeAsk["stage"] }): "chase" | "tell-tenant" | "drop" | "wait" => {
  if (i.ageMs >= VIEWING_ASK_TTL_MS) return "drop";
  // Waiting on the tenant's yes to the broker's time: theirs to answer, nothing to chase.
  if (i.stage === "tenant" || !i.inWindow) return "wait";
  if (!i.chased && i.awakeMs >= CHASE_AWAKE_HOURS * HOUR_MS) return "chase";
  if (i.chased && !i.tenantTold && i.awakeMs >= TELL_TENANT_AWAKE_HOURS * HOUR_MS) return "tell-tenant";
  return "wait";
};
