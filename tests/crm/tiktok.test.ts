/**
 * The TikTok lane's pure core. Fixtures are anonymised (the repo is public):
 * handles, ids and phone numbers below are made up in the shapes the real
 * captions use.
 */
import { describe, expect, it } from 'vitest';
import {
  dupKey,
  fallbackTitle,
  frameTimes,
  homeBody,
  looksLikeRental,
  normalizeRwandaPhone,
  parseTikTokRead,
  phonesFor,
  propertyFramePaths,
  resolveDistrict,
  rwandaPhonesInText,
  skipReasonFor,
  tiktokVideosIn,
  type VideoRow,
} from '../../scripts/crm/tiktok-pure';
import { districtForPlace } from '../../src/lib/geo/rwanda-places';

const READ = {
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
  furnished: false,
  district: null,
  neighbourhood: 'Nyamirambo',
  phones: ['0780 000 111'],
  posterKind: 'BROKER',
  features: ['parking'],
  propertyFrames: [3, 2, 9],
  titleEn: '2-bedroom apartment in Nyamirambo',
  titleRw: 'Inzu y’ibyumba 2 i Nyamirambo',
  descriptionEn: 'Two bedrooms, one bathroom, parking.',
  confidence: 0.9,
};

describe('Rwandan phones', () => {
  it.each([
    ['0780000111', '+250780000111'],
    ['0780 000 111', '+250780000111'],
    ['+250 780 000 111', '+250780000111'],
    ['00250780000111', '+250780000111'],
    ['250780000111', '+250780000111'],
    ['0730-000-111', '+250730000111'],
    ['780000111', '+250780000111'],
  ])('%s → %s', (raw, e164) => expect(normalizeRwandaPhone(raw)).toBe(e164));

  it.each(['0912345678', '+249912345678', '0750000111', '12345', ''])('rejects %s', (raw) => expect(normalizeRwandaPhone(raw)).toBeNull());

  it('finds every number in a caption, deduped, in order', () => {
    expect(rwandaPhonesInText('2bedroom 250k price 0790000222 #fyp call 0790 000 222 or 0720000333')).toEqual(['+250790000222', '+250720000333']);
  });

  it('merges reader phones with caption phones', () => {
    expect(phonesFor({ phones: ['0780 000 111', 'not a phone'] }, 'whatsapp 0790000222')).toEqual(['+250780000111', '+250790000222']);
  });
});

describe('discovery', () => {
  it('pulls video URLs out of raw, encoded and redirect-wrapped search results', () => {
    const html = `
      <a href="https://www.tiktok.com/@some.broker/video/7600000000000000001">x</a>
      <a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.tiktok.com%2F%40Other_Agent%2Fvideo%2F7600000000000000002&rut=1">y</a>
      <a href="https://www.tiktok.com/@some.broker/video/7600000000000000001?lang=en">dup</a>
      <a href="https://www.tiktok.com/@some.broker">profile only</a>`;
    expect(tiktokVideosIn(html)).toEqual([
      { handle: 'some.broker', videoId: '7600000000000000001', url: 'https://www.tiktok.com/@some.broker/video/7600000000000000001' },
      { handle: 'other_agent', videoId: '7600000000000000002', url: 'https://www.tiktok.com/@other_agent/video/7600000000000000002' },
    ]);
  });

  it.each([
    ['2bedroom 1bathroom 250k price', true],
    ['Self compound house for rent (Mugipangu yonyine)', true],
    ['#inzuzikodeshwa Kicukiro', true],
    ['appartement à louer meublé', true],
    ['funny dance challenge 😂', false],
  ])('looksLikeRental(%s) = %s', (caption, want) => expect(looksLikeRental(caption)).toBe(want));

  it('spaces frames evenly inside the middle 90%', () => {
    const t = frameTimes(100, 4);
    expect(t).toEqual([16.25, 38.75, 61.25, 83.75]);
    expect(frameTimes(0)).toEqual([0]);
  });
});

