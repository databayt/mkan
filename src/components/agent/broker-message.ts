/**
 * The words a broker receives, from Mkan as Mkan (Abdout, 2026-11-01): we find
 * tenants for Kigali brokers and bring them to the viewing, so a broker knows
 * who is asking and why — the ground a partnership and a shared commission
 * stand on. The first message to a broker introduces Mkan and says how to stop
 * hearing from us; later ones are short, about one real tenant's need. No
 * emojis, no form links, nothing a tenant did not say. A broker who asks "are
 * you a bot?" gets a person (broker-inbox), never a claim to be one.
 *
 * Until 11-01 the line wrote as the tenant ("Hey there, is this available?"),
 * which brokers could not tell from a renter — and which a test search could
 * send to them every day.
 *
 * Each message picks one of a few phrasings from its seed, so a broker asked
 * twice doesn't get the same template twice. Pure, so the tests read exactly
 * what goes out. The tenant's name and phone never appear here.
 */
import { parseRequirements, type Requirements } from "./requirements";

export interface BrokerHomeLine {
  title: string;
  link: string;
  /** The Mkan listing code ("0002-05"), when the home has one: a ref the broker and #mkan can both quote. */
  code?: string | null;
}

/**
 * The one-tap answer under a single-home ask (11-05): only 10.9% of asks got an
 * answer when the broker had to compose one. "1" or "2" is read as the answer
 * only after a message that offered it (broker-reply.ts, `menu`).
 */
export const REPLY_MENU: Record<"EN" | "FR" | "RW", string> = {
  EN: "(Or just reply 1 = free, 2 = taken.)",
  FR: "(Ou répondez 1 = libre, 2 = prise.)",
  RW: "(Cyangwa subiza 1 = iracyahari, 2 = yafashwe.)",
};

/** The menu wording before 2026-11-22: asks already sent carry it, so a digit reply to them still reads. */
const LEGACY_MENU = ["Reply 1 = still available, 2 = taken.", "Répondez 1 = disponible, 2 = déjà prise.", "Subiza 1 = iracyahari, 2 = yafashwe."];

/** Did this ask offer the 1 / 2 answer? */
export const offersReplyMenu = (body: string | null | undefined) => !!body && [...Object.values(REPLY_MENU), ...LEGACY_MENU].some((m) => body.includes(m));

/** Money the way brokers write it: 400k, 1.2M. */
export const shortRwf = (n: number) => (n >= 1_000_000 ? `${Number((n / 1_000_000).toFixed(1))}M` : `${Math.round(n / 1000)}k`);
const rwf = (n: number) => `RWF ${Math.round(n).toLocaleString("en-US")}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** One of `options`, the same one every time for the same seed. */
export function pickPhrase<T>(seed: string, options: readonly T[]): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return options[Math.abs(h) % options.length]!;
}

/**
 * The need in the words a broker asks for before offering anything. Kigali
 * brokers answer a vague ask with "How much?", "Where?", "Features&budget",
 * "Single or family?" (Abdout's own chats, Oct 2026), so every slot the tenant
 * filled goes in: size and type, furnishing, place, budget, move-in, household.
 * `en` is a noun phrase ("a 2-bedroom apartment, furnished, in Remera, up to
 * 400k"); `they` is Mkan telling the broker ("They're looking for …. It's for a
 * family.").
 */
export function needSummary(r: Requirements): { en: string; rw: string; they: string } {
  const rw: string[] = [];
  let noun: string;
  const beds = r.bedrooms != null && r.bedrooms > 0 ? `${r.bedrooms}-bedroom` : null;
  if (r.homeType === "room") noun = "a single room";
  else if (r.bedrooms === 0) noun = "a studio";
  else if (r.homeType === "house") noun = `a ${beds ? `${beds} ` : ""}house with its own compound`;
  else if (r.homeType === "apartment") noun = beds ? `a ${beds} apartment` : "an apartment";
  else noun = beds ? `a ${beds}` : "a home";

  if (r.homeType === "room") rw.push("icyumba kimwe");
  else if (r.bedrooms != null) rw.push(r.bedrooms === 0 ? "studio" : `ibyumba ${r.bedrooms}`);
  if (r.homeType === "house") rw.push("inzu yigenga ifite igipangu");
  else if (r.homeType === "apartment") rw.push("apartment");
  const furnished = r.furnished === true ? "furnished" : r.furnished === false ? "unfurnished" : null;
  if (r.furnished === true) rw.push("ifite ibikoresho");
  else if (r.furnished === false) rw.push("nta bikoresho");
  const district = r.district ? r.district.charAt(0) + r.district.slice(1).toLowerCase() : null;
  const where = r.neighbourhood ?? district;
  const place = r.neighbourhood ? (district ? `${r.neighbourhood} (${district})` : r.neighbourhood) : district;
  if (place) rw.push(`i ${place}`);
  let budget: string | null = null;
  if (r.maxPrice) {
    budget = `up to ${shortRwf(r.maxPrice)}${r.pricePeriod === "night" ? " a night" : ""}`;
    rw.push(`kugeza ${rwf(r.maxPrice)} ${r.pricePeriod === "night" ? "ku ijoro" : "ku kwezi"}`);
  }
  let from: string | null = null;
  if (r.moveIn) {
    const [, m, d] = r.moveIn.split("-").map(Number);
    from = `from ${d} ${MONTHS[(m ?? 1) - 1]}`;
    rw.push(`guhera ${d}/${m}`);
  }
  let household: string | null = null;
  let whose = "";
  if (r.purpose === "family") {
    household = "for a family";
    rw.push("ku muryango");
    whose = " It's for a family.";
  } else if (r.purpose === "study") {
    household = "for a student";
    rw.push("ku munyeshuri");
    whose = " It's for a student.";
  }
  const en = [noun, furnished, where ? `in ${where}` : null, budget, from, household].filter(Boolean).join(", ");
  // Said aloud the place sits on the noun: "a studio in Kanombe, unfurnished, up to 200k".
  const what = `${noun === "a home" ? "a place" : noun} in ${where ?? "Kigali"}`;
  const they = `They're looking for ${[what, furnished, budget, from].filter(Boolean).join(", ")}.${whose}`;
  return { en, rw: rw.join(", ") || "inzu i Kigali", they };
}

