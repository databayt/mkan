/**
 * crm:zones' pure core: where a listing, a broker and a tenant's request sit
 * in the Kigali tree, and the counters a Twenty zone page shows.
 */
import { describe, expect, it } from 'vitest';
import { districtCode, demandZoneSlug, listingZoneSlug, zoneBody, zoneCounters, zonePatch, ZONES_PARENTS_FIRST } from '../../scripts/crm/zones-pure';
import { KIGALI_ZONE_BY_SLUG } from '../../src/lib/geo/kigali-zones';

describe('placing', () => {
  it('reads district codes however they are written', () => {
    expect(districtCode('Gasabo')).toBe('GASABO');
    expect(districtCode(null, 'KIGALI_KICUKIRO')).toBe('KICUKIRO');
    expect(districtCode('', 'Khartoum')).toBeNull();
  });

  it('places a listing by its backfilled zone, its address, its real pin, then its district', () => {
    expect(listingZoneSlug({ state: 'Gasabo', sector: 'gasabo/remera', neighbourhood: 'gasabo/remera/nyarutarama' })).toBe('gasabo/remera/nyarutarama');
    expect(listingZoneSlug({ state: 'Gasabo', address: 'Kimironko, near the market' })).toBe('gasabo/kimironko');
    expect(listingZoneSlug({ state: 'Kicukiro', address: 'Kicukiro, Kigali', latitude: -1.97, longitude: 30.105, pinIsReal: true })).toBe('kicukiro/niboye/sonatubes');
    // A lead's district-centre pin says nothing finer.
    expect(listingZoneSlug({ state: 'Kicukiro', address: 'Kicukiro, Kigali', latitude: -1.97, longitude: 30.105, pinIsReal: false })).toBe('kicukiro');
    // An address naming a place in another district than the row's is not trusted.
    expect(listingZoneSlug({ state: 'Kicukiro', address: 'Remera' })).toBe('kicukiro');
    expect(listingZoneSlug({ state: '', address: 'Kigali' })).toBeNull();
  });

  it("places a tenant's request at the neighbourhood they named, else their district", () => {
    expect(demandZoneSlug({ district: 'GASABO', neighbourhood: 'Kibagabaga' })).toBe('gasabo/kimironko/kibagabaga');
    expect(demandZoneSlug({ district: 'KICUKIRO', neighbourhood: null })).toBe('kicukiro');
    expect(demandZoneSlug({})).toBeNull();
    expect(demandZoneSlug(null)).toBeNull();
  });
});

describe('counters', () => {
  it('counts homes, brokers and demand in a zone and every zone above it', () => {
    const c = zoneCounters({
      homes: ['gasabo/remera/nyarutarama', 'gasabo/remera', 'gasabo', 'kicukiro/niboye', null],
      brokers: [['gasabo/remera/nyarutarama', 'gasabo/remera'], ['kicukiro'], []],
      demand: ['gasabo/remera/nyarutarama'],
    });
    expect(c.get('gasabo/remera/nyarutarama')).toEqual({ homesCount: 1, brokersCount: 1, openDemand: 1 });
    expect(c.get('gasabo/remera')).toEqual({ homesCount: 2, brokersCount: 1, openDemand: 1 });
    expect(c.get('gasabo')).toEqual({ homesCount: 3, brokersCount: 1, openDemand: 1 });
    expect(c.get('kicukiro')).toEqual({ homesCount: 1, brokersCount: 1, openDemand: 0 });
    // A district-wide broker is not counted in each sector.
    expect(c.get('kicukiro/niboye')!.brokersCount).toBe(0);
  });
});

describe('records', () => {
  it('creates parents before children', () => {
    const seen = new Set<string>();
    for (const z of ZONES_PARENTS_FIRST) {
      if (z.parent) expect(seen.has(z.parent)).toBe(true);
      seen.add(z.slug);
    }
  });

  it('builds the zone body and patches only what changed', () => {
    const z = KIGALI_ZONE_BY_SLUG.get('gasabo/kinyinya/gacuriro')!;
    const body = zoneBody(z, { homesCount: 4, brokersCount: 2, openDemand: 0 });
    expect(body).toMatchObject({ name: 'Gacuriro', level: 'NEIGHBOURHOOD', district: 'GASABO', aliases: 'vision city', mkanZoneSlug: 'gasabo/kinyinya/gacuriro', homesCount: 4 });
    expect(zonePatch({ ...body, latitude: z.lat + 1e-9 }, body)).toEqual({});
    expect(zonePatch({ ...body, homesCount: 3, aliases: null }, body)).toEqual({ homesCount: 4, aliases: 'vision city' });
  });
});
