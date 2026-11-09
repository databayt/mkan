/**
 * Format v2 of the Kigali TikTok page (2026-11-09): the glass card's pure core. Fixtures are made
 * up (the repo is public): numbers and handles are in the real shapes only.
 */
import { describe, expect, it } from 'vitest';

import type { PostRow } from '../../scripts/crm/tiktok-post-pure';
import { CARD, FRAME, SAFE, cardLines, cardTint, displacementMaps, glassGraph, luminance, placeName, roundedRectSdf } from '../../scripts/crm/tiktok-v2-pure';

const row = (over: Partial<PostRow> = {}): PostRow =>
  ({
    id: 6527,
    code: null,
    source: 'TIKTOK',
    priceMonth: 700_000,
    bedrooms: 2,
    bathrooms: 1,
    propertyType: 'Apartment',
    photoUrls: [],
    area: 'Nyamirambo',
    district: 'Nyarugenge',
    hostSourceId: 'tiktok:somebroker',
    postedAt: null,
    lostAt: null,
    ...over,
  }) as PostRow;

describe('the glass card', () => {
  it('says price, home and area, then WhatsApp and the code — no emoji', () => {
    const l = cardLines(row(), '+250 788 000 000');
    expect(l).toEqual({ price: 'RWF 700,000 / month', home: '2-bedroom apartment · Nyamirambo', contact: 'WhatsApp +250 788 000 000 · send', code: 'K6527' });
    expect(Object.values(l).join(' ')).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('writes a place as people do, and falls back to the district, then Kigali', () => {
    expect(placeName('NYAMIRAMBO')).toBe('Nyamirambo');
    expect(placeName('kicukiro, gikondo')).toBe('Kicukiro, Gikondo');
    expect(cardLines(row({ area: null, district: 'gasabo', bedrooms: null, propertyType: 'House' }), '+250 788 000 000').home).toBe('house · Gasabo');
    expect(cardLines(row({ area: null, district: null }), '+250 788 000 000').home).toBe('2-bedroom apartment · Kigali');
  });

  it("sits inside TikTok's safe area", () => {
    expect(CARD.x).toBeGreaterThanOrEqual(SAFE.left);
    expect(CARD.x + CARD.w).toBeLessThanOrEqual(SAFE.right);
    expect(CARD.y).toBeGreaterThanOrEqual(SAFE.top);
    expect(CARD.y + CARD.h + CARD.rise).toBeLessThanOrEqual(SAFE.bottom + CARD.rise);
    expect(CARD.y + CARD.h).toBeLessThanOrEqual(SAFE.bottom);
    expect(CARD.x + CARD.w).toBeLessThanOrEqual(FRAME.w);
  });

  it('darkens its glass just enough for white text over bright rooms, and always reads as glass', () => {
    expect(cardTint(0.05)).toBe(0.22); // a dark room: the lightest glass
    expect(cardTint(0.3)).toBe(0.22);
    const bright = cardTint(0.6);
    expect(bright).toBeGreaterThan(0.45);
    expect(bright).toBeLessThanOrEqual(0.62);
    expect(cardTint(1)).toBe(0.62); // never so dark that the room stops showing through
    expect(luminance(255, 255, 255)).toBeCloseTo(1);
    expect(luminance(0, 0, 0)).toBe(0);
  });

  it('bends the picture only along the rim, inward, and leaves the centre alone', () => {
    const w = 120, h = 60, r = 20;
    expect(roundedRectSdf(60, 30, w, h, r)).toBeLessThan(0);
    expect(roundedRectSdf(-5, 30, w, h, r)).toBeGreaterThan(0);
    const { dx, dy } = displacementMaps(w, h, r, 12, 8);
    expect(dx[30 * w + 60]).toBe(128);
    expect(dy[30 * w + 60]).toBe(128);
    // Left edge samples from the right (further in), right edge from the left: mirror images.
    const left = dx[30 * w + 2]!;
    const right = dx[30 * w + (w - 3)]!;
    expect(left).toBeGreaterThan(128);
    expect(right).toBeLessThan(128);
    expect(left - 128).toBe(128 - right);
    // Top edge samples from below.
    expect(dy[2 * w + 60]!).toBeGreaterThan(128);
  });

  it('lays the card on with the only blur inside it, and nothing wiped', () => {
    const g = glassGraph({ shadow: 1, dx: 2, dy: 3, mask: 4, face: 5, shadowPad: 60 });
    expect(g).not.toMatch(/delogo|boxblur|avgblur/);
    // One gblur, on the crop under the card.
    expect(g.match(/gblur/g)).toHaveLength(1);
    expect(g).toMatch(new RegExp(`\\[under\\]crop=${CARD.w + 48}:${CARD.h + 48}:${CARD.x - 24}:${CARD.y - 24},gblur`));
    expect(g).toMatch(/displace=edge=smear/);
    expect(g).toMatch(/alphamerge,fade=t=in:st=0.6/);
    expect(g.endsWith('[v]')).toBe(true);
  });
});

describe('the sound at upload', () => {
  it("reads Studio's sound rows", async () => {
    const { parseSoundRow } = await import('../../scripts/crm/tiktok-v2-pure');
    expect(parseSoundRow('Gym Motivation (Discipline) 01:00 · Young Twin Stylez')).toEqual({ title: 'Gym Motivation (Discipline)', artist: 'Young Twin Stylez', secs: 60 });
    expect(parseSoundRow('Ordinary (Wedding Verrson)\n01:00 · Alex Warren')).toEqual({ title: 'Ordinary (Wedding Verrson)', artist: 'Alex Warren', secs: 60 });
    expect(parseSoundRow('no duration here')).toBeNull();
  });

  it('takes the first fresh, long-enough track that is not an original sound', async () => {
    const { pickSound } = await import('../../scripts/crm/tiktok-v2-pure');
    const rows = [
      { title: 'original sound - someone', artist: 'Someone', secs: 60 },
      { title: 'Short Loop', artist: 'A', secs: 12 },
      { title: 'Used Yesterday', artist: 'B', secs: 60 },
      { title: 'Fresh Hit', artist: 'C', secs: 60 },
    ];
    const now = Date.parse('2026-11-10T12:00:00Z');
    const used = [{ ref: 'K1', title: 'Used Yesterday', artist: 'B', at: '2026-11-09T18:00:00Z' }];
    expect(pickSound(rows, used, 20, now)).toBe(3);
    // A week later the used one is fresh again; a denylisted one is skipped.
    expect(pickSound(rows, [{ ...used[0]!, at: '2026-11-01T18:00:00Z' }], 20, now)).toBe(2);
    expect(pickSound(rows, [], 20, now, [/used yesterday/i])).toBe(3);
    // A 45 s video needs a 45 s track; a 90 s one needs a full minute (Studio's longest is often 1:00).
    expect(pickSound([{ title: 'Half', artist: 'D', secs: 40 }], [], 45, now)).toBe(-1);
    expect(pickSound([{ title: 'Minute', artist: 'E', secs: 60 }], [], 90, now)).toBe(0);
  });
});

// ── the detector and the plan, on real measurements (digits, @handles and a brand masked) ──────
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyTrack, cleanPlan, persistentStatic, qaProblems, sameBlock, trackLines, type Measure, type MeasuredLine, type Track } from '../../scripts/crm/tiktok-v2-pure';

const fixture = (name: string): Measure => JSON.parse(readFileSync(join(__dirname, 'fixtures', 'tiktok-v2', `${name}.json`), 'utf8')) as Measure;
const covers = (rect: [number, number, number, number], x: number, y: number) => x >= rect[0] && x <= rect[0] + rect[2] && y >= rect[1] && y <= rect[1] + rect[3];

describe('added or in the scene (rules)', () => {
  const m = { w: 576, h: 1024, fps: 30, frames: 300, ocrStep: 10, lines: [], motion: [], cuts: [], staticWindows: [], cell: { div: 8, w: 72, h: 128 } } as Measure;
  const line = (over: Partial<MeasuredLine> = {}): MeasuredLine => ({ f: 0, t: 0, text: 'Nice view', conf: 0.95, box: [100, 500, 200, 30], quad: [], angle: 0, trap: 0, ringTex: 20, votes: [], presence: [], looks: {}, ...over });
  const track = (...lines: MeasuredLine[]): Track => ({ lines, f0: lines[0]!.f, f1: lines[lines.length - 1]!.f, text: lines[0]!.text });

  it('a line that stays pixel-identical while the picture around it changes was laid on top', () => {
    const held = [{ d: 6, dir: 'next' as const, box: 0.99, ring: 0.4 }, { d: 15, dir: 'next' as const, box: 0.98, ring: 0.3 }];
    expect(classifyTrack(track(line({ presence: held }), line({ f: 10, presence: held })), m).kind).toBe('added');
  });

  it('a line that moves with the room is the scene, even with ad words on it', () => {
    const v = { k: 6, d: [12, 0] as [number, number], pred: [12, 0] as [number, number], ringNcc: 0.9, nS: 0.2, nF: 0.95, v: 'follows' as const };
    expect(classifyTrack(track(line({ text: 'HOUSE FOR RENT', votes: [v, v] })), m).kind).toBe('scene');
  });

  it('keeps an unsure line, unless it carries a phone number (it must not reach our page)', () => {
    expect(classifyTrack(track(line({ text: 'Welcome' }), line({ f: 10, text: 'Welcome' })), m).kind).toBe('scene');
    const v = classifyTrack(track(line({ text: 'Call 0700 000 000' }), line({ f: 10, text: 'Call 0700 000 000' })), m);
    expect(v).toMatchObject({ kind: 'added', contact: true });
  });

  it('text in perspective is the scene', () => {
    expect(classifyTrack(track(line({ text: 'PHARMACY', angle: 9, trap: 0.2 }), line({ f: 10, text: 'PHARMACY', angle: 9, trap: 0.2 })), m).kind).toBe('scene');
  });

  it('reads "taken" in Kinyarwanda and English', () => {
    expect(classifyTrack(track(line({ text: 'yabonetse' })), m).taken).toBe(true);
    expect(classifyTrack(track(line({ text: 'Already rented out' })), m).taken).toBe(true);
    expect(classifyTrack(track(line({ text: 'Rooms available' })), m).taken).toBe(false);
  });

  it('stacked lines that come on together are one caption block', () => {
    const a = track(line({ box: [100, 500, 300, 30] }), line({ f: 100, box: [100, 500, 300, 30] }));
    const b = track(line({ box: [110, 540, 280, 30] }), line({ f: 100, box: [110, 540, 280, 30] }));
    const far = track(line({ box: [110, 800, 280, 30] }), line({ f: 100, box: [110, 800, 280, 30] }));
    expect(sameBlock(a, b, m)).toBe(true);
    expect(sameBlock(a, far, m)).toBe(false);
  });

  it("a border's edge in the static map is not a sticker", () => {
    const strip = { f0: 0, f1: 30, rect: [32, 0, 16, 1000] as [number, number, number, number], what: 'x' };
    const logo = { f0: 0, f1: 30, rect: [400, 40, 120, 60] as [number, number, number, number], what: 'x' };
    const rs = [0, 30, 60].flatMap((f) => [{ ...strip, f0: f, f1: f + 30 }, { ...logo, f0: f, f1: f + 30 }]);
    const out = persistentStatic(rs, [], { w: 576, h: 1024 });
    expect(out).toHaveLength(1);
    expect(out[0]!.rect).toEqual([400, 40, 120, 60]);
  });
});

describe('the clean plan on real broker videos', () => {
  it('trims a caption that is only on the first shots (no fill, no blur)', () => {
    const p = cleanPlan(fixture('trim-head'));
    expect(p.mode).toBe('trim');
    expect(p.keep[0]![0]).toBeGreaterThanOrEqual(90);
    expect(p.masks).toHaveLength(0);
  });

  it('trims a caption on the first 3 s of a long shot, and ignores the black bars', () => {
    const m = fixture('caption-first-3s');
    const p = cleanPlan(m);
    expect(p.mode).toBe('trim');
    expect(p.keep[0]![0]).toBeGreaterThanOrEqual(90);
    expect(p.keep.reduce((s, [a, b]) => s + b - a + 1, 0) / m.fps).toBeGreaterThan(40);
  });

  it('clears a seven-line caption block as one region (its inner lines too)', () => {
    const p = cleanPlan(fixture('block-plate'));
    expect(p.mode).toBe('fill');
    expect(p.masks).toHaveLength(1);
    const r = p.masks[0]!.rects[0]!;
    expect(r[1]).toBeLessThanOrEqual(627);
    expect(r[1] + r[3]).toBeGreaterThanOrEqual(899);
  });

  it('clears captions held over the whole video but keeps a sign in the scene', () => {
    const m = fixture('whole-video-captions');
    const p = cleanPlan(m);
    expect(p.mode).toBe('fill');
    expect(p.masks).toHaveLength(2);
    // The sign is the scene: it gets no mask of its own. (Where the camera pans it under a caption's
    // area for a moment, the fill restores the real pixels from other frames — the sign included.)
    const sign = trackLines(m).find((t) => /canal/i.test(t.text))!;
    expect(classifyTrack(sign, m).kind).toBe('scene');
    // Both masks are the two captions (top and bottom bands), none is the sign's.
    expect(p.masks.map((k) => (k.rects[0]![1] < m.h / 2 ? 'top' : 'bottom')).sort()).toEqual(['bottom', 'top']);
  });

  it('cuts the shot with a phone number filmed in the scene, and clears the logo and the price pill', () => {
    const m = fixture('logo-and-scene-number');
    const p = cleanPlan(m);
    expect(p.mode).toBe('fill');
    expect(p.why.join(' ')).toMatch(/cut 1 shot\(s\) with a phone number in the scene/);
    expect(p.keep.some(([a, b]) => a <= 870 && b >= 870)).toBe(false); // the scene number's shot is gone
    // The price pill seen again later (31.7–36.3 s) is cleared too, not left half-done.
    expect(p.masks.some((k) => k.f0 <= 960 && k.f1 >= 1080 && k.rects.some((rc) => covers(rc, 288, 209)))).toBe(true);
  });

  it('a home whose own video says it is taken is skipped', () => {
    const m = fixture('trim-head');
    const taken = { ...m, lines: m.lines.map((l, i) => (i === 0 ? { ...l, text: 'Yabonetse' } : l)) };
    expect(cleanPlan(taken)).toMatchObject({ mode: 'skip', taken: true });
  });

  it('the gate passes a clean video and fails one with a caption left on it', () => {
    expect(qaProblems({ ...fixture('trim-head'), lines: [] })).toEqual([]);
    expect(qaProblems(fixture('top-plate')).length).toBeGreaterThan(0);
  });
});
