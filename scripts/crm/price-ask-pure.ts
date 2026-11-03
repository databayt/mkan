/**
 * The price ask's pure core: which CRM homes still need their rent asked, and the
 * message that asks it. A home with no price cannot meet a tenant's budget on /find,
 * and 40 of the 55 homes kept out on 2026-11-03 had none — the broker wrote "call me".
 */
import { inTheirLanguage, waLink } from './tiktok-post-pure';

type Row = Record<string, unknown>;

export interface PriceAsk {
  homeId: string;
  title: string;
  sourceUrl: string | null;
  phone: string;
  name: string;
  lang: string | null;
  text: string;
  link: string;
}

const linkOf = (v: unknown): string | null => ((v as { primaryLinkUrl?: string | null } | null)?.primaryLinkUrl || null);
const micros = (v: unknown): number | null => {
  const m = (v as { amountMicros?: number | null } | null)?.amountMicros;
  return m ? m / 1_000_000 : null;
};
const phoneOf = (v: unknown): string | null => {
  const p = v as { primaryPhoneNumber?: string | null; primaryPhoneCallingCode?: string | null } | null;
  const n = (p?.primaryPhoneNumber ?? '').replace(/\D/g, '');
  if (!n) return null;
  const cc = (p?.primaryPhoneCallingCode ?? '+250').replace(/\D/g, '');
  return n.startsWith(cc) ? n : `${cc}${n.replace(/^0/, '')}`;
};

/** Ask the broker the rent for one home, their language first (EN, RW or FR). */
export function priceAskText(name: string, title: string, sourceUrl: string | null, lang?: string | null): string {
  const hi = name ? ` ${name}` : '';
  const link = sourceUrl ? `\n${sourceUrl}` : '';
  return inTheirLanguage(lang, {
    EN: [`Hello${hi} 👋 This is mkan (mkan.sd), a home-rental platform in Kigali.`, `We have a tenant looking — what is the monthly rent for "${title}"?${link}`],
    RW: [`Muraho${hi} 👋 Turi mkan (mkan.sd), urubuga rw'ubukode bw'inzu i Kigali.`, `Dufite umukiriya ushaka inzu — "${title}" ikodeshwa angahe ku kwezi?${link}`],
    FR: [`Bonjour${hi} 👋 Ici mkan (mkan.sd), une plateforme de location de maisons à Kigali.`, `Nous avons un locataire intéressé — quel est le loyer mensuel de « ${title} » ?${link}`],
  });
}

/**
 * Homes from the last `days` days still in VETTING, not a duplicate, with no price of any kind
 * and a broker phone to ask. Newest first; one ask per home.
 */
export function selectPriceAsks(homes: Row[], hosts: Row[], nowMs: number, days = 7): PriceAsk[] {
  const hostById = new Map(hosts.map((h) => [String(h.id), h]));
  const since = nowMs - days * 86_400_000;
  const out: (PriceAsk & { at: number })[] = [];
  for (const h of homes) {
    if (!['TIKTOK', 'WEB', 'FACEBOOK'].includes(String(h.source))) continue;
    if (h.pipelineStage !== 'VETTING' || h.homeStatus === 'DUPLICATE') continue;
    if (micros(h.priceMonthLocal) || micros(h.priceNightLocal)) continue;
    const at = Date.parse(String(h.createdAt ?? h.scrapedAt ?? ''));
    if (!(at >= since)) continue;
    const host = hostById.get(String(h.hostId)) ?? null;
    const phone = phoneOf(host?.phone) ?? phoneOf(h.hostPhone);
    if (!phone) continue;
    const name = String(host?.contactName || host?.name || h.hostName || '').trim();
    const lang = (host?.preferredLanguage as string | null) ?? null;
    const title = String(h.titleEn || h.title || 'your home').replace(/\s+/g, ' ').trim();
    const sourceUrl = linkOf(h.sourceUrl);
    const text = priceAskText(name, title, sourceUrl, lang);
    out.push({ homeId: String(h.id), title, sourceUrl, phone, name, lang, text, link: waLink(phone, text), at });
  }
  return out.sort((a, b) => b.at - a.at).map(({ at: _at, ...a }) => a);
}
