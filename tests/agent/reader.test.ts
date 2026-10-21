/**
 * The Claude reader's answer is a proposal: every value is checked in code
 * before it touches the search. No API calls here — the model's output is
 * written by hand.
 */
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ db: {} }));
import { toReading, readerMessage, type ReaderOutput, type ReadInput } from '@/components/agent/reader';
import { EMPTY_REQUIREMENTS } from '@/components/agent/requirements';
import { emptyMemory, rememberTurn } from '@/components/agent/memory';
import { isCreditError, priceOf } from '@/components/agent/claude';
import Anthropic from '@anthropic-ai/sdk';
import type { ShortlistItem } from '@/components/agent/types';

const now = new Date('2026-10-21T09:00:00Z');
const input = (over: Partial<ReadInput> = {}): ReadInput => ({
  latest: '',
  current: { ...EMPTY_REQUIREMENTS },
  history: [],
  shown: [],
  memory: emptyMemory(),
  newChat: true,
  now,
  ...over,
});
const out = (over: Partial<ReaderOutput> = {}): ReaderOutput => ({
  set: [],
  clear: [],
  mustHaves: [],
  currency: 'RWF',
  like: '',
  notLike: '',
  remember: [],
  forget: [],
  intent: 'search',
  question: '',
  lang: 'en',
  ...over,
});
const home = (id: number, over: Partial<ShortlistItem> = {}) =>
  ({ id, path: '/', title: 't', photo: null, district: 'Kicukiro', bedrooms: 2, bathrooms: 1, rating: null, reviews: null, currency: 'RWF', rentPeriod: 'MONTHLY', score: 1, reasons: [], cost: { headline: 450_000, period: 'month' }, duplicates: 0, availability: 'unconfirmed', ...over }) as unknown as ShortlistItem;

describe('reader answer → requirements', () => {
  it('keeps what is valid and drops what is not', () => {
    const r = toReading(
      out({
        set: [
          { field: 'bedrooms', value: '2' },
          { field: 'bathrooms', value: '0' }, // below the minimum
          { field: 'maxPrice', value: '400,000' },
          { field: 'pricePeriod', value: 'month' },
          { field: 'district', value: 'kicukiro' },
          { field: 'stay', value: 'forever' },
          { field: 'furnished', value: 'maybe' },
        ],
      }),
      input(),
    );
    expect(r.set).toEqual({ bedrooms: 2, maxPrice: 400_000, pricePeriod: 'month', district: 'KICUKIRO' });
  });

  it('converts dollars, and refuses a budget no one has', () => {
    expect(toReading(out({ currency: 'USD', set: [{ field: 'maxPrice', value: '800' }, { field: 'pricePeriod', value: 'month' }] }), input()).set.maxPrice).toBe(1_160_000);
    expect(toReading(out({ set: [{ field: 'maxPrice', value: '788123456' }, { field: 'pricePeriod', value: 'night' }] }), input()).set.maxPrice).toBeUndefined();
  });

  it('puts a landmark on the map, a known neighbourhood in the filter, and reports a place it cannot place', () => {
    expect(toReading(out({ set: [{ field: 'near', value: 'KCC' }] }), input()).set.near).toEqual({ name: 'Kigali Convention Centre', lat: -1.9536, lng: 30.0928 });
    expect(toReading(out({ set: [{ field: 'neighbourhood', value: 'kimironko' }] }), input()).set).toEqual({ neighbourhood: 'Kimironko', district: 'GASABO' });
    const placed = toReading(out({ set: [{ field: 'near', value: 'Inema Arts Center' }, { field: 'nearIn', value: 'Kacyiru' }] }), input()).set.near;
    expect(placed).toEqual({ name: 'Inema Arts Center', lat: -1.938, lng: 30.083 });
    const lost = toReading(out({ set: [{ field: 'neighbourhood', value: 'Somewhere Nice' }] }), input());
    expect(lost.set.neighbourhood).toBeUndefined();
    expect(lost.unplaced).toBe('Somewhere Nice');
  });

  it('adds must-haves to the ones already asked for', () => {
    const r = toReading(out({ mustHaves: ['parking', 'waterTank'] }), input({ current: { ...EMPTY_REQUIREMENTS, mustHaves: ['wifi', 'parking'] } }));
    expect(r.set.mustHaves).toEqual(['wifi', 'parking', 'waterTank']);
  });

  it('accepts a move-in date only when it is a real, near date', () => {
    expect(toReading(out({ set: [{ field: 'moveIn', value: '2026-11-01' }] }), input()).set.moveIn).toBe('2026-11-01');
    expect(toReading(out({ set: [{ field: 'moveIn', value: '2025-01-01' }] }), input()).set.moveIn).toBeUndefined();
    expect(toReading(out({ set: [{ field: 'moveIn', value: 'next week' }] }), input()).set.moveIn).toBeUndefined();
  });

  it('"like the second one" borrows its size; refs must point at a shown home', () => {
    const shown = [home(11, { bedrooms: 1 }), home(12, { bedrooms: 3 })];
    const r = toReading(out({ like: 'h2', notLike: 'h5' }), input({ shown }));
    expect(r.like).toBe('h2');
    expect(r.set.bedrooms).toBe(3);
    expect(r.notLike).toBeNull();
  });

  it('only forgets notes that exist, and a cleared field cannot also be set', () => {
    const memory = { ...emptyMemory(), notes: [{ id: 'n1', text: 'has a cat', at: now.toISOString() }] };
    const r = toReading(out({ forget: ['n1', 'n9'], clear: ['maxPrice', 'district'], set: [{ field: 'district', value: 'GASABO' }] }), input({ memory }));
    expect(r.forget).toEqual(['n1']);
    expect(r.clear).toEqual(['maxPrice']);
  });

  it('gives the model the screen as refs and the date in Kigali', () => {
    const text = readerMessage(input({ latest: 'cheaper than h1', shown: [home(1)], newChat: false }));
    expect(text).toContain('Today: 2026-10-21 (Kigali)');
    expect(text).toContain('[h1] 2-bed · Kicukiro · RWF 450,000 a month');
    expect(text).toContain('Newest message: cheaper than h1');
  });
});

