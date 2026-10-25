/**
 * The renting terms an ad states (deposit, commission, visit fee, water,
 * electricity, furnishing): the rules over en / rw / fr captions, the reader's
 * tiktok-v4 fields, what lands on the Twenty home, and the mirror's and
 * backfill's pure decisions (terms → Listing, text → Kigali zone).
 * Samples are made up in the shapes Kigali brokers write (the repo is public).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { termsFromText, mergeTerms, NO_TERMS } from '../../scripts/crm/terms-pure';
import { homeBody, parseTikTokRead, statedFurnished, type VideoRow } from '../../scripts/crm/tiktok-pure';
import { buildFacebookPrompt, buildTikTokPrompt, TIKTOK_PROMPT_VERSION } from '../../scripts/crm/tiktok-read-prompt';
import { planListingTerms, planLocation, termsFromHome, termsFromStoredRead, zoneForLead, type ListingTermsRow } from '../../scripts/crm/lead-terms-pure';
import * as hir from '../../scripts/crm/web-ads/houseinrwanda';
import { mergeReads, readFromAd, webHomeBody } from '../../scripts/crm/web-ads/pure';

describe('terms from the ad text', () => {
  it('reads an English caption', () => {
    expect(termsFromText('2 bedroom apartment Kimironko 400k. 2 months deposit, commission 25%, visit fee 10k. Water included, electricity cash power. Fully furnished')).toEqual({
      depositMonths: 2,
      commission: { pct: 25, none: false },
      viewingFee: 10_000,
      water: 'INCLUDED',
      electricity: 'SEPARATE',
      furnished: true,
    });
  });

  it('reads Kinyarwanda', () => {
    expect(termsFromText("Inzu ikodeshwa Kicukiro 250k, ingwate y'amezi 2, nta komisiyo, amazi n'umuriro birimo")).toMatchObject({
      depositMonths: 2,
      commission: { pct: null, none: true },
      water: 'INCLUDED',
      electricity: 'INCLUDED',
    });
    expect(termsFromText('Inzu nta bikoresho, amazi ntarimo').furnished).toBe(false);
    expect(termsFromText('Inzu nta bikoresho, amazi ntarimo').water).toBe('SEPARATE');
  });

  it('reads French', () => {
    expect(termsFromText('Appartement meublé à louer, caution de 1 mois, frais de visite 5000, eau et électricité non comprises')).toEqual({
      depositMonths: 1,
      commission: null,
      viewingFee: 5_000,
      water: 'SEPARATE',
      electricity: 'SEPARATE',
      furnished: true,
    });
  });

  it('knows the owner, the free visit, a deposit in RWF and bills', () => {
    const t = termsFromText('Direct from owner, no visit fee, deposit 300k, bills included', { priceRwf: 300_000 });
    expect(t).toMatchObject({ depositMonths: 1, commission: { pct: null, none: true }, viewingFee: 0, water: 'INCLUDED', electricity: 'INCLUDED' });
    expect(termsFromText('House 600k + commission, rent excluding water and electricity, unfurnished')).toMatchObject({
      commission: { pct: null, none: false },
      water: 'SEPARATE',
      electricity: 'SEPARATE',
      furnished: false,
    });
    expect(termsFromText('1 month commission, Visiting fee: 10,000 rwf')).toMatchObject({ commission: { pct: 100, none: false }, viewingFee: 10_000 });
  });

  it('reads bills, exceptions and two-price ads the way they are meant', () => {
    expect(termsFromText('210,000Rw per month ( Water bills included)')).toMatchObject({ water: 'INCLUDED', electricity: null });
    expect(termsFromText('All bills included except electricity')).toMatchObject({ water: 'INCLUDED', electricity: 'SEPARATE' });
    const both = termsFromText('1,500K per month inclusive (water, electricity, gas) 💰 1,300K per month exclusive (house only; water, electricity and gas paid separately)');
    expect([both.water, both.electricity]).toEqual([null, null]);
    expect(termsFromText('Payment terms: 2 months rent upfront and 1 month deposit').depositMonths).toBe(1);
    expect(termsFromText('Water and electricity are billed separately for each unit')).toMatchObject({ water: 'SEPARATE', electricity: 'SEPARATE' });
  });

  it('never invents: features, phones and advance rent are not terms', () => {
    expect(termsFromText('Studio 150k water tank, parking, separate entrance, furnished or unfurnished')).toEqual(NO_TERMS);
    expect(termsFromText('Visit 0788123456 for more info. 3 months advance')).toEqual(NO_TERMS);
    expect(termsFromText('Features: water, electricity, separate entrance')).toEqual(NO_TERMS);
    expect(termsFromText('')).toEqual(NO_TERMS);
    expect(termsFromText(null)).toEqual(NO_TERMS);
  });

  it('lets a stated answer win over the rules', () => {
    const rules = termsFromText('2 months deposit, water included');
    expect(mergeTerms({ depositMonths: 1 }, rules)).toMatchObject({ depositMonths: 1, water: 'INCLUDED' });
    expect(mergeTerms(null, rules)).toEqual(rules);
  });
});

const V3_READ = {
  isRental: true,
  rejectReason: null,
  inKigali: true,
  period: 'MONTH',
  priceRwf: 250000,
  priceAsWritten: '250k',
  propertyType: 'Apartment',
  roomType: 'ENTIRE_HOME',
  bedrooms: 2,
  bathrooms: 1,
  furnished: true,
  district: 'NYARUGENGE',
  neighbourhood: 'Nyamirambo',
  phones: ['0780000111'],
  posterKind: 'BROKER',
  features: ['parking'],
  units: [],
  propertyFrames: [2],
  titleEn: '2-bedroom apartment in Nyamirambo',
  titleRw: null,
  descriptionEn: 'A two-bedroom apartment.',
  onScreenText: null,
  brokerName: null,
  confidence: 0.8,
};

describe('the reader (tiktok-v4 terms, still in v5)', () => {
  it('asks for the terms and Kigali home words, and versions the change', () => {
    expect(TIKTOK_PROMPT_VERSION).toBe('tiktok-v5');
    const p = buildTikTokPrompt({ handle: 'x', channel: null, caption: 'c', transcript: '', uploadedAt: null, frames: [] });
    expect(p).toContain('"depositMonths":number|null');
    expect(p).toContain('"commission":{"pct":number|null,"none":bool}|null');
    expect(p).toMatch(/self compound/);
    expect(p).toMatch(/studio = Apartment with bedrooms 0/);
    // The Facebook wording still swaps the medium on the same text.
    const fb = buildFacebookPrompt({ handle: 'x', channel: null, caption: 'c', uploadedAt: null, frames: [] });
    expect(fb).toContain('POST TEXT:');
    expect(fb).toContain('"viewingFee":number|null');
    // v5: the OCR block appears only when there is OCR, and never for Facebook.
    expect(p).not.toContain('ON-SCREEN TEXT (OCR)');
    expect(buildTikTokPrompt({ handle: 'x', channel: null, caption: 'c', transcript: '', uploadedAt: null, frames: [], ocr: '600k | 3 bedrooms' })).toContain('ON-SCREEN TEXT (OCR):\n600k | 3 bedrooms');
    expect(fb).not.toContain('OCR');
    expect(p).toContain('"contactName":string|null');
  });

  it('keeps old reads parsing, the new fields null', () => {
    const r = parseTikTokRead(JSON.stringify(V3_READ));
    expect(r).toMatchObject({ furnished: true, depositMonths: null, commission: null, viewingFee: null, water: null, electricity: null });
  });

  it('accepts the new fields, and folds the shapes readers actually return', () => {
    const r = parseTikTokRead(JSON.stringify({ ...V3_READ, depositMonths: '2', commission: { pct: 25, none: false }, viewingFee: '10000', water: 'INCLUDED', electricity: 'SEPARATE' }));
    expect(r).toMatchObject({ depositMonths: 2, commission: { pct: 25, none: false }, viewingFee: 10_000, water: 'INCLUDED', electricity: 'SEPARATE' });
    const p = (commission: unknown) => parseTikTokRead(JSON.stringify({ ...V3_READ, commission })).commission;
    expect(p('none')).toEqual({ pct: null, none: true });
    expect(p(0.25)).toEqual({ pct: 25, none: false });
    expect(p({ pct: null, none: true })).toEqual({ pct: null, none: true });
    expect(p({ pct: null, none: false })).toEqual({ pct: null, none: false });
    expect(p('nonsense')).toBeNull();
    const bad = parseTikTokRead(JSON.stringify({ ...V3_READ, water: 'yes', depositMonths: 40, viewingFee: { x: 1 }, furnished: 'maybe' }));
    expect(bad).toMatchObject({ water: null, depositMonths: null, viewingFee: null, furnished: null });
  });
});

describe('the Twenty home carries furnishing and terms', () => {
  const row: VideoRow = {
    videoId: '7600000000000000002',
    url: 'https://www.tiktok.com/@some.broker/video/7600000000000000002',
    handle: 'some.broker',
    via: 'seed',
    discoveredAt: '2026-10-22T00:00:00Z',
    state: 'read',
    meta: { caption: '2bd 250k Nyamirambo. Nta komisiyo, visit 5k', uploader: 'some.broker', channel: null, timestamp: 1, duration: 30, views: 1 },
  };
  const opts = { frameUrls: [], phone: '+250780000111', hostName: 'x', promptVersion: 'tiktok-v4', duplicate: false };

  it("writes the reader's furnished, which used to be dropped", () => {
    const b = homeBody(row, parseTikTokRead(JSON.stringify(V3_READ)), opts);
    expect(b.furnishing).toBe('FURNISHED');
    expect(homeBody(row, parseTikTokRead(JSON.stringify({ ...V3_READ, furnished: false })), opts).furnishing).toBe('UNFURNISHED');
  });

  it("drops a pre-v4 reader's unasked-for furnished: false, keeps its true", () => {
    const no = parseTikTokRead(JSON.stringify({ ...V3_READ, furnished: false }));
    expect(homeBody(row, no, { ...opts, promptVersion: 'tiktok-v3/groq' }).furnishing).toBeUndefined();
    expect(homeBody(row, parseTikTokRead(JSON.stringify(V3_READ)), { ...opts, promptVersion: 'tiktok-v3/groq' }).furnishing).toBe('FURNISHED');
    expect(statedFurnished(no, 'web-v1/labels')).toBe(false);
  });

  it("writes the reader's terms, the caption filling what it missed", () => {
    const read = parseTikTokRead(JSON.stringify({ ...V3_READ, depositMonths: 1, commission: { pct: 25, none: false }, water: 'SEPARATE' }));
    const b = homeBody(row, read, opts);
    // The reader said 25%: it outranks the caption's "nta komisiyo".
    expect(b).toMatchObject({ depositMonths: 1, commissionPct: 25, noCommission: false, viewingFee: 5_000, water: 'SEPARATE' });
    expect(b.electricity).toBeUndefined();
    const silent = homeBody({ ...row, meta: { ...row.meta!, caption: '2bd 250k' } }, parseTikTokRead(JSON.stringify({ ...V3_READ, furnished: null })), opts);
    expect([silent.furnishing, silent.depositMonths, silent.commissionPct, silent.noCommission, silent.viewingFee, silent.water]).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
  });

  it("carries a web site's furnishing label through", () => {
    const html = readFileSync(join(__dirname, 'fixtures/web-ads/houseinrwanda-ad.html'), 'utf8');
    const ad = hir.parseAd(html, { adId: '54926', url: 'https://www.houseinrwanda.com/property/rent/apartment/x' });
    const read = readFromAd(ad);
    expect(read.furnished).toBe(false);
    const b = webHomeBody(ad, read, { siteLabel: 'House in Rwanda', photoUrls: [], phone: '+250788000110', hostName: 'x', readVersion: 'web-v2/labels', discoveredAt: '2026-10-22T00:00:00Z' });
    expect(b.furnishing).toBe('UNFURNISHED');
    // A label beats the model; the model fills a term the labels lack.
    const merged = mergeReads(read, { ...read, furnished: true, depositMonths: 2 });
    expect(merged).toMatchObject({ furnished: false, depositMonths: 2 });
  });
});

describe('the mirror and the backfill', () => {
  it("turns Twenty's terms into the Listing's (commission as a fraction)", () => {
    expect(termsFromHome({ depositMonths: 2, commissionPct: 25, noCommission: false, viewingFee: 10000, water: 'INCLUDED', electricity: 'SEPARATE' })).toEqual({
      depositMonths: 2,
      commissionPct: 0.25,
      noCommission: false,
      viewingFee: 10_000,
      waterIncluded: true,
      electricityIncluded: false,
      termsSource: 'AD',
    });
    expect(termsFromHome({ noCommission: true })).toMatchObject({ noCommission: true, commissionPct: null, termsSource: 'AD' });
    // Twenty's BOOLEAN defaults to false: alone it states nothing.
    expect(termsFromHome({ noCommission: false })).toBeNull();
    expect(termsFromHome({})).toBeNull();
  });

  it('places a lead at the most specific zone its text names, within its district', () => {
    const z = zoneForLead({ neighbourhood: 'Kibagabaga', title: null, districtCode: 'GASABO' });
    expect(z).toMatchObject({ district: 'GASABO', sector: 'gasabo/kimironko', neighbourhood: 'gasabo/kimironko/kibagabaga' });
    // A district-only address defers to a title that names the neighbourhood.
    expect(zoneForLead({ neighbourhood: 'Gasabo', title: '2-bedroom apartment in Kimironko', districtCode: 'GASABO' })?.sector).toBe('gasabo/kimironko');
    expect(zoneForLead({ neighbourhood: 'Gasabo', title: 'Nice home', districtCode: 'GASABO' })).toMatchObject({ sector: null, neighbourhood: null });
    // A zone in another district than the CRM filed is ignored.
    expect(zoneForLead({ neighbourhood: null, title: 'Like Nyamirambo', districtCode: 'GASABO' })).toBeNull();
  });

  it("re-pins a lead at its zone and fixes the old demand form's state casing", () => {
    const p = planLocation({ address: 'Kibagabaga', state: 'GASABO', latitude: -1.896, longitude: 30.112, sector: null, neighbourhood: null, listings: [{ source: 'TIKTOK', title: 'x' }] });
    expect(p).toEqual({ state: 'Gasabo', sector: 'gasabo/kimironko', neighbourhood: 'gasabo/kimironko/kibagabaga', latitude: -1.925, longitude: 30.115 });
    // Already right: nothing to write.
    expect(planLocation({ address: 'Kibagabaga', state: 'Gasabo', latitude: -1.925, longitude: 30.115, sector: 'gasabo/kimironko', neighbourhood: 'gasabo/kimironko/kibagabaga', listings: [{ source: 'TIKTOK', title: 'x' }] })).toEqual({});
  });

  it('keeps a real pin and places the row by it', () => {
    const p = planLocation({ address: 'Kigali, Rwanda', state: 'Kigali City', latitude: -1.9255, longitude: 30.1155, sector: null, neighbourhood: null, listings: [{ source: 'AIRBNB', title: 'x' }] });
    expect(p).toEqual({ sector: 'gasabo/kimironko', neighbourhood: 'gasabo/kimironko/kibagabaga' });
    // An address that names only the district defers to the pin for the sector.
    expect(planLocation({ address: 'Kicukiro, Kigali', state: 'Kicukiro', latitude: -2.031, longitude: 30.101, sector: null, neighbourhood: null, listings: [{ source: 'AIRBNB', title: 'x' }] })).toEqual({ sector: 'kicukiro/gahanga' });
  });

  const EMPTY: ListingTermsRow = { priceMonth: 300_000, furnished: null, depositMonths: null, commissionPct: null, noCommission: null, viewingFee: null, waterIncluded: null, electricityIncluded: null, termsSource: null };

  it('fills empty terms from the ad text, for Prisma and for Twenty', () => {
    const { data, twenty } = planListingTerms(EMPTY, ['2 months deposit, commission 25%, water included', null]);
    expect(data).toEqual({ depositMonths: 2, commissionPct: 0.25, noCommission: false, waterIncluded: true, termsSource: 'AD' });
    expect(twenty).toEqual({ depositMonths: 2, commissionPct: 25, noCommission: false, water: 'INCLUDED' });
  });

  it('never overwrites a stated value, and furnishing alone is not a term', () => {
    expect(planListingTerms({ ...EMPTY, depositMonths: 1, termsSource: 'BROKER' }, ['2 months deposit']).data).toEqual({});
    expect(planListingTerms(EMPTY, ['fully furnished']).data).toEqual({ furnished: true });
    // A stored reader answer counts like the text.
    const stored = termsFromStoredRead({ ...V3_READ, furnished: false });
    expect(planListingTerms(EMPTY, ['nothing here'], stored).data).toEqual({ furnished: false });
    expect(termsFromStoredRead(null)).toBeNull();
  });
});
