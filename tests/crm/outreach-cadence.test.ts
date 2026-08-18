/**
 * Regression test for the divisor bug that silently disabled the outreach
 * cadence for its entire life.
 *
 * `daysSince` was computed as `(now - then) / (1000 * 86400 * 1000)` — a
 * divisor of 86.4 billion ms, roughly 2.7 years. `Math.floor` therefore drove
 * every realistic gap to 0, the `>= 3` and `>= 7` branches were unreachable,
 * and Touch 2 and Touch 3 could never fire for any host. The queue reported
 * "0 hosts due" indefinitely, which is indistinguishable from "nobody is due".
 *
 * The assertions below fail against the old arithmetic.
 */
import { describe, expect, it } from 'vitest';

import {
  MS_PER_DAY,
  daysSinceOutreach,
  decideCadenceStage,
} from '../../scripts/crm/outreach-cadence';

const NOW = new Date('2026-08-18T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * MS_PER_DAY).toISOString();

describe('MS_PER_DAY', () => {
  it('is 86,400,000 — not the 86.4 billion the old expression produced', () => {
    expect(MS_PER_DAY).toBe(86_400_000);
    expect(MS_PER_DAY).not.toBe(1000 * 86400 * 1000);
  });
});

describe('daysSinceOutreach', () => {
  it('counts whole days', () => {
    expect(daysSinceOutreach(daysAgo(0), NOW)).toBe(0);
    expect(daysSinceOutreach(daysAgo(3), NOW)).toBe(3);
    expect(daysSinceOutreach(daysAgo(7), NOW)).toBe(7);
    expect(daysSinceOutreach(daysAgo(40), NOW)).toBe(40);
  });

  it('THE BUG: a real gap must not floor to zero', () => {
    // Under the old divisor every one of these returned 0.
    for (const d of [3, 4, 7, 14, 90]) {
      expect(daysSinceOutreach(daysAgo(d), NOW)).toBeGreaterThan(0);
    }
  });

  it('treats never-contacted as Infinity, not a magic 999', () => {
    expect(daysSinceOutreach(null, NOW)).toBe(Infinity);
    expect(daysSinceOutreach(undefined, NOW)).toBe(Infinity);
    expect(daysSinceOutreach('not-a-date', NOW)).toBe(Infinity);
  });
});

describe('decideCadenceStage — the 3-touch ladder', () => {
  it('never contacted → Touch 1', () => {
    expect(decideCadenceStage(null, NOW)).toEqual({
      stage: 'TOUCH_1_DUE',
      touchNum: 1,
      msgType: 'first-touch',
    });
  });

  it('THE BUG: 3 days silent → Touch 2 actually fires', () => {
    expect(decideCadenceStage(daysAgo(3), NOW)).toEqual({
      stage: 'TOUCH_2_DUE',
      touchNum: 2,
      msgType: 'follow-up',
    });
  });

  it('THE BUG: 7 days silent → Touch 3 escalates to a human', () => {
    expect(decideCadenceStage(daysAgo(7), NOW)).toEqual({
      stage: 'TOUCH_3_CALL_DUE',
      touchNum: 3,
      msgType: 'handover',
    });
  });

  it('holds the boundaries exactly', () => {
    expect(decideCadenceStage(daysAgo(2), NOW)).toBeNull(); // not due
    expect(decideCadenceStage(daysAgo(3), NOW)?.touchNum).toBe(2);
    expect(decideCadenceStage(daysAgo(6), NOW)?.touchNum).toBe(2);
    expect(decideCadenceStage(daysAgo(7), NOW)?.touchNum).toBe(3);
  });

  it('a host contacted today is not due again', () => {
    expect(decideCadenceStage(daysAgo(0), NOW)).toBeNull();
  });

  it('every touch is reachable — the property the bug broke', () => {
    const reached = new Set(
      [null, daysAgo(4), daysAgo(30)].map((d) => decideCadenceStage(d, NOW)?.touchNum),
    );
    expect(reached).toEqual(new Set([1, 2, 3]));
  });
});
