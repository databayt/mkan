/**
 * The Kigali TikTok page's pure core. Fixtures are made up (the repo is
 * public): handles, ids and numbers are in the real shapes only.
 */
import { describe, expect, it } from 'vitest';
import {
  beatHolds,
  brokerPreviewAsk,
  contactLeaks,
  errorText,
  pageStatsLine,
  FRESH_DAYS,
  sourcePostedAt,
  stripGraph,
  textRegions,
  type TextBox,
  type TextFrame,
  photoCredits,
  photoHomeSvg,
  pickStock,
  type StockPhoto,
  brokerAsk,
  captionFor,
  carouselCaption,
  carouselHomeSvg,
  carouselNarration,
  slideHolds,
  carouselThemes,
  pickCarousel,
  wrap,
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

const NOW = Date.parse('2026-10-20T07:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
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
  postedAt: daysAgo(2),
  lostAt: null,
  ...over,
});
/** A TikTok video id posted `d` days before NOW (its top 32 bits are the unix seconds). */
const videoId = (d: number): string => ((BigInt(Math.floor((NOW - d * 86_400_000) / 1000)) << BigInt(32)) + BigInt(123_456)).toString();
const brokerFrames = (d: number): string[] => ['1', '2', '3', '4'].map((n) => `https://cdn.example/mkan/uploads/tiktok/${videoId(d)}/${n}.jpg`);

describe('refOf', () => {
  it('prefers the listing code, else K<id>', () => {
    expect(refOf({ id: 5771, code: null })).toBe('K5771');
    expect(refOf({ id: 5771, code: '0005-01' })).toBe('0005-01');
  });
});

