/**
 * The broker directory's pure core. Fixtures are anonymised (the repo is
 * public): handles, names and numbers are made up in the shapes real ads use.
 */
import { describe, expect, it } from 'vitest';
import {
  contactsInHtml,
  coordsFromMapsUrl,
  coverage,
  directoryCandidate,
  districtOf,
  humanEdit,
  isAgencyName,
  isHousingAgency,
  mergeBrokerRows,
  namesForZones,
  resolveMerges,
  withoutLocked,
  zoneOf,
  type BrokerRowFull,
  type BrokerRowState,
  type TwentyBrokerState,
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
  it('keeps estate and property firms and drops car hire found by "rental agency"', () => {
    expect(isHousingAgency({ name: 'Kwanda Real Estate', category: 'Real estate agency' })).toBe(true);
    expect(isHousingAgency({ name: 'Kigali Nice', category: 'Apartment rental agency' })).toBe(true);
    expect(isHousingAgency({ name: 'Nina Estate Group', category: 'Property management company' })).toBe(true);
    expect(isHousingAgency({ name: 'Kigali Rent Car', category: 'Car rental agency' })).toBe(false);
    expect(isHousingAgency({ name: 'Lebs Services /Tours, car rental', category: 'Car rental agency' })).toBe(false);
  });
});

describe('agency fetch quality', () => {
  it('drops commercial and industrial real estate', () => {
    expect(isHousingAgency({ name: 'Kigali Logistics Park', category: 'Industrial real estate agency' })).toBe(false);
    expect(isHousingAgency({ name: 'Downtown Offices', category: 'Commercial real estate agency' })).toBe(false);
    expect(isHousingAgency({ name: 'Hill Homes', category: 'Real estate developer' })).toBe(true);
    expect(isHousingAgency({ name: 'Oscar Realty', category: 'Real estate agent' })).toBe(true);
  });

  it('counts ltd / group / management / company only beside a housing word', () => {
    expect(isAgencyName('Nina Group')).toBe(false);
    expect(isAgencyName('Gakwaya Trading Ltd')).toBe(false);
    expect(isAgencyName('Hotappa Ltd')).toBe(false);
    expect(isAgencyName('Kigali Homes Ltd')).toBe(true);
    expect(isAgencyName('Prime Apartments Management')).toBe(true);
    expect(isAgencyName('Nina Estate Group')).toBe(true);
    expect(isAgencyName('Inzu Nziza Company')).toBe(true);
    expect(isAgencyName('kigali houses')).toBe(false); // a person's handle
  });
});

describe('zones served', () => {
  it('places a home by the place its address names, else a real pin, else the district', () => {
    expect(zoneOf({ address: '3 bedroom in Kibagabaga' })?.slug).toBe('gasabo/kimironko/kibagabaga');
    // "Kicukiro, Kigali" is only the district; an Airbnb pin by Sonatubes says more.
    expect(zoneOf({ address: 'Kicukiro, Kigali', lat: -1.97, lng: 30.105, pinIsReal: true })?.slug).toBe('kicukiro/niboye/sonatubes');
    // A TikTok pin is the district centre: never finer than the district.
    expect(zoneOf({ district: 'KICUKIRO', lat: -1.97, lng: 30.105, pinIsReal: false })?.slug).toBe('kicukiro');
    expect(zoneOf({ district: 'KIGALI_GASABO' })?.slug).toBe('gasabo');
    // A real pin outside Kigali places nothing.
    expect(zoneOf({ lat: -1.5, lng: 29.6, pinIsReal: true })).toBeNull();
  });

  it('lists zones most homes first and keeps districts and neighbourhoods from them', () => {
    const c = coverage([
      home('home:1', { address: 'Kibagabaga' }),
      home('home:2', { address: 'near Kibagabaga hospital' }),
      home('home:3', { address: 'Remera' }),
      home('home:4', { district: 'KICUKIRO' }),
    ]);
    expect(c.zoneSlugs).toEqual(['gasabo/kimironko/kibagabaga', 'gasabo/remera', 'kicukiro']);
    expect(c.districts).toEqual(['GASABO', 'KICUKIRO']);
    expect(c.neighbourhoods).toEqual(['Kibagabaga', 'Kimironko', 'Remera']);
  });

  it("places a Maps agency's office by its pin", () => {
    const c = coverage([], [{ address: 'KG 9 Ave, Kigali', lat: -1.938, lng: 30.083 }]);
    expect(c.zoneSlugs).toEqual(['gasabo/kacyiru']);
  });

  it('names districts and neighbourhoods for zones a person set', () => {
    expect(namesForZones(['gasabo/remera/nyarutarama', 'kicukiro'])).toEqual({ districts: ['GASABO', 'KICUKIRO'], neighbourhoods: ['Nyarutarama', 'Remera'] });
  });

  it('merged brokers carry their zones', () => {
    const [b] = mergeCandidates([cand({ tiktokHandle: 'z1', homes: [home('home:1', { address: 'Gacuriro' })] })]);
    expect(b!.zoneSlugs).toEqual(['gasabo/kinyinya/gacuriro']);
  });
});

