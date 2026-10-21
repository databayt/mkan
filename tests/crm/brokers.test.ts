/**
 * The broker directory's pure core. Fixtures are anonymised (the repo is
 * public): handles, names and numbers are made up in the shapes real ads use.
 */
import { describe, expect, it } from 'vitest';
import {
  contactsInHtml,
  coordsFromMapsUrl,
  coverage,
  districtOf,
  isAgencyName,
  mergeCandidates,
  mergeKeys,
  nameKey,
  neighbourhoodsOf,
  normaliseHandle,
  normaliseRwPhone,
  percentile,
  placeIdFromMapsUrl,
  priceBand,
  summarise,
  websiteDomain,
  type Candidate,
  type HomeFact,
} from '../../scripts/crm/brokers-pure';

const cand = (c: Partial<Candidate>): Candidate => ({ origin: 'post', kind: 'BROKER', name: null, phones: [], sources: ['tiktok'], homes: [], ...c });
const home = (key: string, h: Partial<HomeFact> = {}): HomeFact => ({ key, stay: 'month', ...h });

describe('normalisers', () => {
  it('reads a Rwandan mobile however it is written, and refuses landlines', () => {
    expect(normaliseRwPhone('0788 123 456')).toBe('+250788123456');
    expect(normaliseRwPhone('+250 788-123-456')).toBe('+250788123456');
    expect(normaliseRwPhone('00250788123456')).toBe('+250788123456');
    expect(normaliseRwPhone('0252 123 456')).toBeNull();
    expect(normaliseRwPhone('+249912345678')).toBeNull();
  });

  it('cleans TikTok handles', () => {
    expect(normaliseHandle('@Kigali.Homes_1 ')).toBe('kigali.homes_1');
    expect(normaliseHandle('not a handle!')).toBeNull();
    expect(normaliseHandle(null)).toBeNull();
  });

  it('keeps a broker’s own domain and drops social profiles', () => {
    expect(websiteDomain('https://www.Example-Homes.rw/contact')).toBe('example-homes.rw');
    expect(websiteDomain('example.rw')).toBe('example.rw');
    expect(websiteDomain('https://www.facebook.com/somebody')).toBeNull();
    expect(websiteDomain('https://wa.me/250788123456')).toBeNull();
    expect(websiteDomain('https://linktr.ee/x')).toBeNull();
    expect(websiteDomain('not a url')).toBeNull();
  });

  it('tells an agency name from a person', () => {
    expect(isAgencyName('Hill Real Estate Ltd')).toBe(true);
    expect(isAgencyName('Agence Immobilière du Lac')).toBe(true);
    expect(isAgencyName('Jean Claude')).toBe(false);
    expect(nameKey('Hill Real Estate Ltd')).toBe(nameKey('hill real-estate LIMITED'));
  });
});

describe('merge keys', () => {
  it('orders phone, handle, domain', () => {
    const keys = mergeKeys(cand({ phones: ['0788123456'], tiktokHandle: '@hill', website: 'https://hill.rw' }));
    expect(keys.slice(0, 3)).toEqual(['phone:+250788123456', 'tt:hill', 'web:hill.rw']);
  });

  it('groups agencies by name, never people', () => {
    expect(mergeKeys(cand({ kind: 'AGENCY', name: 'Hill Properties' }))).toContain('name:hill properties');
    expect(mergeKeys(cand({ name: 'Jean Claude' }))).toEqual([]);
  });
});

describe('mergeCandidates', () => {
  it('joins a handle seen in one place and a phone seen in another into one broker', () => {
    const merged = mergeCandidates([
      cand({ origin: 'seed', tiktokHandle: 'hill', homes: [] }),
      cand({ origin: 'post', name: 'Hill Homes', tiktokHandle: 'hill', phones: ['0788123456'], homes: [home('listing:1', { district: 'KICUKIRO', priceMonth: 400_000 })] }),
      cand({ origin: 'listing', kind: 'LANDLORD', phones: ['+250788123456'], userId: 'u1', homes: [home('listing:1', { district: 'KICUKIRO' }), home('listing:2', { address: 'Remera', priceMonth: 600_000 })] }),
      cand({ origin: 'maps', kind: 'AGENCY', name: 'Other Realty', phones: ['0722000111'], sources: ['maps'] }),
    ]);
    expect(merged).toHaveLength(2);
    const hill = merged.find((b) => b.tiktokHandle === 'hill')!;
    expect(hill).toMatchObject({
      key: 'phone:+250788123456',
      kind: 'BROKER',
      name: 'Hill Homes',
      phones: ['+250788123456'],
      userId: 'u1',
      listingsCount: 2,
      districts: ['GASABO', 'KICUKIRO'],
      neighbourhoods: ['Remera'],
      stays: ['month'],
      priceMin: 400_000,
      priceMax: 600_000,
      sources: ['tiktok'],
    });
    expect(merged.find((b) => b.kind === 'AGENCY')).toMatchObject({ name: 'Other Realty', sources: ['maps'], listingsCount: 0 });
  });

  it('a group with two handles keeps the one with more homes in the unique column', () => {
    const [b] = mergeCandidates([
      cand({ tiktokHandle: 'small', phones: ['0788123456'] }),
      cand({ tiktokHandle: 'big', phones: ['0788123456'], homes: [home('home:a'), home('home:b')] }),
    ]);
    expect(b!.tiktokHandle).toBe('big');
    expect(b!.tiktokHandles).toEqual(['big', 'small']);
  });

  it('drops what has no key at all', () => {
    expect(mergeCandidates([cand({ name: 'Somebody' })])).toEqual([]);
  });

  it('takes the latest sighting from posts as well as homes', () => {
    const [b] = mergeCandidates([
      cand({ tiktokHandle: 'x1', lastSeenAt: new Date('2026-10-20T00:00:00Z'), homes: [home('home:1', { seenAt: new Date('2026-10-01T00:00:00Z') })] }),
    ]);
    expect(b!.lastSeenAt?.toISOString()).toBe('2026-10-20T00:00:00.000Z');
  });

  it('summarises by kind and source', () => {
    const s = summarise(
      mergeCandidates([
        cand({ tiktokHandle: 'a1', phones: ['0788000001'] }),
        cand({ origin: 'maps', kind: 'AGENCY', name: 'B Realty', sources: ['maps'], website: 'https://b.rw' }),
      ]),
    );
    expect(s).toMatchObject({ total: 2, byKind: { BROKER: 1, AGENCY: 1 }, bySource: { tiktok: 1, maps: 1 }, withPhone: 1 });
  });
});