describe('reading', () => {
  it('parses a reader answer wrapped in prose and fences', () => {
    const r = parseTikTokRead(`Here it is:\n\`\`\`json\n${JSON.stringify({ ...READ, priceRwf: '250,000', bedrooms: '2' })}\n\`\`\``);
    expect(r.priceRwf).toBe(250000);
    expect(r.bedrooms).toBe(2);
    expect(r.period).toBe('MONTH');
  });

  it('coerces unknown enums instead of failing the whole read', () => {
    const r = parseTikTokRead(JSON.stringify({ ...READ, propertyType: 'Mansion', period: 'weekly', district: 'MUSANZE' }));
    expect(r.propertyType).toBeNull();
    expect(r.period).toBe('UNKNOWN');
    expect(r.district).toBeNull();
  });

  it('skips non-rentals, other towns and unsure reads', () => {
    const r = parseTikTokRead(JSON.stringify(READ));
    expect(skipReasonFor(r)).toBeNull();
    expect(skipReasonFor({ ...r, isRental: false, rejectReason: 'plot for sale' })).toBe('not a rental: plot for sale');
    expect(skipReasonFor({ ...r, inKigali: false })).toBe('outside Kigali');
    expect(skipReasonFor({ ...r, confidence: 0.3 })).toBe('low confidence 0.3');
  });
});

describe('places', () => {
  it.each([
    ['Nyamirambo', 'NYARUGENGE'],
    ['near Kimironko market', 'GASABO'],
    ['Kibagabaga', 'GASABO'],
    ['Kabeza', 'KICUKIRO'],
    ['Norvège', 'NYARUGENGE'],
    ['Kicukiro centre', 'KICUKIRO'],
    ['Musanze', 'UNKNOWN'],
  ])('%s → %s', (place, district) => expect(districtForPlace(place)).toBe(district));

  it('trusts the gazetteer over the reader', () => {
    expect(resolveDistrict({ district: 'KICUKIRO', neighbourhood: 'Remera' })).toBe('GASABO');
    expect(resolveDistrict({ district: 'KICUKIRO', neighbourhood: 'somewhere new' })).toBe('KICUKIRO');
    expect(resolveDistrict({ district: null, neighbourhood: null }, 'house in Gisozi')).toBe('GASABO');
  });
});

describe('what a read becomes', () => {
  const read = parseTikTokRead(JSON.stringify(READ));
  const row: VideoRow = {
    videoId: '7600000000000000001',
    url: 'https://www.tiktok.com/@some.broker/video/7600000000000000001',
    handle: 'some.broker',
    via: 'seed',
    discoveredAt: '2026-10-12T00:00:00Z',
    state: 'read',
    meta: { caption: '2bedroom 250k Nyamirambo 0780000111', uploader: 'some.broker', channel: 'Some Broker', timestamp: 1, duration: 30, views: 10 },
  };

  it('keeps only the frames the reader picked, best first, in range', () => {
    expect(propertyFramePaths(['a', 'b', 'c'], [3, 2, 9, 3])).toEqual(['c', 'b']);
    expect(propertyFramePaths(['a', 'b'], [])).toEqual([]);
  });

  it('files a monthly Kigali rental at VETTING, never live', () => {
    const b = homeBody(row, read, { frameUrls: ['u1', 'u2'], phone: '+250780000111', hostName: 'Some Broker', promptVersion: 'tiktok-v1', duplicate: false });
    expect(b).toMatchObject({
      source: 'TIKTOK',
      sourceId: 'tiktok:7600000000000000001',
      country: 'RWANDA',
      city: 'KIGALI',
      zone: 'KIGALI_NYARUGENGE',
      propertyType: 'APARTMENT',
      rentPeriod: 'MONTH',
      priceMonthLocal: { amountMicros: 250000 * 1_000_000, currencyCode: 'RWF' },
      pipelineStage: 'VETTING',
      publishState: 'NOT_IMPORTED',
      photoCount: 2,
      hostPhone: { primaryPhoneNumber: '780000111', primaryPhoneCallingCode: '+250' },
    });
    expect(b.priceNightLocal).toBeUndefined();
    expect(b.photoUrls).toEqual({ primaryLinkUrl: 'u1', primaryLinkLabel: '', secondaryLinks: [{ url: 'u2', label: '' }] });
  });

  it('titles and dedups from facts', () => {
    expect(fallbackTitle({ ...read, titleEn: null })).toBe('2-bedroom apartment in Nyamirambo');
    expect(dupKey('some.broker', read)).toBe('some.broker|2|250000|nyamirambo');
    expect(dupKey('some.broker', { ...read, priceRwf: null })).toBeNull();
  });
});