describe('memory after a turn', () => {
  it('keeps the settled search, but not a budget priced on a guessed stay', () => {
    const m = rememberTurn(emptyMemory(), { requirements: { stay: 'long', maxPrice: 500_000, bedrooms: 2, district: 'KICUKIRO' }, stayGuessed: true, tapped: false, remember: [], forget: [], shown: [5, 6], now });
    expect(Object.keys(m.prefs).sort()).toEqual(['bedrooms', 'district']);
    expect(m.seen).toEqual([5, 6]);
  });

  it('adds facts without phone numbers and drops the forgotten', () => {
    const before = { ...emptyMemory(), notes: [{ id: 'old', text: 'works in Remera', at: '2026-10-01T00:00:00.000Z' }] };
    const m = rememberTurn(before, { requirements: {}, stayGuessed: false, tapped: false, remember: ['works at Kigali Heights, call 0788123456'], forget: ['old'], shown: [], now });
    expect(m.notes.map((n) => n.text)).toEqual(['works at Kigali Heights, call']);
  });
});

describe('the spend ledger', () => {
  it('prices a Haiku 5.5 read', () => {
    // 3,000 in + 600 out + 2,000 cached = 0.0003 + 0.0003 + 0.00002
    expect(priceOf({ input_tokens: 3_000, output_tokens: 600, cache_read_input_tokens: 2_000, cache_creation_input_tokens: 0 })).toBeCloseTo(0.00062, 6);
  });

  it('reads "out of credits" as the cap, not as an error to retry', () => {
    expect(isCreditError(new Anthropic.APIError(402, undefined, 'payment required', new Headers()))).toBe(true);
    expect(isCreditError(new Anthropic.BadRequestError(400, undefined, 'Your credit balance is too low', new Headers()))).toBe(true);
    expect(isCreditError(new Anthropic.RateLimitError(429, undefined, 'slow down', new Headers()))).toBe(false);
  });
});