describe('ineligibleReason', () => {
  const none = new Set<string>();
  it('passes an owner home with photos and a price', () => {
    expect(ineligibleReason(row(), none, NOW)).toBeNull();
  });
  it('holds a broker lead until that broker says YES', () => {
    const lead = row({ source: 'TIKTOK', hostSourceId: 'tiktok:kigalihomes' });
    expect(ineligibleReason(lead, none, NOW)).toMatch(/not agreed/);
    expect(ineligibleReason(lead, new Set(['kigalihomes']), NOW)).toBeNull();
  });
  it('needs a monthly price and enough photos', () => {
    expect(ineligibleReason(row({ priceMonth: null }), none, NOW)).toMatch(/price/);
    expect(ineligibleReason(row({ photoUrls: PHOTOS.slice(0, 2) }), none, NOW)).toMatch(/photos/);
  });
  it(`takes only homes whose source post is at most ${FRESH_DAYS} days old`, () => {
    expect(ineligibleReason(row({ postedAt: daysAgo(FRESH_DAYS - 1) }), none, NOW)).toBeNull();
    expect(ineligibleReason(row({ postedAt: daysAgo(FRESH_DAYS + 1) }), none, NOW)).toBe(`source post over ${FRESH_DAYS} days old`);
    expect(ineligibleReason(row({ postedAt: null }), none, NOW)).toBe('no source post date');
  });
  it("dates a broker lead by its TikTok video, not by when mkan read it", () => {
    const yes = new Set(['kigalihomes']);
    const lead = (videoDays: number) => row({ source: 'TIKTOK', hostSourceId: 'tiktok:kigalihomes', photoUrls: brokerFrames(videoDays), postedAt: daysAgo(1) });
    expect(sourcePostedAt(lead(30))).toBe(Math.floor((NOW - 30 * 86_400_000) / 1000) * 1000);
    expect(ineligibleReason(lead(30), yes, NOW)).toBe(`source post over ${FRESH_DAYS} days old`);
    expect(ineligibleReason(lead(10), yes, NOW)).toBeNull();
  });
  it('never takes a home that is gone', () => {
    expect(ineligibleReason(row({ lostAt: daysAgo(1) }), none, NOW)).toBe('taken, or its ad is gone');
    expect(pickToday([row({ id: 1, lostAt: daysAgo(1) }), row({ id: 2 })], {}, none, 3, NOW).map((r) => r.id)).toEqual([2]);
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
    expect(endCardSvg(row(), '+250 788 000 000')).toContain('+250 788 000 000');
  });
  it('keeps the corner to the mark and the page — no broker handle on screen', () => {
    const c = cornerSvg();
    expect(c).toContain('>mkan</text>');
    expect(c).not.toContain('Video');
    expect(c).not.toContain('@');
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
  it('credits the broker in the caption on a plain line', () => {
    const lines = captionFor(row({ hostSourceId: 'tiktok:kigalihomes' }), '+250 788 000 000').split('\n');
    expect(lines).toContain('Video: @kigalihomes');
    expect(lines.join('\n')).not.toMatch(/🎥|remastered/);
    expect(captionFor(row(), '+250 788 000 000')).not.toContain('Video:');
  });
  it('lays sting, body and end card on crossfades', () => {
    expect(brandTimeline(10)).toEqual({ bodyAt: 1.05, endAt: 10.7, total: 13.7 });
  });
});

describe('data carousel', () => {
  const pool = [
    row({ id: 1, district: 'Gasabo', priceMonth: 200_000, bedrooms: 1 }),
    row({ id: 2, district: 'Gasabo', priceMonth: 350_000, bedrooms: 2 }),
    row({ id: 3, district: 'Gasabo', priceMonth: 500_000, bedrooms: 2 }),
    row({ id: 4, district: 'Gasabo', priceMonth: 900_000, bedrooms: 3 }),
    row({ id: 5, district: 'Kicukiro', priceMonth: 400_000, bedrooms: 2 }),
    row({ id: 6, district: 'Gasabo', priceMonth: null }),
  ];
  it('takes any home with facts — no consent needed, no photos used', () => {
    const lead = row({ id: 9, source: 'TIKTOK', hostSourceId: 'tiktok:x', district: 'Gasabo', photoUrls: [] });
    const all = carouselThemes([...pool, lead]).find((t) => t.theme.slug === 'district-gasabo')!;
    expect(all.homes.map((r) => r.id)).toContain(9);
    expect(all.homes.map((r) => r.id)).not.toContain(6);
  });
  it('rotates the theme kind by day and lists homes cheapest first', () => {
    const day0 = 20_001 * 86_400_000; // a day index divisible by 3 → district
    const c = pickCarousel(pool, {}, day0, 3)!;
    expect(c.theme.slug).toBe('district-gasabo');
    const prices = c.homes.map((r) => r.priceMonth!);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    expect(pickCarousel(pool, {}, day0 + 86_400_000, 3)!.theme.kind).toBe('budget');
  });
  it('leaves a home that is gone out of every theme', () => {
    const gone = row({ id: 7, district: 'Gasabo', lostAt: daysAgo(1) });
    expect(carouselThemes([...pool, gone]).flatMap((t) => t.homes.map((r) => r.id))).not.toContain(7);
  });
  it('rests a shown home 14 days', () => {
    const day0 = 20_000 * 86_400_000;
    const shown = Object.fromEntries(pool.map((r) => [refOf(r), new Date(day0 - 86_400_000).toISOString()]));
    expect(pickCarousel(pool, shown, day0, 3)).toBeNull();
  });
  it('wraps, escapes and carries the ref + number', () => {
    expect(wrap('Homes for rent in Kicukiro', 14)).toEqual(['Homes for rent', 'in Kicukiro']);
    expect(carouselHomeSvg(row({ id: 77, area: 'A & B' }), 1, 5, '+250 788 000 000')).toContain('K77');
    expect(carouselCaption(carouselThemes(pool)[0]!.theme, pool.slice(0, 2), '+250 788 000 000')).toContain('agent or owner');
  });
});

describe('voiced data video', () => {
  it('narrates the cover, each home and the call to action', () => {
    const theme = carouselThemes([row()]).find((t) => t.theme.slug === 'district-gasabo')!.theme;
    const lines = carouselNarration(theme, [row({ id: 77, propertyType: 'Apartment', bedrooms: 2, bathrooms: 1 })]);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('One home for rent in Gasabo this week.');
    expect(lines[1]).toBe('An apartment in Kimironko, Gasabo. Two bedrooms, one bathroom. 450,000 francs a month. Code K-7-7.');
    expect(lines[2]).toContain('WhatsApp');
  });
  it('holds each slide for its line plus room, never too short', () => {
    expect(slideHolds([5, 1, 0])).toEqual([5.7, 2.5, 2.5]);
  });
});

describe('picture video', () => {
  const photo = (id: string, artist: string, license: string): StockPhoto => ({ id, label: id, title: id, license, artist, page: '', url: `https://upload.wikimedia.org/x/${id}.jpg` });

  it('cuts on the beat: cover 4 beats, homes and end card 8', () => {
    expect(beatHolds(2, 120)).toEqual([2, 4, 4, 4]);
    expect(beatHolds(5)).toHaveLength(7);
  });

  it('rotates area photos, never-used first', () => {
    const all = [photo('a', 'X', 'CC0'), photo('b', 'Y', 'CC0'), photo('c', 'Z', 'CC0')];
    expect(pickStock(all, { a: '2026-10-20T00:00:00Z' }, 2).map((p) => p.id)).toEqual(['b', 'c']);
    expect(pickStock(all, { a: '2026-10-20', b: '2026-10-19', c: '2026-10-21' }, 1).map((p) => p.id)).toEqual(['b']);
  });

  it('credits each author once with their licences, and says the photos are not the homes', () => {
    const line = photoCredits([photo('a', 'Ann', 'CC BY 2.0'), photo('b', 'Ann', 'CC BY 2.0'), photo('c', 'Bo', 'CC0')]);
    expect(line).toContain('not the listed homes');
    expect(line).toContain('Ann (CC BY 2.0), Bo (CC0)');
  });

  it('tags an area photo on screen, and not a home photo', () => {
    const r = { id: 1, code: null, source: 'MANUAL' as const, priceMonth: 300000, bedrooms: 2, bathrooms: 1, propertyType: null, photoUrls: [], area: 'Kimihurura', district: 'Gasabo', hostSourceId: null, postedAt: null, lostAt: null };
    expect(photoHomeSvg(r, 1, 5, true)).toContain('area photo');
    expect(photoHomeSvg(r, 1, 5, false)).not.toContain('area photo');
  });
});

describe('preview ask', () => {
  it('carries the preview link in both languages and promises nothing goes out before YES', () => {
    const m = brokerPreviewAsk('Eric', 'somebroker', 'mkan.rw', 'https://cdn.example/p.mp4');
    expect(m.match(/https:\/\/cdn\.example\/p\.mp4/g)).toHaveLength(2);
    expect(m).toContain('Nothing is posted until you say YES');
    expect(m).toContain('YEGO');
    expect(m).toContain('@somebroker');
  });
});

describe("the broker's text, off", () => {
  // A caption line Vision read: 0.3 of the frame wide, 0.025 tall (48 px of 1920).
  const line = (over: Partial<TextBox> = {}): TextBox => ({ x: 0.2, y: 0.5, w: 0.3, h: 0.025, conf: 1, text: '0788 000 000', ...over });
  const seen = (ts: number[], boxes: TextBox[] = [line()]): TextFrame[] => ts.map((t) => ({ t, boxes }));
  /** Every box Vision read lies inside some region while it was seen (but the frame's outermost pixel, which delogo fills from). */
  const covered = (frames: TextFrame[], regions: ReturnType<typeof textRegions>): boolean =>
    frames.every((f) =>
      f.boxes.every((b) =>
        regions.some(
          (r) =>
            r.x <= Math.max(1, b.x * 1080) && r.y <= Math.max(1, b.y * 1920) && r.x + r.w >= Math.min(1079, (b.x + b.w) * 1080) && r.y + r.h >= Math.min(1919, (b.y + b.h) * 1920) && r.start <= f.t && r.end >= f.t,
        ),
      ),
    );

  it('maps a box into output pixels, padded past its plate, held a sample either side', () => {
    // 48 px tall → 84 px of pad across (a leading emoji, the plate's ends), 30 px up and down.
    expect(textRegions(seen([5]))).toEqual([{ x: 132, y: 930, w: 492, h: 108, start: 4.35, end: 5.65 }]);
  });

  it('makes one region of a caption that stays, and of the lines of one caption', () => {
    const frames = seen([0, 0.5, 1, 1.5, 2, 2.5, 3], [line(), line({ y: 0.53, text: '2 beds' })]);
    const r = textRegions(frames, { duration: 40 });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ start: 0, end: 3.65 });
    expect(covered(frames, r)).toBe(true);
  });

  it('bridges frames Vision missed, but not a caption that comes back much later', () => {
    expect(textRegions(seen([1, 2.5]))).toHaveLength(1);
    const apart = textRegions(seen([1, 10]));
    expect(apart.map((r) => [r.start, r.end])).toEqual([[0.35, 1.65], [9.35, 10.65]]);
  });

  it('keeps separate places separate', () => {
    expect(textRegions(seen([1], [line({ y: 0.1 }), line({ y: 0.8 })]))).toHaveLength(2);
  });

  it('ignores low-confidence and tiny boxes', () => {
    expect(textRegions(seen([1], [line({ conf: 0.1 }), line({ h: 0.004 })]))).toEqual([]);
  });

  it('stays inside the frame (a pixel of edge for delogo) and inside the body', () => {
    const [r] = textRegions(seen([2.8], [line({ x: 0, y: 0, w: 1, h: 0.05 })]), { duration: 3 });
    expect(r).toMatchObject({ x: 1, y: 1, w: 1078, end: 3 });
  });

  it('caps the count by merging the closest, never by dropping text', () => {
    // 60 small boxes all over the frame and the clip.
    const frames: TextFrame[] = Array.from({ length: 60 }, (_, i) => ({ t: (i % 12) * 3, boxes: [line({ x: (i % 5) * 0.19, y: Math.floor(i / 5) * 0.08, w: 0.05, h: 0.012 })] }));
    const r = textRegions(frames, { maxRegions: 8, duration: 40 });
    expect(r.length).toBeLessThanOrEqual(8);
    expect(covered(frames, r)).toBe(true);
  });

  it('builds the wipe as one ffmpeg graph, timed for a video and for good on a still', () => {
    const regions = textRegions(seen([1], [line(), line({ y: 0.1 })]));
    const g = stripGraph(regions);
    expect(g.startsWith('[0:v]delogo=')).toBe(true);
    expect(g.endsWith('[v]')).toBe(true);
    expect(g.match(/delogo=/g)).toHaveLength(2);
    expect(g).toContain(`enable='between(t,${regions[0]!.start},${regions[0]!.end})'`);
    expect(stripGraph(regions, false)).not.toContain('enable');
    expect(stripGraph([])).toBe('[0:v]null[v]');
  });

  it('finds the numbers and handles a broker burns in, and lets ours through', () => {
    expect(contactLeaks('4 Beds,3 Baths. 0781000024')).toEqual(['0781000024']);
    expect(contactLeaks('WhatsApp +250 732 000 096')).toEqual(['+250732000096']);
    expect(contactLeaks('call 0788.000.588 now')).toEqual(['0788000588']);
    expect(contactLeaks('O788000588')).toEqual(['0788000588']); // Vision's O for a zero
    expect(contactLeaks('07880 00')).toEqual(['0788000']); // half a number is still a number
    expect(contactLeaks('follow @kigali.homes')).toEqual(['@kigali.homes']);
    expect(contactLeaks('House For Rent @600k · 2.5 bathrooms · RWF 1,450,000 · security 24/7')).toEqual([]);
    expect(contactLeaks('WhatsApp +250 780 000 777', ['+250 780 000 777'])).toEqual([]);
    expect(contactLeaks('WhatsApp +250 780 000 777')).toEqual(['+250780000777']);
  });
});

