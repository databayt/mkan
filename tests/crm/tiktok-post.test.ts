/**
 * The Kigali TikTok page's pure core. Fixtures are made up (the repo is
 * public): handles, ids and numbers are in the real shapes only.
 */
import { describe, expect, it } from 'vitest';
import {
  brokerAsk,
  captionFor,
  endCardSvg,
  ineligibleReason,
  lowerThirdSvg,
  brandTimeline,
  brokerVideoUrl,
  cornerSvg,
  pickToday,
  refInText,
  refOf,
  timeline,
  waLink,
  type Ledger,
  type PostRow,
} from '../../scripts/crm/tiktok-post-pure';

const PHOTOS = ['1', '2', '3', '4', '5'].map((n) => `https://cdn.example/${n}.jpg`);
const row = (over: Partial<PostRow> = {}): PostRow => ({
  id: 100,
  code: null,
  source: 'MANUAL',
  priceMonth: 450_000,
  bedrooms: 3,
  bathrooms: 2,
  propertyType: 'Apartment',
  photoUrls: PHOTOS,
  area: 'Kimironko',
  district: 'Gasabo',
  hostSourceId: null,
  ...over,
});
const NOW = Date.parse('2026-10-20T07:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe('refOf', () => {
  it('prefers the listing code, else K<id>', () => {
    expect(refOf({ id: 5771, code: null })).toBe('K5771');
    expect(refOf({ id: 5771, code: '0005-01' })).toBe('0005-01');
  });
});

describe('ineligibleReason', () => {
  const none = new Set<string>();
  it('passes an owner home with photos and a price', () => {
    expect(ineligibleReason(row(), none)).toBeNull();
  });
  it('holds a broker lead until that broker says YES', () => {
    const lead = row({ source: 'TIKTOK', hostSourceId: 'tiktok:kigalihomes' });
    expect(ineligibleReason(lead, none)).toMatch(/not agreed/);
    expect(ineligibleReason(lead, new Set(['kigalihomes']))).toBeNull();
  });
  it('needs a monthly price and enough photos', () => {
    expect(ineligibleReason(row({ priceMonth: null }), none)).toMatch(/price/);
    expect(ineligibleReason(row({ photoUrls: PHOTOS.slice(0, 2) }), none)).toMatch(/photos/);
  });
});

describe('pickToday', () => {
  const rows = [
    row({ id: 1, district: 'Gasabo' }),
    row({ id: 2, district: 'Gasabo' }),
    row({ id: 3, district: 'Kicukiro' }),
    row({ id: 4, district: 'Nyarugenge' }),
  ];
  it('spreads a day across districts', () => {
    const picked = pickToday(rows, {}, new Set(), 3, NOW);
    expect(new Set(picked.map((r) => r.district)).size).toBe(3);
  });
  it('rests a posted home 30 days and a queued one 3 days', () => {
    const ledger: Ledger = {
      K4: { listingId: 4, district: 'Nyarugenge', queuedAt: daysAgo(10), postedAt: daysAgo(10) },
      K3: { listingId: 3, district: 'Kicukiro', queuedAt: daysAgo(1) },
    };
    expect(pickToday(rows, ledger, new Set(), 4, NOW).map((r) => r.id).sort()).toEqual([1, 2]);
    ledger.K4.postedAt = daysAgo(31);
    ledger.K3.queuedAt = daysAgo(4);
    expect(pickToday(rows, ledger, new Set(), 4, NOW)).toHaveLength(4);
  });
  it('puts the district posted least this week first', () => {
    const ledger: Ledger = { K9: { listingId: 9, district: 'Gasabo', queuedAt: daysAgo(2), postedAt: daysAgo(2) } };
    expect(pickToday(rows, ledger, new Set(), 1, NOW)[0].district).not.toBe('Gasabo');
  });
});

describe('caption + artwork', () => {
  it('carries price, place, the ref and the number', () => {
    const c = captionFor(row({ id: 77 }), '+250 788 000 000');
    expect(c).toContain('RWF 450,000 / month');
    expect(c).toContain('Kimironko, Gasabo');
    expect(c).toContain('"K77"');
    expect(c).toContain('+250 788 000 000');
    expect(c).toContain('#gasabo');
    expect(refInText(c)).toBe('K77');
  });
  it('escapes text in the SVG', () => {
    expect(lowerThirdSvg(row({ area: 'A & B <x>' }))).toContain('A &amp; B &lt;x&gt;');
    expect(cornerSvg('kigalihomes')).toContain('Video @kigalihomes');
    expect(cornerSvg(null)).not.toContain('Video @');
    expect(endCardSvg(row(), '+250 788 000 000')).toContain('+250 788 000 000');
  });
  it('asks brokers in English and Kinyarwanda', () => {
    const m = brokerAsk('Eric');
    expect(m).toContain('Hello Eric');
    expect(m).toContain('Muraho Eric');
  });
});

describe('timeline', () => {
  it('overlaps slides by the fade and ends after the card', () => {
    const t = timeline(6, 2.6, 0.4, 3);
    expect(t.offsets).toEqual([2.2, 4.4, 6.6, 8.8, 11]);
    expect(t.slidesLen).toBe(13.6);
    expect(t.total).toBe(16.2);
  });
});

describe('broker ask link', () => {
  it('names their TikTok and our page, and prefills WhatsApp', () => {
    const m = brokerAsk('', 'kigalihomes', 'mkan.rw');
    expect(m).toContain('Hello 👋');
    expect(m).toContain('@kigalihomes');
    expect(m).toContain('(@mkan.rw)');
    const link = waLink('+250 788 000 000', m);
    expect(link.startsWith('https://wa.me/250788000000?text=')).toBe(true);
    expect(decodeURIComponent(link.split('text=')[1])).toBe(m);
  });
});

describe('broker video + brand timeline', () => {
  it('finds the TikTok video a broker lead was cut from', () => {
    const lead = row({ source: 'TIKTOK', hostSourceId: 'tiktok:KigaliHomes', photoUrls: ['https://cdn.example/mkan/uploads/tiktok/7412345678901234567/1.jpg'] });
    expect(brokerVideoUrl(lead)).toBe('https://www.tiktok.com/@kigalihomes/video/7412345678901234567');
    expect(brokerVideoUrl(row())).toBeNull();
  });
  it('credits the broker in the caption', () => {
    expect(captionFor(row({ hostSourceId: 'tiktok:kigalihomes' }), '+250 788 000 000')).toContain('🎥 @kigalihomes');
    expect(captionFor(row(), '+250 788 000 000')).not.toContain('🎥');
  });
  it('lays sting, body and end card on crossfades', () => {
    expect(brandTimeline(10)).toEqual({ bodyAt: 1.05, endAt: 10.7, total: 13.7 });
  });
});
