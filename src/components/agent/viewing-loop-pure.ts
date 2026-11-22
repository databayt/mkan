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
import { firstSendableAt, KIGALI_OFFSET_MS } from "../../../scripts/wa/outbox-pure";
import { KIGALI, haversineKm } from "@/lib/geo/rwanda-places";
import { zoneLabel } from "@/lib/geo/kigali-zones";
import { greetName } from "./broker-message";
import { parseBrokerReply } from "./broker-reply";
import { readViewingTime, type ConfirmLang, type DealLang, type MeetingSpot } from "./deal-pure";
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

export type SlotVerdict = "ok" | "past" | "soon" | "hours" | "busy" | "off";

/** Minutes kept between the rep's viewings: MKAN_VIEWING_GAP_MIN, 90 when unset or not a number (2026-11-15). */
export function repGapMs(env: string | undefined = process.env.MKAN_VIEWING_GAP_MIN): number {
  const n = Number(env?.trim());
  return env?.trim() && Number.isFinite(n) && n >= 0 && n <= 600 ? Math.round(n) * 60_000 : REP_GAP_MS;
}

/** WaState key of a day Mkan's person is not available: `off 2026-11-20` (rep-word.ts) writes it. */
export const repOffKey = (day: string) => `rep-off:${day}`;
export const REP_OFF_PREFIX = "rep-off:";

/** What a slot check also needs beyond the weekly hours: the gap between viewings, and the days off (Kigali YYYY-MM-DD). */
export type SlotOpts = { gapMs?: number; off?: ReadonlySet<string> };

/**
 * Can the viewing be at `at`? `askableAt` is when the broker can first be asked (now, or 08:00 after quiet
 * hours); `busy` are the person's other viewings. The last start is an hour before their day ends.
 */
export function slotVerdict(at: Date, askableAt: Date, busy: readonly Date[], hours: RepHours = repHours(), opts: SlotOpts = {}): SlotVerdict {
  if (at.getTime() <= askableAt.getTime()) return "past";
  if (at.getTime() - askableAt.getTime() < MIN_LEAD_MS) return "soon";
  const k = new Date(at.getTime() + KIGALI_OFFSET_MS);
  const h = k.getUTCHours() + k.getUTCMinutes() / 60;
  if (!hours.days.includes(k.getUTCDay()) || h < hours.start || h > hours.end - 1) return "hours";
  // A day marked off (`off 2026-11-20`): nothing is offered on it, whatever the weekly hours say.
  if (opts.off?.has(k.toISOString().slice(0, 10))) return "off";
  const gap = opts.gapMs ?? repGapMs();
  if (busy.some((b) => Math.abs(b.getTime() - at.getTime()) < gap)) return "busy";
  return "ok";
}

/** The nearest time at or after `from` that works (half-hour steps, a fortnight at most); null when none does. */
export function nextSlot(from: Date, askableAt: Date, busy: readonly Date[], hours: RepHours = repHours(), opts: SlotOpts = {}): Date | null {
  const first = Math.max(from.getTime(), askableAt.getTime() + MIN_LEAD_MS);
  let t = Math.ceil(first / (30 * 60_000)) * 30 * 60_000;
  for (let i = 0; i < 14 * 48; i++, t += 30 * 60_000) {
    const at = new Date(t);
    if (slotVerdict(at, askableAt, busy, hours, opts) === "ok") return at;
  }
  return null;
}

/**
 * Up to `n` times to offer, on different days when the diary allows: the nearest free slot, then the next one
 * at least 20 h later. `askableAt` is when the line could first write to a broker (08:00–20:00 Kigali).
 */
export function pickSlots(now: Date, busy: readonly Date[], opts: SlotOpts = {}, n = 2, hours: RepHours = repHours()): Date[] {
  const askableAt = firstSendableAt({ kind: "BROKER_REQUEST", label: null }, now);
  const out: Date[] = [];
  let from = now;
  for (let i = 0; i < n; i++) {
    const at = nextSlot(from, askableAt, [...busy, ...out], hours, opts);
    if (!at) break;
    out.push(at);
    from = new Date(at.getTime() + 20 * HOUR_MS);
  }
  return out;
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

// ── where to meet ────────────────────────────────────────────────────────────────────────────────

/** What a home's Location row says about where it is (the columns, as the select reads them). */
export type PlaceFacts = { latitude: number | null; longitude: number | null; neighbourhood?: string | null; sector?: string | null } | null | undefined;

/**
 * Is the pin a real one? A broker lead with no pin is stored at the centre of Kigali (tiktok-mirror.ts), and
 * (0, 0) is "unset": neither tells a tenant where to go, so neither is ever sent as a map pin.
 */
export function realPin(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6) return false;
  return haversineKm(lat, lng, KIGALI.lat, KIGALI.lng) > 0.15;
}

