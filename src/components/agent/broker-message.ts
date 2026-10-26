/**
 * The words a broker receives. They read like one person at Mkan texting a
 * broker the way Kigali brokers text each other: short, plain English with a
 * "Muraho", the home's link, what the client wants — no brand line, no "one
 * tap", no opt-out footer (STOP / HAGARIKA still work, wa-outbox). Each
 * message picks one of a few phrasings from its own link, so a broker asked
 * twice doesn't get the same template twice. Pure, so the tests read exactly
 * what goes out. The tenant's name and phone never appear here; a broker sees
 * them only after confirming a viewing.
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
 * 400k") so it fits "Do you have …?" and "My client wants …".
 */
export function needSummary(r: Requirements): { en: string; rw: string } {
  const rw: string[] = [];
  let noun: string;
  const beds = r.bedrooms != null && r.bedrooms > 0 ? `${r.bedrooms}-bedroom` : null;
  if (r.homeType === "room") noun = "a single room";
  else if (r.bedrooms === 0) noun = "a studio";
  else if (r.homeType === "house") noun = `a ${beds ? `${beds} ` : ""}house with its own compound`;
  else if (r.homeType === "apartment") noun = beds ? `a ${beds} apartment` : "an apartment";
  else noun = beds ? `a ${beds}` : "a home";
  const en: string[] = [noun];

  if (r.homeType === "room") rw.push("icyumba kimwe");
  else if (r.bedrooms != null) rw.push(r.bedrooms === 0 ? "studio" : `ibyumba ${r.bedrooms}`);
  if (r.homeType === "house") rw.push("inzu yigenga ifite igipangu");
  else if (r.homeType === "apartment") rw.push("apartment");
  if (r.furnished === true) {
    en.push("furnished");
    rw.push("ifite ibikoresho");
  } else if (r.furnished === false) {
    en.push("unfurnished");
    rw.push("nta bikoresho");
  }
  const district = r.district ? r.district.charAt(0) + r.district.slice(1).toLowerCase() : null;
  if (r.neighbourhood ?? district) en.push(`in ${r.neighbourhood ?? district}`);
  const place = r.neighbourhood ? (district ? `${r.neighbourhood} (${district})` : r.neighbourhood) : district;
  if (place) rw.push(`i ${place}`);
  if (r.maxPrice) {
    en.push(`up to ${shortRwf(r.maxPrice)}${r.pricePeriod === "night" ? " a night" : ""}`);
    rw.push(`kugeza ${rwf(r.maxPrice)} ${r.pricePeriod === "night" ? "ku ijoro" : "ku kwezi"}`);
  }
  if (r.moveIn) {
    const [, m, d] = r.moveIn.split("-").map(Number);
    en.push(`from ${d} ${MONTHS[(m ?? 1) - 1]}`);
    rw.push(`guhera ${d}/${m}`);
  }
  if (r.purpose === "family") {
    en.push("for a family");
    rw.push("ku muryango");
  } else if (r.purpose === "study") {
    en.push("for a student");
    rw.push("ku munyeshuri");
  }
  return { en: en.join(", "), rw: rw.join(", ") || "inzu i Kigali" };
}

/** "Is it still available?" about one or more of the broker's own homes. */
export function availabilityMessage(need: { en: string }, homes: BrokerHomeLine[]): string {
  const seed = homes.map((h) => h.link).join();
  if (homes.length === 1) {
    const link = homes[0]!.link;
    return pickPhrase(seed, [
      `Muraho! Is this one still available?\n${link}\n\nI have a client looking for ${need.en}.`,
      `Hello, is this place still available?\n${link}\n\nMy client wants ${need.en}.`,
      `Hi 👋 still available?\n${link}\n\nClient is looking for ${need.en}.`,
    ]);
  }
  const list = homes.map((h, i) => `${i + 1}. ${h.title}\n${h.link}`).join("\n\n");
  return pickPhrase(seed, [
    `Muraho! Are these still available?\n\n${list}\n\nI have a client looking for ${need.en}.`,
    `Hello, are these still free?\n\n${list}\n\nMy client wants ${need.en}.`,
  ]);
}

/** The tenant picked a viewing time; the broker confirms on the link and then sees their contact. */
export function viewingChosenMessage(title: string, slotLabel: string, link: string): string {
  return pickPhrase(link, [
    `Hello, my client wants to come see "${title}" on ${slotLabel}. Is that ok for you? Confirm here and I'll share their number:\n${link}`,
    `Hi! Client can view "${title}" on ${slotLabel}. Does that work? Confirm here and you'll get their contact:\n${link}`,
  ]);
}

/**
 * Nothing on Mkan fits a tenant: ask a broker who works the area whether they
 * have a home. They answer in the chat — photos and a price — which
 * broker-inbox turns into a lead. `seed` varies the wording per broker.
 */
export function demandMessage(need: { en: string }, seed: string): string {
  return pickPhrase(seed, [
    `Muraho! Do you have ${need.en}? I have a client ready. If yes send me photos and the price 🙏`,
    `Hello, I'm looking for ${need.en} for a client. Do you have something? Send photos and price please.`,
    `Hi! I need ${need.en} for a client. Anything available? Send me photos and the price.`,
  ]);
}

/** The broker asked "how much / where / features?" back: answer with the need, once. */
export function needReplyMessage(need: { en: string }, seed: string): string {
  return pickPhrase(seed, [
    `It's ${need.en}. Do you have something? Send photos and the price 🙏`,
    `Client wants ${need.en}. If you have one send photos and price.`,
  ]);
}

/** The broker sent photos without a price. */
export function priceQuestionMessage(seed: string): string {
  return pickPhrase(seed, [
    "Nice 👍 how much per month? And which area?",
    "Thanks! What's the price per month, and where is it?",
    "Looks good. How much a month, and which area?",
  ]);
}

/** To a tenant who left their number: homes for their search have come in. */
export function tenantAlertMessage(lang: string, count: number, link: string): string {
  if (lang === "ar") return `مكان: وجدنا ${count === 1 ? "منزلاً جديداً" : `${count} منازل جديدة`} لبحثك في كيغالي.\n${link}`;
  if (lang === "rw") return `Mkan: twabonye ${count === 1 ? "inzu nshya" : `amazu ${count} mashya`} ahuye n'ibyo washakaga i Kigali.\n${link}`;
  return `Mkan: ${count === 1 ? "a new home has" : `${count} new homes have`} come in for your Kigali search.\n${link}\n\nReply STOP to stop these alerts.`;
}

/** To a tenant who asked on WhatsApp: the broker answered about one home. */
export function brokerAnswerMessage(lang: string, title: string, available: boolean, link: string): string {
  if (lang === "ar")
    return available
      ? `مكان: أكّد الوسيط أن «${title}» ما زال متاحاً. اختر موعداً للمعاينة هنا:\n${link}`
      : `مكان: «${title}» مؤجَّر للأسف. بقية المنازل لبحثك هنا:\n${link}`;
  if (lang === "rw")
    return available
      ? `Mkan: komisiyoneri yemeje ko "${title}" igihari. Hitamo igihe cyo kuyisura hano:\n${link}`
      : `Mkan: "${title}" yamaze gufatwa. Andi mazu ahuye n'ibyo ushaka ari hano:\n${link}`;
  return available
    ? `Mkan: the broker says "${title}" is still available. Pick a viewing time here:\n${link}`
    : `Mkan: "${title}" is taken, sorry. Your other homes are here:\n${link}`;
}
