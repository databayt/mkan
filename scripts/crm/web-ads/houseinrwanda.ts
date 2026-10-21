/**
 * houseinrwanda.com — Rwanda's largest property classifieds (Drupal). Server-
 * rendered, robots allows /for-rent and /property/, no login. Each ad carries
 * a labelled price, bedrooms, address ("Kigali City, Gasabo, Kinyinya"), a
 * contact phone and the advertising agency. ~110 rent ads per list page.
 */
import { rwandaPhonesInText } from '../tiktok-pure';
import { between, htmlToText, intIn, labelValue, metaContent, parsePrice, urlsIn, yesNo, type AdLink, type RawAd, type SiteAdapter } from './html';

const ORIGIN = 'https://www.houseinrwanda.com';
const MAX_PAGES = 5;

/** Each teaser is an `<article data-history-node-id="N">`; its first /property/rent/ link is the ad. */
export function parseList(html: string): AdLink[] {
  const out = new Map<string, AdLink>();
  const parts = html.split(/data-history-node-id="(\d+)"/);
  for (let i = 1; i < parts.length; i += 2) {
    const id = parts[i]!;
    const href = /href="(\/property\/rent\/[^"#?]+)"/.exec(parts[i + 1] ?? '')?.[1];
    if (href && !out.has(id)) out.set(id, { adId: id, url: `${ORIGIN}${href}` });
  }
  return [...out.values()];
}

export function parseAd(html: string, link: AdLink): RawAd {
  const text = htmlToText(html);
  const title = metaContent(html, 'og:title') ?? (/class="field field--name-title[^"]*">([^<]+)</.exec(html)?.[1]?.trim() ?? '');
  const priceLine = labelValue(text, 'Price');
  const price = parsePrice(priceLine);
  const address = labelValue(text, 'Address') ?? '';
  const [province, district, sector] = address.split(',').map((x) => x.trim() || undefined);
  const description = between(text, 'Property description', 'Contact details') ?? metaContent(html, 'og:description') ?? '';
  const hood = /Neighbou?rhood name\s*:\s*([^\n:]+?)(?:Furnished|Rent|\n|$)/i.exec(description)?.[1]?.trim() || null;
  const contact = between(text, 'Contact details', /View map|Advertiser agent/) ?? '';
  const agent = between(text, 'Advertiser agent', /View map|Share|$/) ?? '';
  const phones = rwandaPhonesInText(`${[...html.matchAll(/href="tel:([^"]+)"/g)].map((m) => decodeURIComponent(m[1]!)).join(' ')} ${contact} ${description}`);
  const month = /advert_photos\/(\d{4}-\d{2})\//.exec(html)?.[1] ?? null;
  return {
    site: 'houseinrwanda',
    adId: link.adId,
    url: link.url,
    title,
    text: description,
    price: price.amount,
    currency: price.currency,
    period: price.period,
    priceAsWritten: priceLine,
    bedrooms: intIn(labelValue(text, 'Bedrooms')),
    bathrooms: intIn(labelValue(text, 'Bathrooms')),
    propertyType: labelValue(text, 'Property type'),
    furnished: yesNo(labelValue(text, 'Furnished')),
    place: hood ?? sector ?? null,
    district: district ?? null,
    province: province ?? null,
    location: [hood, address].filter(Boolean).join(', '),
    phones,
    agencyName: labelValue(agent, 'Name') ?? labelValue(contact, 'Contact name'),
    photos: urlsIn(html, /href="((?:https:\/\/www\.houseinrwanda\.com)?\/sites\/default\/files\/advert_photos\/[^"]+\.(?:jpe?g|png|webp))"/gi, ORIGIN),
    postedAt: month,
  };
}

export const houseinrwanda: SiteAdapter = {
  site: 'houseinrwanda',
  label: 'House in Rwanda',
  origin: ORIGIN,
  listUrl: (page) => (page < MAX_PAGES ? `${ORIGIN}/for-rent${page ? `?page=${page}` : ''}` : null),
  parseList,
  parseAd,
};
