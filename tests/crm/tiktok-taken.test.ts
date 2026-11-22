/**
 * 2026-11-22: our TikTok kept sending people to K6823 for days after the broker said taken. The page never posts a
 * taken home, holds one that no broker confirmed lately, and queues the video already out for removal.
 * Fixtures are made up (the repo is public).
 */
import { describe, expect, it } from 'vitest';
import { brokerSaidTaken, CONFIRM_DAYS, ineligibleReason, needsReask, pickFresh, takedownsDue, unconfirmedReason, type PostRow, type PostedRow } from '../../scripts/crm/tiktok-post-pure';
import { pickSimilar } from '../../src/app/[lang]/k/[ref]/similar-pure';

const NOW = Date.parse('2026-10-20T07:00:00Z');
const day = 86_400_000;
const ago = (d: number) => new Date(NOW - d * day).toISOString();
const PHOTOS = ['1', '2', '3', '4', '5'].map((n) => `https://cdn.example/${n}.jpg`);
const row = (over: Partial<PostRow> = {}): PostRow => ({
  id: 100, code: null, source: 'MANUAL', priceMonth: 450_000, bedrooms: 3, bathrooms: 2, propertyType: 'Apartment', photoUrls: PHOTOS,
  area: 'Kimironko', district: 'Gasabo', hostSourceId: null, postedAt: ago(1), lostAt: null, ...over,
});
const none = new Set<string>();

describe('a taken home never goes out', () => {
  it('lostAt, or a broker "taken" after their last yes', () => {
    expect(ineligibleReason(row({ lostAt: ago(1) }), none, NOW)).toBe('taken, or its ad is gone');
    expect(ineligibleReason(row({ rentedAt: ago(1), confirmedAt: ago(4) }), none, NOW)).toBe('a broker said it is taken');
    expect(ineligibleReason(row({ rentedAt: ago(1), confirmedAt: null }), none, NOW)).toBe('a broker said it is taken');
  });
  it('a yes after the "taken" lifts it (the home came back)', () => {
    expect(brokerSaidTaken({ rentedAt: ago(5), confirmedAt: ago(1) })).toBe(false);
    expect(ineligibleReason(row({ rentedAt: ago(5), confirmedAt: ago(1) }), none, NOW)).toBeNull();
  });
  it('the day pick skips it', () => {
    const rows = [row({ id: 1, rentedAt: ago(0.5), confirmedAt: ago(2) }), row({ id: 2 })];
    expect(pickFresh(rows, {}, none, { now: NOW }).picked.map((r) => r.id)).toEqual([2]);
  });
});

describe(`confirmed free in the last ${CONFIRM_DAYS} days, or asked again first`, () => {
  it('a fresh ad (today or yesterday) stands for the broker saying it is free', () => {
    expect(unconfirmedReason(row({ postedAt: ago(1), confirmedAt: null }), NOW)).toBeNull();
  });
  it('an older ad needs a broker yes inside the window', () => {
    expect(unconfirmedReason(row({ postedAt: ago(8), confirmedAt: null }), NOW)).toMatch(/not confirmed free/);
    expect(unconfirmedReason(row({ postedAt: ago(8), confirmedAt: ago(10) }), NOW)).toMatch(/not confirmed free/);
    expect(unconfirmedReason(row({ postedAt: ago(8), confirmedAt: ago(2) }), NOW)).toBeNull();
    expect(ineligibleReason(row({ postedAt: ago(8), confirmedAt: null }), none, NOW)).toMatch(/asked again first/);
  });
  it('a row loaded without the answers is not judged (an old caller, or the table down)', () => {
    expect(unconfirmedReason(row({ postedAt: ago(8) }), NOW)).toBeNull();
  });
  it('the held homes are the ones that would go out but for the check', () => {
    const rows = [row({ id: 1, postedAt: ago(8), confirmedAt: null }), row({ id: 2, postedAt: ago(8), confirmedAt: ago(1) }), row({ id: 3, postedAt: ago(8), confirmedAt: null, lostAt: ago(1) }), row({ id: 4, postedAt: ago(1), confirmedAt: null })];
    expect(needsReask(rows, none, NOW).map((r) => r.id)).toEqual([1]);
  });
});

describe('the video already out comes down', () => {
  const post = (over: Partial<PostedRow> = {}): PostedRow => ({ id: 'p1', listingId: 6823, ref: 'K6823', status: 'POSTED', postedAt: ago(6), tiktokUrl: 'https://www.tiktok.com/@mkan.rw/video/7000000000000000000', tiktokId: '7000000000000000000', lostAt: null, confirmedAt: ago(9), rentedAt: null, ...over });
  it('queues a posted video whose home is lost, or a broker said taken', () => {
    expect(takedownsDue([post({ lostAt: ago(1) }), post({ id: 'p2', rentedAt: ago(1) }), post({ id: 'p3' })], new Set(), NOW).map((p) => p.id)).toEqual(['p1', 'p2']);
  });
  it('once only, and only a live post of the last 45 days', () => {
    expect(takedownsDue([post({ lostAt: ago(1) })], new Set(['p1']), NOW)).toEqual([]);
    expect(takedownsDue([post({ lostAt: ago(1), status: 'FAILED' }), post({ id: 'old', lostAt: ago(1), postedAt: ago(60) })], new Set(), NOW)).toEqual([]);
  });
});

describe('the /k page of a taken home', () => {
  const target = { id: 6823, priceMonth: 350_000, bedrooms: 2, district: 'KICUKIRO' };
  const c = (id: number, over: Record<string, unknown> = {}) => ({ id, title: '2 bedroom house in Kabeza', propertyType: 'Villa', rentPeriod: 'MONTHLY', priceMonth: 330_000, bedrooms: 2, lostAt: null, district: 'Kicukiro', ...over });
  it('offers 2–3 free homes of its size and rent, never itself, a taken one, a shop or noise', () => {
    const rows = [
      c(6823),
      c(1, { lostAt: new Date() }),
      c(2, { title: 'Shop for rent' }),
      c(3, { priceMonth: 40_000 }),
      c(4, { priceMonth: 900_000 }),
      c(5, { bedrooms: 5 }),
      c(6, { priceMonth: 360_000, district: 'Gasabo' }),
      c(7),
      c(8, { priceMonth: 345_000 }),
      c(9, { rentPeriod: 'NIGHTLY' }),
    ];
    const got = pickSimilar(target, rows, 3).map((x) => x.id);
    expect(got).toEqual([8, 7, 6]);
  });
});