describe('errorText', () => {
  it('spells out a connection that failed on every address, where the message is empty', () => {
    const e = new AggregateError([Object.assign(new Error('connect ETIMEDOUT 3.18.0.1:5432'), { code: 'ETIMEDOUT' }), new Error('connect ENETUNREACH 2600::1:5432')], '');
    expect(e.message).toBe('');
    expect(errorText(e)).toBe('connect ETIMEDOUT 3.18.0.1:5432; connect ENETUNREACH 2600::1:5432');
    expect(errorText(new Error('Connection terminated due to connection timeout'))).toBe('Connection terminated due to connection timeout');
    expect(errorText(Object.assign(new Error(''), { code: 'ECONNRESET' }))).toBe('ECONNRESET');
    expect(errorText('plain')).toBe('plain');
  });
});


describe('pageStatsLine', () => {
  it("counts every video on the page, the picture videos included", () => {
    const now = Date.parse('2026-11-01T12:00:00Z');
    const vids = [
      { views: 113, likes: 5, at: Date.parse('2026-11-01T07:03:00Z'), text: '🏠 RWF 1M+ a month — this week • K5808 — RWF 1,000,000/mo' },
      { views: 187, likes: 5, at: Date.parse('2026-10-23T05:31:00Z'), text: '🏠 RWF 1M+ a month — this week • K5776' },
      { views: 171, likes: 5, at: Date.parse('2026-10-31T05:01:00Z'), text: '🏠 Homes for rent in Gasabo — this week • K6285' },
    ];
    expect(pageStatsLine('mkan.rw', vids, { matched: 0, views: 0 }, now)).toBe(
      '📈 TikTok @mkan.rw: 3 videos, 471 views, 15 likes · posted in the last 7 days: 2, 284 views · best: "RWF 1M+ a month" 187 (23 Oct) · broker videos matched to homes: 0',
    );
    expect(pageStatsLine('mkan.rw', [], { matched: 0, views: 0 }, now)).toBe('📈 TikTok @mkan.rw: 0 videos, 0 views, 0 likes · posted in the last 7 days: 0, 0 views · broker videos matched to homes: 0');
  });
});
