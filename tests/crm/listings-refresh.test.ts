import { describe, it, expect } from 'vitest';
import { pickSlice, goneVerdict, diffFields } from '../../scripts/crm/listings-refresh-pure';

const d = (s: string) => new Date(s);
const NOW = d('2026-11-15T00:00:00Z');

describe('pickSlice', () => {
  const rows = Array.from({ length: 70 }, (_, i) => ({ id: `r${String(i).padStart(2, '0')}`, sourceCapturedAt: i % 2 ? d(`2026-10-${10 + (i % 15)}`) : null }));
  it('sizes to ceil(total/days), never-checked first, then oldest', () => {
    const s = pickSlice(rows, NOW, { days: 7 });
    expect(s).toHaveLength(10);
    expect(s.every((r) => r.sourceCapturedAt === null)).toBe(true);
  });
  it('orders by age', () => {
    const s = pickSlice([{ id: 'b', sourceCapturedAt: d('2026-10-20') }, { id: 'a', sourceCapturedAt: d('2026-10-01') }, { id: 'c', sourceCapturedAt: d('2026-10-30') }], NOW, { days: 1 });
    expect(s.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('is capped', () => expect(pickSlice(rows, NOW, { days: 7, cap: 4 })).toHaveLength(4));
  it('rounds up', () => expect(pickSlice(rows.slice(0, 15), NOW, { days: 7 })).toHaveLength(3));
  it('handles empty', () => expect(pickSlice([], NOW, { cap: 5 })).toEqual([]));
});

describe('goneVerdict', () => {
  it('one miss is not gone', () => expect(goneVerdict({ misses: 0 }, { kind: 'unavailable' })).toEqual({ misses: 1, gone: false }));
  it('two consecutive misses are gone', () => expect(goneVerdict({ misses: 1 }, { kind: 'not-found' })).toEqual({ misses: 2, gone: true }));
  it('ok resets', () => expect(goneVerdict({ misses: 1 }, { kind: 'ok' })).toEqual({ misses: 0, gone: false }));
  it('blocked and errors change nothing', () => {
    expect(goneVerdict({ misses: 1 }, { kind: 'blocked' })).toEqual({ misses: 1, gone: false });
    expect(goneVerdict({ misses: 1 }, { kind: 'error' })).toEqual({ misses: 1, gone: false });
  });
});

describe('diffFields', () => {
  const old = { pricePerNight: 100, photoUrls: ['a', 'b', 'c'], averageRating: 4.5, numberOfReviews: 10, title: 'T', description: 'D' };
  it('returns nothing when equal', () => expect(diffFields(old, { ...old })).toEqual({}));
  it('returns only changed fields', () => expect(diffFields(old, { ...old, averageRating: 4.6, numberOfReviews: 12 })).toEqual({ averageRating: 4.6, numberOfReviews: 12 }));
  it('keeps photo order significant', () => expect(diffFields(old, { photoUrls: ['b', 'a', 'c'] })).toEqual({ photoUrls: ['b', 'a', 'c'] }));
  it('never drops to fewer than 3 photos', () => expect(diffFields(old, { photoUrls: ['a', 'b'] })).toEqual({}));
  it('ignores empty title/description and missing fresh values', () => {
    expect(diffFields(old, { title: '  ', description: '', averageRating: null, pricePerNight: null })).toEqual({});
  });
  it('takes a non-empty new title', () => expect(diffFields(old, { title: 'New' })).toEqual({ title: 'New' }));
  it('price change', () => expect(diffFields(old, { pricePerNight: 120 })).toEqual({ pricePerNight: 120 }));
});
