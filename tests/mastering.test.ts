/**
 * Mastering pipeline — pure-helper invariants (scripts/mastering/pure.ts).
 *
 * These pin the load-bearing behaviors the real world already punished once:
 * swap is by VALUE never index (hosts mutate the array), UUID basenames must
 * not become room "hints", drift is UPDATED-but-not-live, and the Slack return
 * parser only ever trusts human-attached images. Imports pure.ts ONLY — lib.ts
 * boots dotenv/Keychain at module scope and stays out of the suite.
 */
import { describe, expect, it } from 'vitest';
import {
  isCdnUrl,
  isDrifted,
  masteredKey,
  roomHintFrom,
  swapPhoto,
  toReturns,
  type SlackMessage,
} from '../scripts/mastering/pure';

describe('roomHintFrom', () => {
  it('reads room names from named files, stripping order digits', () => {
    expect(roomHintFrom('https://cdn.databayt.org/mkan/uploads/1/living-room.webp')).toBe('living room');
    expect(roomHintFrom('https://cdn.databayt.org/mkan/uploads/1/bedroom-2.webp')).toBe('bedroom');
    expect(roomHintFrom('https://cdn.databayt.org/x/master_bathroom.jpg')).toBe('master bathroom');
  });
  it('refuses numeric and UUID basenames — hex garbage must never reach the prompt', () => {
    expect(roomHintFrom('https://cdn.databayt.org/mkan/uploads/1/01.webp')).toBeNull();
    expect(
      roomHintFrom('https://cdn.databayt.org/mkan/uploads/40938188/4b47453c-89a8-4067-aa25-55c36b6fa871.jpg'),
    ).toBeNull();
  });
  it('survives unparseable input', () => {
    expect(roomHintFrom('')).toBeNull();
  });
});

describe('swapPhoto', () => {
  const urls = ['a.jpg', 'b.jpg', 'c.jpg'];
  it('swaps by value and leaves the source array untouched', () => {
    expect(swapPhoto(urls, 'b.jpg', 'B.webp')).toEqual(['a.jpg', 'B.webp', 'c.jpg']);
    expect(urls).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });
  it('returns null when the original is gone — never guesses a slot', () => {
    expect(swapPhoto(urls, 'zz.jpg', 'B.webp')).toBeNull();
  });
});

describe('isDrifted', () => {
  it('flags a mastered URL that left the array, tolerates null', () => {
    expect(isDrifted('m.webp', ['a.jpg'])).toBe(true);
    expect(isDrifted('m.webp', ['a.jpg', 'm.webp'])).toBe(false);
    expect(isDrifted(null, ['a.jpg'])).toBe(false);
  });
});

describe('cdn helpers', () => {
  it('recognizes only cdn.databayt.org, rejects junk without throwing', () => {
    expect(isCdnUrl('https://cdn.databayt.org/mkan/uploads/x.jpg')).toBe(true);
    expect(isCdnUrl('https://a0.muscache.com/pic.jpg')).toBe(false);
    expect(isCdnUrl('not a url')).toBe(false);
  });
  it('keeps mastered output inside the IAM-permitted uploads prefix', () => {
    expect(masteredKey('run1')).toBe('mkan/uploads/mastered/run1.webp');
    expect(masteredKey('run1', 'other')).toBe('other/uploads/mastered/run1.webp');
  });
});

describe('toReturns (Slack return parsing)', () => {
  const img = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    mimetype: 'image/png',
    url_private_download: `https://files.slack.com/${id}`,
    ...over,
  });
  const messages: SlackMessage[] = [
    { ts: '3.0', user: 'U1', text: 'DONE abc', files: [img('F3')] },
    { ts: '2.0', bot_id: 'B1', files: [img('FBOT')] }, // bot upload — never trusted
    { ts: '1.5', user: 'U1', files: [{ id: 'FPDF', mimetype: 'application/pdf', url_private_download: 'x' }] },
    { ts: '1.0', user: 'U1', thread_ts: '0.5', files: [img('F1'), img('FNOURL', { url_private_download: undefined, url_private: undefined })] },
  ];
  const out = toReturns(messages);
  it('keeps only human image attachments with a fetchable URL, newest first', () => {
    expect(out.map((r) => r.fileId)).toEqual(['F3', 'F1']);
  });
  it('carries thread + text so done can match a run', () => {
    expect(out[0].text).toBe('DONE abc');
    expect(out[1].threadTs).toBe('0.5');
  });
});
