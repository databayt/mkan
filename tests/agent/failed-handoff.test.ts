/**
 * A chat the agent could not answer reaches #mkan (2026-11-08). Replays the one failure in the 14 days
 * before: "2 bedroom in Kicukiro" whose search outlasted the 15 s turn deadline on a slow database.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn(async () => {});
vi.mock('@/components/agent/whatsapp', () => ({ postSlackCard: (...a: unknown[]) => post(...(a as [string])) }));
const search = vi.fn();
vi.mock('@/components/agent/search', () => ({ searchKigali: (...a: unknown[]) => search(...a), toShortlist: vi.fn(async () => []) }));
vi.mock('@/components/agent/llm', () => ({ readRequirementsWithGroq: vi.fn(async () => null) }));
vi.mock('@/components/agent/broker', () => ({ requestConfirmations: vi.fn(async () => []) }));
const executeRaw = vi.fn(async () => 1);
const messages = [{ role: 'user', text: '2 bedroom in Kicukiro', at: '' }];
vi.mock('@/lib/db', () => ({
  db: {
    $executeRaw: (...a: unknown[]) => executeRaw(...(a as [])),
    agentTask: {
      findUnique: vi.fn(async () => ({ id: 't1', locale: 'en', messages, requirements: null, events: [] })),
      update: vi.fn(async () => ({})),
    },
    agentEvent: {
      create: vi.fn(async () => ({ id: 1 })),
      update: vi.fn(async () => ({})),
      createMany: vi.fn(async () => ({})),
      findFirst: vi.fn(async () => null),
    },
  },
}));

describe('failedChatCard', () => {
  it('names the chat, the cause and the last words, trimmed', async () => {
    const { failedChatCard, lastUserText } = await import('@/components/agent/failed-handoff');
    expect(lastUserText([{ role: 'user', text: 'a' }, { role: 'agent', kind: 'error' }, { role: 'user', text: 'b' }])).toBe('b');
    expect(lastUserText(null)).toBeNull();
    const card = failedChatCard('t1', 'deadline', '2 bedroom\nin Kicukiro');
    expect(card).toContain('chat t1');
    expect(card).toContain('(deadline)');
    expect(card).toContain('> 2 bedroom in Kicukiro');
    // The tenant's words are cut at 300; the card also names who to answer (2026-11-08).
    expect(failedChatCard('t1', 'stuck', 'x'.repeat(900)).length).toBeLessThan(450);
    expect(failedChatCard('t1', 'deadline', 'hi')).toContain('web chat, no number left');
    expect(failedChatCard('t1', 'deadline', 'hi', '+250720000011')).toContain('wa.me/250720000011');
  });
});

let runTurn: (id: string) => Promise<void>;

describe('a turn that cannot answer', () => {
  beforeAll(async () => {
    ({ runTurn } = await import('@/components/agent/run'));
  });
  beforeEach(() => {
    vi.useFakeTimers();
    post.mockClear();
    executeRaw.mockClear();
    search.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('posts the chat to #mkan when the deadline answers with the error', async () => {
    search.mockImplementation(() => new Promise((r) => setTimeout(() => r({ candidates: [], truncated: false }), 60_000)));
    const done = runTurn('t1');
    await vi.advanceTimersByTimeAsync(16_000);
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]![0]).toContain('(deadline)');
    expect(post.mock.calls[0]![0]).toContain('2 bedroom in Kicukiro');
    await vi.runAllTimersAsync();
    await done;
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when the turn answers in time', async () => {
    search.mockResolvedValue({ candidates: [], truncated: false });
    const done = runTurn('t1');
    await vi.advanceTimersByTimeAsync(2_000);
    await done;
    expect(post).not.toHaveBeenCalled();
  });
});
