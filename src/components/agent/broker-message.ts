/**
 * The words a broker receives, written as the tenant they speak for: a Kigali
 * renter texting about one ad — "Hey there, is this available?" and the link
 * to the broker's own post, nothing else. No brand line, no form link, no
 * opt-out footer (STOP / HAGARIKA still work, wa-outbox). Every follow-up uses
 * only what the tenant told the agent; nothing here invents a person, and a
 * broker who asks "are you a bot?" gets a person (broker-inbox). Each message
 * picks one of a few phrasings from its seed, so a broker asked twice doesn't
 * get the same template twice. Pure, so the tests read exactly what goes out.
 * The tenant's name and phone never appear here; a broker sees them only after
 * confirming a viewing.
 */
import type { Requirements } from "./requirements";

export interface BrokerHomeLine {
  title: string;
  link: string;
}

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
 * 400k") for the answer form; `me` is the tenant saying it ("I'm looking for
 * …. It's for my family.") for WhatsApp.
 */
export function needSummary(r: Requirements): { en: string; rw: string; me: string } {
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
  let mine = "";
  if (r.purpose === "family") {
    household = "for a family";
    rw.push("ku muryango");
    mine = " It's for my family.";
  } else if (r.purpose === "study") {
    household = "for a student";
    rw.push("ku munyeshuri");
    mine = " I'm a student.";
  }
  const en = [noun, furnished, where ? `in ${where}` : null, budget, from, household].filter(Boolean).join(", ");
  // Said aloud the place sits on the noun: "a studio in Kanombe, unfurnished, up to 200k".
  const what = `${noun === "a home" ? "a place" : noun} in ${where ?? "Kigali"}`;
  const me = `I'm looking for ${[what, furnished, budget, from].filter(Boolean).join(", ")}.${mine}`;
  return { en, rw: rw.join(", ") || "inzu i Kigali", me };
}

/** "Is this available?" about the broker's own ads — the link and nothing else. */
export function availabilityMessage(homes: BrokerHomeLine[], seed: string): string {
  const links = [...new Set(homes.map((h) => h.link))];
  if (links.length === 1) {
    const link = links[0]!;
    return pickPhrase(seed, [
      `Hey there, is this available?\n${link}`,
      `Hi, is this still available?\n${link}`,
      `hey, is this one still available?\n${link}`,
      `${link}\nHello, is this still available?`,
    ]);
  }
  const list = links.join("\n");
  return pickPhrase(seed, [`Hi, are these still available?\n${list}`, `Hey there, are these available?\n${list}`]);
}

/** The tenant picked one of the times the broker offered on the form; the broker confirms there and then sees their contact. */
export function viewingChosenMessage(_title: string, slotLabel: string, link: string): string {
  return pickPhrase(link, [
    `Hi! Can I come see it on ${slotLabel}? Please confirm here\n${link}`,
    `Hello, is ${slotLabel} okay for me to come and see it? Confirm here please:\n${link}`,
  ]);
}

/**
 * Nothing on Mkan fits a tenant: ask a broker who works the area whether they
 * have a home. They answer in the chat — photos and a price — which
 * broker-inbox turns into a lead. `seed` varies the wording per broker.
 */
export function demandMessage(need: { me: string }, seed: string): string {
  return pickPhrase(seed, [
    `Hi, ${need.me} Do you have anything? Send me photos and the price`,
    `Hello! ${need.me} Anything available? Send photos and the price please`,
    `Hey there, ${need.me} Do you have something? Photos and price please`,
  ]);
}

/** The broker asked "how much / where / features?" back about a no-home ask: answer with the need, once. */
export function needReplyMessage(need: { me: string }, seed: string): string {
  return pickPhrase(seed, [`${need.me} Do you have something? Send photos and the price`, `${need.me} If you have one send me photos and the price.`]);
}

/** The broker asked about the tenant ("budget?", "single or family?") after "is this available?": answer, once. */
export function aboutMeMessage(need: { me: string }, seed: string, many = false): string {
  return pickPhrase(seed, many ? [`${need.me} Are they still available?`, `${need.me} Are these still free?`] : [`${need.me} Is it still available?`, `${need.me} Is this one still free?`]);
}

/** The broker only said hello: say it back and ask again, once. "How are you?" gets its answer. */
export function reAskMessage(text: string, seed: string, many = false): string {
  const it = many ? "are they" : "is it";
  if (/how are (?:you|u)|how r u|amakuru/i.test(text)) return pickPhrase(seed, [`Good, thanks. ${cap(it)} still available?`, `Fine thanks. ${cap(it)} still available?`]);
  return pickPhrase(seed, [`Hi, ${it} still available?`, `Hello, ${it} still available?`]);
}

/** The broker said it is available. */
export function availableAckMessage(seed: string): string {
  return pickPhrase(seed, ["Great, thanks", "Okay thank you, I'll get back to you", "Nice, thanks. I'll let you know"]);
}

/** The broker said it is taken. */
export function takenAckMessage(seed: string): string {
  return pickPhrase(seed, ["Ok, thanks for letting me know", "Alright, thank you", "Okay thanks"]);
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

/**
 * To a tenant who asked on WhatsApp: the broker answered about one home.
 * `canPick` — the broker offered viewing times on the form, so the chat has a
 * time to pick; a broker who answered in words offered none.
 * `phone` — the broker who said yes, for the tenant to call and arrange the viewing.
 */
export function brokerAnswerMessage(lang: string, title: string, available: boolean, link: string, canPick = true, phone?: string | null): string {
  const number = available ? brokerNumber(phone) : null;
  const lines = (said: string, call: string, pick: string, orPick: string) =>
    [said, ...(number ? [`${call} ${number}`, `https://wa.me/${number.slice(1)}`] : []), ...(canPick ? [number ? orPick : pick] : []), link].join("\n");
  if (lang === "ar")
    return available
      ? lines(`مكان: أكّد الوسيط أن «${title}» ما زال متاحاً.`, "اتصل به أو راسله على واتساب لترتيب المعاينة:", "اختر موعداً للمعاينة هنا:", "أو اختر موعداً للمعاينة هنا:")
      : `مكان: «${title}» مؤجَّر للأسف. بقية المنازل لبحثك هنا:\n${link}`;
  if (lang === "rw")
    return available
      ? lines(`Mkan: komisiyoneri yemeje ko "${title}" igihari.`, "Muhamagare cyangwa umwandikire kuri WhatsApp mupange gusura:", "Hitamo igihe cyo kuyisura hano:", "Cyangwa uhitemo igihe cyo kuyisura hano:")
      : `Mkan: "${title}" yamaze gufatwa. Andi mazu ahuye n'ibyo ushaka ari hano:\n${link}`;
  return available
    ? lines(`Mkan: the broker says "${title}" is still available.`, "Call or WhatsApp them to arrange a viewing:", "Pick a viewing time here:", "Or pick a viewing time here:")
    : `Mkan: "${title}" is taken, sorry. Your other homes are here:\n${link}`;
}
