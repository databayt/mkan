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
  impossibleState,
  isCdnUrl,
  isDrifted,
  masteredKey,
  predatesDispatch,
  predatesLineage,
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

describe('a dropped render that cannot answer its run', () => {
  // The real sequence that lost a render (run irrpmcb2, 2026-08-25): the human
  // rendered photo 1 attempt 2 at 01:59Z, then the machine reverted attempt 1
  // at 02:06Z, queued attempt 2 at 02:07Z and dispatched it at 02:16Z. Judged
  // against the attempt, a good photo is "impossible"; judged against the
  // photo's own history, it is obviously fine.
  const rendered = Date.parse('2026-08-25T01:59:52Z');
  const lineageStart = new Date('2026-08-22T17:37:46Z'); // photo 1 first queued
  const assignedAt = new Date('2026-08-25T02:16:54Z');

  it('accepts a render made while the machine was still re-queueing', () => {
    expect(predatesLineage(rendered, lineageStart)).toBe(false);
  });

  it('still refuses one made before the photo ever entered the pipeline', () => {
    expect(predatesLineage(Date.parse('2026-08-01T00:00:00Z'), lineageStart)).toBe(true);
  });

  it('keeps the strict bar for the machine junk drawer, where nobody chose the file', () => {
    expect(predatesDispatch(rendered, assignedAt)).toBe(true);
  });

  it('has nothing to disprove when the run was never dispatched', () => {
    expect(predatesLineage(rendered, null)).toBe(false);
    expect(predatesDispatch(rendered, null)).toBe(false);
  });
});

describe('impossibleState', () => {
  const ok = { status: 'ASSIGNED', slackTs: '1787.1', masteredUrl: null, appliedAt: null };

  it('passes states the scripts actually produce', () => {
    expect(impossibleState(ok)).toBeNull();
    expect(impossibleState({ status: 'QUEUED', slackTs: null, masteredUrl: null, appliedAt: null })).toBeNull();
    expect(
      impossibleState({ status: 'UPDATED', slackTs: '1.1', masteredUrl: 'https://cdn/x.webp', appliedAt: new Date() }),
    ).toBeNull();
  });

  it('catches a dispatched run reset to QUEUED — the 2026-08-25 outside write', () => {
    expect(impossibleState({ ...ok, status: 'QUEUED' })).toMatch(/dispatched, then reset/);
  });

  it('catches a result that exists before any step could have made one', () => {
    expect(impossibleState({ ...ok, masteredUrl: 'https://cdn/x.webp' })).toMatch(/already has a mastered URL/);
  });

  it('catches UPDATED with no apply timestamp', () => {
    expect(impossibleState({ status: 'UPDATED', slackTs: null, masteredUrl: 'https://cdn/x.webp', appliedAt: null })).toMatch(
      /without an applied timestamp/,
    );
  });
});
