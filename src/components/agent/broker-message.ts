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

export function needSummary(r: Requirements): { en: string; rw: string } {
  const en: string[] = [];
  const rw: string[] = [];
  if (r.bedrooms != null) {
    en.push(r.bedrooms === 0 ? "a studio" : `${r.bedrooms} bedroom${r.bedrooms === 1 ? "" : "s"}`);
    rw.push(r.bedrooms === 0 ? "studio" : `ibyumba ${r.bedrooms}`);
  }
  if (r.furnished === true) {
    en.push("furnished");
    rw.push("ifite ibikoresho");
  }
  if (r.district) {
    const d = r.district.charAt(0) + r.district.slice(1).toLowerCase();
    en.push(`in ${d}`);
    rw.push(`i ${d}`);
  }
  if (r.maxPrice) {
    en.push(`up to ${rwf(r.maxPrice)} a ${r.pricePeriod === "night" ? "night" : "month"}`);
    rw.push(`kugeza ${rwf(r.maxPrice)} ${r.pricePeriod === "night" ? "ku ijoro" : "ku kwezi"}`);
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
    `A tenant is looking for ${need.en} and nothing we list fits. Do you have one? Send it here (price, rooms, place) or reply with photos:`,
    link,
    "",
    `Muraho! Umukiriya arashaka ${need.rw}. Ufite inzu imeze ityo? Yohereze hano cyangwa usubize n'amafoto.`,
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
