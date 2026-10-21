/**
 * Who wins a field when Claude has read the message: Claude's reading, with
 * the rules filling only words they rarely misread — never money. The reader
 * is mocked; the database too.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Candidate } from '@/components/agent/rank';
import type { Reading } from '@/components/agent/reader';

const search = vi.fn();
const read = vi.fn();
vi.mock('@/components/agent/search', () => ({
  searchKigali: (...a: unknown[]) => search(...a),
  toShortlist: vi.fn(async () => [{ id: 7, availability: 'unconfirmed' }]),
}));
vi.mock('@/components/agent/reader', () => ({ readRequirements: (...a: unknown[]) => read(...a) }));
vi.mock('@/components/agent/broker', () => ({ requestConfirmations: vi.fn(async () => []) }));
const findUnique = vi.fn();
const createMany = vi.fn(async () => ({}));
vi.mock('@/lib/db', () => ({
  db: {
    agentTask: { findUnique: (...a: unknown[]) => findUnique(...a), update: vi.fn(async () => ({})) },
    agentEvent: {
      create: vi.fn(async () => ({ id: 1 })),
      update: vi.fn(async () => ({})),
      createMany: (...a: unknown[]) => createMany(...(a as [])),
      findFirst: vi.fn(async () => null),
    },
    $transaction: vi.fn(async () => undefined),
  },
}));

const home = { id: 7, hostId: 'h', rentPeriod: 'MONTHLY', priceMonth: 380_000, pricePerNight: null, monthlyDiscount: null, cleaningFee: null, bedrooms: 2, guestCount: 4, district: 'Kicukiro', bathrooms: 1, averageRating: 0, numberOfReviews: 0, confirmedAt: null } as unknown as Candidate;

const claude = (over: Partial<Reading>): Reading => ({
  by: 'claude',
  set: {},
  clear: [],
  like: null,
  notLike: null,
  remember: [],
  forget: [],
  intent: 'search',
  question: null,
  lang: 'en',
  unplaced: null,
  ...over,
});

const turn = async (text: string, memory: unknown = null) => {
  findUnique.mockResolvedValueOnce({ id: 't1', locale: 'en', messages: [{ role: 'user', text, at: '' }], requirements: null, shortlist: null, profileId: 'p1', profile: { memory }, events: [] });
  search.mockResolvedValue({ candidates: [home], truncated: false });
  const { runTurn } = await import('@/components/agent/run');
  await runTurn('t1');
  return search.mock.calls[0]![0] as Record<string, unknown>;
};

beforeEach(() => {
  search.mockReset();
  read.mockReset();
  createMany.mockClear();
});

describe('with a Claude reading', () => {
  it('a phone number never becomes a budget', async () => {
    read.mockResolvedValueOnce(claude({ set: { bedrooms: 2 } }));
    const query = await turn('2 bedroom in Kicukiro, call me on 0788123456');
    expect(query.maxPrice).toBeNull();
    expect(query).toMatchObject({ bedrooms: 2, district: 'KICUKIRO' });
  });

  it('the model\'s reading beats the rules on a field both read', async () => {
    // "in 10 days" — the rules read 10 nights; the model reads a move-in date and a monthly stay.
    read.mockResolvedValueOnce(claude({ set: { stay: 'long', moveIn: '2026-10-31', bedrooms: 1 } }));
    const query = await turn('1 bedroom, moving in 10 days');
    expect(query).toMatchObject({ stay: 'long', moveIn: '2026-10-31', bedrooms: 1, nights: null });
  });

  it('says which fields came from memory', async () => {
    const memory = { prefs: { maxPrice: { value: 500_000, at: '2026-10-01T00:00:00.000Z', source: 'said' }, pricePeriod: { value: 'month', at: '2026-10-01T00:00:00.000Z', source: 'said' } } };
    read.mockResolvedValueOnce(claude({ set: { maxPrice: 500_000, pricePeriod: 'month', bedrooms: 2 } }));
    await turn('a 2 bedroom with parking', memory);
    const rows = createMany.mock.calls.flatMap((c) => (c as unknown as [{ data: { kind: string; payload: unknown }[] }])[0].data);
    expect(rows.find((r) => r.kind === 'memory_used')?.payload).toEqual({ fields: ['maxPrice', 'pricePeriod'] });
  });

  it('a place the Groq fallback invents is dropped', async () => {
    // Seen on the test branch: "near Kigali Heights" came back from Groq as Kicukiro.
    read.mockResolvedValueOnce(claude({ by: 'groq', set: { neighbourhood: 'Kicukiro', district: 'KICUKIRO', bedrooms: 2 } }));
    const query = await turn('2 bedroom near Kigali Heights');
    expect(query).toMatchObject({ neighbourhood: null, district: null, bedrooms: 2 });
  });

  it('without a model, the rules read alone (and still read money)', async () => {
    read.mockResolvedValueOnce(null);
    const query = await turn('2 bedroom in Kicukiro under 400k a month');
    expect(query).toMatchObject({ maxPrice: 400_000, pricePeriod: 'month', bedrooms: 2 });
  });
});
