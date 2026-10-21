/**
 * The web-ads lane: each site adapter's parser on a saved page, the label →
 * read mapping, and the survey's robots check. Fixtures are real pages
 * trimmed and anonymised (phones, emails, people's names) — the repo is public.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { htmlToText, labelValue, parsePrice } from '../../scripts/crm/web-ads/html';
import * as hir from '../../scripts/crm/web-ads/houseinrwanda';
import * as imali from '../../scripts/crm/web-ads/imali';
import * as rhl from '../../scripts/crm/web-ads/rwandahouseland';
import { buildWebPrompt, isStale, mergeReads, propertyTypeFor, readFromAd, readerGaps, sourceIdFor, webHomeBody, webHostBody } from '../../scripts/crm/web-ads/pure';
import { robotsAllows, surveyPage, SURVEY_SITES } from '../../scripts/crm/web-ads/survey';
import { dupKey, skipReasonFor, type TikTokRead } from '../../scripts/crm/tiktok-pure';

const fx = (name: string) => readFileSync(join(__dirname, 'fixtures/web-ads', name), 'utf8');

describe('html helpers', () => {
  it('reads printed prices in the shapes the sites use', () => {
    expect(parsePrice('500,000 Rwf /month')).toEqual({ amount: 500_000, currency: 'RWF', period: 'MONTH' });
    expect(parsePrice('Rwf 1 000 000 ≈ $ 675.68 USD / month')).toEqual({ amount: 1_000_000, currency: 'RWF', period: 'MONTH' });
    expect(parsePrice('900 USD Payable monthly')).toEqual({ amount: 900, currency: 'USD', period: 'MONTH' });
    expect(parsePrice('RWF 500,000')).toEqual({ amount: 500_000, currency: 'RWF', period: 'UNKNOWN' });
    expect(parsePrice('600K FRW')).toMatchObject({ amount: 600_000, currency: 'RWF' });
    expect(parsePrice('$80 per night')).toEqual({ amount: 80, currency: 'USD', period: 'NIGHT' });
    expect(parsePrice(null).amount).toBeNull();
  });

  it('treats source newlines as spaces and block tags as lines', () => {
    const t = htmlToText('<p>Asking price</p>\n<p>\n  900\n  <span>USD</span>\n</p><div><strong>Price:</strong> 1&nbsp;000</div>');
    expect(t.split('\n')).toEqual(['Asking price', '900 USD', 'Price: 1 000']);
    expect(labelValue(t, 'Asking price')).toBe('900 USD');
    expect(labelValue(t, 'Price')).toBe('1 000');
    expect(labelValue('Please use the details below to book a visit. Contact name: Example Realty', 'Contact name')).toBe('Example Realty');
  });
});

describe('houseinrwanda', () => {
  it('lists each teaser once, by node id', () => {
    const links = hir.parseList(fx('houseinrwanda-list.html'));
    expect(links.length).toBe(3);
    expect(links[0]!.adId).toMatch(/^\d+$/);
    expect(links[0]!.url).toMatch(/^https:\/\/www\.houseinrwanda\.com\/property\/rent\//);
  });

  it('reads the labelled ad', () => {
    const ad = hir.parseAd(fx('houseinrwanda-ad.html'), { adId: '54926', url: 'https://www.houseinrwanda.com/property/rent/apartment/2-bedroom-apartment-rent-kagugu' });
    expect(ad).toMatchObject({
      site: 'houseinrwanda',
      adId: '54926',
      title: '2 BEDROOM APARTMENT FOR RENT IN KAGUGU',
      price: 500_000,
      currency: 'RWF',
      period: 'MONTH',
      bedrooms: 2,
      bathrooms: 2,
      propertyType: 'Apartment',
      furnished: false,
      place: 'Kagugu',
      district: 'Gasabo',
      province: 'Kigali City',
      phones: ['+250788000110'],
      agencyName: 'Example Listings',
      postedAt: '2026-10',
    });
    expect(ad.photos.length).toBeGreaterThan(3);
    expect(ad.photos[0]).toMatch(/^https:\/\/www\.houseinrwanda\.com\/sites\/default\/files\/advert_photos\//);
    expect(ad.text).toContain('2 bedrooms');
  });
});

describe('rwandahouseland', () => {
  it('lists ads by id, newest first', () => {
    const links = rhl.parseList(fx('rwandahouseland-list.html'));
    expect(links.length).toBeGreaterThanOrEqual(3);
    expect(Number(links[0]!.adId)).toBeGreaterThan(Number(links[1]!.adId));
    expect(links[0]!.url).toBe(`https://rwandahouseland.com/property_view/${links[0]!.adId}`);
  });

  it('reads a USD ad, and the broker name rather than the avatar initial', () => {
    const ad = rhl.parseAd(fx('rwandahouseland-ad.html'), { adId: '1998', url: 'https://rwandahouseland.com/property_view/1998' });
    expect(ad).toMatchObject({
      title: 'Full furnished house for rent',
      price: 900,
      currency: 'USD',
      period: 'MONTH',
      bedrooms: 3,
      bathrooms: 3,
      propertyType: 'house',
      place: 'Kanombe',
      district: 'Kicukiro',
      location: 'Kanombe, Kicukiro, Kigali city',
      agencyName: 'Jane Broker',
    });
    expect(ad.phones).toEqual(['+250788000112']);
    expect(ad.photos.every((p) => p.startsWith('https://rwandahouseland.com/photos/'))).toBe(true);
  });
});

describe('imali', () => {
  it('lists rent ads by numeric id', () => {
    const links = imali.parseList(fx('imali-list.html'));
    expect(links.length).toBe(3);
    expect(links[0]!.url).toMatch(/^https:\/\/imali\.biz\/isaziso\/houses-for-rent\/27\/\d+\/imp\d+$/);
  });

  it('reads a Kinyarwanda owner ad', () => {
    const ad = imali.parseAd(fx('imali-ad.html'), { adId: '261594', url: 'https://imali.biz/isaziso/houses-for-rent/27/261594/imp3872112' });
    expect(ad).toMatchObject({
      title: 'Dubai poti masaka',
      price: 500_000,
      currency: 'RWF',
      period: 'MONTH',
      bedrooms: 4,
      bathrooms: 3,
      propertyType: 'house',
      place: 'Masaka',
      district: 'Kicukiro',
      province: 'Umujyi wa Kigali',
      agencyName: null,
      postedAt: '2026-10-20T20:29:54+02:00',
    });
    expect(ad.phones).toEqual(['+250788000114', '+250788000115']);
    expect(ad.photos.length).toBe(5);
    expect(ad.photos.every((p) => p.includes('_261594_'))).toBe(true);
  });
});

describe('labels → read', () => {
  const hirAd = () => hir.parseAd(fx('houseinrwanda-ad.html'), { adId: '54926', url: 'https://www.houseinrwanda.com/x' });

  it('needs no model when the site labels price, rooms and place', () => {
    const read = readFromAd(hirAd());
    expect(read).toMatchObject({ isRental: true, inKigali: true, priceRwf: 500_000, period: 'MONTH', bedrooms: 2, propertyType: 'Apartment', district: 'GASABO', neighbourhood: 'Kagugu', posterKind: 'BROKER' });
    expect(readerGaps(read)).toEqual([]);
    expect(skipReasonFor(read, { caption: hirAd().location })).toBeNull();
    expect(dupKey('', read)).toBe(dupKey('', { priceRwf: 500_000, bedrooms: 2, neighbourhood: 'Kagugu' }));
  });

  it('converts USD and maps the type words', () => {
    const ad = rhl.parseAd(fx('rwandahouseland-ad.html'), { adId: '1998', url: 'https://rwandahouseland.com/property_view/1998' });
    const read = readFromAd(ad, 1450);
    expect(read.priceRwf).toBe(1_305_000);
    expect(read.propertyType).toBe('Villa');
    expect(read.district).toBe('KICUKIRO');
    expect(propertyTypeFor('room')).toBe('Rooms');
    expect(propertyTypeFor('Commercial')).toBe('NOT_A_HOME');
    expect(propertyTypeFor(null, '2 bedroom apartment')).toBe('Apartment');
  });

  it('drops homes outside Kigali at the gate', () => {
    const ad = { ...hirAd(), place: 'Ntarama', district: 'Bugesera', province: 'Eastern Province', location: 'Eastern Province, Bugesera, Ntarama' };
    const read = readFromAd(ad);
    expect(read.inKigali).toBe(false);
    expect(skipReasonFor(read, { caption: ad.location })).toBe('outside Kigali');
  });

  it('lets the reader fill gaps but never override a label', () => {
    const labels = readFromAd({ ...hirAd(), place: null, bedrooms: null });
    expect(readerGaps(labels)).toEqual(['bedrooms', 'place']);
    const model = { ...labels, bedrooms: 3, neighbourhood: 'Kagugu', priceRwf: 450_000, titleEn: '3-bedroom apartment in Kagugu', confidence: 0.8 } as TikTokRead;
    const merged = mergeReads(labels, model);
    expect(merged).toMatchObject({ bedrooms: 3, neighbourhood: 'Kagugu', priceRwf: 500_000, titleEn: '3-bedroom apartment in Kagugu' });
  });

  it('titles owner ads from the facts', () => {
    const ad = imali.parseAd(fx('imali-ad.html'), { adId: '261594', url: 'https://imali.biz/x' });
    expect(readFromAd(ad).titleEn).toBeNull();
    const body = webHomeBody(ad, readFromAd(ad), { siteLabel: 'IMALI.biz', photoUrls: [], phone: ad.phones[0]!, hostName: 'x', readVersion: 'web-v1/labels', discoveredAt: '2026-10-21T00:00:00Z' });
    expect(body.title).toBe('4-bedroom villa in Masaka');
  });
});

describe('Twenty bodies', () => {
  const ad = hir.parseAd(fx('houseinrwanda-ad.html'), { adId: '54926', url: 'https://www.houseinrwanda.com/property/rent/apartment/2-bedroom-apartment-rent-kagugu' });
  const read = readFromAd(ad);

  it('files a WEB home at VETTING under web:<site>:<adId>', () => {
    const b = webHomeBody(ad, read, { siteLabel: 'House in Rwanda', photoUrls: ['https://cdn/x/1.jpg'], phone: '+250788000110', hostName: 'Example Listings', readVersion: 'web-v1/labels', discoveredAt: '2026-10-21T00:00:00Z' });
    expect(b).toMatchObject({
      source: 'WEB',
      sourceId: sourceIdFor('houseinrwanda', '54926'),
      sourceUrl: { primaryLinkUrl: ad.url, primaryLinkLabel: 'House in Rwanda' },
      pipelineStage: 'VETTING',
      zone: 'KIGALI_GASABO',
      bedrooms: 2,
      priceMonthLocal: { amountMicros: 500_000_000_000, currencyCode: 'RWF' },
      homeAddress: { addressStreet1: 'Kagugu', addressCity: 'Kigali', addressCountry: 'Rwanda' },
    });
    expect(b.sourceId).toBe('web:houseinrwanda:54926');
    expect(b.notesEn).toContain('Ad on House in Rwanda by Example Listings');
    expect(b.notesEn).not.toMatch(/tiktok/i);
  });

  it('files the advertiser as a WEB host found in a public directory', () => {
    const h = webHostBody(ad, read, ['+250788000110'], 'House in Rwanda');
    expect(h).toMatchObject({ name: 'Example Listings', source: 'WEB', contactFoundVia: 'PUBLIC_DIRECTORY', agencySuspected: true, tiktokHandle: undefined });
    expect(h.phone?.primaryPhoneNumber).toBe('788000110');
  });

  it('words the reader prompt for a property site', () => {
    const p = buildWebPrompt(ad, 'House in Rwanda');
    expect(p).toContain('classified ad on the Rwandan property website House in Rwanda');
    expect(p).toContain('Price: 500,000 Rwf /month');
  });
});

describe('stale ads and the survey', () => {
  it('ages ads by the site date, month-only dates from the month end', () => {
    const now = Date.parse('2026-10-21T00:00:00Z');
    expect(isStale('2026-06', 90, now)).toBe(true);
    expect(isStale('2026-08', 90, now)).toBe(false);
    expect(isStale('2026-10-20T20:29:54+02:00', 90, now)).toBe(false);
    expect(isStale(null, 90, now)).toBe(false);
  });

  it('reads robots.txt the way a polite crawler should', () => {
    const drupal = 'User-agent: *\nAllow: /core/*.css$\nDisallow: /core/\nDisallow: /search/\nDisallow: /user/login\n';
    expect(robotsAllows(drupal, '/for-rent')).toBe(true);
    expect(robotsAllows(drupal, '/search/rent')).toBe(false);
    expect(robotsAllows('User-agent: *\nDisallow:\n', '/anything')).toBe(true);
    expect(robotsAllows('User-agent: *\nDisallow: /\nAllow: /forRent\n', '/forRent')).toBe(true);
    expect(robotsAllows('User-agent: googlebot\nDisallow: /\n', '/x')).toBe(true);
  });

  it('passes a static list with enough priced ads and fails a client-rendered one', () => {
    const site = SURVEY_SITES.find((s) => s.site === 'rwandahouseland')!;
    const html = Array.from({ length: 24 }, (_, i) => `<a href="https://rwandahouseland.com/property_view/${100 + i}">600,000 FRW Kicukiro</a>`).join('') + '<a href="/forRent?page=3">3</a>';
    expect(surveyPage(site, { status: 200, url: site.listUrl, html }, true)).toMatchObject({ render: 'static', adLinks: 24, estimate: 72, verdict: 'PASS ~72 ads' });
    const next = SURVEY_SITES.find((s) => s.site === 'nextlinehomes')!;
    expect(surveyPage(next, { status: 200, url: next.listUrl, html: '<div id="__next"></div><script src="/_next/static/x.js"></script>'.padEnd(5000) }, true).verdict).toBe('FAIL ads render client-side');
    expect(surveyPage(next, null, false).verdict).toMatch(/robots/);
  });
});