/** A link that opens the pin in any maps app. */
export const mapLink = (lat: number, lng: number) => `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;

/**
 * Where the tenant is told to meet: the place the broker named, else the home's own pin (a link), else its
 * area ("Kabeza"). Null when none is known — the broker is then asked where.
 */
export function meetingSpot(place: string | null | undefined, loc: PlaceFacts, lang: ConfirmLang = "en"): MeetingSpot {
  const named = place?.trim();
  if (named) return { kind: "place", text: named };
  if (loc && realPin(loc.latitude, loc.longitude)) return { kind: "pin", text: `📍 ${mapLink(loc.latitude!, loc.longitude!)}` };
  const area = zoneLabel(loc?.neighbourhood ?? loc?.sector ?? null, lang === "ar" || lang === "rw" ? lang : "en");
  return area ? { kind: "area", text: area } : null;
}

// ── the booking, to the broker and to Mkan's person ──────────────────────────────────────────────

/**
 * Their yes: it is booked — in the broker's language (EN / FR / RW, Broker.preferredLanguage), with the time,
 * where Mkan's person will be (the pin or area of the home when they did not name a spot) and who comes.
 * `askPlace`: they did not say where to meet, so the message asks. Kinyarwanda goes first with English
 * under it, as every message to a broker does (broker-message.ts).
 */
export function viewingBookedBrokerMessage(v: { en: string; rep: string; askPlace: boolean; lang?: string | null; rw?: string; spot?: MeetingSpot }): string {
  const spot = v.spot ?? null;
  const spotEn = !v.askPlace && !spot ? "" : spot?.kind === "place" ? ` Meeting at: ${spot.text}.` : spot?.kind === "pin" ? ` We'll come to the home's pin: ${spot.text}. Tell us if another spot is better.` : spot?.kind === "area" ? ` We'll come to ${spot.text}: where exactly should they meet you?` : " Where should they meet you?";
  const en = `Confirmed, thank you: ${v.en}. ${v.rep} from Mkan will be there with the tenant.${v.askPlace || spot?.kind === "place" ? spotEn : ""} Murakoze!`;
  if (isFrench(v.lang)) {
    const spotFr = !v.askPlace && !spot ? "" : spot?.kind === "place" ? ` Rendez-vous : ${spot.text}.` : spot?.kind === "pin" ? ` Nous viendrons à l'emplacement du logement : ${spot.text}. Dites-nous si un autre endroit est mieux.` : spot?.kind === "area" ? ` Nous viendrons à ${spot.text} : où exactement doivent-ils vous retrouver ?` : " Où doivent-ils vous retrouver ?";
    return `Confirmé, merci : ${v.en}. ${v.rep} de Mkan sera là avec le locataire.${v.askPlace || spot?.kind === "place" ? spotFr : ""} Merci !`;
  }
  if ((v.lang ?? "").toUpperCase() === "RW") {
    const spotRw = !v.askPlace && !spot ? "" : spot?.kind === "place" ? ` Duhurira: ${spot.text}.` : spot?.kind === "pin" ? ` Tuzaza kuri iyi nzu: ${spot.text}. Mutubwire niba hari ahandi heza.` : spot?.kind === "area" ? ` Tuzaza ${spot.text}: ni hehe neza bagomba kubahurira?` : " Bagomba kubahurira he?";
    return `Byemejwe, murakoze: ${v.rw ?? v.en}. ${v.rep} wo muri Mkan azaba ahari hamwe n'umukiriya.${v.askPlace || spot?.kind === "place" ? spotRw : ""} Murakoze!\n\n${en}`;
  }
  return en;
}

/** They named another time: it goes to the tenant first. */
export const viewingCounterAckMessage = (en: string) => `Thank you. I'll check ${en} with the tenant and confirm here.`;
/** Their other time does not work for Mkan's person: the nearest one that does. */
export const viewingRepCannotMessage = (v: { en: string; alt: string }) => `Thank you. We can't make ${v.en} on our side. Could you do ${v.alt}? Reply 1 = yes, or send another time.`;
/** A day with no hour. */
export const viewingWhatTimeBrokerMessage = () => "Thank you. What time on that day?";
/** They said no to the time: when, then? */
export const viewingWhenBrokerMessage = () => "No problem. Which day and time would work for you this week?";

/**
 * To Mkan's person, when a viewing is booked: everything they need to be there. An FYI — the line settled the
 * time with both sides and both have their confirmation; nothing waits for him but the walk.
 */
