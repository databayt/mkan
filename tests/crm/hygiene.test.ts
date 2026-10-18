import { describe, expect, it } from 'vitest';
import { checkHomes, checkHosts, videoGone } from '../../scripts/crm/hygiene-pure';

describe('crm hygiene', () => {
  const listings = [{ id: 7, code: '3314-01', isPublished: true, source: 'AIRBNB', sourceListingId: '88' }];

  it('keeps the scraped record over sync-up’s echo, and copies the site code', () => {
    const homes = [
      { id: 'echo', source: 'MKAN_SITE', mkanListingId: 7, createdAt: '2026-10-15T18:00:00Z', listingId: '3314-01', mkanPublishState: 'LIVE' },
      { id: 'scraped', source: 'AIRBNB', mkanListingId: 7, hostId: 'h1', createdAt: '2026-10-15T19:00:00Z', listingId: '', mkanPublishState: 'LIVE' },
    ];
    const { fixes } = checkHomes(homes, listings);
    expect(fixes).toContainEqual(expect.objectContaining({ id: 'echo', body: { homeStatus: 'DUPLICATE', duplicateCheck: 'CONFIRMED', duplicateOfId: 'scraped' } }));
    expect(fixes).toContainEqual(expect.objectContaining({ id: 'scraped', body: { listingId: '3314-01' } }));
    expect(fixes.some((f) => f.id === 'scraped' && 'homeStatus' in f.body)).toBe(false);
  });

  it('reports what needs a person, and fixes nothing there', () => {
    const homes = [{ id: 'a', mkanListingId: 7, publishState: 'LIVE', mkanPublishState: 'LIVE', pipelineStage: 'VETTING', createdAt: '2026-08-01T00:00:00Z' }];
    const { findings } = checkHomes(homes, [{ ...listings[0]!, isPublished: false }], new Date('2026-10-18'));
    expect(findings.map((f) => f.check)).toEqual(expect.arrayContaining(['operator said LIVE, the site is not showing it', 'at VETTING for more than 14 days']));
  });

  it('gives a bare national number its calling code, unless a human locked it', () => {
    const hosts = [
      { id: 'b', source: 'TIKTOK', phone: { primaryPhoneNumber: '788123456', primaryPhoneCallingCode: '' } },
      { id: 'c', source: 'TIKTOK', contactVerifiedByHuman: true, phone: { primaryPhoneNumber: '788123457', primaryPhoneCallingCode: '' } },
    ];
    const { fixes } = checkHosts(hosts);
    expect(fixes).toEqual([expect.objectContaining({ id: 'b', body: { phone: expect.objectContaining({ primaryPhoneCallingCode: '+250', primaryPhoneNumber: '788123456' }) } })]);
  });

  it('flags hosts sharing a phone across lanes', () => {
    const hosts = [
      { id: 'd', name: 'Broker', phone: { primaryPhoneNumber: '788123456', primaryPhoneCallingCode: '+250' } },
      { id: 'e', name: 'Same broker', whatsapp: { primaryPhoneNumber: '788123456', primaryPhoneCallingCode: '+250' } },
    ];
    expect(checkHosts(hosts).findings[0]).toMatchObject({ check: 'hosts sharing a phone' });
  });

  it('tells a removed video from a network blink', () => {
    expect(videoGone('ERROR: [TikTok] 7: Video not available, status code 10204')).toBe(true);
    expect(videoGone('ERROR: Unable to download webpage: <urlopen error [Errno 8] nodename nor servname provided> (could not resolve)')).toBe(false);
  });
});
