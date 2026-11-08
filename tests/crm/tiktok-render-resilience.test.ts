import { describe, expect, it } from 'vitest';
import { diskFloorGiB, fillUnreadFrames } from '../../scripts/crm/tiktok-post-pure';

describe('diskFloorGiB', () => {
  it('defaults to 4 and honours a sane override', () => {
    expect(diskFloorGiB(undefined)).toBe(4);
    expect(diskFloorGiB('')).toBe(4);
    expect(diskFloorGiB('abc')).toBe(4);
    expect(diskFloorGiB('8')).toBe(8);
  });
  it('never goes under 2', () => {
    expect(diskFloorGiB('0')).toBe(4);
    expect(diskFloorGiB('1')).toBe(4);
  });
});

describe('fillUnreadFrames', () => {
  it('passes fully read frames through', () => {
    expect(fillUnreadFrames([[1], [], [2]])).toEqual([[1], [], [2]]);
  });
  it('fills one unreadable frame from its neighbour', () => {
    expect(fillUnreadFrames([[1], null, [2]])).toEqual([[1], [1], [2]]);
    expect(fillUnreadFrames([null, [5]])).toEqual([[5], [5]]);
  });
  it('fails closed on two unreadable frames or none readable', () => {
    expect(() => fillUnreadFrames([null, [1], null])).toThrow();
    expect(() => fillUnreadFrames([null])).toThrow();
  });
});
