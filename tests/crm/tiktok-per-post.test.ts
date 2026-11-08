/** Per-post numbers: caption marks, Studio payload parser, interaction rate. Fixtures are made up. */
import { describe, expect, it } from 'vitest';
import { FOLLOW_ASK, bestWorst, captionFor, captionMarks, interactionRate, parseStudioMetrics, type PostRow } from '../../scripts/crm/tiktok-post-pure';

describe('captionMarks', () => {
  it('reads the follow ask and the WhatsApp line number from a live caption', () => {
    const t = `🏠 House — Kimironko\n📲 WhatsApp +250700000000 — send "K1234"\n💰 RWF 400,000 / month\n${FOLLOW_ASK}\n\n#kigali`;
    expect(captionMarks(t)).toEqual({ askFollow: true, waLine: 2 });
  });
  it('flags the old third-line layout and a missing ask', () => {
    const t = `🏠 House\n💰 RWF 1\n📲 WhatsApp +250700000000 — send "K1"\n#kigali`;
    expect(captionMarks(t)).toEqual({ askFollow: false, waLine: 3 });
    expect(captionMarks(null)).toEqual({ askFollow: false, waLine: null });
  });
  it('agrees with captionFor', () => {
    const r = { id: 1, bedrooms: 2, priceMonth: 400000, area: 'Kimironko', district: 'Gasabo', hostSourceId: null } as unknown as PostRow;
    expect(captionMarks(captionFor(r, '+250700000000', true, false))).toEqual({ askFollow: true, waLine: 2 });
    expect(captionMarks(captionFor(r, '+250700000000', false, true))).toEqual({ askFollow: false, waLine: 2 });
  });
});

describe('parseStudioMetrics', () => {
  it('finds nested fields, converts percent and milliseconds', () => {
    const m = parseStudioMetrics({ data: { overview: { favorites: { value: 7 }, average_watch_time: 4200, finish_rate: 31.5 }, list: [{ comments: 2, shares: 1 }] } });
    expect(m).toEqual({ saves: 7, avgWatchSec: 4.2, completion: 0.315, comments: 2, shares: 1 });
  });
  it('leaves unknown fields undefined, never 0', () => {
    expect(parseStudioMetrics([{ foo: 1 }, null, 'x'])).toEqual({});
    expect(parseStudioMetrics(undefined)).toEqual({});
  });
  it('keeps a completion already in 0..1 and survives cycles', () => {
    const a: Record<string, unknown> = { completion_rate: '0.4' };
    a.self = a;
    expect(parseStudioMetrics(a).completion).toBe(0.4);
  });
});

describe('interactionRate / bestWorst', () => {
  it('sums likes, comments, shares, saves over views', () => {
    expect(interactionRate({ views: 200, likes: 6, comments: 2, shares: 1, saves: 1 })).toBe(0.05);
    expect(interactionRate({ views: 0, likes: 3 })).toBeNull();
  });
  it('ranks posts and skips tiny ones', () => {
    const a = { views: 100, likes: 10 };
    const b = { views: 100, likes: 1 };
    const tiny = { views: 5, likes: 5 };
    expect(bestWorst([b, tiny, a])).toEqual({ best: a, worst: b });
    expect(bestWorst([tiny])).toBeNull();
  });
});
