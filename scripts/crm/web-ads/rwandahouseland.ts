/**
 * rwandahouseland.com — a broker marketplace (Laravel + Tailwind), server-
 * rendered, robots allows everything, no login to read. /forRent lists 24 ads
 * a page, newest first; each ad names its broker with a phone, the asking
 * price in FRW, "Payable monthly", and Province / District / Sector.
 */
import { rwandaPhonesInText } from '../tiktok-pure';
import { between, htmlToText, intIn, labelValue, metaContent, parsePrice, urlsIn, type AdLink, type RawAd, type SiteAdapter } from './html';

const ORIGIN = 'https://rwandahouseland.com';
/** The site's own line, printed in every footer — never an ad's phone. */
const SITE_PHONES = ['+250783159293'];
const MAX_PAGES = 40;

export function parseList(html: string): AdLink[] {
  const out = new Map<string, AdLink>();
  for (const m of html.matchAll(/property_view\/(\d+)/g)) {
    const id = m[1]!;
    if (!out.has(id)) out.set(id, { adId: id, url: `${ORIGIN}/property_view/${id}` });
  }
  return [...out.values()];
}

export function parseAd(html: string, link: AdLink): RawAd {
  // The footer repeats the site's phone and generic links; the ad ends before "Browse more properties".
  const cut = html.search(/Browse more properties/i);
  const body = cut > 0 ? html.slice(0, cut) : html;
  const text = htmlToText(body);
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(body);
  const title = htmlToText(h1?.[1] ?? '') || metaContent(html, 'og:title') || '';
  // The key facts sit right under the title: the place line, then chips.
  const afterTitle = `\n${htmlToText(h1 ? body.slice((h1.index ?? 0) + h1[0].length) : body)}`;
  const where = afterTitle.split('\n')[1]?.trim() ?? '';
  const priceLine = labelValue(text, 'Asking price');
  const price = parsePrice(`${priceLine ?? ''} ${/Payable (\w+)/i.exec(text)?.[0] ?? ''}`);
  const province = labelValue(text, 'Province');
  const district = labelValue(text, 'District');
  const sector = labelValue(text, 'Sector');
  const cell = labelValue(text, 'Cell / Village');
  const type = /\n(apartment|house|villa|room|studio|townhouse|commercial|office|guest ?house)\b/i.exec(afterTitle)?.[1] ?? null;
  const tel = [...body.matchAll(/href="(?:tel:|https:\/\/wa\.me\/)([^"]+)"/g)].map((m) => decodeURIComponent(m[1]!)).join(' ');
  const listedBy = between(text, 'Listed by', /Get in touch|View all properties/) ?? '';
  const phones = rwandaPhonesInText(`${tel} ${listedBy}`).filter((p) => !SITE_PHONES.includes(p));
  return {
    site: 'rwandahouseland',
    adId: link.adId,
    url: link.url,
    title,
    text: between(text, 'About this property', /\nLocation\n/) ?? metaContent(html, 'og:description') ?? '',
    price: price.amount,
    currency: price.currency ?? (price.amount != null ? 'RWF' : null),
    period: price.period,
    priceAsWritten: priceLine,
    bedrooms: intIn(/(\d+)\s*bedroom/i.exec(afterTitle)?.[1]),
    bathrooms: intIn(/(\d+)\s*bathroom/i.exec(afterTitle)?.[1]),
    propertyType: type,
    furnished: /\bunfurnished\b/i.test(text) ? false : /\bfurnished\b/i.test(title) ? true : null,
    place: cell ?? sector ?? null,
    district,
    province,
    location: where || [cell, sector, district, province].filter(Boolean).join(', '),
    phones,
    // The avatar fallback prints the broker's initial first; the name is the broker link.
    agencyName: htmlToText(/href="https:\/\/rwandahouseland\.com\/broker\/\d+"[^>]*>([\s\S]*?)<\/a>/.exec(body)?.[1] ?? '') || listedBy.split('\n').find((l) => l.trim().length > 2)?.trim() || null,
    photos: urlsIn(body, /data-full="(https:\/\/rwandahouseland\.com\/photos\/[^"]+)"/g, ORIGIN),
    postedAt: null,
  };
}

export const rwandahouseland: SiteAdapter = {
  site: 'rwandahouseland',
  label: 'RwandaHouseland',
  origin: ORIGIN,
  listUrl: (page) => (page < MAX_PAGES ? `${ORIGIN}/forRent${page ? `?page=${page + 1}` : ''}` : null),
  parseList,
  parseAd,
};
