/**
 * The TikTok lane's OCR text, language and broker profile (2026-10-25).
 * Fixtures are made up in the shapes real Kigali ads use (the repo is public).
 */
import { describe, expect, it } from 'vitest';
import {
  adText,
  brokerProfile,
  captionCarriesFacts,
  detectLanguages,
  hostProfilePatch,
  langCode,
  ocrText,
  parseTikTokRead,
  propertyFramesByOcr,
  requeueable,
  type VideoRow,
} from '../../scripts/crm/tiktok-pure';
import { mergeLanguages, mostNamed } from '../../scripts/crm/brokers-pure';

const read = (o: Record<string, unknown> = {}) =>
  parseTikTokRead(JSON.stringify({ isRental: true, inKigali: true, period: 'MONTH', priceRwf: 300000, bedrooms: 2, confidence: 0.9, ...o }));

const row = (caption: string, extra: Partial<VideoRow> = {}): VideoRow => ({
  videoId: '7600000000000000001',
  url: 'https://www.tiktok.com/@example.homes/video/7600000000000000001',
  handle: 'example.homes',
  via: 'seed',
  discoveredAt: '2026-10-25T00:00:00Z',
  state: 'read',
  meta: { caption, uploader: 'example.homes', channel: 'Example Homes', timestamp: null, duration: 20, views: 10 },
  ...extra,
});

describe('OCR text', () => {
  it('dedupes repeated card lines across frames, in order', () => {
    const r = { ocr: ['0780000001 | House for rent 600k', '0780000001 | House for rent 600k | 3 bedrooms', ''] };
    expect(ocrText(r)).toBe('0780000001 | House for rent 600k | 3 bedrooms');
  });
  it('lets the frames carry the facts when the caption is only hashtags', () => {
    const r = row('#kigali #fyp', { ocr: ['250k nyamirambo | 2bedroom parking'] });
    expect(captionCarriesFacts(r.meta!.caption)).toBe(false);
    expect(captionCarriesFacts(adText(r))).toBe(true);
  });
  it('picks the frames with the least text as the house', () => {
    const card = 'HOUSE FOR RENT 600K 3 BEDROOMS 2 BATHROOMS CALL 0780000001 KABEZA';
    expect(propertyFramesByOcr([card, '', 'parking', '', card], 5, 3)).toEqual([2, 4, 3]);
    expect(propertyFramesByOcr(undefined, 0)).toEqual([]);
  });
});

describe('language', () => {
  it('reads Kinyarwanda, English and French ads', () => {
    expect(detectLanguages('Inzu ikodeshwa i Kimironko, ifite ibyumba 3, hamagara')[0]!.lang).toBe('RW');
    expect(detectLanguages('House for rent in Kibagabaga with parking, call now')[0]!.lang).toBe('EN');
    expect(detectLanguages('Maison à louer avec 3 chambres et salon, prix par mois')[0]!.lang).toBe('FR');
    expect(detectLanguages('')).toEqual([]);
  });
  it('maps reader and ISO labels', () => {
    expect(langCode('Kinyarwanda')).toBe('RW');
    expect(langCode('fr')).toBe('FR');
    expect(langCode('klingon')).toBeNull();
  });
  it('parses v5 fields and keeps v4 reads valid', () => {
    const r = read({ contactName: ' Eric ', languages: ['rw', 'English', 'xx'], primaryLanguage: 'Kinyarwanda' });
    expect(r.contactName).toBe('Eric');
    expect(r.languages).toEqual(['RW', 'EN']);
    expect(r.primaryLanguage).toBe('RW');
    const old = read();
    expect(old.languages).toEqual([]);
    expect(old.primaryLanguage).toBeNull();
  });
});

