/**
 * The web-ads lane's pure core: a site's raw ad → the TikTok lane's read, the
 * keys it dedupes on, and the Twenty bodies it files. No network, no disk.
 *
 * Property sites already label their facts (price, rooms, district), so most
 * ads need no model at all; the reader runs only on the ads whose labels leave
 * a gap, and its answer never overrides a labelled field.
 */
import { buildFacebookPrompt, USD_RWF } from '../tiktok-read-prompt';
import { dupKey, fallbackTitle, homeBody, hostBody, phonesFor, type TikTokRead, type VideoRow } from '../tiktok-pure';
import { twentyPhones } from '../../../src/lib/phone';
import { districtForPlace } from '../../../src/lib/geo/rwanda-places';
import { termsFromText } from '../terms-pure';
import type { RawAd } from './html';

// web-v2 (2026-10-22): the reader (facebook-v2) and the labels both carry the renting terms.
export const WEB_PROMPT_VERSION = 'web-v2';
export const sourceIdFor = (site: string, adId: string): string => `web:${site}:${adId}`;

/** The site's type word → the reader's PROPERTY_TYPES; null = not a home (land, shop, office). */
export function propertyTypeFor(raw: string | null, title = ''): TikTokRead['propertyType'] | 'NOT_A_HOME' {
  const s = `${raw ?? ''} ${title}`.toLowerCase();
  if (/\b(commercial|office|shop|warehouse|land|plot|store|boutique)\b/.test(raw?.toLowerCase() ?? '')) return 'NOT_A_HOME';
  if (/\b(room|annex|self[- ]contained|chambre|icyumba)\b/.test(raw?.toLowerCase() ?? '')) return 'Rooms';
  if (/\b(apartment|apartement|appartement|flat|studio|condo)\b/.test(s)) return 'Apartment';
  if (/\b(townhouse|duplex|terrace)\b/.test(s)) return 'Townhouse';
  if (/\b(villa|house|home|inzu|bungalow|maison)\b/.test(s)) return 'Villa';
  if (/\b(room|annex|chambre|icyumba)\b/.test(s)) return 'Rooms';
  return null;
}

/** RWF from the printed amount; USD/EUR at the reader's rate (EUR ≈ USD × 1.08). */
export function priceRwfFor(ad: Pick<RawAd, 'price' | 'currency'>, usdRate = USD_RWF): number | null {
  if (ad.price == null) return null;
  if (ad.currency === 'USD') return Math.round(ad.price * usdRate);
  if (ad.currency === 'EUR') return Math.round(ad.price * usdRate * 1.08);
  return Math.round(ad.price);
}

const KIGALI = /\bkigali\b|umujyi wa kigali/i;
const district3 = (s: string | null): TikTokRead['district'] => {
  const d = districtForPlace(s);
  return d === 'UNKNOWN' ? null : d;
};

/** What the site's labels alone say, in the reader's shape. */
export function readFromAd(ad: RawAd, usdRate = USD_RWF): TikTokRead {
  const type = propertyTypeFor(ad.propertyType, ad.title);
  const priceRwf = priceRwfFor(ad, usdRate);
  const district = district3(ad.district) ?? district3(ad.place) ?? district3(ad.location);
  const inKigali = district != null || KIGALI.test(ad.province ?? '') || (KIGALI.test(ad.location) && !ad.province);
  // The site's furnishing label wins; the ad's own words fill it and the terms.
  const terms = termsFromText(`${ad.title}\n${ad.text}`, { priceRwf });
  return {
    isRental: type !== 'NOT_A_HOME',
    rejectReason: type === 'NOT_A_HOME' ? `listed as ${ad.propertyType}` : null,
    inKigali,
    period: priceRwf == null ? 'UNKNOWN' : ad.period,
    priceRwf,
    priceAsWritten: ad.priceAsWritten,
    propertyType: type === 'NOT_A_HOME' ? null : type,
    roomType: type === 'Rooms' ? 'PRIVATE_ROOM' : type ? 'ENTIRE_HOME' : null,
    bedrooms: ad.bedrooms,
    bathrooms: ad.bathrooms,
    furnished: ad.furnished ?? terms.furnished,
    depositMonths: terms.depositMonths,
    commission: terms.commission,
    viewingFee: terms.viewingFee,
    water: terms.water,
    electricity: terms.electricity,
    district,
    neighbourhood: ad.place,
    phones: ad.phones,
    posterKind: ad.agencyName ? 'BROKER' : 'UNKNOWN',
    features: [],
    units: [],
    propertyFrames: [],
    // Owners on classifieds title an ad "Iyinzu iri kuri azamu"; the facts make a better title.
    titleEn: DESCRIPTIVE_TITLE.test(ad.title) ? tidyTitle(ad.title) : null,
    titleRw: null,
    descriptionEn: null,
    onScreenText: null,
    brokerName: ad.agencyName,
    // Labelled by the site itself: as sure as a read gets, short of the broker.
    confidence: 0.9,
  };
}

