import { describe, expect, it } from 'vitest';
import { pickToday, probeVerdict, refOf, type PostRow } from '../../scripts/crm/tiktok-post-pure';

describe('probeVerdict', () => {
  it('ok on exit 0', () => expect(probeVerdict(true, '')).toBe('ok'));
  it('photo post', () => {
    expect(probeVerdict(false, 'ERROR: Unsupported URL: https://www.tiktok.com/@x/photo/123')).toBe('photo');
    expect(probeVerdict(false, 'ERROR: There is no video in this post')).toBe('photo');
  });
  it('gone', () => {
    expect(probeVerdict(false, 'ERROR: Video not available')).toBe('gone');
    expect(probeVerdict(false, 'ERROR: [TikTok] 123: This video has been removed')).toBe('gone');
  });
  it('private', () => expect(probeVerdict(false, 'ERROR: This video is private. Log in')).toBe('private'));
  it('network is never a verdict on the video', () => expect(probeVerdict(false, 'Could not resolve host')).toBe('network'));
});

describe('a fetch-failed home is never featured again', () => {
  const now = Date.parse('2026-11-08T08:00:00Z');
  const row = (id: number): PostRow =>
    ({ id, code: `K${id}`, source: 'MANUAL', priceMonth: 300000, district: 'Kicukiro', area: 'a', bedrooms: 2, photoUrls: ['a', 'b', 'c', 'd'], hostSourceId: null, postedAt: '2026-11-07T00:00:00Z', lostAt: null }) as unknown as PostRow;
  it('skips it and the next home takes its place', () => {
    const rows = [row(3), row(2), row(1)];
    const ledger = { K3: { listingId: 3, district: 'Kicukiro', queuedAt: '2020-01-01T00:00:00Z', fetchFailedAt: '2026-11-07T00:00:00Z', fetchFailure: 'gone' as const } };
    expect(pickToday(rows, ledger, new Set(), 2, now).map(refOf)).toEqual(['K2', 'K1']);
  });
});