describe('directory candidates', () => {
  it('hold together the keys a person merged, without adding a broker of their own', () => {
    const merged = mergeCandidates([
      cand({ tiktokHandle: 'one', homes: [home('home:1')] }),
      cand({ phones: ['0788000002'], homes: [home('home:2')] }),
      directoryCandidate({ phones: ['+250788000002'], whatsapp: null, tiktokHandle: 'one', userId: null, website: null, facebookUrl: null }),
      directoryCandidate({ phones: ['+250788000009'], whatsapp: null, tiktokHandle: null, userId: null, website: null, facebookUrl: null }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.listingsCount).toBe(2);
    expect(merged[0]!.origins).toEqual(['post']);
  });
});

// ── two-way ──────────────────────────────────────────────────────────────────

const synced = new Date('2026-10-22T08:00:00Z');
const later = (s: number) => new Date(synced.getTime() + s * 1000);
const prismaRow = (over: Partial<BrokerRowState> = {}): BrokerRowState => ({
  id: 'p1',
  kind: 'BROKER',
  name: 'Kigali House Find',
  phones: ['+250788000001'],
  whatsapp: null,
  optOut: false,
  optOutAt: null,
  zoneSlugs: ['gasabo/remera'],
  lockedFields: [],
  syncedAt: synced,
  ...over,
});
const twentyRow = (over: Partial<TwentyBrokerState> = {}): TwentyBrokerState => ({
  id: 't1',
  updatedAt: synced,
  updatedBy: 'API',
  kind: 'BROKER',
  name: 'Kigali House Find',
  phones: ['+250788000001'],
  whatsapp: null,
  optOut: false,
  zoneSlugs: ['gasabo/remera'],
  zonesByPerson: false,
  mergeIntoId: null,
  ...over,
});

describe('humanEdit', () => {
  it('ignores our own write, and API writes after it', () => {
    expect(humanEdit(twentyRow({ updatedAt: later(2), kind: 'AGENCY', updatedBy: 'MANUAL' }), prismaRow()).changed).toEqual([]);
    expect(humanEdit(twentyRow({ updatedAt: later(60), kind: 'AGENCY' }), prismaRow()).changed).toEqual([]);
  });

  it('copies and locks what a person changed, and only that', () => {
    const now = new Date('2026-10-22T09:00:00Z');
    const e = humanEdit(twentyRow({ updatedAt: later(60), updatedBy: 'MANUAL', kind: 'AGENCY', optOut: true }), prismaRow(), now);
    expect(e.changed).toEqual(['kind', 'optOut']);
    expect(e.data).toEqual({ kind: 'AGENCY', optOut: true, optOutAt: now, lockedFields: ['kind', 'optOut'] });
  });

  it('keeps earlier locks and normalises phones', () => {
    const e = humanEdit(twentyRow({ updatedAt: later(60), updatedBy: 'MANUAL', phones: ['0788 000 003'] }), prismaRow({ lockedFields: ['kind'] }));
    expect(e.data).toEqual({ phones: ['+250788000003'], lockedFields: ['kind', 'phones'] });
  });

  it('never undoes an opt-out the agent recorded after our last write', () => {
    const e = humanEdit(twentyRow({ updatedAt: later(60), updatedBy: 'MANUAL', name: 'KHF Rentals' }), prismaRow({ optOut: true, optOutAt: later(30) }));
    expect(e.changed).toEqual(['name']);
  });

  it('with no sync stamp yet, only a person stamp counts', () => {
    expect(humanEdit(twentyRow({ updatedAt: later(60), kind: 'AGENCY' }), prismaRow({ syncedAt: null })).changed).toEqual([]);
    expect(humanEdit(twentyRow({ updatedAt: later(60), updatedBy: 'MANUAL', kind: 'AGENCY' }), prismaRow({ syncedAt: null })).changed).toEqual(['kind']);
  });

  it('reads zones served from the junction rows', () => {
    // A person added a zone row (it does not touch the broker record).
    expect(humanEdit(twentyRow({ zoneSlugs: ['gasabo/remera', 'gasabo/kimironko'], zonesByPerson: true }), prismaRow()).data).toEqual({
      zoneSlugs: ['gasabo/remera', 'gasabo/kimironko'],
      lockedFields: ['zoneSlugs'],
    });
    // A person removed one, once we have synced.
    expect(humanEdit(twentyRow({ zoneSlugs: [] }), prismaRow()).changed).toEqual(['zoneSlugs']);
    // Never synced and no person rows: a missing junction is ours to build, not an edit.
    expect(humanEdit(twentyRow({ zoneSlugs: [] }), prismaRow({ syncedAt: null })).changed).toEqual([]);
    // Junction object not seeded.
    expect(humanEdit(twentyRow({ zoneSlugs: null }), prismaRow()).changed).toEqual([]);
  });
});

describe('locks', () => {
  it('drops locked fields from the derived update; locked zones keep their names', () => {
    const derived = { kind: 'BROKER', name: 'x', zoneSlugs: ['kicukiro'], districts: ['KICUKIRO'], neighbourhoods: [] as string[], priceMin: 1 };
    expect(withoutLocked(derived, ['kind', 'zoneSlugs'], ['gasabo/remera'])).toEqual({ name: 'x', districts: ['GASABO'], neighbourhoods: ['Remera'], priceMin: 1 });
    expect(withoutLocked(derived, [])).toEqual(derived);
  });
});

describe('mergeInto', () => {
  it('follows chains to the survivor and skips cycles and missing targets', () => {
    const m = resolveMerges([
      { id: 'a', mergeIntoId: 'b' },
      { id: 'b', mergeIntoId: 'c' },
      { id: 'c', mergeIntoId: null },
      { id: 'x', mergeIntoId: 'y' },
      { id: 'y', mergeIntoId: 'x' },
      { id: 'g', mergeIntoId: 'gone' },
      { id: 's', mergeIntoId: 's' },
    ]);
    expect([...m]).toEqual([
      ['a', 'c'],
      ['b', 'c'],
    ]);
  });

  const full = (over: Partial<BrokerRowFull>): BrokerRowFull => ({
    ...prismaRow(),
    userId: null,
    tiktokHandle: null,
    facebookUrl: null,
    website: null,
    email: null,
    districts: [],
    neighbourhoods: [],
    stays: [],
    priceMin: null,
    priceMax: null,
    listingsCount: 0,
    lastSeenAt: null,
    lastAskedAt: null,
    asks: 0,
    answers: 0,
    availableAnswers: 0,
    sources: [],
    ...over,
  });

  it('sums counters, unions phones, sources and zones, fills blanks, keeps the survivor locks', () => {
    const survivor = full({ id: 's', kind: 'BROKER', phones: ['+250788000001'], zoneSlugs: ['gasabo/remera'], lockedFields: ['kind'], asks: 2, answers: 1, listingsCount: 3, sources: ['tiktok'], priceMin: 300_000, priceMax: 600_000 });
    const loser = full({
      id: 'l', kind: 'AGENCY', phones: ['+250788000002', '+250788000001'], zoneSlugs: ['kicukiro/niboye'], userId: 'u2', tiktokHandle: 'loser', asks: 1, answers: 1,
      availableAnswers: 1, listingsCount: 2, sources: ['facebook'], priceMin: 200_000, priceMax: 900_000, optOut: true, optOutAt: synced,
    });
    const d = mergeBrokerRows(survivor, loser);
    expect(d).toMatchObject({
      kind: 'BROKER', // locked by a person on the survivor
      phones: ['+250788000001', '+250788000002'],
      zoneSlugs: ['gasabo/remera', 'kicukiro/niboye'],
      districts: ['GASABO', 'KICUKIRO'],
      userId: 'u2',
      tiktokHandle: 'loser',
      asks: 3,
      answers: 2,
      availableAnswers: 1,
      listingsCount: 5,
      sources: ['tiktok', 'facebook'],
      priceMin: 200_000,
      priceMax: 900_000,
      optOut: true,
      lockedFields: ['kind'],
    });
    // Unlocked kind takes the stronger of the two.
    expect(mergeBrokerRows({ ...survivor, lockedFields: [] }, loser).kind).toBe('AGENCY');
    // Locked zones stay the survivor's.
    expect(mergeBrokerRows({ ...survivor, lockedFields: ['zoneSlugs'] }, loser).zoneSlugs).toEqual(['gasabo/remera']);
  });
});
