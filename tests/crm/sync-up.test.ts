import { describe, expect, it } from 'vitest';
import { unseenListings } from '../../scripts/crm/sync-up-pure';
import { findPairs } from '../../scripts/crm/merge-tiktok-dupes';

describe('sync-up create phase', () => {
  const homes = [
    { mkanListingId: 1, airbnbListingId: null },
    { mkanListingId: null, airbnbListingId: '998877' },
    { mkanListingId: null, airbnbListingId: '', sourceId: 'tiktok:111' },
  ];

  it('knows a listing by id, Airbnb id or TikTok source id', () => {
    const listings = [
      { id: 1, source: 'MANUAL', sourceListingId: null },
      { id: 2, source: 'AIRBNB', sourceListingId: '998877' },
      { id: 3, source: 'MANUAL', sourceListingId: 'tiktok:111' },
      { id: 4, source: 'MANUAL', sourceListingId: null },
    ];
    expect(unseenListings(homes, listings).map((l) => l.id)).toEqual([4]);
  });

  it('never re-creates a TikTok lead, even one the board has lost', () => {
    expect(unseenListings(homes, [{ id: 9, source: 'TIKTOK', sourceListingId: 'tiktok:222' }])).toEqual([]);
  });
});

describe('merge-tiktok-dupes', () => {
  it('pairs each MKAN_SITE copy with the TikTok home it copied', () => {
    const board = [
      { id: 'orig', source: 'TIKTOK', sourceId: 'tiktok:111' },
      { id: 'copy', source: 'MKAN_SITE', mkanListingId: 5778 },
      { id: 'done', source: 'MKAN_SITE', mkanListingId: 5779, homeStatus: 'DUPLICATE' },
      { id: 'real', source: 'MKAN_SITE', mkanListingId: 12 },
    ];
    const leads = [
      { id: 5778, sourceListingId: 'tiktok:111' },
      { id: 5779, sourceListingId: 'tiktok:111' },
    ];
    expect(findPairs(board, leads)).toEqual([{ copyId: 'copy', originalId: 'orig', listingId: 5778, sourceId: 'tiktok:111' }]);
  });
});
