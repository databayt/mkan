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
  searchCaptionOn,
  asksForFollow,
  FOLLOW_ASK,
  ineligibleReason,
  brokerVideoUrl,
  pickToday,
  pickFresh,
  slotQuota,
  dayPieces,
  fetchFailure,
  bufferPlan,
  ledgerFixes,
  shortfallLine,
  kigaliMinute,
  kigaliMidnight,
  clock,
  SLOT_TIMES,
  EVENING_FROM,
  nextSlotGap,
  aheadRenders,
  repostReach,
  repostLine,
  codePattern,
  POSTS_CEILING,
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
  it('puts the WhatsApp line second, where TikTok shows it before "more" — in both arms of the follow test', () => {
    for (const askFollow of [false, true]) {
      const lines = captionFor(row({ id: 77 }), '+250 788 000 000', askFollow, false).split('\n');
      expect(lines[0]).toMatch(/^🏠 /);
      expect(lines[1]).toBe('📲 WhatsApp +250 788 000 000 — send "K77"');
    }
    const search = captionFor(row({ id: 77, area: 'Kimihurura', district: 'Gasabo' }), '+250 788 000 000', false, true).split('\n');
    expect(search[0]).toMatch(/for rent in/);
    expect(search[1]).toBe('📲 WhatsApp +250 788 000 000 — send "K77"');
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

describe('follow ask (lever 4)', () => {
  it('alternates by post number', () => {
    expect([0, 1, 2, 3].map(asksForFollow)).toEqual([true, false, true, false]);
  });
  it('adds the ask in both languages, after the code and WhatsApp lines', () => {
    const c = captionFor(row({ id: 77, askFollow: true }), '+250 788 000 000');
    expect(c).toContain('Follow for new Kigali homes every day');
    expect(c).toContain('Kurikira');
    expect(c.indexOf(FOLLOW_ASK)).toBeGreaterThan(c.indexOf('WhatsApp +250'));
    expect(c.split('\n').indexOf(FOLLOW_ASK)).toBeGreaterThan(2);
  });
  it('leaves the caption as it was on the other side', () => {
    expect(captionFor(row({ id: 77 }), '+250 788 000 000')).not.toMatch(/Follow for new/);
    expect(captionFor(row({ id: 77, askFollow: false }), '+250 788 000 000')).not.toContain('Kurikira');
  });
});

describe('search-first caption (lever 3, off by default)', () => {
  const wa = '+250 788 000 000';
  it('is off unless the env switch is 1', () => {
    expect(searchCaptionOn({})).toBe(false);
    expect(searchCaptionOn({ TIKTOK_SEARCH_CAPTION: '0' })).toBe(false);
    expect(searchCaptionOn({ TIKTOK_SEARCH_CAPTION: '1' })).toBe(true);
    expect(captionFor(row({ id: 77 }), wa)).not.toMatch(/for rent in/);
  });
  it('opens with plain searched words (EN) and keeps code, WhatsApp, Kinyarwanda and the ask', () => {
    const c = captionFor(row({ id: 77, bedrooms: 2, area: 'Kimihurura', district: 'Gasabo', priceMonth: 400000, askFollow: true }), wa, undefined, true);
    const lines = c.split('\n');
    expect(lines[0]).toBe('Apartment for rent in Kimihurura, Gasabo, Kigali: 2 bedrooms, 400,000 RWF a month'.replace('Apartment', lines[0].split(' ')[0]));
    expect(c).toContain('WhatsApp +250 788 000 000 — send "K77"');
    expect(c).toContain(FOLLOW_ASK);
  });
  it('RW line and 3-5 hashtags incl. #inzuikodeshwa and the area', () => {
    const c = captionFor(row({ id: 77, area: 'Kimihurura', district: 'Gasabo' }), wa, false, true);
    expect(c).toContain('Inzu ikodeshwa');
    const tags = c.split('\n').at(-1)!.split(' ');
    expect(tags.length).toBeGreaterThanOrEqual(3);
    expect(tags.length).toBeLessThanOrEqual(5);
    expect(tags).toContain('#inzuikodeshwa');
    expect(tags).toContain('#kimihurura');
    expect(c).not.toContain(FOLLOW_ASK);
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

describe("only the text added on top of the video is wiped (2026-11-06)", () => {
  const still = () => "still" as const;
  const moving = () => "moving" as const;
  const box = (x: number, y: number, text: string, h = 0.03, w = 0.4, conf = 0.95) => ({ x, y, w, h, conf, text });
  const frames = (...per: { x: number; y: number; w: number; h: number; conf: number; text?: string }[][]) => per.map((boxes, i) => ({ t: i * 0.5, boxes }));

  it("keeps a sign that moves with the picture, wipes a caption fixed on the screen", async () => {
    const { addedText } = await import("../../scripts/crm/tiktok-post-pure");
    const f = frames(
      [box(0.1, 0.82, "Luxury living"), box(0.2, 0.3, "SUPERMARKET", 0.02, 0.15, 0.8)],
      [box(0.1, 0.82, "Luxury living"), box(0.32, 0.31, "SUPERMARKET", 0.02, 0.15, 0.8)],
      [box(0.1, 0.82, "Luxury living"), box(0.45, 0.33, "SUPERMARKET", 0.02, 0.15, 0.8)],
    );
    const out = addedText(f, { motion: moving }).flatMap((x) => x.boxes.map((b) => b.text));
    expect(out).toEqual(["Luxury living", "Luxury living", "Luxury living"]);
  });

  it("wipes a phone number, a handle or a price wherever it is", async () => {
    const { addedText } = await import("../../scripts/crm/tiktok-post-pure");
    const f = frames([box(0.3, 0.4, "Call 0788 123 456", 0.02, 0.2, 0.7)], [box(0.5, 0.5, "@kigali.homes", 0.02, 0.2, 0.7)], [box(0.4, 0.45, "2 bedrooms 300k", 0.02, 0.2, 0.7)]);
    expect(addedText(f, { motion: moving }).flatMap((x) => x.boxes).length).toBe(3);
  });

  it("with the camera still, wipes a bold caption and keeps a small label in the room", async () => {
    const { addedText } = await import("../../scripts/crm/tiktok-post-pure");
    const f = frames(
      [box(0.1, 0.85, "Beautiful home", 0.04, 0.6, 0.98), box(0.45, 0.5, "Samsung", 0.012, 0.08, 0.9)],
      [box(0.1, 0.85, "Beautiful home", 0.04, 0.6, 0.98), box(0.45, 0.5, "Samsung", 0.012, 0.08, 0.9)],
    );
    const out = addedText(f, { motion: still }).flatMap((x) => x.boxes.map((b) => b.text));
    expect(out).toEqual(["Beautiful home", "Beautiful home"]);
  });

  it("a word glimpsed once while the camera moves is the scene", async () => {
    const { addedText } = await import("../../scripts/crm/tiktok-post-pure");
    const f = frames([box(0.6, 0.2, "EXIT", 0.02, 0.06, 0.9)], [], []);
    expect(addedText(f, { motion: moving }).flatMap((x) => x.boxes)).toEqual([]);
  });

  it("the strict gate no longer fails a video for the scene's own text", async () => {
    const { addedText, leftoverText } = await import("../../scripts/crm/tiktok-post-pure");
    const scene = frames([box(0.2, 0.3, "PHARMACY", 0.03, 0.2, 0.95)], [box(0.35, 0.32, "PHARMACY", 0.03, 0.2, 0.95)]);
    expect(leftoverText(scene).length).toBeGreaterThan(0);
    expect(leftoverText(addedText(scene, { motion: moving }))).toEqual([]);
  });

  it("tells a moving camera from a still one", async () => {
    const { sceneMotion } = await import("../../scripts/crm/tiktok-post-pure");
    const gw = 8, gh = 8;
    const flat = (v: number) => ({ data: new Uint8Array(gw * gh).fill(v) });
    const stillFrames = Array.from({ length: 8 }, (_, i) => ({ t: i * 0.5, ...flat(120) }));
    const movingFrames = Array.from({ length: 8 }, (_, i) => ({ t: i * 0.5, data: Uint8Array.from({ length: gw * gh }, (_, p) => ((p * 37 + i * 91) % 255)) }));
    expect(sceneMotion(stillFrames, { gw, gh })(1)).toBe("still");
    expect(sceneMotion(movingFrames, { gw, gh })(1)).toBe("moving");
    expect(sceneMotion(stillFrames.slice(0, 2), { gw, gh })(0)).toBe("unknown");
  });
});

// ── 2026-11-07: every ad that went up today goes out, one at a time through the day ─────────
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe('kigaliMinute / kigaliMidnight', () => {
  it('reads the clock in Kigali (UTC+2), whatever the machine says', () => {
    expect(clock(kigaliMinute(Date.parse('2026-11-07T05:50:00Z')))).toBe('07:50');
    expect(clock(kigaliMinute(Date.parse('2026-11-07T22:30:00Z')))).toBe('00:30');
  });
  it('starts the day at midnight in Kigali, 22:00 UTC the day before', () => {
    expect(kigaliMidnight(Date.parse('2026-11-07T21:59:00Z'))).toBe(Date.parse('2026-11-06T22:00:00Z'));
    expect(kigaliMidnight(Date.parse('2026-11-07T22:00:00Z'))).toBe(Date.parse('2026-11-07T22:00:00Z'));
  });
});

describe('pickFresh', () => {
  // NOW is 09:00 in Kigali on 10-20, so "yesterday" began at 10-18 22:00 UTC.
  it('posts every postable ad that went up today or yesterday, not an older one', () => {
    const rows = [
      row({ id: 1, postedAt: hoursAgo(2) }),
      row({ id: 2, postedAt: hoursAgo(30), district: 'Kicukiro' }), // 03:00 yesterday
      row({ id: 3, postedAt: hoursAgo(36) }), // 21:00 the day before yesterday
    ];
    const f = pickFresh(rows, {}, new Set(), { floor: 0, now: NOW });
    expect(f.picked.map((r) => r.id).sort()).toEqual([1, 2]);
    expect(f).toMatchObject({ fresh: 2, over: 0, topUp: 0 });
  });
  it("keys on the ad's own date, not on when mkan fetched it", () => {
    const yes = new Set(['kigalihomes']);
    const lead = (id: number, d: number) => row({ id, source: 'TIKTOK', hostSourceId: 'tiktok:kigalihomes', photoUrls: brokerFrames(d), postedAt: hoursAgo(1) });
    // Both were fetched an hour ago; only the video posted today is today's ad.
    const f = pickFresh([lead(1, 0.2), lead(2, 3)], {}, yes, { floor: 0, now: NOW });
    expect(f.picked.map((r) => r.id)).toEqual([1]);
  });
  it("still needs the broker's YES for a broker's ad", () => {
    const lead = row({ id: 1, source: 'TIKTOK', hostSourceId: 'tiktok:kigalihomes', photoUrls: brokerFrames(0.2) });
    expect(pickFresh([lead], {}, new Set(), { floor: 0, now: NOW }).picked).toEqual([]);
  });
  it('caps the day at the ceiling and keeps the rest for the next pick', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row({ id: i + 1, postedAt: hoursAgo(1) }));
    const f = pickFresh(rows, {}, new Set(), { now: NOW });
    expect(f.picked).toHaveLength(POSTS_CEILING);
    expect(f.over).toBe(20 - POSTS_CEILING);
  });
  it("adds to today's queue without passing the ceiling", () => {
    const rows = Array.from({ length: 5 }, (_, i) => row({ id: i + 1, postedAt: hoursAgo(1) }));
    expect(pickFresh(rows, {}, new Set(), { already: POSTS_CEILING - 2, now: NOW }).picked).toHaveLength(2);
    expect(pickFresh(rows, {}, new Set(), { already: POSTS_CEILING, now: NOW }).picked).toEqual([]);
  });
  it('tops a thin day up to the floor from the older pool', () => {
    const rows = [row({ id: 1, postedAt: hoursAgo(1) }), row({ id: 2, postedAt: daysAgo(4) }), row({ id: 3, postedAt: daysAgo(5) })];
    const f = pickFresh(rows, {}, new Set(), { floor: 3, now: NOW });
    expect(f).toMatchObject({ fresh: 1, topUp: 2 });
    expect(f.picked[0]!.id).toBe(1);
  });
  it('leaves out a home that is posted, queued, or rejected', () => {
    const rows = [row({ id: 1, postedAt: hoursAgo(1) }), row({ id: 2, postedAt: hoursAgo(1) }), row({ id: 3, postedAt: hoursAgo(1) })];
    const ledger: Ledger = {
      K1: { listingId: 1, district: 'Gasabo', queuedAt: hoursAgo(2), postedAt: hoursAgo(1) },
      K2: { listingId: 2, district: 'Gasabo', queuedAt: hoursAgo(2) },
      K3: { listingId: 3, district: 'Gasabo', queuedAt: daysAgo(5), rejectedAt: daysAgo(5) },
    };
    expect(pickFresh(rows, ledger, new Set(), { floor: 0, now: NOW }).picked).toEqual([]);
  });
});

describe('a rejected render rests', () => {
  it('rests like a posted home, where a plain queued one frees up after 3 days', () => {
    const queued: Ledger = { K1: { listingId: 1, district: 'Gasabo', queuedAt: daysAgo(5) } };
    const rejected: Ledger = { K1: { ...queued.K1!, rejectedAt: daysAgo(5) } };
    expect(pickToday([row({ id: 1 })], queued, new Set(), 3, NOW)).toHaveLength(1);
    expect(pickToday([row({ id: 1 })], rejected, new Set(), 3, NOW)).toHaveLength(0);
  });
});

describe('slotQuota', () => {
  const at = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
  /** One day of slots: what each slot posts (by "HH:MM"), given the slots that run. */
  const day = (total: number, runs: readonly number[] = SLOT_TIMES) => {
    let out = 0;
    const posts: Record<string, number> = {};
    for (const t of runs) {
      const q = slotQuota(total, out, t);
      posts[clock(t)] = q;
      out += q;
    }
    return { out, posts };
  };
  it('has 14 slots, 10 of them from 17:00, when Kigali scrolls', () => {
    expect(SLOT_TIMES.map(clock)).toEqual(['07:00', '08:30', '12:30', '13:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30']);
    expect(SLOT_TIMES.filter((t) => t >= EVENING_FROM)).toHaveLength(10);
  });
  it('puts most of an 11-home day in the evening, one at a time', () => {
    const { out, posts } = day(11);
    expect(out).toBe(11);
    expect(Math.max(...Object.values(posts))).toBe(1);
    const evening = Object.entries(posts).filter(([t, q]) => q && at(t) >= EVENING_FROM).length;
    expect(evening).toBeGreaterThanOrEqual(7);
    expect(posts['07:00']).toBe(1);
  });
  it('spreads a 3-home day through the day, not all in the morning', () => {
    const { posts } = day(3);
    expect(Object.entries(posts).filter(([, q]) => q).map(([t]) => t)).toEqual(['07:00', '17:00', '19:30']);
  });
  it('a full 15-home day posts every home by 21:30, never more than two at once', () => {
    const { out, posts } = day(POSTS_CEILING);
    expect(out).toBe(POSTS_CEILING);
    expect(Math.max(...Object.values(posts))).toBe(2);
  });
  it('a missed day catches up two at a time and still finishes the evening', () => {
    const { out, posts } = day(12, SLOT_TIMES.filter((t) => t >= EVENING_FROM));
    expect(out).toBe(12);
    expect(posts['17:00']).toBe(2);
    expect(Math.max(...Object.values(posts))).toBe(2);
  });
  it('posts nothing before the first slot, or once the day is out', () => {
    expect(slotQuota(5, 0, at('06:00'))).toBe(0);
    expect(slotQuota(5, 5, at('12:30'))).toBe(0);
    expect(slotQuota(0, 0, at('12:30'))).toBe(0);
  });
  it('a late run after the last slot still posts at most two', () => {
    expect(slotQuota(10, 4, at('23:00'))).toBe(2);
  });
});

describe('nextSlotGap / aheadRenders', () => {
  const at = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
  it('measures the minutes to the next slot, none after the last', () => {
    expect(nextSlotGap(at('07:00'))).toBe(90);
    expect(nextSlotGap(at('13:30'))).toBe(210);
    expect(nextSlotGap(at('21:00'))).toBe(30);
    expect(nextSlotGap(at('21:30'))).toBeNull();
  });
  it('renders up to 3 ahead before an hour-long gap, 1 before a half-hour one', () => {
    expect(aheadRenders(90, 10)).toBe(3);
    expect(aheadRenders(60, 2)).toBe(2);
    expect(aheadRenders(30, 10)).toBe(1);
  });
  it('renders nothing after the last slot, too close to the next one, or with nothing left', () => {
    expect(aheadRenders(null, 5)).toBe(0);
    expect(aheadRenders(15, 5)).toBe(0);
    expect(aheadRenders(90, 0)).toBe(0);
  });
});

describe('repostReach / repostLine / codePattern', () => {
  // NOW is 09:00 in Kigali. A post `d` days back at 09:00 is a day post; 10 hours later, an evening one.
  const post = (d: number, views: number | null, evening = false) => ({ postedAt: NOW - d * 86_400_000 + (evening ? 10 * 3_600_000 : 0), views });
  it('splits the last week, posts a day or more old, into day and evening medians', () => {
    const r = repostReach([post(2, 40), post(3, 60), post(2, 120, true), post(4, 160, true), post(0.5, 5)], NOW);
    expect(r).toMatchObject({ week: 4, median: 90, dayMedian: 50, eveningMedian: 140, prevMedian: null, halved: false });
  });
  it('flags reach halved week over week, only with 10 posts in each week', () => {
    const lastWeek = Array.from({ length: 10 }, (_, i) => post(1.5 + (i % 6), 40));
    const before = Array.from({ length: 10 }, (_, i) => post(8.5 + (i % 6), 100));
    expect(repostReach([...lastWeek, ...before], NOW).halved).toBe(true);
    expect(repostReach([...lastWeek.slice(1), ...before], NOW).halved).toBe(false);
  });
  it('reads as one line, with the warning only when reach halved', () => {
    const halved = { week: 12, median: 40, dayMedian: 30, eveningMedian: 50, prevMedian: 100, halved: true };
    expect(repostLine(halved, 2)).toContain('median 40 views (day 30, evening 50; the week before 100)');
    expect(repostLine(halved, 2)).toContain('⚠️');
    expect(repostLine({ ...halved, halved: false }, null)).not.toMatch(/⚠️|chats/);
  });
  it('matches the codes as a chat quotes them', () => {
    expect(codePattern(['K6552', 'K6571', '0005-01', 'K6552'])).toBe('\\m(k[ -]?6552|k[ -]?6571|0005-01)\\M');
    expect(codePattern([])).toBeNull();
  });
});

describe('dayPieces', () => {
  it("reads each queued home's state from the day's folder", () => {
    const files = ['K1.mp4', 'K1.txt', 'K2.mp4', 'K3.rejected', 'K4.mp4', 'K4.txt', 'K5.error'];
    // K2 has no caption yet: its render is still running.
    expect(dayPieces(['K1', 'K2', 'K3', 'K4', 'K5'], files, { K1: hoursAgo(1) }, {})).toEqual({ total: 4, out: 1, ready: ['K4'], todo: ['K2', 'K5'], rejected: 1 });
  });
  it('counts a clicked post as out, and a posted one even with a stale marker', () => {
    expect(dayPieces(['K1', 'K2'], ['K1.rejected', 'K2.mp4', 'K2.txt'], { K1: hoursAgo(1) }, { K2: hoursAgo(1) })).toMatchObject({ total: 2, out: 2, ready: [], todo: [] });
  });
});

describe('a day ahead: why homes stall and the buffer that covers it', () => {
  it('reads DNS and timeout failures as network, so a sleeping Mac never rejects a live video', () => {
    // the five 11-07 "could not be fetched" rejections, in yt-dlp's own words
    expect(fetchFailure('ERROR: [TikTok] 77: Unable to download webpage: Failed to perform, curl: (6) Could not resolve host: www.tiktok.com')).toBe('network');
    expect(fetchFailure('ERROR: [TikTok] 77: Unable to download webpage: Failed to perform, curl: (28) Resolving timed out after 30000 milliseconds')).toBe('network');
    expect(fetchFailure('ERROR: Unable to download JSON metadata: Failed to resolve (nodename nor servname provided, or not known)')).toBe('network');
  });
  it('still calls a deleted or private video gone', () => {
    expect(fetchFailure('ERROR: [TikTok] 77: Video not available')).toBe('gone');
    expect(fetchFailure('ERROR: This video is private')).toBe('gone');
    expect(fetchFailure('')).toBe('gone');
    expect(fetchFailure(undefined)).toBe('gone');
  });
  it('renders tomorrow only once today has nothing to render or three videos waiting', () => {
    expect(bufferPlan({ live: 0, ready: 0 }, { todo: 2, ready: 1 }, 20 * 60, 60)).toMatchObject({ missing: 3, pick: false, render: 0 });
    expect(bufferPlan({ live: 0, ready: 0 }, { todo: 0, ready: 0 }, 18 * 60, 90)).toMatchObject({ missing: 3, pick: true, render: 3 });
    // today still has a home to render, but five videos already wait to post: tomorrow does not starve
    expect(bufferPlan({ live: 0, ready: 0 }, { todo: 1, ready: 5 }, 14 * 60, 180)).toMatchObject({ pick: true, render: 3 });
  });
  it('keeps the margin before the next slot, and renders it all after the last', () => {
    expect(bufferPlan({ live: 3, ready: 0 }, { todo: 0, ready: 0 }, 19 * 60 + 40, 20)).toMatchObject({ render: 1 });
    expect(bufferPlan({ live: 3, ready: 0 }, { todo: 0, ready: 0 }, 19 * 60 + 50, 10)).toMatchObject({ render: 0 });
    expect(bufferPlan({ live: 3, ready: 0 }, { todo: 0, ready: 0 }, 21 * 60 + 30, null)).toMatchObject({ render: 3 });
  });
  it('only picks when the queue is under the floor, and asks for no more than is missing', () => {
    expect(bufferPlan({ live: 3, ready: 1 }, { todo: 0, ready: 0 }, 18 * 60, 90)).toMatchObject({ missing: 2, pick: false, render: 2 });
    expect(bufferPlan({ live: 2, ready: 2 }, { todo: 0, ready: 0 }, 18 * 60, 90)).toMatchObject({ missing: 1, pick: true });
    expect(bufferPlan({ live: 5, ready: 3 }, { todo: 0, ready: 0 }, 18 * 60, 90)).toMatchObject({ missing: 0, render: 0, alert: false });
  });
  it('alerts at 21:00 Kigali, not before, and only while fewer than three are ready', () => {
    expect(bufferPlan({ live: 3, ready: 2 }, { todo: 0, ready: 0 }, 20 * 60 + 59, 1).alert).toBe(false);
    expect(bufferPlan({ live: 3, ready: 2 }, { todo: 0, ready: 0 }, 21 * 60, 30).alert).toBe(true);
    expect(bufferPlan({ live: 3, ready: 3 }, { todo: 0, ready: 0 }, 21 * 60, 30).alert).toBe(false);
  });
  it('settles PICKED rows from the day folder, and leaves the rest alone', () => {
    const rows = [
      { id: 'a', ref: 'K1', status: 'PICKED' },
      { id: 'b', ref: 'K2', status: 'PICKED' },
      { id: 'c', ref: 'K3', status: 'PICKED' },
      { id: 'd', ref: 'K4', status: 'POSTED' },
      { id: 'e', ref: 'K5', status: 'PICKED' },
    ];
    const files = ['K1.mp4', 'K1.txt', 'K2.rejected', 'K4.mp4', 'K4.txt', 'K5.mp4']; // K5 has no caption yet: not finished
    expect(ledgerFixes(rows, files, { K2: 'video gone' })).toEqual([
      { id: 'a', ref: 'K1', status: 'CLEAN' },
      { id: 'b', ref: 'K2', status: 'REJECTED', reason: 'video gone' },
    ]);
  });
  it('writes the shortfall line with counts only', () => {
    const line = shortfallLine('mkan.rw', '2026-11-09', 1, 3, { 'video not fetched': 2, 'render error': 0 });
    expect(line).toContain('1 of 3 clean videos ready for 2026-11-09 at 21:00 Kigali');
    expect(line).toContain('3 homes queued, stalled today: 2 video not fetched');
    expect(line).not.toContain('render error');
    expect(shortfallLine('mkan.rw', '2026-11-09', 0, 1, {})).toContain('1 home queued)');
  });
});