export function viewingRepMessage(v: { rep: string; title: string; ref: string; en: string; place: string | null; tenant: string; broker: string | null; share: string | null }): string {
  return [
    `${v.rep}, a viewing is booked: ${v.title} (${v.ref}), ${v.en}${v.place ? `, ${v.place}` : ""}.`,
    `Tenant ${v.tenant}${v.broker ? ` · broker ${v.broker}` : ""}.`,
    v.share ? `Mkan's share: ${v.share} (agreed).` : "No share agreed with this broker yet: settle it at the home (10% of their commission, free viewing).",
    "Confirm the terms there: months up front, deposit, commission, water and electricity.",
    "FYI: the line agreed this with the tenant and the broker; both have their confirmation. You just go.",
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

// ── when the home is not yet confirmed, or cannot be settled ─────────────────────────────────────

/** The tenant named a time for a home no broker has confirmed yet: the line checks the home first, then the time. */
export function checkingHomeFirstMessage(lang: DealLang, label: string): string {
  if (lang === "ar") return `تمام: ${label}. أتأكد أولاً من الوسيط أن المنزل ما زال متاحاً، ثم أثبّت الموعد وأراسلك هنا.`;
  if (lang === "rw") return `Yego: ${label}. Ndabanza kubaza komisiyoneri niba inzu igihari, hanyuma nemeze igihe, nzakwandikira hano.`;
  return `Got it: ${label}. I'm first checking with the broker that the home is still free, then I'll lock the time and message you here.`;
}

/** No broker the line may write to has this home: it says so and moves to the next one. */
export function noBrokerMessage(lang: DealLang): string {
  if (lang === "ar") return "لم أستطع الوصول إلى وسيط هذا المنزل الآن. هل أتحقق من منزل آخر لك؟ أرسل رقمه أو رمزه.";
  if (lang === "rw") return "Sinabashije kubona komisiyoneri w'iyi nzu ubu. Ushaka ko ndeba indi? Ohereza nimero cyangwa kode yayo.";
  return "I can't reach the broker of this home right now. Want me to check another one for you? Send its number or code.";
}

/** The home was taken while the time was being arranged. */
export function homeGoneMessage(lang: DealLang): string {
  if (lang === "ar") return "للأسف هذا المنزل أُخذ قبل أن نثبّت الموعد. سأبحث لك عن بديل، أو أخبرني بما تريد تغييره.";
  if (lang === "rw") return "Birambabaje, iyi nzu yafashwe mbere yo kwemeza igihe. Ndagushakira indi, cyangwa umbwire icyo wahindura.";
  return "Sorry, that home was taken before the time could be locked. I'll look for a replacement, or tell me what to change.";
}

/** Why the line did not settle a time itself (settleViewingTime's `fallback`). */
export type FallbackWhy = "auto-off" | "sends-off" | "test-number" | "no-whatsapp" | "share-required";

/**
 * The one #mkan card left for a viewing: an FYI that says why the line stopped and what it is doing next, plus the
 * hand-booking command for the cases where only a person can move it. Never "agree it by hand" as the first word.
 */
export function viewingFallbackCard(v: { title: string; ref: string; label: string; why: FallbackWhy; tenant: string; broker: string; command: string; rep: string }): string {
  const head = `📅 *FYI — viewing asked* — ${v.title} (${v.ref}), *${v.label}*\nTenant: ${v.tenant} · Broker: ${v.broker}`;
  switch (v.why) {
    case "auto-off":
      return `${head}\nThe line's own booking is switched off (MKAN_VIEWING_AUTO=off), so it told the tenant it is confirming and sent the broker nothing. Turn it on and the next time asked is settled by itself; for this one: ${v.command}`;
    case "sends-off":
      return `${head}\nBroker sends are paused, so nothing went to the broker. The tenant was told the time is being confirmed. The line settles times by itself again as soon as sends are on; for this one: ${v.command}`;
    case "test-number":
      return `${head}\nA team number: a rehearsal, so the line did not message the broker. For a real booking: ${v.command}`;
    case "no-whatsapp":
      return `${head}\nA web tenant with no WhatsApp number: the line can't message them, so nothing went to the broker. Their time is on their card in /find. For this one: ${v.command}`;
    case "share-required":
      return `${head}\nThe line did not book: enough deals are paid that a share is now required, and this broker has agreed none. It is asking the tenant nothing more. Record the share and the line books the next ask by itself: \`pnpm deal:terms --broker=<id> --share-pct=50\`. For this one: ${v.command}`;
  }
}
