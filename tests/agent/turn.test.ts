/**
 * The agent's database-shaped behaviour with the database mocked: a zero-match
 * turn loads one pool for every widening, and the broker loop picks who to ask.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Candidate } from '@/components/agent/rank';

const search = vi.fn();
vi.mock('@/components/agent/search', () => ({
  searchKigali: (...a: unknown[]) => search(...a),
  toShortlist: vi.fn(async () => []),
}));
vi.mock('@/components/agent/llm', () => ({ readRequirementsWithGroq: vi.fn(async () => null) }));
vi.mock('@/components/agent/broker', () => ({ requestConfirmations: vi.fn(async () => []) }));
const update = vi.fn(async () => ({}));
const executeRaw = vi.fn(async () => 1);
vi.mock('@/lib/db', () => ({
  db: {
    $executeRaw: (...a: unknown[]) => executeRaw(...(a as [])),
    agentTask: {
      findUnique: vi.fn(async () => ({
        id: 't1',
        locale: 'en',
        messages: [{ role: 'user', text: 'a 3 bedroom house for a year in Kimihurura with 3 bathrooms under 300k', at: '' }],
        requirements: null,
        events: [],
      })),
      update,
    },
    agentEvent: {
      create: vi.fn(async () => ({ id: 1 })),
      update: vi.fn(async () => ({})),
      createMany: vi.fn(async () => ({})),
      findFirst: vi.fn(async () => null),
    },
  },
}));

const home = (over: Partial<Candidate>): Candidate =>
  ({ id: 1, hostId: 'h', rentPeriod: 'MONTHLY', priceMonth: 380_000, pricePerNight: null, monthlyDiscount: null, cleaningFee: null, bedrooms: 3, guestCount: 6, district: 'Gasabo', bathrooms: 2, averageRating: 4.5, numberOfReviews: 3, confirmedAt: null, ...over }) as Candidate;

describe('zero-match widening', () => {
  beforeEach(() => search.mockReset());

  it('ranks every widening against one wide load', async () => {
    // The first, exact search finds nothing; the wide pool has a home the
    // budget widening (or dropping the neighbourhood) lets through.
    search.mockResolvedValueOnce({ candidates: [], truncated: false });
    search.mockResolvedValueOnce({ candidates: [home({ id: 7 })], truncated: false });
    const { runTurn } = await import('@/components/agent/run');
    await runTurn('t1');
    expect(search).toHaveBeenCalledTimes(2);
    expect(search.mock.calls[1]![1]).toEqual({ take: 2000, excludeIds: [] });
  });

  it('falls back to one search per widening when the pool was cut short', async () => {
    search.mockResolvedValueOnce({ candidates: [], truncated: false });
    search.mockResolvedValueOnce({ candidates: [], truncated: true });
    search.mockResolvedValue({ candidates: [], truncated: false });
    const { runTurn } = await import('@/components/agent/run');
    await runTurn('t1');
    expect(search.mock.calls.length).toBeGreaterThan(3);
  });
});

describe('homes before questions', () => {
  beforeEach(async () => {
    search.mockReset();
    update.mockClear();
    const { requestConfirmations } = await import('@/components/agent/broker');
    vi.mocked(requestConfirmations).mockClear();
  });

  const turnWith = async (message: Record<string, unknown>) => {
    const { db } = await import('@/lib/db');
    vi.mocked(db.agentTask.findUnique).mockResolvedValueOnce({ id: 't1', locale: 'en', messages: [{ at: '', ...message }], requirements: null, events: [] } as never);
    const shortlist = await import('@/components/agent/search');
    vi.mocked(shortlist.toShortlist).mockResolvedValueOnce([{ id: 7, availability: 'unconfirmed' }] as never);
    search.mockResolvedValue({ candidates: [home({ id: 7 })], truncated: false });
    const { runTurn } = await import('@/components/agent/run');
    await runTurn('t1');
  };
  const replies = () =>
    update.mock.calls
      .map((c) => (c as unknown as [{ data: { messages?: { kind?: string; refine?: string }[] } }])[0].data.messages?.at(-1))
      .filter(Boolean);

  it('searches monthly rent when no stay type was given, and offers a budget under the cards', async () => {
    await turnWith({ role: 'user', text: '2 bedroom in Kicukiro' });
    expect(search.mock.calls[0]![0]).toMatchObject({ stay: 'long', bedrooms: 2, district: 'KICUKIRO' });
    expect(replies()).toEqual([expect.objectContaining({ kind: 'shortlist', refine: 'maxPrice' })]);
    // Not yet engaged: no broker is asked until the tenant picks a budget or says monthly.
    const { requestConfirmations } = await import('@/components/agent/broker');
    expect(requestConfirmations).not.toHaveBeenCalled();
  });

  it('answers a few nights with "monthly only": no search, no broker', async () => {
    await turnWith({ role: 'user', text: '3 nights in Kiyovu for 2 people' });
    expect(search).not.toHaveBeenCalled();
    expect(replies()).toEqual([expect.objectContaining({ kind: 'monthlyOnly' })]);
    const { requestConfirmations } = await import('@/components/agent/broker');
    expect(requestConfirmations).not.toHaveBeenCalled();
  });

  it('skips the model on a tap', async () => {
    const { readRequirementsWithGroq } = await import('@/components/agent/llm');
    vi.mocked(readRequirementsWithGroq).mockClear();
    await turnWith({ role: 'user', text: 'Months', filters: { stay: 'long' } });
    expect(readRequirementsWithGroq).not.toHaveBeenCalled();
    expect(replies()).toEqual([expect.objectContaining({ kind: 'shortlist', refine: 'maxPrice' })]);
  });
});

describe('the turn deadline', () => {
  const tap = async () => {
    const { db } = await import('@/lib/db');
    vi.mocked(db.agentTask.findUnique).mockResolvedValueOnce({
      id: 't1',
      locale: 'en',
      messages: [{ role: 'user', text: 'Months', filters: { stay: 'long' }, at: '' }],
      requirements: null,
      events: [],
    } as never);
  };
  const replies = () =>
    update.mock.calls
      .map((c) => (c as unknown as [{ data: { messages?: { kind?: string }[] } }])[0].data.messages?.at(-1))
      .filter(Boolean);

  beforeEach(async () => {
    search.mockReset();
    update.mockClear();
    executeRaw.mockClear();
    const { requestConfirmations } = await import('@/components/agent/broker');
    vi.mocked(requestConfirmations).mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('answers with the error when nothing replied in 15 s, and drops the late cards', async () => {
    vi.useFakeTimers();
    await tap();
    let release!: (v: unknown) => void;
    search.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    const { startTurn } = await import('@/components/agent/run');
    const turn = startTurn('t1');
    await vi.advanceTimersByTimeAsync(15_000);
    await turn.shown;
    // The error went in as an append, without the task's messages in hand.
    expect(executeRaw).toHaveBeenCalledTimes(1);
    release({ candidates: [home({ id: 7 })], truncated: false });
    await turn.done;
    expect(replies()).toEqual([]);
    const { requestConfirmations } = await import('@/components/agent/broker');
    expect(requestConfirmations).not.toHaveBeenCalled();
  });

  it('says the first reply is shown as soon as the cards are written', async () => {
    await tap();
    search.mockResolvedValue({ candidates: [home({ id: 7 })], truncated: false });
    const { startTurn } = await import('@/components/agent/run');
    const turn = startTurn('t1');
    await turn.shown;
    expect(replies()).toEqual([expect.objectContaining({ kind: 'shortlist' })]);
    await turn.done;
    expect(executeRaw).not.toHaveBeenCalled();
  });
});
