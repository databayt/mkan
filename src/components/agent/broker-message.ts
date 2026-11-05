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
import type { Requirements } from "./requirements";

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
  EN: "Reply 1 = still available, 2 = taken.",
  FR: "Répondez 1 = disponible, 2 = déjà prise.",
  RW: "Subiza 1 = iracyahari, 2 = yafashwe.",
};

/** Did this ask offer the 1 / 2 answer? */
export const offersReplyMenu = (body: string | null | undefined) => !!body && Object.values(REPLY_MENU).some((m) => body.includes(m));

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
  /** The tenant's need, as `needSummary().they`. */
  need?: string | null;
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
 * "Is this home still available?" about the broker's own ads, from Mkan. The
 * first one introduces Mkan and how to opt out; after that, a short ask that
 * names the tenant's need.
 */
export function availabilityMessage(homes: BrokerHomeLine[], seed: string, voice: BrokerVoice = { introduce: true }): string {
  const links = [...new Set(homes.map((h) => h.link))];
  const many = links.length > 1;
  // One home: its ref beside the link. Several: links only.
  const code = !many ? homes.find((h) => h.code?.trim())?.code?.trim() : null;
  const list = many ? links.join("\n") : `${links[0] ?? ""}${code ? ` (ref ${code})` : ""}`;
  const name = greetName(voice.name);
  const need = voice.need?.trim() ? `\n${voice.need.trim()}` : "";
  const lang = langOf(voice.lang);
  // One question, and for one home the answer is a digit.
  const menu = many ? "" : ` ${REPLY_MENU[lang]}`;
  if (lang === "FR") {
    const hi = `Bonjour${name ? ` ${name}` : ""}`;
    const q = (many ? "Sont-elles toujours disponibles ?" : "Est-elle toujours disponible ?") + menu;
    if (voice.introduce)
      return `${hi}, ici Mkan. Nous aidons des gens à trouver un logement à Kigali et nous les amenons à des agents comme vous. Un locataire que nous accompagnons s'intéresse à ${many ? "vos maisons" : "votre maison"} :\n${list}${need}\n${q} Si oui, nous organisons la visite avec vous.\nSi vous préférez ne plus recevoir nos messages, répondez simplement stop.`;
    return pickPhrase(seed, [`${hi}, c'est Mkan. Un locataire que nous accompagnons aime ${many ? "celles-ci" : "celle-ci"} :\n${list}${need}\n${q}`, `${hi}, Mkan à nouveau. Un locataire s'intéresse à ${many ? "ces maisons" : "cette maison"} :\n${list}${need}\n${q}`]);
  }
  if (lang === "RW") {
    const hi = `Muraho${name ? ` ${name}` : ""}`;
    const q = (many ? "Ziracyahari?" : "Iracyahari?") + menu;
    if (voice.introduce)
      return `${hi}, ni Mkan. Dufasha abantu kubona inzu i Kigali tukabazana ku ba komisiyoneri nkawe. Umukiriya dufasha yashimye ${many ? "amazu yawe" : "inzu yawe"}:\n${list}${need}\n${q} Niba ${many ? "zihari" : "ihari"}, turategura gusura nawe.\nNiba udashaka ko tukwandikira, subiza stop.`;
    return pickPhrase(seed, [`${hi}, ni Mkan. Umukiriya dufasha yashimye ${many ? "aya mazu" : "iyi nzu"}:\n${list}${need}\n${q}`, `${hi}, ni Mkan nanone. Dufite umukiriya ushaka ${many ? "aya mazu" : "iyi nzu"}:\n${list}${need}\n${q}`]);
  }
  const hi = `Hi${name ? ` ${name}` : " there"}`;
  const q = (many ? "Are they still available?" : "Is it still available?") + menu;
  if (voice.introduce)
    return `${hi}, this is Mkan. We help people find homes in Kigali and bring them to brokers like you. A tenant we're helping is interested in ${many ? "these homes of yours" : "your home"}:\n${list}${need}\n${q} If ${many ? "they are" : "it is"}, we'll set up the viewing with you.\nIf you'd rather we didn't message you, just reply stop.`;
  return pickPhrase(seed, [
    `${hi}, Mkan here. A tenant we're helping likes ${many ? "these" : "this one"}:\n${list}${need}\n${q}`,
    `Hello${name ? ` ${name}` : ""}, it's Mkan again. We have a tenant interested in ${many ? "these homes" : "this home"}:\n${list}${need}\n${q}`,
    `${hi}, Mkan again. One of our tenants is asking about ${many ? "these" : "this one"}:\n${list}${need}\n${q}`,
  ]);
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

/** The broker said it is available: Mkan comes back with the viewing. */
export function availableAckMessage(seed: string): string {
  return pickPhrase(seed, [
    "Great, thank you. We'll come back to you to set up the viewing.",
    "Thanks! We'll get back to you with a time for the viewing.",
    "Perfect, thank you. We'll be in touch about the viewing.",
  ]);
}

/** The broker said it is taken. */
export function takenAckMessage(seed: string): string {
  return pickPhrase(seed, ["Thanks for letting us know.", "Okay, thank you.", "Alright, thanks for the update."]);
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
 * 10-27), so the chat has a time to pick.
 */
export function brokerAnswerMessage(lang: string, title: string, available: boolean, link: string, canPick = false, rep = viewingRep()): string {
  if (lang === "ar")
    return available
      ? [`مكان: أكّد الوسيط أن «${title}» ما زال متاحاً.`, `سيراسلك ${rep} من مكان هنا قريباً لترتيب المعاينة معك ومع الوسيط، والمعاينة مجانية لك.`, ...(canPick ? ["أو اختر موعداً للمعاينة هنا:"] : []), link].join("\n")
      : `مكان: «${title}» مؤجَّر للأسف. بقية المنازل لبحثك هنا:\n${link}`;
  if (lang === "rw")
    return available
      ? [`Mkan: komisiyoneri yemeje ko "${title}" igihari.`, `${rep} wo muri Mkan arakwandikira hano vuba mupange gusura hamwe na komisiyoneri — ni ubuntu kuri wowe.`, ...(canPick ? ["Cyangwa uhitemo igihe cyo kuyisura hano:"] : []), link].join("\n")
      : `Mkan: "${title}" yamaze gufatwa. Andi mazu ahuye n'ibyo ushaka ari hano:\n${link}`;
  return available
    ? [`Mkan: good news, the broker says "${title}" is still available.`, `${rep} from Mkan will message you here shortly to set up the viewing with you and the broker. The viewing is free for you.`, ...(canPick ? ["Or pick a viewing time here:"] : []), link].join("\n")
    : `Mkan: "${title}" is taken, sorry. Your other homes are here:\n${link}`;
}

/** To a WhatsApp tenant: the broker has not answered in a day, and nobody else is left to ask about the home. */
export function noReplyMessage(lang: string, title: string, link: string): string {
  if (lang === "ar") return `مكان: لم يرد الوسيط بعد بخصوص «${title}». سأخبرك فور رده. يمكنك أيضاً أن تكتب لي ما تريد تغييره في البحث.\n${link}`;
  if (lang === "rw") return `Mkan: komisiyoneri ntarasubiza ku bya "${title}". Nzakubwira akimara gusubiza. Ushobora no kumbwira icyo wahindura mu byo ushaka.\n${link}`;
  return `Mkan: the broker hasn't answered about "${title}" yet. I'll tell you as soon as they do. Meanwhile you can tell me what to change in your search.\n${link}`;
}