/** How a message to one broker is voiced. */
export interface BrokerVoice {
  /** Their first message from Mkan: say who we are and how to stop hearing from us. */
  introduce: boolean;
  /** The person their ads say to call ("Eric"), else none — never an agency name with emojis in it. */
  name?: string | null;
  /** The language their ads are written in (Broker.preferredLanguage): EN, FR or RW. Anything else is EN. */
  lang?: string | null;
  /** The tenant's need as one line (`needLines(r)` per language, or a ready string). Budget only if the tenant stated it. */
  need?: string | NeedLines | null;
  /** What this broker was last sent (newest first): the ask never repeats a wording they already had. */
  previous?: readonly string[];
  /** Ignored since 2026-11-22: an ask is one message in one language, never a Kinyarwanda + English wall. */
  bilingual?: boolean;
  /**
   * Times Mkan's person can be at the viewing (viewing-loop.ts offerSlots), as labels. The ask then gives the
   * broker a yes AND a time in one reply: "Is it free? Could we view it Mon 23 Nov, 09:00 or Tue 24 Nov, 09:00?"
   * (2026-11-21: of 11 picks, four brokers said yes and not one viewing time was ever agreed).
   */
  slots?: { en: string; rw: string; fr?: string }[];
}

/** A first name fit to greet with: letters only, no emoji, no handle, not an agency's whole name. */
export function greetName(name: string | null | undefined): string | null {
  const n = (name ?? "").replace(/[^\p{L}\p{M}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
  if (!n || n.length > 24 || n.split(" ").length > 2) return null;
  if (/\b(?:real|estate|properties|property|house|homes?|rentals?|agency|ltd|services|kigali|rwanda|apartments?)\b/i.test(n)) return null;
  return n;
}

type Lang = "EN" | "FR" | "RW";
const langOf = (l: string | null | undefined): Lang => (l === "FR" || l === "RW" ? l : "EN");

/**
 * Whether the tenant themselves named this budget: some message of theirs states `maxPrice` (in words, or as a
 * chip's filter). A ceiling that only the stored requirements carry — set from a listing's price, a stale
 * search, a misread number — is never told to a broker (2026-11-22: "up to 42k" for a tenant who said 150k).
 * `messages` is the chat's AgentTask.messages; only the tenant's own ("user") lines count.
 */
export function tenantStatedBudget(messages: unknown, maxPrice: number | null | undefined): boolean {
  if (!maxPrice || !Array.isArray(messages)) return false;
  for (const m of messages as { role?: string; text?: unknown; filters?: { maxPrice?: unknown } | null }[]) {
    if (m?.role !== "user") continue;
    if (typeof m.filters?.maxPrice === "number" && m.filters.maxPrice === maxPrice) return true;
    if (typeof m.text === "string" && parseRequirements(m.text).maxPrice === maxPrice) return true;
  }
  return false;
}

/** A tenant's need as one line a broker reads, in each language ("" when the tenant said nothing to tell). */
export type NeedLines = Record<Lang, string>;

const hasNeedOf = (r: Requirements) => r.bedrooms != null || !!r.homeType || !!r.district || !!r.neighbourhood || !!r.maxPrice;

/**
 * The tenant's need in one line per language. The budget is the tenant's own stated ceiling (`r.maxPrice`) and
 * nothing else — the caller strips it when the tenant never said one (broker.ts askBodyNow), so a figure never
 * comes from a listing's price (2026-11-22: a broker was told "up to 42k" for a tenant who said 150k).
 */
export function needLines(r: Requirements): NeedLines {
  if (!hasNeedOf(r)) return { EN: "", FR: "", RW: "" };
  const s = needSummary(r);
  const district = r.district ? r.district.charAt(0) + r.district.slice(1).toLowerCase() : null;
  const where = r.neighbourhood ?? district;
  const beds = r.bedrooms != null && r.bedrooms > 0 ? ` de ${r.bedrooms} chambre${r.bedrooms > 1 ? "s" : ""}` : "";
  const noun = r.homeType === "room" ? "une chambre" : r.bedrooms === 0 ? "un studio" : r.homeType === "house" ? `une maison${beds}` : r.homeType === "apartment" ? `un appartement${beds}` : r.bedrooms != null ? `un logement${beds}` : "un logement";
  const fem = r.homeType === "room" || r.homeType === "house";
  const fr = [`${noun}${where ? ` à ${where}` : ""}`, r.furnished === true ? (fem ? "meublée" : "meublé") : r.furnished === false ? (fem ? "non meublée" : "non meublé") : null, r.maxPrice ? `jusqu'à ${shortRwf(r.maxPrice)}${r.pricePeriod === "night" ? " la nuit" : ""}` : null].filter(Boolean).join(", ");
  return { EN: s.they, FR: `Notre locataire cherche ${fr}.`, RW: `Ashaka: ${s.rw}.` };
}

/** One opener per variant: the tag is what the ask must not repeat to the same broker, whole sentences included. */
interface AskCtx {
  hi: string;
  link: string;
  need: string;
  many: boolean;
  /** "Mon 23 Nov, 09:00 or Tue 24 Nov, 09:00" in this language's joiner; empty without a free time. */
  slots: string;
  menu: string;
}
interface AskVariant {
  tag: string;
  text: (c: AskCtx) => string;
}
const nl = (s: string) => (s ? `\n${s}` : "");

const EN_FREE = (c: AskCtx) => (c.many ? "Are any of them still free?" : "Is it still free?");
const EN_VARIANTS: AskVariant[] = [
  { tag: "Mkan here", text: (c) => `${c.hi}, Mkan here. A tenant likes ${c.many ? "these" : "this one"}:\n${c.link}${nl(c.need)}\n${EN_FREE(c)} ${c.slots ? `Could we come ${c.slots}?` : "If yes, when could we come?"}${c.menu}` },
  { tag: "it's Mkan", text: (c) => `${c.hi}, it's Mkan. We have a tenant for ${c.many ? "these homes" : "this home"}:\n${c.link}${nl(c.need)}\n${EN_FREE(c)} ${c.slots ? `Would ${c.slots} work for a viewing?` : "What day suits you for a viewing?"}${c.menu}` },
  { tag: "Mkan again", text: (c) => `${c.hi}, Mkan again. Our tenant would like to see ${c.many ? "these" : "this one"}:\n${c.link}${nl(c.need)}\nStill free? ${c.slots ? `We could come ${c.slots}.` : "Tell us a day that suits you."}${c.menu}` },
  { tag: "quick one", text: (c) => `${c.hi}, quick one from Mkan. A tenant asked about ${c.many ? "these" : "this home"}:\n${c.link}${nl(c.need)}\n${EN_FREE(c)} ${c.slots ? `Can we visit ${c.slots}?` : "When can we visit?"}${c.menu}` },
];

const FR_FREE = (c: AskCtx) => (c.many ? "Sont-elles toujours disponibles ?" : "Est-elle toujours disponible ?");
const FR_VARIANTS: AskVariant[] = [
  { tag: "c'est Mkan", text: (c) => `${c.hi}, c'est Mkan. Un locataire est intéressé par ${c.many ? "celles-ci" : "celle-ci"} :\n${c.link}${nl(c.need)}\n${FR_FREE(c)} ${c.slots ? `Pourrait-on passer le ${c.slots} ?` : "Quel jour vous conviendrait pour une visite ?"}${c.menu}` },
  { tag: "à nouveau", text: (c) => `${c.hi}, Mkan à nouveau. Nous avons un locataire pour ${c.many ? "ces maisons" : "cette maison"} :\n${c.link}${nl(c.need)}\n${FR_FREE(c)} ${c.slots ? `Le ${c.slots}, ça vous irait pour une visite ?` : `Quand pourrait-on ${c.many ? "les" : "la"} visiter ?`}${c.menu}` },
  { tag: "voudrait", text: (c) => `${c.hi}, ici Mkan. Un de nos locataires voudrait ${c.many ? "les voir" : "la voir"} :\n${c.link}${nl(c.need)}\nToujours ${c.many ? "disponibles" : "disponible"} ? ${c.slots ? `On pourrait passer le ${c.slots}.` : "Dites-nous un jour qui vous arrange."}${c.menu}` },
];

const RW_FREE = (c: AskCtx) => (c.many ? "Ziracyahari?" : "Iracyahari?");
const RW_VARIANTS: AskVariant[] = [
  { tag: "yashimye", text: (c) => `${c.hi}, ni Mkan. Umukiriya yashimye ${c.many ? "aya mazu" : "iyi nzu"}:\n${c.link}${nl(c.need)}\n${RW_FREE(c)} ${c.slots ? `Twayisura ${c.slots}?` : "Ni ryari twayisura?"}${c.menu}` },
  { tag: "nanone", text: (c) => `${c.hi}, ni Mkan nanone. Dufite umukiriya ushaka ${c.many ? "aya mazu" : "iyi nzu"}:\n${c.link}${nl(c.need)}\n${RW_FREE(c)} ${c.slots ? `Twaza ${c.slots}?` : "Mwatubwira umunsi mwemera?"}${c.menu}` },
  { tag: "kureba", text: (c) => `${c.hi}, ni Mkan. Umukiriya wacu ashaka kureba ${c.many ? "aya mazu" : "iyi nzu"}:\n${c.link}${nl(c.need)}\n${RW_FREE(c)} ${c.slots ? `Twayisura ${c.slots}?` : "Ni ryari twaza?"}${c.menu}` },
];

const VARIANTS: Record<Lang, AskVariant[]> = { EN: EN_VARIANTS, FR: FR_VARIANTS, RW: RW_VARIANTS };

/** The variant for this ask: the seeded one, moved on past any the broker has already had (tags found in `previous`). */
export function pickAsk(lang: Lang, seed: string, previous: readonly string[] = []): AskVariant {
  const all = VARIANTS[lang];
  const start = all.indexOf(pickPhrase(seed, all));
  for (let k = 0; k < all.length; k++) {
    const v = all[(start + k) % all.length]!;
    if (!previous.some((b) => b.includes(v.tag))) return v;
  }
  return all[start]!;
}

/**
 * "Is this home still available?" about the broker's own ads, from Mkan: one short message in ONE language (the
 * broker's: Broker.preferredLanguage, else the language of their ads). The first one says who we are and how to
 * stop; after that it is the tenant's need in a line, the home's Mkan page, and "Is it still free? Could we
 * come A or B?" — a yes and a time in one reply. The 1 / 2 answer stays as a soft hint for one home. Several
 * wordings per language, never the one the broker last got (`voice.previous`).
 */
export function availabilityMessage(homes: BrokerHomeLine[], seed: string, voice: BrokerVoice = { introduce: true }): string {
  const lang = langOf(voice.lang);
  const links = [...new Set(homes.map((h) => h.link))];
  const many = links.length > 1;
  const name = greetName(voice.name);
  const needRaw = voice.need;
  const need = (typeof needRaw === "string" ? needRaw : needRaw?.[lang] ?? "").trim();
  const list = (voice.slots ?? []).slice(0, 2);
  const join = lang === "FR" ? " ou le " : lang === "RW" ? " cyangwa " : " or ";
  const slots = list.map((x) => (lang === "RW" ? x.rw : lang === "FR" ? (x.fr ?? x.en) : x.en)).join(join);
  const menu = many ? "" : ` ${REPLY_MENU[lang]}`;
  const link = links.join("\n");
  const hiWord = lang === "FR" ? "Bonjour" : lang === "RW" ? "Muraho" : "Hi";
  const ctx: AskCtx = { hi: `${hiWord}${name ? ` ${name}` : lang === "EN" ? " there" : ""}`, link, need, many, slots, menu };
  if (voice.introduce) {
    if (lang === "FR")
      return `${ctx.hi}, ici Mkan. Nous aidons des gens à trouver un logement à Kigali et nous les amenons chez des courtiers comme vous.\nUn locataire que nous accompagnons est intéressé par ${many ? "vos maisons" : "votre maison"} :\n${link}${nl(need)}\n${FR_FREE(ctx)} ${slots ? `Pourrait-on passer le ${slots} ?` : "Quel jour vous conviendrait pour une visite ?"}${menu}\nSi vous ne souhaitez plus recevoir nos messages, répondez stop.`;
    if (lang === "RW")
      return `${ctx.hi}, ni Mkan. Dufasha abantu kubona inzu i Kigali tukabazana ku ba komisiyoneri nkawe.\nUmukiriya dufasha yashimye ${many ? "amazu yawe" : "inzu yawe"}:\n${link}${nl(need)}\n${RW_FREE(ctx)} ${slots ? `Twayisura ${slots}?` : "Ni ryari twayisura?"}${menu}\nNiba udashaka ko tukwandikira, subiza stop.`;
    return `${ctx.hi}, this is Mkan. We help people find homes in Kigali and bring them to brokers like you.\nA tenant we're helping likes ${many ? "these homes of yours" : "your home"}:\n${link}${nl(need)}\n${EN_FREE(ctx)} ${slots ? `Could we come ${slots}?` : "If yes, when could we come?"}${menu}\nIf you'd rather we didn't message you, just reply stop.`;
  }
  return pickAsk(lang, seed, voice.previous ?? []).text(ctx);
}

/** "Is it free? Could we view it A or B?" — the second half of the ask, in the broker's language; empty without slots. */
export function viewingSlotLine(lang: Lang, many: boolean, slots: BrokerVoice["slots"]): string {
  const list = (slots ?? []).slice(0, 2);
  if (list.length === 0) return "";
  const t = (k: "en" | "rw") => list.map((x) => x[k]);
  const fr = list.map((x) => x.fr ?? x.en);
  if (lang === "FR") return ` ${many ? "Si l'une est disponible, pourrait-on la visiter" : "Si oui, pourrait-on la visiter"} le ${fr.join(" ou le ")} ?`;
  if (lang === "RW") return ` ${many ? "Niba imwe ihari, twayisura" : "Niba ihari, twayisura"} ${t("rw").join(" cyangwa ")}?`;
  return ` ${many ? "If one is free, could we view it" : "Could we view it"} ${t("en").join(" or ")}?`;
}

/**
 * The one nudge, for a broker who has not answered after NUDGE_AWAKE_HOURS of daytime (broker-rank.ts
 * nudgeDue): short, Kinyarwanda first with English under it, the same one-digit answer. It names the
 * homes by link only — the first message already said who we are and why.
 */
export function nudgeMessage(links: string[], lang?: string | null, name?: string | null): string {
  const uniq = [...new Set(links)];
  const many = uniq.length > 1;
  const list = uniq.join("\n");
  const who = greetName(name);
  const l = langOf(lang);
  const menu = (m: string) => (many ? "" : `\n${m}`);
  if (l === "FR") return `Bonjour${who ? ` ${who}` : ""}, petit rappel de Mkan : ${many ? "ces maisons sont-elles toujours disponibles" : "cette maison est-elle toujours disponible"} ?\n${list}${menu(REPLY_MENU.FR)}`;
  if (l === "RW") return `Muraho${who ? ` ${who}` : ""}, ni Mkan nanone: ${many ? "ziracyahari" : "iracyahari"}?\n${list}${menu(REPLY_MENU.RW)}`;
  return `Hi${who ? ` ${who}` : ""}, a quick reminder from Mkan: ${many ? "are these still free" : "is this still free"}?\n${list}${menu(REPLY_MENU.EN)}`;
}

/** The tenant picked one of the times the broker offered on the form; the broker confirms there and then sees their contact. */
export function viewingChosenMessage(_title: string, slotLabel: string, link: string): string {
  return pickPhrase(link, [
    `Hi, Mkan here. Our tenant would like to see it on ${slotLabel}. Could you confirm here?\n${link}`,
    `Hello, it's Mkan. Is ${slotLabel} okay for the viewing with our tenant? Please confirm here:\n${link}`,
  ]);
}

/**
 * Nothing on Mkan fits a tenant who asked us to look around: ask a broker who
 * works the area whether they have a home. They answer in the chat — photos and
 * a price — which broker-inbox turns into a lead. `seed` varies the wording.
 */
export function demandMessage(need: { they: string }, seed: string, voice: Pick<BrokerVoice, "introduce" | "name"> = { introduce: true }): string {
  const name = greetName(voice.name);
  const hi = `Hi${name ? ` ${name}` : " there"}`;
  if (voice.introduce)
    return `${hi}, this is Mkan. We help people find homes in Kigali and bring them to brokers like you. A tenant we're helping is looking for a place. ${need.they} Do you have anything? Photos and the price would be great.\nIf you'd rather we didn't message you, just reply stop.`;
  return pickPhrase(seed, [
    `${hi}, Mkan here. A tenant we're helping is looking for a place. ${need.they} Do you have anything? Photos and the price please.`,
    `Hello${name ? ` ${name}` : ""}, it's Mkan. ${need.they} Anything that fits? Send photos and the price please.`,
  ]);
}

/** The broker asked "how much / where / features?" back about a no-home ask: answer with the need, once. */
export function needReplyMessage(need: { they: string }, seed: string): string {
  return pickPhrase(seed, [`${need.they} Do you have something? Photos and the price please.`, `${need.they} If you have one, send photos and the price.`]);
}

/** The broker asked about the tenant ("budget?", "single or family?") after the availability ask: answer, once. */
export function aboutMeMessage(need: { they: string }, seed: string, many = false): string {
  return pickPhrase(seed, many ? [`${need.they} Are they still available?`, `${need.they} Are these still free?`] : [`${need.they} Is it still available?`, `${need.they} Is it still free?`]);
}

/** The broker only said hello: say it back and ask again, once. "How are you?" gets its answer. */
export function reAskMessage(text: string, seed: string, many = false): string {
  const it = many ? "are they" : "is it";
  if (/how are (?:you|u)|how r u|amakuru/i.test(text)) return pickPhrase(seed, [`Good, thanks. ${cap(it)} still available?`, `Fine thanks. ${cap(it)} still available?`]);
  return pickPhrase(seed, [`Hi, ${it} still available?`, `Hello, ${it} still available?`]);
}

/**
 * The broker could not open the link or video we sent ("The video is not available", "send the link again"):
 * the fault is ours, so say so, give Mkan's own page for the home, and ask again. In the broker's language;
 * One language, like the first ask. `link` is the /k/K… page.
 */
export function resendMessage(link: string, seed: string, lang?: string | null): string {
  const l = langOf(lang);
  const fr = `Désolé, le lien n'a pas fonctionné de notre côté. Voici la page de la maison :\n${link}\nEst-elle toujours disponible ? ${REPLY_MENU.FR}`;
  if (l === "FR") return fr;
  const en = pickPhrase(seed, [
    `Sorry, the link didn't work on our side. Here is the home's page:\n${link}\nIs it still available? ${REPLY_MENU.EN}`,
    `Sorry about that, the video must have been removed. This is the page for the home:\n${link}\nIs it still available? ${REPLY_MENU.EN}`,
  ]);
  if (l !== "RW") return en;
  return `Mutubabarire, link ntiyakoze. Dore urupapuro rw'inzu:\n${link}\nIracyahari? ${REPLY_MENU.RW}`;
}

type Words = Record<Lang, readonly string[]>;
/** One wording in the broker's language, seeded. */
const say = (lang: string | null | undefined, seed: string, w: Words) => pickPhrase(seed, w[langOf(lang)]);

/** The broker said it is available: Mkan comes back with the viewing. */
export function availableAckMessage(seed: string, lang?: string | null): string {
  return say(lang, seed, {
    EN: ["Great, thank you. We'll come back to you to set up the viewing.", "Thanks! We'll get back to you with a time for the viewing.", "Perfect, thank you. We'll be in touch about the viewing."],
    FR: ["Parfait, merci. Nous revenons vers vous pour organiser la visite.", "Merci ! Nous vous proposons très vite un horaire pour la visite."],
    RW: ["Murakoze cyane. Turabagarukira kugira ngo dutegure gusura.", "Murakoze! Turabandikira tubabwire igihe cyo gusura."],
  });
}

/** The broker said it is taken. */
export function takenAckMessage(seed: string, lang?: string | null): string {
  return say(lang, seed, {
    EN: ["Thanks for letting us know.", "Okay, thank you.", "Alright, thanks for the update."],
    FR: ["Merci de nous avoir prévenus.", "D'accord, merci."],
    RW: ["Murakoze kutubwira.", "Sawa, murakoze."],
  });
}

/** The broker said taken and offered another home: take it warmly and ask for what a tenant needs to see it. */
export function takenOtherAckMessage(seed: string, lang?: string | null): string {
  return say(lang, seed, {
    EN: [
      "Thank you, and yes please! Send the link or photos of the other one with the price, and we'll show it to our tenant.",
      "Thanks for telling us. Please send the link or the photos of the other home and its price, we have a tenant looking.",
      "Okay, thank you. We'd like to see the other one: could you send the link or photos, and the rent?",
    ],
    FR: ["Merci, avec plaisir ! Envoyez-nous le lien ou les photos de l'autre maison avec le prix, nous la montrerons à notre locataire.", "Merci de nous prévenir. Pouvez-vous nous envoyer les photos de l'autre maison et son loyer ?"],
    RW: ["Murakoze, yego dushaka! Mutwoherereze amafoto y'indi nzu n'igiciro cyayo, tuzayereka umukiriya.", "Murakoze kutubwira. Mwatwoherereza amafoto y'indi nzu n'ubukode bwayo?"],
  });
}

/** Their other home is already in our hands (area, size, rent said in words): thank them, photos are a bonus. */
export function otherHomeKeptMessage(seed: string, lang?: string | null, taken = true): string {
  return say(lang, seed, {
    EN: taken
      ? ["Thanks, we've noted the other one and will show it to our tenants. Photos, if you have them, would help.", "Okay thank you, we noted the other home. Send photos here when you can."]
      : ["Thanks, we've noted it and will show it to our tenants. And is the first one still free?", "Thank you, noted! Is the first one still free?"],
    FR: taken ? ["Merci, nous avons noté l'autre maison et la montrerons à nos locataires. Des photos nous aideraient."] : ["Merci, c'est noté ! La première est-elle toujours disponible ?"],
    RW: taken ? ["Murakoze, twanditse indi nzu kandi tuzayereka abakiriya. Amafoto yadufasha."] : ["Murakoze, twabyanditse! Iya mbere iracyahari?"],
  });
}

/** A time, with or without a yes: we take it to the tenant and come back — no promise a person will reply. */
export function timeAckMessage(seed: string, lang: string | null | undefined, label: string): string {
  return say(lang, seed, {
    EN: [`Great, ${label} works for us. We'll confirm with our tenant and come back to you shortly.`, `Thank you! We'll check ${label} with our tenant and confirm here.`],
    FR: [`Parfait, ${label} nous convient. Nous confirmons avec notre locataire et revenons vers vous.`, `Merci ! Nous vérifions avec notre locataire pour ${label} et confirmons ici.`],
    RW: [`Murakoze, ${label} birakunda. Turabigenzura n'umukiriya tubabwire.`, `Murakoze! Turabaza umukiriya ${label} tubabwire.`],
  });
}

/** They asked something about the tenant: answer with the need, then the question again. `need` may be empty. */
export function questionReplyMessage(seed: string, lang: string | null | undefined, need: string, many = false): string {
  const l = langOf(lang);
  const ask = many ? { EN: "Are they still free?", FR: "Sont-elles toujours disponibles ?", RW: "Ziracyahari?" } : { EN: "Is it still free?", FR: "Est-elle toujours disponible ?", RW: "Iracyahari?" };
  if (!need.trim()) {
    return say(lang, seed, {
      EN: [`We'll confirm that at the viewing. ${ask.EN}`, `Good question, we'll confirm it when we come. ${ask.EN}`],
      FR: [`Nous le confirmerons lors de la visite. ${ask.FR}`],
      RW: [`Tuzabibemeza ku munsi wo gusura. ${ask.RW}`],
    });
  }
  return `${need.trim()} ${ask[l]}`;
}

/** They quoted a rent or fee for the home: thank them, and ask the one thing still open. */
export function priceNotedMessage(seed: string, lang: string | null | undefined, askFree: boolean): string {
  return say(lang, seed, {
    EN: askFree ? ["Noted, thank you. Is it still free?", "Thanks for the price. Is it still free?"] : ["Noted, thank you.", "Thanks, noted."],
    FR: askFree ? ["Noté, merci. Est-elle toujours disponible ?"] : ["Noté, merci."],
    RW: askFree ? ["Twabyanditse, murakoze. Iracyahari?"] : ["Twabyanditse, murakoze."],
  });
}

/** Nothing the line can place: one short question, never a wall. */
export function clarifyMessage(seed: string, lang: string | null | undefined, many = false): string {
  return say(lang, seed, {
    EN: many ? ["Sorry, are they still free? A yes or no is fine."] : ["Sorry, is it still free? A yes or no is fine.", "Just to be sure: is it still free?"],
    FR: many ? ["Pardon, sont-elles toujours disponibles ? Oui ou non suffit."] : ["Pardon, est-elle toujours disponible ? Oui ou non suffit."],
    RW: many ? ["Mubabarire, ziracyahari? Yego cyangwa oya."] : ["Mubabarire, iracyahari? Yego cyangwa oya."],
  });
}

/** The broker sent photos without a price. */
export function priceQuestionMessage(seed: string): string {
  return pickPhrase(seed, [
    "Nice, how much per month? And which area?",
    "Thanks! What's the price per month, and where is it?",
    "Looks good. How much a month, and which area?",
  ]);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** To a tenant who left their number: homes for their search have come in. */
export function tenantAlertMessage(lang: string, count: number, link: string): string {
  if (lang === "ar") return `مكان: وجدنا ${count === 1 ? "منزلاً جديداً" : `${count} منازل جديدة`} لبحثك في كيغالي.\n${link}`;
  if (lang === "rw") return `Mkan: twabonye ${count === 1 ? "inzu nshya" : `amazu ${count} mashya`} ahuye n'ibyo washakaga i Kigali.\n${link}`;
  return `Mkan: ${count === 1 ? "a new home has" : `${count} new homes have`} come in for your Kigali search.\n${link}\n\nReply STOP to stop these alerts.`;
}

/** "+250 788…" in any shape → "+250788…"; null when it is not a number. */
export function brokerNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? `+${digits}` : null;
}

/** Who from Mkan meets the tenant and the broker at a viewing (MKAN_VIEWING_REP; Abdout for now, 2026-11-01). */
export const viewingRep = (env: string | undefined = process.env.MKAN_VIEWING_REP) => env?.trim() || "Osman";

/**
 * To a tenant who asked on WhatsApp: the broker answered about one home. Mkan
 * stays in the middle (Abdout, 2026-11-01): a yes never hands the tenant the
 * broker's number — the person from Mkan who will be at the viewing writes to
 * them. `canPick` — the broker offered viewing times on the form (asks before
 * 10-27), so the chat has a time to pick. `askedOn` — the answer comes a day or
 * more after the tenant last wrote (deal-pure.ts askedOnLabel): it names the day
 * they asked and asks whether they're still looking (2026-11-08).
 */
export function brokerAnswerMessage(lang: string, title: string, available: boolean, link: string, canPick = false, rep = viewingRep(), askedOn: string | null = null): string {
  if (lang === "ar")
    return available
      ? [
          askedOn ? `مكان: سألت عن «${title}» يوم ${askedOn}، وأكّد الوسيط أنه ما زال متاحاً.` : `مكان: أكّد الوسيط أن «${title}» ما زال متاحاً.`,
          `${askedOn ? "إن كنت ما زلت تبحث، " : ""}سيراسلك ${rep} من مكان هنا قريباً لترتيب المعاينة معك ومع الوسيط، والمعاينة مجانية لك.`,
          ...(canPick ? ["أو اختر موعداً للمعاينة هنا:"] : []),
          link,
        ].join("\n")
      : `مكان: ${askedOn ? `سألت عن «${title}» يوم ${askedOn}، وهو` : `«${title}»`} مؤجَّر للأسف. بقية المنازل لبحثك هنا:\n${link}`;
  if (lang === "rw")
    return available
      ? [
          askedOn ? `Mkan: wabajije ibya "${title}" ku itariki ya ${askedOn}. Komisiyoneri yemeje ko iracyahari.` : `Mkan: komisiyoneri yemeje ko "${title}" iracyahari.`,
          `${askedOn ? "Niba ugishaka inzu, " : ""}${rep} wo muri Mkan arakwandikira hano vuba mupange gusura hamwe na komisiyoneri — ni ubuntu kuri wowe.`,
          ...(canPick ? ["Cyangwa uhitemo igihe cyo kuyisura hano:"] : []),
          link,
        ].join("\n")
      : `Mkan: ${askedOn ? `wabajije ibya "${title}" ku itariki ya ${askedOn}. Yamaze` : `"${title}" yamaze`} gufatwa. Andi mazu ahuye n'ibyo ushaka ari hano:\n${link}`;
  return available
    ? [
        askedOn ? `Mkan: you asked about "${title}" on ${askedOn}. Good news, the broker says it's still available.` : `Mkan: good news, the broker says "${title}" is still available.`,
        `${askedOn ? "If you're still looking, " : ""}${rep} from Mkan will message you here shortly to set up the viewing with you and the broker. The viewing is free for you.`,
        ...(canPick ? ["Or pick a viewing time here:"] : []),
        link,
      ].join("\n")
    : `Mkan: ${askedOn ? `you asked about "${title}" on ${askedOn}. It's` : `"${title}" is`} taken, sorry. Your other homes are here:\n${link}`;
}

/**
 * To a WhatsApp tenant: the home they picked is taken, and the next best homes follow at once — never a
 * dead end ("is taken, sorry. Your other homes are here: <link>", the reply every November pick got).
 * `homes` is the list already formatted (whatsapp-format.ts homeLines), numbered from 1: replying with a
 * number checks that home, because the chat's shortlist was reordered to match (broker.ts applyAnswer).
 */
export function takenNextMessage(lang: string, title: string, homes: string, n: number, askedOn: string | null = null): string {
  const reply = "1";
  if (lang === "ar")
    return `مكان: ${askedOn ? `سألت عن «${title}» يوم ${askedOn}، وهو` : `«${title}»`} مؤجَّر للأسف. هذا أقرب بديل لك:\n\n${homes}\n\nأرسل ${n > 1 ? "رقم أحدهما" : reply} وأتأكد أنه ما زال متاحاً وأرتب لك معاينة.`;
  if (lang === "rw")
    return `Mkan: ${askedOn ? `wabajije ibya "${title}" ku itariki ya ${askedOn}. Yamaze` : `"${title}" yamaze`} gufatwa. Dore izikurikiraho zikubereye:\n\n${homes}\n\nOhereza ${n > 1 ? "nimero y'imwe" : reply} ndebe niba iracyahari.`;
  return `Mkan: ${askedOn ? `you asked about "${title}" on ${askedOn}. It's` : `"${title}" is`} taken, sorry. Next best for you:\n\n${homes}\n\nReply ${n > 1 ? "with a number" : reply} and I'll check it's still free and set up a viewing.`;
}

/** To a WhatsApp tenant: the broker has not answered in a day, and nobody else is left to ask about the home. */
export function noReplyMessage(lang: string, title: string, link: string): string {
  if (lang === "ar") return `مكان: لم يرد الوسيط بعد بخصوص «${title}». سأخبرك فور رده. يمكنك أيضاً أن تكتب لي ما تريد تغييره في البحث.\n${link}`;
  if (lang === "rw") return `Mkan: komisiyoneri ntarasubiza ku bya "${title}". Nzakubwira akimara gusubiza. Ushobora no kumbwira icyo wahindura mu byo ushaka.\n${link}`;
  return `Mkan: the broker hasn't answered about "${title}" yet. I'll tell you as soon as they do. Meanwhile you can tell me what to change in your search.\n${link}`;
}