const DESCRIPTIVE_TITLE = /\b(\d+\s*-?\s*(?:bed|br|bd)|bedrooms?|apartments?|house|villa|studio|room|duplex|for rent)\b/i;

/** "2 BEDROOM APARTMENT FOR RENT IN KAGUGU" → "2 Bedroom Apartment For Rent In Kagugu". */
export function tidyTitle(t: string): string {
  const s = t.replace(/\s+/g, ' ').trim();
  return s === s.toUpperCase() ? s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()) : s;
}

/** The labels a CRM home needs that this ad left blank — empty = no reader. */
export function readerGaps(read: TikTokRead): string[] {
  const gaps: string[] = [];
  if (read.priceRwf == null) gaps.push('price');
  if (read.bedrooms == null && read.propertyType !== 'Rooms') gaps.push('bedrooms');
  if (!read.district) gaps.push('district');
  // No neighbourhood = no dupKey: the reader finds it in the text ("near Kagugu Center").
  else if (!read.neighbourhood) gaps.push('place');
  if (!read.propertyType && read.isRental) gaps.push('type');
  return gaps;
}

/** The reader fills gaps; a labelled field always wins over a model's guess. */
export function mergeReads(labels: TikTokRead, model: TikTokRead): TikTokRead {
  const pick = <K extends keyof TikTokRead>(k: K): TikTokRead[K] => (labels[k] ?? model[k]) as TikTokRead[K];
  const priceRwf = pick('priceRwf');
  return {
    ...model,
    isRental: labels.isRental && model.isRental,
    rejectReason: labels.rejectReason ?? model.rejectReason,
    inKigali: labels.inKigali || model.inKigali,
    period: labels.priceRwf != null ? labels.period : model.period,
    priceRwf,
    priceAsWritten: pick('priceAsWritten'),
    propertyType: pick('propertyType'),
    roomType: pick('roomType'),
    bedrooms: pick('bedrooms'),
    bathrooms: pick('bathrooms'),
    furnished: pick('furnished'),
    depositMonths: pick('depositMonths'),
    commission: pick('commission'),
    viewingFee: pick('viewingFee'),
    water: pick('water'),
    electricity: pick('electricity'),
    district: pick('district'),
    neighbourhood: pick('neighbourhood'),
    phones: [...new Set([...labels.phones, ...model.phones])],
    posterKind: labels.posterKind !== 'UNKNOWN' ? labels.posterKind : model.posterKind,
    titleEn: model.titleEn ?? labels.titleEn,
    brokerName: pick('brokerName'),
    units: [],
    confidence: Math.min(labels.confidence, Math.max(model.confidence, 0.6)),
  };
}

/** The Facebook reader, worded for a property-site ad (text only, no photos). */
export function buildWebPrompt(ad: RawAd, siteLabel: string): string {
  return buildFacebookPrompt({
    handle: ad.agencyName ?? siteLabel,
    channel: siteLabel,
    caption: [ad.title, ad.priceAsWritten ? `Price: ${ad.priceAsWritten}` : null, ad.location ? `Location: ${ad.location}` : null, ad.text].filter(Boolean).join('\n'),
    uploadedAt: ad.postedAt?.slice(0, 10) ?? null,
    frames: [],
  }).replace('one Facebook post (a group post or a Marketplace listing) in Rwanda', `one classified ad on the Rwandan property website ${siteLabel}`);
}

/** Older than `maxAgeDays` by the site's own date; undated ads are kept. */
export function isStale(postedAt: string | null, maxAgeDays: number, nowMs = Date.now()): boolean {
  if (!postedAt || !Number.isFinite(maxAgeDays)) return false;
  // "YYYY-MM" (a month implied by an upload path) counts from the month's end.
  const t = /^\d{4}-\d{2}$/.test(postedAt) ? Date.parse(`${postedAt}-28T00:00:00Z`) : Date.parse(postedAt);
  return Number.isFinite(t) && nowMs - t > maxAgeDays * 86_400_000;
}