describe('coverage', () => {
  it('reads districts from codes, place names and real pins, but never a district-centre pin', () => {
    expect(districtOf({ district: 'KIGALI_NYARUGENGE' })).toBe('NYARUGENGE');
    expect(districtOf({ address: '2 bedroom in Kimironko' })).toBe('GASABO');
    expect(districtOf({ lat: -1.98, lng: 30.04, pinIsReal: true })).toBe('NYARUGENGE');
    expect(districtOf({ lat: -1.98, lng: 30.04, pinIsReal: false })).toBeNull();
  });

  it('names neighbourhoods from the address, else from a real pin', () => {
    expect(neighbourhoodsOf({ address: 'Near Kimihurura roundabout' })).toEqual(['Kimihurura']);
    expect(neighbourhoodsOf({ lat: -1.98, lng: 30.04, pinIsReal: true })).toContain('Nyamirambo');
    expect(neighbourhoodsOf({ lat: -1.98, lng: 30.04 })).toEqual([]);
  });

  it('prices the 10th–90th percentile of monthly rents, rounded to RWF 1,000', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 10)).toBe(1);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
    expect(percentile([], 50)).toBeNull();
    const rents = [150_000, 200_000, 250_000, 300_000, 350_000, 400_000, 450_000, 500_000, 550_000, 5_000_000];
    expect(priceBand(rents)).toEqual({ priceMin: 150_000, priceMax: 550_000 });
    expect(priceBand([301_499])).toEqual({ priceMin: 301_000, priceMax: 301_000 });
    expect(priceBand([])).toEqual({ priceMin: null, priceMax: null });
  });

  it('counts each home once and lists stays', () => {
    const c = coverage([home('listing:1', { stay: 'night' }), home('listing:1'), home('home:2', { stay: 'month', priceMonth: 300_000 })]);
    expect(c.listingsCount).toBe(2);
    expect(c.stays).toEqual(['month', 'night']);
  });

  it('an agency office counts towards districts', () => {
    expect(coverage([], [{ address: 'KG 7 Ave, Kacyiru, Kigali' }]).districts).toEqual(['GASABO']);
  });
});

describe('agency pages', () => {
  it('finds mobiles, WhatsApp and email on a website', () => {
    const html = `<a href="https://wa.me/250788123456">Chat</a>
      <a href="tel:+250 722 000 111">Call</a>
      <p>Office: 0252 000 000 · Mobile 0733 444 555</p>
      <a href="mailto:Info@Example.rw?subject=hi">mail</a>
      <script>var x = "0788999999";</script>`;
    const c = contactsInHtml(html);
    expect(c.whatsapp).toBe('+250788123456');
    expect(c.phones).toEqual(['+250788123456', '+250722000111', '+250733444555']);
    expect(c.email).toBe('info@example.rw');
  });

  it('reads place ids and pins from Maps URLs', () => {
    const url = 'https://www.google.com/maps/place/Hill+Realty/data=!4m7!3m6!1s0x19dca5:0xabc123!8m2!3d-1.9501!4d30.0912!16s';
    expect(placeIdFromMapsUrl(url)).toBe('0x19dca5:0xabc123');
    expect(coordsFromMapsUrl(url)).toEqual({ lat: -1.9501, lng: 30.0912 });
    expect(placeIdFromMapsUrl('https://www.google.com/maps/place/Hill%20Realty/@-1.9,30.1,17z')).toBe('hill realty');
  });
});

describe('isHousingAgency', () => {
  it('keeps estate and property firms and drops car hire found by "rental agency"', async () => {
    const { isHousingAgency } = await import('../../scripts/crm/brokers');
    expect(isHousingAgency({ name: 'Kwanda Real Estate', category: 'Real estate agency' })).toBe(true);
    expect(isHousingAgency({ name: 'Kigali Nice', category: 'Apartment rental agency' })).toBe(true);
    expect(isHousingAgency({ name: 'Nina Estate Group', category: 'Property management company' })).toBe(true);
    expect(isHousingAgency({ name: 'Kigali Rent Car', category: 'Car rental agency' })).toBe(false);
    expect(isHousingAgency({ name: 'Lebs Services /Tours, car rental', category: 'Car rental agency' })).toBe(false);
  });
});
