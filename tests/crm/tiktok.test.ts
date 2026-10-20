/**
 * The TikTok lane's pure core. Fixtures are anonymised (the repo is public):
 * handles, ids and phone numbers below are made up in the shapes the real
 * captions use.
 */
import { describe, expect, it } from 'vitest';
import {
  dupKey,
  placeToken,
  captionCarriesFacts,
  unitReads,
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
  inKigaliFor,
  priceLooksWrong,
  currencyAsWritten,
  requeueable,
  readPriority,
  byPriority,
  seedIsDue,
  shouldPromote,
  NOT_A_RENTAL_CAPTION,
  postBody,
  wantsPost,
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
    ['4 Bedrooms house for sale in Kibagabaga', false],
    ['Plot for sale Rebero 300sqm', false],
    ['House for sale or for rent, 3 bedrooms', true],
    ['', true], // the frames carry the facts
    ['Call us 0786471095 #kigali #rwanda', true],
  ])('looksLikeRental(%s) = %s', (caption, want) => expect(looksLikeRental(caption)).toBe(want));

  it('lets a known rental account through on a wordy off-topic caption, never a sale', () => {
    const story = 'Good morning family today we went to see the beautiful hills and the sunrise was amazing thank you all';
    expect(looksLikeRental(story)).toBe(false);
    expect(looksLikeRental(story, true)).toBe(true);
    expect(looksLikeRental('Plot for sale Rebero 300sqm', true)).toBe(false);
  });

  it('requeues caption-skipped rows the gate now passes, while still fresh', () => {
    const nowMs = Date.UTC(2026, 9, 20);
    const row = (caption: string, daysOld: number, skipReason = NOT_A_RENTAL_CAPTION): VideoRow => ({
      videoId: '1', url: 'u', handle: 'h', via: 'seed', discoveredAt: '', state: 'skipped', skipReason,
      meta: { caption, uploader: 'h', channel: null, timestamp: nowMs / 1000 - daysOld * 86400, duration: 30, views: 1 },
    });
    expect(requeueable(row('#kigali_update #kigalitiktok #diasporatiktok', 10), true, 120, nowMs)).toBe(true);
    expect(requeueable(row('#kigali_update #kigalitiktok', 200), true, 120, nowMs)).toBe(false);
    expect(requeueable(row('Plot for sale Rebero', 10), true, 120, nowMs)).toBe(false);
    expect(requeueable(row('#kigali', 10, 'outside Kigali'), true, 120, nowMs)).toBe(false);
  });

  it('reads phone-and-price posts first, then seeds, then newest', () => {
    const r = (caption: string, timestamp: number, handle = 'h'): VideoRow => ({
      videoId: String(timestamp), url: 'u', handle, via: 'seed', discoveredAt: '', state: 'fetched',
      meta: { caption, uploader: handle, channel: null, timestamp, duration: 30, views: 1 },
    });
    const rows = [r('#fyp', 300), r('2bd 250k', 100), r('2bd 250k call 0780000111', 50), r('#fyp', 200)];
    const sorted = rows.map((v) => ({ v, p: readPriority(v, v.meta!.timestamp === 200) })).sort((a, b) => byPriority(a.p, b.p)).map(({ v }) => v.meta!.timestamp);
    expect(sorted).toEqual([50, 100, 200, 300]);
  });

  it('pauses dead seeds, re-tries them weekly, and promotes proven proposals', () => {
    const nowMs = Date.UTC(2026, 9, 20);
    expect(seedIsDue({ status: 'active', from: 'manual', addedAt: '' }, nowMs)).toBe(true);
    expect(seedIsDue({ status: 'paused', from: 'manual', addedAt: '', pausedAt: new Date(nowMs - 2 * 86_400_000).toISOString() }, nowMs)).toBe(false);
    expect(seedIsDue({ status: 'paused', from: 'manual', addedAt: '', pausedAt: new Date(nowMs - 8 * 86_400_000).toISOString() }, nowMs)).toBe(true);
    expect(seedIsDue({ status: 'ignored', from: 'manual', addedAt: '' }, nowMs)).toBe(false);
    expect(shouldPromote({ status: 'proposed', from: 'search', addedAt: '', hits: 5 }, 1)).toBe(true);
    expect(shouldPromote({ status: 'proposed', from: 'search', addedAt: '', hits: 5 }, 0)).toBe(false);
    expect(shouldPromote({ status: 'proposed', from: 'search', addedAt: '', hits: 2 }, 3)).toBe(false);
  });

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
    expect(skipReasonFor({ ...r, inKigali: false, neighbourhood: null })).toBe('outside Kigali');
    expect(skipReasonFor({ ...r, confidence: 0.3 })).toBe('low confidence 0.3');
    expect(skipReasonFor({ ...r, confidence: 0.55 })).toBe('low confidence 0.55');
  });

  it('rejects a read with neither a price nor a room count', () => {
    const r = parseTikTokRead(JSON.stringify({ ...READ, priceRwf: null, bedrooms: null, confidence: 0.6 }));
    expect(skipReasonFor(r)).toBe('no price and no rooms');
    expect(skipReasonFor({ ...r, bedrooms: 2 })).toBeNull();
  });

  it('decides Kigali from the gazetteer before the reader', () => {
    const r = parseTikTokRead(JSON.stringify(READ));
    // The reader filed a Norvege flat as outside Kigali.
    expect(inKigaliFor({ inKigali: false, neighbourhood: 'Norvege' })).toBe(true);
    expect(skipReasonFor({ ...r, inKigali: false, neighbourhood: null }, { caption: 'Unfurnished apartment 2bedroom in norvege 600k' })).toBeNull();
    // …and a Kamonyi house "near Kigali" as inside.
    expect(inKigaliFor({ inKigali: true, neighbourhood: 'Kamonyi' }, 'inzu ikodeshwa hafi ya kigali')).toBe(false);
    expect(inKigaliFor({ inKigali: true, neighbourhood: null }, '2bd house')).toBe(true);
  });

  it('flags prices outside the Kigali band and foreign currencies', () => {
    expect(priceLooksWrong({ priceRwf: 20_000, period: 'MONTH' })).toBe(true);
    expect(priceLooksWrong({ priceRwf: 250_000, period: 'MONTH' })).toBe(false);
    expect(priceLooksWrong({ priceRwf: 40_000, period: 'NIGHT' })).toBe(false);
    expect(priceLooksWrong({ priceRwf: 20_000, period: 'UNKNOWN' })).toBe(false);
    expect(currencyAsWritten('$1200')).toBe('USD');
    expect(currencyAsWritten('1,200 usd per month')).toBe('USD');
    expect(currencyAsWritten('450k')).toBeNull();
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
    expect(b.qualificationStatus).toBeUndefined();
    expect(b.photoUrls).toEqual({ primaryLinkUrl: 'u1', primaryLinkLabel: '', secondaryLinks: [{ url: 'u2', label: '' }] });
  });

  it('marks homes nobody can call, and prices nobody should quote', () => {
    const noPhone = homeBody(row, read, { frameUrls: [], phone: null, hostName: 'x', promptVersion: 'v', duplicate: false });
    expect(noPhone.qualificationStatus).toBe('UNREACHABLE_HOST');
    expect(noPhone.notesEn).toContain('No phone in the post');
    const cheap = homeBody(row, { ...read, priceRwf: 20_000 }, { frameUrls: [], phone: null, hostName: 'x', promptVersion: 'v', duplicate: false });
    expect(cheap.qualificationStatus).toBe('PRICE_ANOMALY');
    const usd = homeBody(row, { ...read, priceAsWritten: '$1200' }, { frameUrls: [], phone: '+250780000111', hostName: 'x', promptVersion: 'v', duplicate: false });
    expect(usd.notesEn).toContain('Currency as written: USD');
  });

  it('titles and dedups from facts', () => {
    expect(fallbackTitle({ ...read, titleEn: null })).toBe('2-bedroom apartment in Nyamirambo');
    // No handle in the key: two brokers posting one house collide.
    expect(dupKey('some.broker', read)).toBe(dupKey('another.broker', { ...read, priceRwf: 255_000, neighbourhood: 'Nyamirambo / Biryogo' }));
    expect(dupKey('some.broker', read)).not.toBe(dupKey('some.broker', { ...read, bedrooms: 3 }));
    expect(dupKey('some.broker', { ...read, priceRwf: null })).toBeNull();
    expect(dupKey('some.broker', { ...read, neighbourhood: 'Kigali' })).toBeNull();
    expect(placeToken('Kimironko, Kwa Mushimire')).toBe('kimironko');
  });

  it('records the ad itself: broker, publish date, caption, on-screen text', () => {
    const r = parseTikTokRead(JSON.stringify({ ...READ, onScreenText: '2 BEDROOMS | 250K | NYAMIRAMBO', brokerName: 'Some Real Estate' }));
    const p = postBody({ ...row, state: 'upserted', read: r, homeId: 'h1', hostId: 'o1', transcript: 'call me', readVersion: 'tiktok-v3/groq', meta: { ...row.meta!, timestamp: 1_760_000_000 } });
    expect(p).toMatchObject({
      videoId: '7600000000000000001',
      tiktokHandle: 'some.broker',
      accountName: 'Some Broker',
      brokerName: 'Some Real Estate',
      publishedAt: new Date(1_760_000_000_000).toISOString(),
      caption: '2bedroom 250k Nyamirambo 0780000111',
      onScreenText: '2 BEDROOMS | 250K | NYAMIRAMBO',
      transcript: 'call me',
      phonesSeen: '+250780000111',
      postStatus: 'LISTING',
      homeId: 'h1',
      hostId: 'o1',
    });
    expect(p.name).toBe('Some Real Estate · 2025-10-09');
    // No agency named: the account name stands in; a re-post links the home it joined.
    const q = postBody({ ...row, state: 'upserted', read: parseTikTokRead(JSON.stringify(READ)), homeId: 'h2', mergedInto: 'h1' });
    expect(q).toMatchObject({ brokerName: 'Some Broker', postStatus: 'JOINED_EXISTING', homeId: 'h1' });
    expect(postBody({ ...row, state: 'fetched' })).toMatchObject({ postStatus: 'WAITING', homeId: undefined });
  });

  it('keeps a post for every video the reader judged, not for caption-gate drops', () => {
    expect(wantsPost({ ...row, state: 'fetched' })).toBe(true);
    expect(wantsPost({ ...row, state: 'skipped', skipReason: 'caption does not read as a rental' })).toBe(false);
    expect(wantsPost({ ...row, state: 'skipped', read: parseTikTokRead(JSON.stringify(READ)) })).toBe(true);
    expect(wantsPost({ ...row, meta: undefined, state: 'discovered' })).toBe(false);
  });

  it('splits a multi-unit post into one home per unit', () => {
    const multi = { ...read, units: [{ bedrooms: 1, priceRwf: 600_000, propertyType: 'Apartment' as const }, { bedrooms: 2, priceRwf: 700_000, propertyType: null }] };
    const units = unitReads('76', multi);
    expect(units.map((u) => u.sourceId)).toEqual(['tiktok:76', 'tiktok:76#2']);
    expect(units[1]!.read).toMatchObject({ bedrooms: 2, priceRwf: 700_000, propertyType: 'Apartment', titleEn: null });
    expect(unitReads('76', read)).toEqual([{ sourceId: 'tiktok:76', read }]);
  });
});

describe('caption-first reading', () => {
  it.each([
    ['Kigali Kimihurura Unfurnished House For Rent @ 600k rwf  3 Bedrooms,2 Bathrooms', true],
    ['400k price etaje 3bedroom 3bathroom located Norvege', true],
    ['Studio for rent Remera 150,000 RWF', true],
    ['#kigalirentals #houseforrent #fyp', false],
    ['Fully furnished 3 bedroom house for rent in Nyarutarama', false], // no price
  ])('%s → %s', (caption, want) => expect(captionCarriesFacts(caption)).toBe(want));
});
