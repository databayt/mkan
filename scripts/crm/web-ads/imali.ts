/**
 * imali.biz — a Rwandan general classifieds site (since 2010), owners posting
 * directly, often in Kinyarwanda. Server-rendered, robots allows everything,
 * no login to read. Each rent category lists its ~21 newest ads (no further
 * pages without JS), so a daily run sees every new one. An ad carries the
 * price in RWF, province / district / sector, room counts and a "Call on" phone.
 */
import { rwandaPhonesInText } from '../tiktok-pure';
import { between, decodeEntities, htmlToText, intIn, labelValue, parsePrice, type AdLink, type RawAd, type SiteAdapter } from './html';

const ORIGIN = 'https://imali.biz';
/** The rent categories, newest ads first. Rooms are homes too (mkan's "Rooms" type). */
const CATEGORIES = ['/category/23/27/houses-for-rent?all', '/category/23/91/apartment-for-rent?all', '/category/2/88/room-for-rent?all'];

export function parseList(html: string): AdLink[] {
  const out = new Map<string, AdLink>();
  for (const m of html.matchAll(/href="(\/isaziso\/([a-z-]*for-rent)\/\d+\/(\d+)\/imp\d+)"/gi)) {
    const id = m[3]!;
    if (!out.has(id)) out.set(id, { adId: id, url: `${ORIGIN}${m[1]}` });
  }
  return [...out.values()];
}

const MONTHS: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

export function parseAd(html: string, link: AdLink): RawAd {
  const text = htmlToText(html);
  const category = /\/isaziso\/([a-z-]+)\//.exec(link.url)?.[1] ?? '';
  const title = decodeEntities(/class="auto-title[^"]*"[^>]*>([^<]*)</.exec(html)?.[1] ?? '').trim() || (/IMALI\.biz \| ([^:<]+)/.exec(html)?.[1]?.trim() ?? '');
  const priceLine = labelValue(text, 'label.announcePrice');
  const price = parsePrice(priceLine);
  const province = labelValue(text, 'label.announceProvince');
  const district = labelValue(text, 'label.announceDistrict');
  const sector = labelValue(text, 'label.announceSector');
  const details = between(text, 'label.announceDetails', 'label.announcePrice') ?? '';
  const call = /Call on:\s*([+\d][\d\s]+)/.exec(text)?.[1] ?? '';
  const d = /\b[A-Z][a-z]{2}, (\d{1,2}) ([A-Z][a-z]{2}) (\d{4}) (\d\d:\d\d:\d\d)/.exec(text);
  const postedAt = d && MONTHS[d[2]!] ? `${d[3]}-${MONTHS[d[2]!]}-${d[1]!.padStart(2, '0')}T${d[4]}+02:00` : null;
  const kind = category.startsWith('room') ? 'room' : category.startsWith('apartment') ? 'apartment' : 'house';
  return {
    site: 'imali',
    adId: link.adId,
    url: link.url,
    title,
    text: details,
    price: price.amount,
    currency: price.currency,
    // Kigali rents are monthly; the site never says, and its night stays are "Hotel Services".
    period: price.period === 'UNKNOWN' && price.amount != null ? 'MONTH' : price.period,
    priceAsWritten: priceLine,
    bedrooms: intIn(labelValue(text, 'label.houseBedRooms')) ?? (kind === 'room' ? 1 : null),
    bathrooms: intIn(labelValue(text, 'label.houseBathRooms')),
    propertyType: kind,
    furnished: null,
    place: sector,
    district,
    province,
    location: [sector, district, province].filter(Boolean).join(', '),
    phones: rwandaPhonesInText(`${call} ${details}`),
    agencyName: null,
    photos: [...new Set([...html.matchAll(/(https?:\/\/www\.img\.imali\.biz\/\d+\/[^"'?\s]+\.jpe?g)/gi)].map((m) => m[1]!).filter((u) => u.includes(`_${link.adId}_`)))],
    postedAt,
  };
}

export const imali: SiteAdapter = {
  site: 'imali',
  label: 'IMALI.biz',
  origin: ORIGIN,
  listUrl: (page) => (CATEGORIES[page] ? `${ORIGIN}${CATEGORIES[page]}` : null),
  parseList,
  parseAd,
};
