/**
 * Format v2 of the Kigali TikTok page (2026-11-09): the glass card's pure core. Fixtures are made
 * up (the repo is public): numbers and handles are in the real shapes only.
 */
import { describe, expect, it } from 'vitest';

import type { PostRow } from '../../scripts/crm/tiktok-post-pure';
import { CARD, FRAME, SAFE, cardLines, cardTint, displacementMaps, glassGraph, luminance, placeName, roundedRectSdf } from '../../scripts/crm/tiktok-v2-pure';

const row = (over: Partial<PostRow> = {}): PostRow =>
  ({
    id: 6527,
    code: null,
    source: 'TIKTOK',
    priceMonth: 700_000,
    bedrooms: 2,
    bathrooms: 1,
    propertyType: 'Apartment',
    photoUrls: [],
    area: 'Nyamirambo',
    district: 'Nyarugenge',
    hostSourceId: 'tiktok:somebroker',
    postedAt: null,
    lostAt: null,
    ...over,
  }) as PostRow;

describe('the glass card', () => {
  it('says price, home and area, then WhatsApp and the code — no emoji', () => {
    const l = cardLines(row(), '+250 788 000 000');
    expect(l).toEqual({ price: 'RWF 700,000 / month', home: '2-bedroom apartment · Nyamirambo', contact: 'WhatsApp +250 788 000 000 · send', code: 'K6527' });
    expect(Object.values(l).join(' ')).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('writes a place as people do, and falls back to the district, then Kigali', () => {
    expect(placeName('NYAMIRAMBO')).toBe('Nyamirambo');
    expect(placeName('kicukiro, gikondo')).toBe('Kicukiro, Gikondo');
    expect(cardLines(row({ area: null, district: 'gasabo', bedrooms: null, propertyType: 'House' }), '+250 788 000 000').home).toBe('house · Gasabo');
    expect(cardLines(row({ area: null, district: null }), '+250 788 000 000').home).toBe('2-bedroom apartment · Kigali');
  });

  it("sits inside TikTok's safe area", () => {
    expect(CARD.x).toBeGreaterThanOrEqual(SAFE.left);
    expect(CARD.x + CARD.w).toBeLessThanOrEqual(SAFE.right);
    expect(CARD.y).toBeGreaterThanOrEqual(SAFE.top);
    expect(CARD.y + CARD.h + CARD.rise).toBeLessThanOrEqual(SAFE.bottom + CARD.rise);
    expect(CARD.y + CARD.h).toBeLessThanOrEqual(SAFE.bottom);
    expect(CARD.x + CARD.w).toBeLessThanOrEqual(FRAME.w);
  });

  it('darkens its glass just enough for white text over bright rooms, and always reads as glass', () => {
    expect(cardTint(0.05)).toBe(0.22); // a dark room: the lightest glass
    expect(cardTint(0.3)).toBe(0.22);
    const bright = cardTint(0.6);
    expect(bright).toBeGreaterThan(0.45);
    expect(bright).toBeLessThanOrEqual(0.62);
    expect(cardTint(1)).toBe(0.62); // never so dark that the room stops showing through
    expect(luminance(255, 255, 255)).toBeCloseTo(1);
    expect(luminance(0, 0, 0)).toBe(0);
  });

  it('bends the picture only along the rim, inward, and leaves the centre alone', () => {
    const w = 120, h = 60, r = 20;
    expect(roundedRectSdf(60, 30, w, h, r)).toBeLessThan(0);
    expect(roundedRectSdf(-5, 30, w, h, r)).toBeGreaterThan(0);
    const { dx, dy } = displacementMaps(w, h, r, 12, 8);
    expect(dx[30 * w + 60]).toBe(128);
    expect(dy[30 * w + 60]).toBe(128);
    // Left edge samples from the right (further in), right edge from the left: mirror images.
    const left = dx[30 * w + 2]!;
    const right = dx[30 * w + (w - 3)]!;
    expect(left).toBeGreaterThan(128);
    expect(right).toBeLessThan(128);
    expect(left - 128).toBe(128 - right);
    // Top edge samples from below.
    expect(dy[2 * w + 60]!).toBeGreaterThan(128);
  });

  it('lays the card on with the only blur inside it, and nothing wiped', () => {
    const g = glassGraph({ shadow: 1, dx: 2, dy: 3, mask: 4, face: 5, shadowPad: 60 });
    expect(g).not.toMatch(/delogo|boxblur|avgblur/);
    // One gblur, on the crop under the card.
    expect(g.match(/gblur/g)).toHaveLength(1);
    expect(g).toMatch(new RegExp(`\\[under\\]crop=${CARD.w + 48}:${CARD.h + 48}:${CARD.x - 24}:${CARD.y - 24},gblur`));
    expect(g).toMatch(/displace=edge=smear/);
    expect(g).toMatch(/alphamerge,fade=t=in:st=0.6/);
    expect(g.endsWith('[v]')).toBe(true);
  });
});
