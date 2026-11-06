/**
 * The Kigali TikTok page's pure core. Fixtures are made up (the repo is
 * public): handles, ids and numbers are in the real shapes only.
 */
import { describe, expect, it } from 'vitest';
import {
  brokerPreviewAsk,
  contactLeaks,
  errorText,
  pageStatsLine,
  FRESH_DAYS,
  sourcePostedAt,
  stripGraph,
  bandCrop,
  fitGraph,
  pictureRect,
  W,
  H,
  textRegions,
  leftoverText,
  staticOverlayRegions,
  spokenContactSpans,
  muteFilter,
  oldRenderDays,
  type GrayFrame,
  type SpokenWord,
  type TextBox,
  type TextFrame,
  brokerAsk,
  captionFor,
  ineligibleReason,
  brokerVideoUrl,
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

describe('caption', () => {
  it('carries price, place, the ref and the number', () => {
    const c = captionFor(row({ id: 77 }), '+250 788 000 000');
    expect(c).toContain('RWF 450,000 / month');
    expect(c).toContain('Kimironko, Gasabo');
    expect(c).toContain('"K77"');
    expect(c).toContain('+250 788 000 000');
    expect(c).toContain('#gasabo');
    expect(refInText(c)).toBe('K77');
  });
  it('carries no music line: the broker\'s own sound goes out, nothing generated', () => {
    expect(captionFor(row({ hostSourceId: 'tiktok:kigalihomes' }), '+250 788 000 000')).not.toMatch(/music|AI-generated/i);
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

describe('broker video', () => {
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
});


describe('preview ask', () => {
  it('carries the preview link in both languages and promises nothing goes out before YES', () => {
    const m = brokerPreviewAsk('Eric', 'somebroker', 'mkan.rw', 'https://cdn.example/p.mp4');
    expect(m.match(/https:\/\/cdn\.example\/p\.mp4/g)).toHaveLength(2);
    expect(m).toContain('Nothing is posted until you say YES');
    expect(m).toContain('YEGO');
    expect(m).toContain('@somebroker');
  });
  it('credits them in the caption, and promises the video cleaned — never their name on it, never mkan music', () => {
    for (const lang of ['EN', 'RW', 'FR']) {
      const m = brokerPreviewAsk('Eric', 'somebroker', 'mkan.rw', 'https://cdn.example/p.mp4', lang);
      expect(m).not.toMatch(/on every video|sur chaque vidéo|mkan music|musique mkan/i);
    }
    const en = brokerPreviewAsk('Eric', 'somebroker', 'mkan.rw', 'https://cdn.example/p.mp4', 'EN');
    expect(en).toContain('crediting you by name in the caption');
    expect(en).toContain('the text on screen taken off');
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
    // The WebSocket ErrorEvent the database driver throws, with the real error inside.
    expect(errorText({ type: 'error', error: new Error('getaddrinfo ENOTFOUND ep-x.neon.tech') })).toBe('database connection: getaddrinfo ENOTFOUND ep-x.neon.tech');
    expect(errorText({ type: 'error' })).toBe('error event (no detail)');
    // A wrapped error keeps the real one in `cause`.
    expect(errorText(new Error('', { cause: Object.assign(new Error(''), { code: 'ECONNREFUSED' }) }))).toBe('ECONNREFUSED');
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
      '📈 TikTok @mkan.rw: 3 posts, 471 views, 15 likes · posted in the last 7 days: 2, 284 views · best: "RWF 1M+ a month" 187 (23 Oct) · broker videos matched to homes: 0',
    );
    expect(pageStatsLine('mkan.rw', [], { matched: 0, views: 0 }, now)).toBe('📈 TikTok @mkan.rw: 0 posts, 0 views, 0 likes · posted in the last 7 days: 0, 0 views · broker videos matched to homes: 0');
  });
});



describe('the strict gate after the strip', () => {
  const box = (over: Partial<TextBox> = {}): TextBox => ({ x: 0.2, y: 0.5, w: 0.3, h: 0.025, conf: 0.9, text: 'Kimironko 2 beds', ...over });
  it('fails on any readable text left, not just a number', () => {
    expect(leftoverText([{ t: 1, boxes: [box()] }])).toEqual(['"Kimironko 2 beds" at 1 s']);
  });
  it('fails on a number or handle at any size or confidence', () => {
    expect(leftoverText([{ t: 2, boxes: [box({ w: 0.02, h: 0.005, conf: 0.35, text: '0788 000 111' })] }])).toEqual(['"0788000111" at 2 s']);
    expect(leftoverText([{ t: 2, boxes: [box({ w: 0.02, h: 0.005, conf: 0.35, text: '@some.broker' })] }])).toHaveLength(1);
  });
  it('lets small or unsure reads on a wiped patch through', () => {
    expect(leftoverText([{ t: 1, boxes: [box({ w: 0.03, h: 0.01 }), box({ conf: 0.3 }), box({ text: '·' })] }])).toEqual([]);
    expect(leftoverText([])).toEqual([]);
  });
});

describe('logos and watermarks', () => {
  const gw = 54;
  const gh = 96;
  /** Frames whose scene moves (fresh noise each time) under a fixed checkered mark at (mx, my, mw × mh) cells. */
  const frames = (n: number, mark?: { x: number; y: number; w: number; h: number }, still = false, seed = 1): GrayFrame[] => {
    let s = seed;
    const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648) * 255;
    const base = Array.from({ length: gw * gh }, rnd);
    return Array.from({ length: n }, (_, i) => {
      const data = still ? base.slice() : Array.from({ length: gw * gh }, rnd);
      if (mark) for (let y = mark.y; y < mark.y + mark.h; y++) for (let x = mark.x; x < mark.x + mark.w; x++) data[y * gw + x] = (x + y) % 2 ? 250 : 10;
      return { t: i / 2, data };
    });
  };
  const opts = { gw, gh, width: 1080, height: 1920, duration: 8 };

  it('finds a mark that holds still while the scene moves, in output pixels', () => {
    const r = staticOverlayRegions(frames(16, { x: 40, y: 4, w: 10, h: 5 }), opts);
    expect(r).toHaveLength(1);
    const [m] = r;
    // 20 px a cell; the mark is cells 40–49 × 4–8, plus a cell of pad.
    expect(m!.x).toBeLessThanOrEqual(40 * 20);
    expect(m!.x + m!.w).toBeGreaterThanOrEqual(50 * 20);
    expect(m!.y).toBeLessThanOrEqual(4 * 20);
    expect(m!.y + m!.h).toBeGreaterThanOrEqual(9 * 20);
    expect(m!.start).toBe(0);
    expect(m!.end).toBe(8);
    expect(stripGraph(r)).toContain('delogo=');
  });

  it('times a mark that only shows in part of the clip', () => {
    const f = [...frames(8), ...frames(8, { x: 2, y: 80, w: 8, h: 6 }, false, 7).map((x) => ({ ...x, t: x.t + 4 }))];
    const [m] = staticOverlayRegions(f, opts);
    expect(m!.start).toBeGreaterThanOrEqual(3);
    expect(m!.end).toBe(8);
  });

  it('wipes nothing on a still shot or a photo slideshow', () => {
    expect(staticOverlayRegions(frames(16, { x: 40, y: 4, w: 10, h: 5 }, true), opts)).toEqual([]);
  });

  it('never takes a big part of the frame for a logo', () => {
    // A fixed block over a quarter of the frame is the scene (a wall, a window), not an overlay.
    expect(staticOverlayRegions(frames(16, { x: 0, y: 0, w: 30, h: 50 }), opts)).toEqual([]);
  });

  it('ignores a fixed flat patch with no edges, and too few frames', () => {
    const flat = frames(16).map((f) => {
      const d = Array.from(f.data);
      for (let y = 10; y < 16; y++) for (let x = 10; x < 20; x++) d[y * gw + x] = 128;
      return { ...f, data: d };
    });
    expect(staticOverlayRegions(flat, opts)).toEqual([]);
    expect(staticOverlayRegions(frames(3, { x: 40, y: 4, w: 10, h: 5 }), opts)).toEqual([]);
  });
});

describe("the broker's voice", () => {
  const say = (text: string, from = 0): SpokenWord[] => text.split(' ').map((word, i) => ({ word: ` ${word}`, start: from + i * 0.4, end: from + i * 0.4 + 0.35 }));

  it('mutes a phone number read out as digits or words', () => {
    expect(spokenContactSpans(say('call me on 0788 123 456 today'))).toEqual([{ start: 0.95, end: 2.6, what: 'number 078…' }]);
    const words = spokenContactSpans(say('WhatsApp zero seven eight eight one two three four five six'));
    expect(words).toHaveLength(1);
    expect(words[0]!.start).toBeCloseTo(0.15);
    expect(spokenContactSpans(say('zero seven double eight one two three'))).toHaveLength(1); // 0788123
  });

  it('mutes an @handle', () => {
    const [h] = spokenContactSpans(say('follow @kigali.homes for more'));
    expect(h!.what).toBe('a handle');
    expect(spokenContactSpans(say('follow at kigalihomes for more'))).toHaveLength(1);
  });

  it('keeps prices, counts and short numbers', () => {
    expect(spokenContactSpans(say('the rent is 1,500,000 francs for 3 bedrooms and 2 baths'))).toEqual([]);
    expect(spokenContactSpans(say('house number 12 34 on the left'))).toEqual([]);
    expect(spokenContactSpans([])).toEqual([]);
  });

  it('joins spans that touch, and builds one ffmpeg filter', () => {
    const spans = spokenContactSpans([...say('0788 123 456'), ...say('@x.homes', 1.3)]);
    expect(spans).toHaveLength(1);
    expect(muteFilter(spans)).toBe(`volume=enable='between(t,${spans[0]!.start},${spans[0]!.end})':volume=0`);
    expect(muteFilter([])).toBeNull();
  });
});

describe('disk floor', () => {
  it('frees render folders over 14 days old, never anything else', () => {
    const now = Date.parse('2026-11-05T07:00:00Z');
    expect(oldRenderDays(['2026-10-01', '2026-10-25', '2026-11-05', 'src', 'preview', 'posted.json'], now)).toEqual(['2026-10-01']);
  });
});

describe('a sale price read as a monthly rent', () => {
  it('is never posted', async () => {
    const { ineligibleReason, MAX_MONTHLY_RENT } = await import('../../scripts/crm/tiktok-post-pure');
    const row = { id: 6525, code: null, source: 'MANUAL', priceMonth: 140_000_000, bedrooms: 4, bathrooms: 3, propertyType: 'HOUSE', photoUrls: ['a', 'b', 'c', 'd', 'e'], area: 'Kabeza', district: 'Kicukiro', hostSourceId: null, postedAt: new Date().toISOString(), lostAt: null } as never;
    expect(ineligibleReason(row, new Set())).toBe('price looks like a sale');
    expect(ineligibleReason({ ...(row as object), priceMonth: MAX_MONTHLY_RENT } as never, new Set())).toBeNull();
  });
});

describe('bandCrop — a full-width caption banner is cut off, not wiped', () => {
  const full = { x: 0, y: 0, w: W, h: H };
  // K6516 (11-06), as Vision read it on the 1080×1920 body: three centred caption lines, top quarter.
  const k6516: TextFrame[] = [0.5, 3, 6, 9].map((t) => ({
    t,
    boxes: [
      { x: 0.23, y: 0.173, w: 0.623, h: 0.035, conf: 1, text: 'Full furnished one' },
      { x: 0.204, y: 0.222, w: 0.674, h: 0.035, conf: 1, text: 'bedroom for rent In' },
      { x: 0.343, y: 0.268, w: 0.396, h: 0.04, conf: 1, text: 'Gisozi 550k' },
    ],
  }));

  it('cuts the K6516 banner off the top and keeps everything under it', () => {
    const regions = textRegions(k6516, { duration: 10 });
    const cut = bandCrop(regions, full)!;
    expect(cut).not.toBeNull();
    expect(cut.bottom).toBe(0);
    // Below the last caption line, never into the picture's middle.
    const lineBottom = (0.268 + 0.04) * H;
    expect(cut.keep.y).toBeGreaterThanOrEqual(lineBottom);
    expect(cut.keep.y).toBeLessThan(0.4 * H);
    expect(cut.keep.y + cut.keep.h).toBe(H);
    expect(cut.keep.w % 2 + cut.keep.h % 2 + cut.keep.y % 2).toBe(0);
  });

  it('leaves a small box (a price tag in a corner) to delogo', () => {
    const r = { x: 700, y: 100, w: 300, h: 80, start: 0, end: 5 };
    expect(bandCrop([r], full)).toBeNull();
  });

  it('leaves a wide line mid-picture to delogo — only the top and bottom quarters are cut', () => {
    expect(bandCrop([{ x: 20, y: 900, w: 1040, h: 120, start: 0, end: 5 }], full)).toBeNull();
  });

  it('cuts a bottom banner from its top edge down', () => {
    const cut = bandCrop([{ x: 1, y: 1700, w: 1078, h: 150, start: 0, end: 5 }], full)!;
    expect(cut.top).toBe(0);
    expect(cut.keep.y).toBe(0);
    expect(cut.keep.y + cut.keep.h).toBeLessThanOrEqual(1700);
  });

  it('measures against the picture, not the frame: a landscape strip on its blurred fill', () => {
    const pic = pictureRect(1920, 1080); // 1080 × 608, centred
    expect(pic).toEqual({ x: 0, y: 656, w: 1080, h: 608 });
    const cut = bandCrop([{ x: 30, y: 660, w: 1020, h: 90, start: 0, end: 4 }], pic)!;
    expect(cut.keep.y).toBeGreaterThanOrEqual(750);
    expect(cut.keep.y + cut.keep.h).toBe(656 + 608);
    // The same line high on a portrait frame is in that picture's top quarter, but on the
    // strip a line in the frame's top quarter is outside the picture: nothing to cut.
    expect(bandCrop([{ x: 30, y: 100, w: 1020, h: 90, start: 0, end: 4 }], pic)).toBeNull();
  });

  it('never cuts away more than minKeep allows: the bigger band that fits alone, else none', () => {
    const top = { x: 0, y: 1, w: W, h: 500, start: 0, end: 5 };
    const bottom = { x: 0, y: 1500, w: W, h: 419, start: 0, end: 5 };
    const cut = bandCrop([top, bottom], full)!; // both = 1001 + 420 rows > 45%
    expect(cut.top).toBeGreaterThan(0);
    expect(cut.bottom).toBe(0);
    expect(bandCrop([{ x: 0, y: 1, w: W, h: 1000, start: 0, end: 5 }], full)).toBeNull();
  });

  it('re-fits: a near-portrait keep covers the frame, a wide one sits on its blurred fill', () => {
    expect(fitGraph(1080, 1300)).toMatch(/^scale=1080:1920:force_original_aspect_ratio=increase.*crop=1080:1920$/);
    expect(fitGraph(1080, 500)).toContain('gblur=sigma=40');
  });
});
