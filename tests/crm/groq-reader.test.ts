import { afterEach, describe, expect, it, vi } from 'vitest';
import { GroqLimit, retryAfterSeconds, runGroq } from '../../scripts/crm/groq-reader';

describe('groq reader', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the wait from the header or the message', () => {
    expect(retryAfterSeconds('7', '')).toBe(7);
    expect(retryAfterSeconds(null, 'Please try again in 12.5s.')).toBe(12.5);
    expect(retryAfterSeconds(null, 'Please try again in 2m3s.')).toBe(123);
    expect(retryAfterSeconds(null, 'nothing')).toBeNull();
  });

  it('stops on a limit that will not clear inside a minute', async () => {
    process.env.GROQ_API_KEY = 'test';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"try again in 14m2s"}}', { status: 429 })));
    await expect(runGroq({ prompt: 'x' })).rejects.toBeInstanceOf(GroqLimit);
  });

  it('returns the text without the model thinking out loud', async () => {
    process.env.GROQ_API_KEY = 'test';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '<think>hmm</think>{"a":1}' } }] }), { status: 200 })));
    await expect(runGroq({ prompt: 'x' })).resolves.toBe('{"a":1}');
  });
});