describe('broker profile', () => {
  it('takes the repeated agency and contact, and the language the captions are in', () => {
    const p = brokerProfile([
      row('Maison à louer à Remera, 2 chambres, salon et cuisine', { read: read({ brokerName: 'Example Real Estate', contactName: 'Eric' }) }),
      row('Appartement à louer avec parking, prix par mois', { read: read({ brokerName: 'Example Real Estate' }) }),
      row('#kigali', { read: read({ brokerName: 'Other' }) }),
    ]);
    expect(p.brokerName).toBe('Example Real Estate');
    expect(p.contactName).toBe('Eric');
    expect(p.preferredLanguage).toBe('FR');
  });
  it('falls back to RW when nothing written says anything', () => {
    expect(brokerProfile([row('#kigali')]).preferredLanguage).toBe('RW');
  });
  it('patches only what the lane set itself', () => {
    const r = row('x');
    const p = { brokerName: 'Example Real Estate', contactName: 'Eric', preferredLanguage: 'EN' as const, languages: ['EN' as const] };
    expect(hostProfilePatch({ name: 'Example Homes', preferredLanguage: 'RW' }, r, p)).toEqual({ name: 'Example Real Estate', contactName: 'Eric', preferredLanguage: 'EN' });
    // A person renamed them and set French: both stay.
    expect(hostProfilePatch({ name: 'Jean (landlord)', contactName: 'Jean', preferredLanguage: 'FR' }, r, p)).toEqual({});
  });
});

describe('30-day window', () => {
  it('requeues rows the 7-day gate skipped once they fit the window', () => {
    const nowMs = Date.parse('2026-10-25T00:00:00Z');
    const posted = nowMs / 1000 - 20 * 86400;
    const r = row('2bd for rent', { state: 'skipped', skipReason: 'older than 7 days', meta: { caption: '2bd', uploader: 'x', channel: null, timestamp: posted, duration: 1, views: 1 } });
    expect(requeueable(r, true, 30, nowMs)).toBe(true);
    expect(requeueable(r, true, 7, nowMs)).toBe(false);
  });
});

describe('broker merge', () => {
  it('weights each source\'s first language', () => {
    expect(mergeLanguages([['EN', 'RW'], ['RW'], ['FR']])).toEqual(['RW', 'EN', 'FR']);
    expect(mergeLanguages([undefined, []])).toEqual([]);
  });
  it('names by majority, case-blind', () => {
    expect(mostNamed(['Eric', 'eric ', null, 'Jean'])).toBe('Eric');
  });
});

describe('the broker ask in their language', async () => {
  const { brokerAsk, brokerPreviewAsk } = await import('../../scripts/crm/tiktok-post-pure');
  it('leads with Kinyarwanda or French when their ads are', () => {
    expect(brokerAsk('Eric', 'x', 'mkan.rw', 'RW').startsWith('Muraho Eric')).toBe(true);
    const fr = brokerAsk('Eric', 'x', 'mkan.rw', 'FR');
    expect(fr.startsWith('Bonjour Eric')).toBe(true);
    expect(fr).toContain('Hello Eric');
    expect(brokerPreviewAsk('', 'x', 'mkan.rw', 'https://cdn.example/p.mp4', 'FR')).toContain('https://cdn.example/p.mp4');
  });
  it('keeps English first when unknown', () => {
    expect(brokerAsk('Eric').startsWith('Hello Eric')).toBe(true);
  });
});

describe('room counts written after the word', () => {
  it('counts "ibyumba 2" and "chambres: 3"', () => {
    expect(captionCarriesFacts('price 250k | kimironko ibyumba 2')).toBe(true);
    expect(captionCarriesFacts('Maison 300k, chambres: 3')).toBe(true);
    expect(captionCarriesFacts('price 250k nice place')).toBe(false);
  });
});

describe('reader lists', () => {
  it('reads null lists as empty', () => {
    const r = read({ phones: null, features: null, propertyFrames: null, units: null, languages: null });
    expect([r.phones, r.features, r.propertyFrames, r.units, r.languages]).toEqual([[], [], [], [], []]);
  });
});
