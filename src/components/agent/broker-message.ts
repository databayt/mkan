/**
 * The words a broker receives — English then Kinyarwanda, because Kigali
 * brokers read both and the tenant's language says nothing about theirs.
 * Pure, so the tests read exactly what goes out. The tenant's name and phone
 * never appear here; a broker sees them only after confirming a viewing.
 */
import type { Requirements } from "./requirements";

export interface BrokerHomeLine {
  title: string;
  link: string;
}

const rwf = (n: number) => `RWF ${Math.round(n).toLocaleString("en-US")}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The need in the words a broker asks for before offering anything. Kigali
 * brokers answer a vague ask with "How much?", "Where?", "Features&budget",
 * "Single or family?" (Abdout's own chats, Oct 2026), so every slot the tenant
 * filled goes in: size and type, furnishing, place, budget, move-in, household.
 */
export function needSummary(r: Requirements): { en: string; rw: string } {
  const en: string[] = [];
  const rw: string[] = [];
  if (r.homeType === "room") {
    en.push("a single room");
    rw.push("icyumba kimwe");
  } else if (r.bedrooms != null) {
    en.push(r.bedrooms === 0 ? "a studio" : `${r.bedrooms} bedroom${r.bedrooms === 1 ? "" : "s"}`);
    rw.push(r.bedrooms === 0 ? "studio" : `ibyumba ${r.bedrooms}`);
  }
  if (r.homeType === "house") {
    en.push("self compound (own gate and yard)");
    rw.push("inzu yigenga ifite igipangu");
  } else if (r.homeType === "apartment") {
    en.push("apartment");
    rw.push("apartment");
  }
  if (r.furnished === true) {
    en.push("furnished");
    rw.push("ifite ibikoresho");
  } else if (r.furnished === false) {
    en.push("unfurnished");
    rw.push("nta bikoresho");
  }
  const district = r.district ? r.district.charAt(0) + r.district.slice(1).toLowerCase() : null;
  const place = r.neighbourhood ? (district ? `${r.neighbourhood} (${district})` : r.neighbourhood) : district;
  if (place) {
    en.push(`in ${place}`);
    rw.push(`i ${place}`);
  }
  if (r.maxPrice) {
    en.push(`up to ${rwf(r.maxPrice)} a ${r.pricePeriod === "night" ? "night" : "month"}`);
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
  return { en: en.join(", ") || "a home in Kigali", rw: rw.join(", ") || "inzu i Kigali" };
}

export function availabilityMessage(handle: string | null, need: { en: string; rw: string }, homes: BrokerHomeLine[]): string {
  const hello = handle ? `Hello @${handle}` : "Hello";
  const list = homes.map((h, i) => `${homes.length > 1 ? `${i + 1}. ` : ""}${h.title}\n${h.link}`).join("\n\n");
  return [
    `${hello}, this is Mkan (mkan.sd).`,
    `A tenant is looking for ${need.en}. Is your home below still available? One tap answers — you can also offer viewing times.`,
    "",
    list,
    "",
    `Muraho! Umukiriya arashaka ${need.rw}. Inzu yawe iracyaboneka? Kanda ku murongo hejuru usubize.`,
  ].join("\n");
}

export function viewingChosenMessage(title: string, slotLabel: string, link: string): string {
  return [
    `Mkan: a tenant chose ${slotLabel} to view "${title}". Please confirm with one tap — you will then see their name and phone:`,
    link,
    "",
    `Umukiriya yahisemo ${slotLabel} gusura inzu. Emeza hano:`,
  ].join("\n");
}

/**
 * Nothing on Mkan fits a tenant: ask a broker who works the area whether they
 * have a home. One link to submit it; a plain WhatsApp reply works too.
 */
export function demandMessage(name: string | null, need: { en: string; rw: string }, link: string): string {
  return [
    `${name ? `Hello ${name}` : "Hello"}, this is Mkan (mkan.sd).`,
    `A tenant is looking for ${need.en}. Nothing we list fits — do you have one?`,
    `Reply here with the photos and the price (and the visit fee, if any), or send it on this page:`,
    link,
    "",
    `Muraho! Umukiriya arashaka ${need.rw}. Ufite inzu imeze ityo? Subiza hano n'amafoto n'igiciro, cyangwa uyohereze kuri uru rubuga.`,
    "",
    "Reply STOP to receive no more requests. / Andika HAGARIKA.",
  ].join("\n");
}

/** To a tenant who left their number: homes for their search have come in. */
export function tenantAlertMessage(lang: string, count: number, link: string): string {
  if (lang === "ar") return `مكان: وجدنا ${count === 1 ? "منزلاً جديداً" : `${count} منازل جديدة`} لبحثك في كيغالي.\n${link}`;
  if (lang === "rw") return `Mkan: twabonye ${count === 1 ? "inzu nshya" : `amazu ${count} mashya`} ahuye n'ibyo washakaga i Kigali.\n${link}`;
  return `Mkan: ${count === 1 ? "a new home has" : `${count} new homes have`} come in for your Kigali search.\n${link}\n\nReply STOP to stop these alerts.`;
}