/** The ad in the shape the TikTok bodies read; `handle` is the agency or the site. */
export function asVideoRow(ad: RawAd, siteLabel: string, discoveredAt: string): VideoRow {
  return {
    videoId: `${ad.site}:${ad.adId}`,
    url: ad.url,
    handle: ad.agencyName ?? siteLabel,
    via: 'seed',
    discoveredAt,
    state: 'read',
    meta: { caption: `${ad.title}\n${ad.location}\n${ad.text}`, uploader: ad.agencyName ?? '', channel: ad.agencyName ?? siteLabel, timestamp: null, duration: null, views: null },
  };
}

/** The dupKey of a home already in Twenty, from its own fields — TikTok's and Facebook's homes count too. */
export function twentyHomeKey(h: Record<string, unknown>): string | null {
  const micros = (h.priceMonthLocal as { amountMicros?: number } | null)?.amountMicros;
  const place = (h.homeAddress as { addressStreet1?: string } | null)?.addressStreet1 ?? null;
  return dupKey('', { priceRwf: micros ? micros / 1e6 : null, bedrooms: (h.bedrooms as number | null) ?? null, neighbourhood: place });
}

const linkOne = (url: string, label: string) => ({ primaryLinkUrl: url, primaryLinkLabel: label });

/** The Twenty `home` body for one web ad (source WEB, VETTING). Undefined values are dropped by the caller. */
export function webHomeBody(ad: RawAd, read: TikTokRead, opts: { siteLabel: string; photoUrls: string[]; phone: string | null; hostName: string; readVersion: string; discoveredAt: string }) {
  const v = asVideoRow(ad, opts.siteLabel, opts.discoveredAt);
  const base = homeBody(v, read, { frameUrls: opts.photoUrls, phone: opts.phone, hostName: opts.hostName, promptVersion: opts.readVersion, duplicate: false, sourceId: sourceIdFor(ad.site, ad.adId) });
  return {
    ...base,
    source: 'WEB',
    sourceUrl: linkOne(ad.url, opts.siteLabel),
    title: read.titleEn ?? fallbackTitle(read),
    description: ad.text || base.description,
    notesEn: [
      `Ad on ${opts.siteLabel}${ad.agencyName ? ` by ${ad.agencyName}` : ''}${ad.postedAt ? `, posted ${ad.postedAt.slice(0, 10)}` : ''}.`,
      ad.priceAsWritten ? `Price as written: ${ad.priceAsWritten}` : null,
      ad.currency && ad.currency !== 'RWF' ? `Currency as written: ${ad.currency} — RWF price is converted, confirm with the advertiser.` : null,
      read.priceRwf == null ? 'No price in the ad — ask the advertiser.' : null,
      base.qualificationStatus === 'PRICE_ANOMALY' ? `Price ${read.priceRwf} RWF/${read.period.toLowerCase()} is outside the usual Kigali band — check before quoting.` : null,
      !opts.phone ? `No phone in the ad — reach the advertiser on ${opts.siteLabel}.` : null,
      `Location as written: ${ad.location || '—'}`,
      `Read by ${opts.readVersion}, confidence ${read.confidence}`,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

/** The Twenty `host` body for a web advertiser (an agency, a broker, or an owner). */
export function webHostBody(ad: RawAd, read: TikTokRead, phones: string[], siteLabel: string) {
  const v = asVideoRow(ad, siteLabel, '');
  const phone = phones[0] ?? null;
  const base = hostBody(v, read, phone);
  return {
    ...base,
    name: ad.agencyName ?? (phone ? `${siteLabel} advertiser ${phone}` : `${siteLabel} advertiser`),
    tiktokHandle: undefined,
    source: 'WEB',
    contactFoundVia: 'PUBLIC_DIRECTORY',
    phone: twentyPhones(phone, phones.slice(1)),
    agencySuspected: !!ad.agencyName || read.posterKind === 'BROKER',
    notes: `${siteLabel} advertiser — ${ad.url}`,
  };
}

/** Phones to file: the labels and reader's, validated, plus any the ad text spells out. */
export const webPhones = (read: TikTokRead, ad: RawAd): string[] => phonesFor(read, `${ad.text} ${ad.phones.join(' ')}`);
